import { create } from "zustand";
import { persist } from "zustand/middleware";
import { apiUrl } from "../lib/api";

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
  try {
    const res = await fetch(apiUrl(`/api/profiles/${user.id}`), {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    });

    if (!res.ok) return user;

    const body = (await res.json()) as {
      profile?: {
        username?: string;
        displayName?: string;
        avatarUrl?: string;
        bio?: string;
        followers?: number;
        following?: number;
        level?: number;
        isVerified?: boolean;
      };
    };

    const profile = body.profile;
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
  } catch {
    // Non-fatal — return base user if profile fetch fails
    return user;
  }
}

const getAuthErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    const m = error.message.toLowerCase();
    if (
      m.includes("load failed") ||
      m.includes("failed to fetch") ||
      m.includes("network request failed") ||
      m.includes("the internet connection appears to be offline")
    ) {
      const isLocal =
        typeof window !== "undefined" &&
        (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
      return isLocal
        ? "Cannot reach backend. Start both frontend and backend: npm run dev:all"
        : "Cannot reach backend. Try again later.";
    }
    return error.message;
  }
  if (typeof error === "string") return error;
  return `Authentication failed: ${JSON.stringify(error)}`;
};

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
      const res = await fetch(apiUrl("/api/auth/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: email.trim(), password }),
      });

      const data = (await res.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;

      if (!res.ok) {
        const message: string =
          (data?.error as string) ||
          (data?.message as string) ||
          "Login failed. Please try again.";
        if (
          message.toLowerCase().includes("invalid") ||
          message.toLowerCase().includes("credentials")
        ) {
          return { error: "Incorrect email or password." };
        }
        if (message.toLowerCase().includes("confirm")) {
          return {
            error: "Please verify your email address before logging in.",
          };
        }
        return { error: message };
      }

      const backendUser = (data.user ?? null) as AuthUser | null;
      const sessionData = data.session as
        | { accessToken?: string; access_token?: string }
        | null
        | undefined;
      const accessToken: string | undefined =
        sessionData?.accessToken ?? sessionData?.access_token;

      if (!backendUser || !accessToken) {
        // Some server modes rely on cookie auth and may omit token in login response.
        // Recover by fetching /api/auth/me before failing.
        const meRes = await fetch(apiUrl("/api/auth/me"), {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
        });
        const meData = (await meRes.json().catch(() => ({}))) as Record<string, unknown>;
        const meUser = (meData.user ?? null) as AuthUser | null;
        const meSessionData = meData.session as
          | { accessToken?: string; access_token?: string }
          | null
          | undefined;
        const meAccessToken: string | undefined =
          meSessionData?.accessToken ?? meSessionData?.access_token;

        if (!meRes.ok || !meUser || !meAccessToken) {
          return { error: "Login failed unexpectedly. Please try again." };
        }

        const mapped = mapUserToUser(meUser);
        set({
          backendUser: meUser,
          session: { user: meUser, access_token: meAccessToken },
          user: mapped,
          isAuthenticated: true,
          isLoading: false,
          authMode: "client",
        });
        return { error: null };
      }

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
      if (
        msg.toLowerCase().includes("fetch") ||
        msg.toLowerCase().includes("network") ||
        msg.toLowerCase().includes("failed to fetch")
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
      if (
        (err as { name?: string }).name === "AbortError" ||
        msg.toLowerCase().includes("aborted")
      ) {
        return { error: "aborted" };
      }
      return { error: msg };
    }
  },

  // ── Sign up ──────────────────────────────────────────────────────────────
  signUpWithPassword: async (email, password, username, displayName) => {
    try {
      const res = await fetch(apiUrl("/api/auth/register"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: email.trim(),
          password,
          username: username || email.split("@")[0],
          displayName: displayName || username || email.split("@")[0],
        }),
      });

      const data = (await res.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;

      if (!res.ok) {
        const message: string =
          (data?.error as string) ||
          (data?.message as string) ||
          "Signup failed. Please try again.";
        if (
          message.toLowerCase().includes("fetch") ||
          message.toLowerCase().includes("network") ||
          res.status === 0
        ) {
          return {
            error: "Cannot reach backend. Start both frontend and backend: npm run dev:all",
            needsEmailConfirmation: false,
          };
        }
        if (data?.needsEmailConfirmation) {
          return { error: null, needsEmailConfirmation: true };
        }
        return { error: message, needsEmailConfirmation: false };
      }

      const backendUser = (data.user ?? null) as AuthUser | null;
      const sessionData = data.session as
        | { accessToken?: string; access_token?: string }
        | null
        | undefined;
      const accessToken: string | undefined =
        sessionData?.accessToken ?? sessionData?.access_token;

      if (backendUser && accessToken) {
        const mapped = mapUserToUser(backendUser);

        // Seed a profile entry on the Hetzner backend
        if (mapped) {
          fetch(apiUrl("/api/profiles"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
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
      }

      if (backendUser && !accessToken) {
        return { error: null, needsEmailConfirmation: true };
      }

      return {
        error: "Signup failed (no user data returned). Please try again.",
        needsEmailConfirmation: false,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error occurred";
      if (
        msg.toLowerCase().includes("fetch") ||
        msg.toLowerCase().includes("network") ||
        msg.toLowerCase().includes("failed to fetch")
      ) {
        return {
          error: "Cannot reach backend. Start both frontend and backend: npm run dev:all",
          needsEmailConfirmation: false,
        };
      }
      if (
        (err as { name?: string }).name === "AbortError" ||
        msg.toLowerCase().includes("aborted")
      ) {
        return { error: "aborted", needsEmailConfirmation: false };
      }
      return { error: msg, needsEmailConfirmation: false };
    }
  },

  // ── Resend confirmation ──────────────────────────────────────────────────
  resendSignupConfirmation: async (email) => {
    try {
      const res = await fetch(apiUrl("/api/auth/resend-confirmation"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as Record<
          string,
          unknown
        >;
        return {
          error:
            (data?.error as string) ||
            (data?.message as string) ||
            "Failed to resend confirmation email.",
        };
      }
      return { error: null };
    } catch (error) {
      return { error: getAuthErrorMessage(error) };
    }
  },

  // ── Apple sign-in ────────────────────────────────────────────────────────
  signInWithApple: async () => {
    try {
      const res = await fetch(apiUrl("/api/auth/apple/start"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          redirectTo: window.location.origin + "/auth/callback",
        }),
      });
      const data = (await res.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      if (!res.ok) {
        return {
          error:
            (data?.error as string) ||
            (data?.message as string) ||
            "Apple sign-in failed.",
        };
      }
      if (data?.url) {
        window.location.href = data.url as string;
      }
      return { error: null };
    } catch (error) {
      return { error: getAuthErrorMessage(error) };
    }
  },
  signInAsGuest: async () => {
    try {
      const res = await fetch(apiUrl("/api/auth/guest"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });

      const data = (await res.json().catch(() => ({}))) as {
        user?: AuthUser;
        session?: AuthSession;
        error?: string;
      };

      if (!res.ok || !data.user || !data.session) {
        return {
          error:
            data?.error ||
            "Guest login failed. Please try again or use email login.",
        };
      }

      const mapped = mapUserToUser(data.user);
      const enriched = mapped ? await enrichUserWithProfile(mapped) : null;

      set({
        user: enriched,
        backendUser: data.user,
        session: data.session,
        isAuthenticated: true,
        isLoading: false,
      });

      return { error: null };
    } catch (error) {
      return { error: getAuthErrorMessage(error) };
    }
  },

  // ── Sign out ─────────────────────────────────────────────────────────────
  signOut: async () => {
    try {
      await fetch(apiUrl("/api/auth/logout"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
    } catch {
      // Ignore network errors on sign-out
    }
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
    try {
      const existing = get();
      const bearer =
        existing.session?.access_token ||
        (existing.session as any)?.accessToken ||
        (existing.session as any)?.access_token ||
        undefined;

      const res = await fetch(apiUrl("/api/auth/me"), {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
        },
        credentials: "include",
      });

      if (!res.ok) {
        // Server rejected the token — clear the stale session so user can re-login
        set({
          backendUser: null,
          session: null,
          user: null,
          isAuthenticated: false,
          isLoading: false,
          authMode: "client",
        });
        return;
      }

      let data: Record<string, unknown> = {};
      try {
        const text = await res.text();
        if (text) data = JSON.parse(text) as Record<string, unknown>;
      } catch {
        set({
          backendUser: null,
          session: null,
          user: null,
          isAuthenticated: false,
          isLoading: false,
          authMode: "client",
        });
        return;
      }

      const backendUser = (data.user ?? null) as AuthUser | null;
      const sessionData = data.session as
        | { accessToken?: string; access_token?: string }
        | null
        | undefined;
      const accessToken = sessionData?.accessToken ?? sessionData?.access_token;

      if (!backendUser || typeof backendUser.id !== "string") {
        set({
          backendUser: null,
          session: null,
          user: null,
          isAuthenticated: false,
          isLoading: false,
          authMode: "client",
        });
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
      set({
        backendUser: null,
        session: null,
        user: null,
        isAuthenticated: false,
        isLoading: false,
        authMode: "client",
      });
    }
  },
}), {
  name: 'elix-auth',
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
