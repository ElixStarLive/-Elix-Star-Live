import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { request } from "../lib/apiClient";
import { parseAuthLoginRegisterResponse } from "../lib/authApiContract";

interface User {
  id: string;
  username: string;
  name: string;
  email: string;
  avatar: string;
  level: number;
  isVerified?: boolean;
  followers: number;
  following: number;
  joinedDate: string;
}

interface AuthUser {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
  email_confirmed_at?: string;
  created_at?: string;
}

/** Minimal type for auth session returned by the Hetzner backend. */
interface AuthSession {
  user: AuthUser | null;
  access_token?: string;
}

type AuthMode = "client";

interface AuthStore {
  user: User | null;
  session: AuthSession | null;
  isAuthenticated: boolean;
  backendUser: AuthUser | null;
  isLoading: boolean;
  authMode: AuthMode;

  signInWithPassword: (
    email: string,
    password: string,
  ) => Promise<{ error: string | null }>;
  signUpWithPassword: (
    email: string,
    password: string,
    username?: string,
    displayName?: string,
  ) => Promise<{ error: string | null; needsEmailConfirmation: boolean }>;
  resendSignupConfirmation: (
    email: string,
  ) => Promise<{ error: string | null }>;
  signInWithApple: () => Promise<{ error: string | null }>;
  signInAsGuest: () => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  updateUser: (updates: Partial<User>) => void;
  getCurrentUser: () => User | null;
  checkUser: () => Promise<void>;
}

const AUTH_STORAGE_KEY = "elix-auth";

function isNativeRuntime(): boolean {
  return typeof window !== "undefined" && Capacitor.isNativePlatform();
}

const authStateStorage: StateStorage = {
  getItem: async (name) => {
    if (isNativeRuntime()) {
      const nativeValue = await Preferences.get({ key: name });
      if (nativeValue.value != null) return nativeValue.value;
      // One-time migration path from old localStorage persistence.
      try {
        const legacy = window.localStorage.getItem(name);
        if (legacy != null) {
          await Preferences.set({ key: name, value: legacy });
          return legacy;
        }
      } catch {
        // Ignore local storage access errors and continue unauthenticated.
      }
      return null;
    }
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(name);
  },
  setItem: async (name, value) => {
    if (isNativeRuntime()) {
      await Preferences.set({ key: name, value });
      return;
    }
    if (typeof window !== "undefined") {
      window.localStorage.setItem(name, value);
    }
  },
  removeItem: async (name) => {
    if (isNativeRuntime()) {
      await Preferences.remove({ key: name });
      return;
    }
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(name);
    }
  },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapUserToUser(backendUser: AuthUser | null): User | null {
  if (!backendUser || backendUser.id == null) return null;
  const meta = (backendUser.user_metadata || {}) as Record<string, unknown>;
  const email = typeof backendUser.email === "string" ? backendUser.email : "";
  const usernameFromMeta =
    typeof meta.username === "string" ? meta.username : undefined;
  const fullNameFromMeta =
    typeof meta.full_name === "string" ? meta.full_name : undefined;
  const avatarFromMeta =
    typeof meta.avatar_url === "string" ? meta.avatar_url : undefined;
  const fallbackUsername = email ? email.split("@")[0] : "user";
  const rawLevel = meta.level;
  const levelFromMeta =
    typeof rawLevel === "number"
      ? rawLevel
      : typeof rawLevel === "string"
        ? Number(rawLevel)
        : NaN;
  const level =
    Number.isFinite(levelFromMeta) && levelFromMeta > 0
      ? Math.floor(levelFromMeta)
      : 1;

  return {
    id: String(backendUser.id),
    username: (usernameFromMeta ?? fallbackUsername) as string,
    name: (fullNameFromMeta ?? usernameFromMeta ?? fallbackUsername) as string,
    email,
    avatar:
      avatarFromMeta ??
      `https://ui-avatars.com/api/?name=${encodeURIComponent(
        (usernameFromMeta ?? fallbackUsername) as string,
      )}&background=random`,
    level,
    isVerified: !!backendUser.email_confirmed_at,
    followers: 0,
    following: 0,
    joinedDate: backendUser.created_at ?? "",
  };
}

/**
 * Enrich a mapped user with profile data from the Hetzner backend.
 * Calls GET /api/profiles/:userId which returns username, displayName,
 * avatarUrl, followers, following counts, etc.
 * Falls back to the original user object on any error.
 */
