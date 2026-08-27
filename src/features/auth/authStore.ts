/**
 * The one owner of authentication state.
 *
 * Nothing is persisted here. The session survives a reload because the server
 * set an HttpOnly cookie, and the app re-establishes it on boot by calling
 * `/api/auth/me`. That keeps the server authoritative about whether a session is
 * still valid — a token copied into local storage would let a revoked or
 * suspended account keep rendering as signed in until something happened to
 * contradict it.
 */

import { create } from 'zustand';
import { setBearerToken } from '../../lib/apiClient';
import { fetchCurrentSession, login, logout, type AuthUser } from './authApi';

export type AuthStatus = 'restoring' | 'authenticated' | 'anonymous';

export interface LoginFailure {
  code: string;
  message: string;
}

interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;

  /** Resolves the persisted session on app start. Safe to call more than once. */
  restore: () => Promise<void>;
  signIn: (identifier: string, password: string) => Promise<LoginFailure | null>;
  signOut: () => Promise<void>;
}

/**
 * Server codes mapped to the copy shown to a person. Kept next to the store
 * rather than in the page so every entry point reports a failure identically.
 */
const LOGIN_MESSAGES: Record<string, string> = {
  invalid_credentials: 'Incorrect email/username or password.',
  email_not_confirmed: 'Please verify your email address before logging in.',
  account_suspended: 'This account has been suspended.',
  too_many_attempts: 'Too many failed sign-in attempts. Please try again later.',
  invalid_request: 'Please enter both your email or username and your password.',
  network_error: 'Cannot reach the server. Check your connection and try again.',
};

function loginFailure(code: string, fallback: string): LoginFailure {
  return { code, message: LOGIN_MESSAGES[code] ?? fallback };
}

export const useAuthStore = create<AuthState>()((set) => ({
  status: 'restoring',
  user: null,

  restore: async () => {
    const { data, error } = await fetchCurrentSession();

    if (error) {
      // A network failure is not proof of signing out, but there is no session
      // to show either, so the app starts anonymous and the person can retry.
      setBearerToken(null);
      set({ status: 'anonymous', user: null });
      return;
    }

    setBearerToken(data.session.accessToken);
    set({ status: 'authenticated', user: data.user });
  },

  signIn: async (identifier, password) => {
    const { data, error } = await login(identifier, password);

    if (error) {
      if (error.code === 'aborted') return null;
      return loginFailure(error.code, error.message);
    }

    setBearerToken(data.session.accessToken);
    set({ status: 'authenticated', user: data.user });
    return null;
  },

  signOut: async () => {
    // Local state is cleared whatever the server says: refusing to sign out
    // locally because a network call failed leaves the session on screen.
    await logout();
    setBearerToken(null);
    set({ status: 'anonymous', user: null });
  },
}));
