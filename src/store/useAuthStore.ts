import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { request } from "../lib/apiClient";
import { ensureUserProfileRow } from "../lib/ensureUserProfileRow";
import { notificationService } from "../lib/notifications";
import {
  authAppleNative,
  authGetMe,
  authLoginWithPassword,
  authLogout,
  authRegister,
  authResendConfirmation,
} from "../features/auth/authSession";

interface User {
  id: string;
  username: string;
  name: string;
  email: string;
  avatar: string;
  level: number;
  isVerified?: boolean;
  isAdmin?: boolean;
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
  /** Last non-fatal auth warning (e.g. local sign-out while server logout failed). Not persisted. */
  lastError: string | null;

  signInWithPassword: (
    email: string,
    password: string,
  ) => Promise<{ error: string | null }>;
  signUpWithPassword: (
    email: string,
    password: string,
    username?: string,
    displayName?: string,
  ) => Promise<{
    error: string | null;
    needsEmailConfirmation: boolean;
    welcomeMessage?: string;
  }>;
  resendSignupConfirmation: (
    email: string,
  ) => Promise<{ error: string | null }>;
  signInWithApple: () => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  clearLastError: () => void;
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
      // Preferences is the sole native owner. Legacy localStorage is never
      // rehydrated (migration already shipped); drop any leftover plaintext copy.
      try {
        window.localStorage.removeItem(name);
      } catch {
        /* ignore */
      }
      const nativeValue = await Preferences.get({ key: name });
      return nativeValue.value ?? null;
    }
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(name);
  },
  setItem: async (name, value) => {
    if (isNativeRuntime()) {
      await Preferences.set({ key: name, value });
      try {
        window.localStorage.removeItem(name);
      } catch {
        /* ignore */
      }
      return;
    }
    if (typeof window !== "undefined") {
      window.localStorage.setItem(name, value);
    }
  },
  removeItem: async (name) => {
    if (isNativeRuntime()) {
      await Preferences.remove({ key: name });
      try {
        window.localStorage.removeItem(name);
      } catch {
        /* ignore */
      }
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
    Number.isFinite(levelFromMeta) && levelFromMeta >= 0
      ? Math.floor(levelFromMeta)
      : 0;

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
    isAdmin: false,
    followers: 0,
    following: 0,
    joinedDate: backendUser.created_at ?? "",
  };
}

function applyProfileMeta(
  user: User,
  profileMeta:
    | { is_admin?: boolean; is_creator?: boolean; level?: number }
    | null
    | undefined,
): User {
  if (!profileMeta || typeof profileMeta !== "object") return user;
  return {
    ...user,
    isAdmin: Boolean(profileMeta.is_admin),
    isVerified: profileMeta.is_creator != null ? Boolean(profileMeta.is_creator) : user.isVerified,
    level:
      Number.isFinite(Number(profileMeta.level)) && Number(profileMeta.level) >= 0
        ? Math.floor(Number(profileMeta.level))
        : user.level,
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
    level: Number.isFinite(Number(profile.level)) && Number(profile.level) >= 0
      ? Math.floor(Number(profile.level))
      : user.level,
    isVerified: profile.isVerified ?? user.isVerified,
  };
}

type AuthProfileMeta =
  | { is_admin?: boolean; is_creator?: boolean; level?: number }
  | null
  | undefined;

/** Shared login/register mapping for fetch/network/not_json unreachable backend. */
function mapAuthNetworkUnreachableError(message: string): string | null {
  const m = message.toLowerCase();
  if (
    !(
      m.includes("fetch") ||
      m.includes("network") ||
      m.includes("failed to fetch") ||
      m.includes("request_failed") ||
      m.includes("not_json")
    )
  ) {
    return null;
  }
  const isLocal =
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1");
  return isLocal
    ? "Cannot reach backend. Start both frontend and backend: npm run dev:all"
    : "Cannot reach backend. Try again later.";
}

function mapAuthenticatedUser(
  backendUser: AuthUser,
  profileMeta: AuthProfileMeta,
): User | null {
  const mappedBase = mapUserToUser(backendUser);
  return mappedBase ? applyProfileMeta(mappedBase, profileMeta) : null;
}

type AuthSessionSet = (
  partial: Partial<{
    backendUser: AuthUser | null;
    session: AuthSession | null;
    user: User | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    authMode: AuthMode;
  }>,
) => void;

type AuthSessionGet = () => {
  isAuthenticated: boolean;
  user: User | null;
};

/**
 * Commit mapped session state after successful password login/register.
 * Optional profile enrich matches sign-in (register historically skipped enrich).
 */