async function enrichUserWithProfile(user: User): Promise<User> {
  const { data: body, error } = await request(`/api/profiles/${user.id}`);
  if (error) return user;

  const profile = body?.profile as {
    username?: string;
    displayName?: string;
    avatarUrl?: string;
    bio?: string;
    followers?: number;
    following?: number;
    level?: number;
    isVerified?: boolean;
  } | undefined;
  if (!profile) return user;

  return {
    ...user,
    username: profile.username || user.username,
    name: profile.displayName || user.name,
    avatar: profile.avatarUrl || user.avatar,
    followers: profile.followers ?? user.followers,
    following: profile.following ?? user.following,
    level: profile.level ?? user.level,
    isVerified: profile.isVerified ?? user.isVerified,
  };
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useAuthStore = create<AuthStore>()(persist((set, get) => ({
  user: null,
  session: null,
  isAuthenticated: false,
  backendUser: null,
  isLoading: true,
  authMode: "client",

  // ── Sign in ──────────────────────────────────────────────────────────────
  signInWithPassword: async (email, password) => {
    if (!email || !password) {
      return { error: "Please enter both email and password." };
    }

    try {
      const { data, error: loginError } = await request("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: email.trim(), password }),
      });

      if (loginError) {
        const message = loginError.message || "Login failed. Please try again.";
        const m = message.toLowerCase();
        if (m.includes("invalid") || m.includes("credentials")) {
          return { error: "Incorrect email or password." };
        }
        if (m.includes("confirm")) {
          return {
            error: "Please verify your email address before logging in.",
          };
        }
        if (
          m.includes("fetch") ||
          m.includes("network") ||
          m.includes("failed to fetch") ||
          m.includes("request_failed")
        ) {
          const isLocal =
            typeof window !== "undefined" &&
            (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
          return {
            error: isLocal
              ? "Cannot reach backend. Start both frontend and backend: npm run dev:all"
              : "Cannot reach backend. Try again later.",
          };
        }
        if (m.includes("aborted")) {
          return { error: "aborted" };
        }
        return { error: message };
      }

      const parsed = parseAuthLoginRegisterResponse(data);
      if (!parsed) {
        return {
          error:
            "Could not complete sign-in. Check your connection, update the app, or try again later.",
        };
      }

      const backendUser = parsed.user as AuthUser;
      const accessToken = parsed.accessToken;
      const mapped = mapUserToUser(backendUser);

      set({
        backendUser,
        session: { user: backendUser, access_token: accessToken },
        user: mapped,
        isAuthenticated: true,
        isLoading: false,
        authMode: "client",
      });

      // Enrich with Hetzner profile data in the background
      if (mapped) {
        enrichUserWithProfile(mapped)
          .then((enriched) => {
            if (get().isAuthenticated && get().user?.id === enriched.id) {
              set({ user: enriched });
            }
          })
          .catch(() => {});
      }

      return { error: null };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error occurred";
      return { error: msg };
    }
  },

  // ── Sign up ──────────────────────────────────────────────────────────────
  signUpWithPassword: async (email, password, username, displayName) => {
    try {
      const { data, error: regError } = await request("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email: email.trim(),
          password,
          username: username || email.split("@")[0],
          displayName: displayName || username || email.split("@")[0],
        }),
      });

      if (regError) {
        const message = regError.message || "Signup failed. Please try again.";
        const m = message.toLowerCase();
        if (
          m.includes("fetch") ||
          m.includes("network") ||
          m.includes("failed to fetch") ||
          m.includes("request_failed")
        ) {
          return {
            error: "Cannot reach backend. Start both frontend and backend: npm run dev:all",
            needsEmailConfirmation: false,
          };
        }
        if (m.includes("aborted")) {
          return { error: "aborted", needsEmailConfirmation: false };
        }
        return { error: message, needsEmailConfirmation: false };
      }

      if (data?.needsEmailConfirmation) {
        return { error: null, needsEmailConfirmation: true };
      }

      const parsed = parseAuthLoginRegisterResponse(data);
      if (!parsed) {
        return {
          error: "Signup did not return a valid session. Please try again or update the app.",
          needsEmailConfirmation: false,
        };
      }

      const backendUser = parsed.user as AuthUser;
      const accessToken = parsed.accessToken;
      const mapped = mapUserToUser(backendUser);

      if (mapped) {
        request("/api/profiles", {
          method: "POST",
          body: JSON.stringify({
            userId: mapped.id,
            username: mapped.username,
            displayName: mapped.name,
            email: mapped.email,
            avatarUrl: mapped.avatar,
          }),
        }).catch(() => {});
      }

      set({
        backendUser,
        session: { user: backendUser, access_token: accessToken },
        user: mapped,
        isAuthenticated: true,
        isLoading: false,
        authMode: "client",
      });
      return { error: null, needsEmailConfirmation: false };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error occurred";
      return { error: msg, needsEmailConfirmation: false };
    }
  },

  // ── Resend confirmation ──────────────────────────────────────────────────
  resendSignupConfirmation: async (email) => {
    const { error } = await request("/api/auth/resend-confirmation", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
    if (error) {
      return { error: error.message || "Failed to resend confirmation email." };
    }
    return { error: null };
  },

  // ── Apple sign-in ────────────────────────────────────────────────────────
  signInWithApple: async () => {
    const { data, error } = await request("/api/auth/apple/start", {
      method: "POST",
      body: JSON.stringify({
        redirectTo: window.location.origin + "/auth/callback",
      }),
    });
    if (error) {
      return { error: error.message || "Apple sign-in failed." };
    }
    if (data?.url) {
      window.location.href = data.url as string;
    }
    return { error: null };
  },
  signInAsGuest: async () => {
    const { data, error } = await request("/api/auth/guest", {
      method: "POST",
    });

    if (error || !data?.user || !data?.session) {
      return {
        error:
          error?.message ||
          "Guest login failed. Please try again or use email login.",
      };
    }

    const mapped = mapUserToUser(data.user as AuthUser);
    const enriched = mapped ? await enrichUserWithProfile(mapped) : null;

    set({
      user: enriched,
      backendUser: data.user as AuthUser,
      session: data.session as AuthSession,
      isAuthenticated: true,
      isLoading: false,
    });

    return { error: null };
  },

  // ── Sign out ─────────────────────────────────────────────────────────────
  signOut: async () => {
    try { await request("/api/auth/logout", { method: "POST" }); } catch {}
    set({
      session: null,
      user: null,
      backendUser: null,
      isAuthenticated: false,
      isLoading: false,
      authMode: "client",
    });
  },

  // ── Update user locally ──────────────────────────────────────────────────
  updateUser: (updates) =>
    set((state) => ({
      user: state.user ? { ...state.user, ...updates } : null,
    })),

  getCurrentUser: () => get().user,

  // ── Check session (app boot / token refresh) ─────────────────────────────
  checkUser: async () => {
    const clearState = () =>
      set({
        backendUser: null,
        session: null,
        user: null,
        isAuthenticated: false,
        isLoading: false,
        authMode: "client",
      });

    try {
      const { data, error: meError } = await request("/api/auth/me");

      if (meError) {
        clearState();
        return;
      }

      const backendUser = (data?.user ?? null) as AuthUser | null;
      const sessionData = data?.session as
        | { accessToken?: string; access_token?: string }
        | null
        | undefined;
      const accessToken = sessionData?.accessToken ?? sessionData?.access_token;

      if (!backendUser || typeof backendUser.id !== "string") {
        clearState();
        return;
      }

      const mapped = mapUserToUser(backendUser);

      // Enrich with Hetzner profile data (username, avatar, follower counts)
      let userToSet = mapped;
      if (mapped) {
        try {
          userToSet = await enrichUserWithProfile(mapped);
        } catch {
          userToSet = mapped;
        }
      }

      set({
        backendUser,
        session: accessToken
          ? { user: backendUser, access_token: String(accessToken) }
          : null,
        user: userToSet,
        isAuthenticated: true,
        isLoading: false,
        authMode: "client",
      });
    } catch {
      clearState();
    }
  },
}), {
  name: AUTH_STORAGE_KEY,
  storage: createJSONStorage(() => authStateStorage),
  partialize: (state) => ({
    user: state.user,
    session: state.session,
    isAuthenticated: state.isAuthenticated,
    backendUser: state.backendUser,
    authMode: state.authMode,
  }),
  onRehydrateStorage: () => (state) => {
    if (state) {
      state.isLoading = false;
    }
  },
}));