async function applySuccessfulAuthSession(
  set: AuthSessionSet,
  get: AuthSessionGet,
  args: {
    backendUser: AuthUser;
    accessToken: string | undefined;
    user: User | null;
    enrichProfile: boolean;
  },
): Promise<void> {
  set({
    backendUser: args.backendUser,
    session: { user: args.backendUser, access_token: args.accessToken },
    user: args.user,
    isAuthenticated: true,
    isLoading: false,
    authMode: "client",
  });

  if (!args.enrichProfile || !args.user) return;

  try {
    const enriched = await enrichUserWithProfile(args.user);
    if (get().isAuthenticated && get().user?.id === enriched.id) {
      set({
        user: {
          ...enriched,
          isAdmin: get().user?.isAdmin ?? enriched.isAdmin,
        },
      });
    }
  } catch {
    try {
      const { showToast } = await import("../lib/toast");
      showToast("Signed in, but profile details could not load");
    } catch {
      /* toast best-effort */
    }
  }
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useAuthStore = create<AuthStore>()(persist((set, get) => ({
  user: null,
  session: null,
  isAuthenticated: false,
  backendUser: null,
  isLoading: true,
  authMode: "client",
  lastError: null,

  // ── Sign in ──────────────────────────────────────────────────────────────
  signInWithPassword: async (email, password) => {
    try {
      const result = await authLoginWithPassword(email, password);
      if (result.ok === false) {
        const message = result.error;
        const m = message.toLowerCase();
        if (m.includes("invalid") || m.includes("credentials")) {
          return { error: "Incorrect email/username or password." };
        }
        if (m.includes("confirm")) {
          return {
            error: "Please verify your email address before logging in.",
          };
        }
        const networkError = mapAuthNetworkUnreachableError(message);
        if (networkError) {
          return { error: networkError };
        }
        if (m.includes("aborted")) {
          return { error: "aborted" };
        }
        return { error: message };
      }
      if (result.kind !== "session") {
        return { error: "Please verify your email address before logging in." };
      }

      const backendUser = result.user as unknown as AuthUser;
      const accessToken = result.accessToken;
      const mapped = mapAuthenticatedUser(
        backendUser,
        result.profileMeta as AuthProfileMeta,
      );
      if (!mapped) {
        return { error: "Cannot reach backend. Try again later." };
      }

      await applySuccessfulAuthSession(set, get, {
        backendUser,
        accessToken,
        user: mapped,
        enrichProfile: true,
      });

      return { error: null };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error occurred";
      return { error: msg };
    }
  },

  // ── Sign up ──────────────────────────────────────────────────────────────
  signUpWithPassword: async (email, password, username, displayName) => {
    try {
      const result = await authRegister({
        email: email.trim(),
        password,
        username: username || email.split("@")[0],
        displayName: displayName || username || email.split("@")[0],
      });

      if (result.ok === false) {
        const message = result.error;
        const m = message.toLowerCase();
        const networkError = mapAuthNetworkUnreachableError(message);
        if (networkError) {
          return {
            error: networkError,
            needsEmailConfirmation: false,
          };
        }
        if (m.includes("aborted")) {
          return { error: "aborted", needsEmailConfirmation: false };
        }
        return { error: message, needsEmailConfirmation: false };
      }

      if (result.kind === "email_confirm") {
        return { error: null, needsEmailConfirmation: true };
      }

      const data = result.raw as { welcome_message?: string } | null;
      const backendUser = result.user as unknown as AuthUser;
      const accessToken = result.accessToken;
      const mapped = mapAuthenticatedUser(
        backendUser,
        result.profileMeta as AuthProfileMeta,
      );

      if (mapped) {
        const profileEnsure = await ensureUserProfileRow({
          userId: mapped.id,
          username: mapped.username,
          displayName: mapped.name,
          email: mapped.email,
          avatarUrl: mapped.avatar,
        });
        if (profileEnsure.error) {
          set({ isLoading: false });
          return {
            error: profileEnsure.error,
            needsEmailConfirmation: false,
          };
        }
      }

      await applySuccessfulAuthSession(set, get, {
        backendUser,
        accessToken,
        user: mapped,
        enrichProfile: false,
      });
      return {
        error: null,
        needsEmailConfirmation: false,
        welcomeMessage:
          typeof data?.welcome_message === "string"
            ? data.welcome_message
            : undefined,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error occurred";
      return { error: msg, needsEmailConfirmation: false };
    }
  },

  // ── Resend confirmation ──────────────────────────────────────────────────
  resendSignupConfirmation: async (email) => {
    const result = await authResendConfirmation(email);
    if (result.ok === false) {
      return { error: result.error };
    }
    return { error: null };
  },

  // ── Apple sign-in ────────────────────────────────────────────────────────
  signInWithApple: async () => {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "ios") {
      return { error: "Sign in with Apple is available in the iOS app." };
    }
    try {
      const { SocialLogin } = await import("@capgo/capacitor-social-login");
      await SocialLogin.initialize({
        apple: {
          clientId: "com.elixstarlive.app",
          redirectUrl: "",
          useProperTokenExchange: false,
        },
      });
      const state = globalThis.crypto.randomUUID();
      const apple = await SocialLogin.login({
        provider: "apple",
        options: {
          scopes: ["email", "name"],
          state,
        },
      });
      const appleResult = apple.result;
      if (!appleResult.idToken) {
        return { error: "Apple did not return a valid identity token." };
      }

      const authResult = await authAppleNative({
        idToken: appleResult.idToken,
        givenName: appleResult.profile.givenName,
        familyName: appleResult.profile.familyName,
      });
      if (authResult.ok === false) {
        return { error: authResult.error };
      }
      if (authResult.kind !== "session") {
        return { error: "Apple sign-in returned an invalid session." };
      }
      const backendUser = authResult.user as unknown as AuthUser;
      const mappedBase = mapUserToUser(backendUser);
      if (!mappedBase) return { error: "Apple account could not be loaded." };
      const mapped = applyProfileMeta(
        mappedBase,
        authResult.profileMeta as { is_admin?: boolean; is_creator?: boolean } | undefined,
      );
      set({
        backendUser,
        session: { user: backendUser, access_token: authResult.accessToken },
        user: mapped,
        isAuthenticated: true,
        isLoading: false,
        authMode: "client",
      });
      void notificationService.registerTokenWithBackend();
      return { error: null };
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      if (err.code === "USER_CANCELLED") return { error: "Apple sign-in cancelled." };
      return { error: err.message || "Apple sign-in failed." };
    }
  },
  // ── Sign out ─────────────────────────────────────────────────────────────
  signOut: async () => {
    try { await notificationService.unregisterToken(); } catch { /* push unregister is best-effort */ }

    // Local clear is required for security even if the server logout fails.
    let serverLogoutError: string | null = null;
    try {
      const { error } = await authLogout();
      if (error) {
        serverLogoutError = error || "Logout request failed";
      }
    } catch (e: unknown) {
      serverLogoutError =
        e instanceof Error ? e.message : "Logout request failed";
    }

    try {
      const { useWalletStore } = await import("./useWalletStore");
      useWalletStore.getState().clear();
    } catch { /* wallet clear is best-effort */ }

    const lastError = serverLogoutError
      ? `Signed out locally, but server session may still be active (${serverLogoutError})`
      : null;

    set({
      session: null,
      user: null,
      backendUser: null,
      isAuthenticated: false,
      isLoading: false,
      authMode: "client",
      lastError,
    });

    if (lastError) {
      try {
        const { showToast } = await import("../lib/toast");
        showToast("Signed out, but server logout may have failed");
      } catch {
        /* toast is best-effort */
      }
    }
  },

  clearLastError: () => set({ lastError: null }),

  // ── Update user locally ──────────────────────────────────────────────────
  updateUser: (updates) =>
    set((state) => ({
      user: state.user ? { ...state.user, ...updates } : null,
    })),

  getCurrentUser: () => get().user,

  // ── Check session (app boot / token refresh) ─────────────────────────────
  checkUser: async () => {
    set({ isLoading: true });

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
      const meResult = await authGetMe();

      if (meResult.ok === false) {
        if (meResult.isAuthFailure || !get().session?.access_token) {
          clearState();
        } else {
          set({ isLoading: false });
        }
        return;
      }

      const backendUser = meResult.user as unknown as AuthUser;
      const accessToken = meResult.accessToken;

      const mappedBase = mapUserToUser(backendUser);
      const mapped = mappedBase
        ? applyProfileMeta(
            mappedBase,
            meResult.profileMeta as { is_admin?: boolean; is_creator?: boolean } | undefined,
          )
        : null;

      // Enrich with Hetzner profile data (username, avatar, follower counts)
      let userToSet = mapped;
      if (mapped) {
        try {
          const enriched = await enrichUserWithProfile(mapped);
          userToSet = { ...enriched, isAdmin: mapped.isAdmin };
        } catch {
          userToSet = mapped;
          try {
            const { showToast } = await import("../lib/toast");
            showToast("Could not refresh profile details");
          } catch {
            /* toast best-effort */
          }
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
      // Transient network errors should not log the user out if they have a persisted session.
      // Only stop loading; the user keeps their hydrated session until next successful check.
      const hasSession = !!get().session?.access_token;
      if (hasSession) {
        set({ isLoading: false });
      } else {
        clearState();
      }
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
      // Keep loading until checkUser completes after hydration (session ownership).
      state.isLoading = true;
    }
  },
}));
