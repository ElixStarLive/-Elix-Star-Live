/**
 * Auth session owner — login/register/verify parsing + profile enrich.
 * Store remains UI state holder; this module owns the server contract calls.
 */

import { request } from '../../lib/apiClient';
import { parseAuthLoginRegisterResponse } from '../../lib/authApiContract';

export type AuthLoginResult =
  | {
      ok: true;
      kind: 'session';
      accessToken: string;
      user: Record<string, unknown>;
      profileMeta?: unknown;
      raw: unknown;
    }
  | { ok: true; kind: 'email_confirm'; raw: unknown }
  | { ok: false; error: string };

export type AuthSimpleResult = { ok: true } | { ok: false; error: string };

export type AuthMeResult =
  | {
      ok: true;
      accessToken: string;
      user: Record<string, unknown>;
      profileMeta?: unknown;
      raw: unknown;
    }
  | { ok: false; error: string; isAuthFailure: boolean };

function isAuthFailureMessage(msg: string): boolean {
  return (
    msg.includes('HTTP_401') ||
    msg.includes('HTTP_403') ||
    /invalid|expired|revoked|unauthorized|forbidden|session/i.test(msg)
  );
}

export async function authLoginWithPassword(
  email: string,
  password: string,
): Promise<AuthLoginResult> {
  if (!email || !password) {
    return { ok: false, error: 'Please enter both email and password.' };
  }
  const { data, error: loginError } = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: email.trim(), password }),
  });
  if (loginError) {
    return { ok: false, error: loginError.message || 'Login failed. Please try again.' };
  }
  const parsed = parseAuthLoginRegisterResponse(data);
  if (!parsed) {
    return { ok: false, error: 'Cannot reach backend. Try again later.' };
  }
  return {
    ok: true,
    kind: 'session',
    accessToken: parsed.accessToken,
    user: parsed.user as Record<string, unknown>,
    profileMeta: (data as { profile_meta?: unknown })?.profile_meta,
    raw: data,
  };
}

export async function authRegister(body: {
  email: string;
  password: string;
  username: string;
  displayName?: string;
}): Promise<AuthLoginResult> {
  const { data, error } = await request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (error) {
    return { ok: false, error: error.message || 'Registration failed.' };
  }
  if (data && typeof data === 'object' && (data as { needsEmailConfirmation?: boolean }).needsEmailConfirmation) {
    return { ok: true, kind: 'email_confirm', raw: data };
  }
  const parsed = parseAuthLoginRegisterResponse(data);
  if (!parsed) {
    return { ok: false, error: 'Cannot reach backend. Try again later.' };
  }
  return {
    ok: true,
    kind: 'session',
    accessToken: parsed.accessToken,
    user: parsed.user as Record<string, unknown>,
    profileMeta: (data as { profile_meta?: unknown })?.profile_meta,
    raw: data,
  };
}

export async function authVerifyEmail(token: string): Promise<AuthLoginResult> {
  const { data, error } = await request('/api/auth/verify-email', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
  if (error) {
    return { ok: false, error: error.message || 'Verification failed.' };
  }
  const parsed = parseAuthLoginRegisterResponse(data);
  if (!parsed) {
    return { ok: false, error: 'Invalid verification response.' };
  }
  return {
    ok: true,
    kind: 'session',
    accessToken: parsed.accessToken,
    user: parsed.user as Record<string, unknown>,
    raw: data,
  };
}

export async function authLogout(): Promise<{ error: string | null }> {
  const { error } = await request('/api/auth/logout', { method: 'POST' });
  return { error: error?.message ?? null };
}

export async function authGetMe(): Promise<AuthMeResult> {
  const { data, error } = await request('/api/auth/me');
  if (error) {
    const msg = String(error.message || '');
    return { ok: false, error: msg, isAuthFailure: isAuthFailureMessage(msg) };
  }
  const parsed = parseAuthLoginRegisterResponse(data);
  if (!parsed) {
    return { ok: false, error: 'Invalid session response.', isAuthFailure: true };
  }
  return {
    ok: true,
    accessToken: parsed.accessToken,
    user: parsed.user as Record<string, unknown>,
    profileMeta: (data as { profile_meta?: unknown })?.profile_meta,
    raw: data,
  };
}

export async function authResendConfirmation(email: string): Promise<AuthSimpleResult> {
  const { error } = await request('/api/auth/resend-confirmation', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
  if (error) {
    return { ok: false, error: error.message || 'Failed to resend confirmation email.' };
  }
  return { ok: true };
}

export async function authAppleNative(body: {
  idToken: string;
  givenName?: string | null;
  familyName?: string | null;
}): Promise<AuthLoginResult> {
  const { data, error } = await request('/api/auth/apple/native', {
    method: 'POST',
    body: JSON.stringify({
      idToken: body.idToken,
      givenName: body.givenName,
      familyName: body.familyName,
    }),
  });
  if (error) {
    return { ok: false, error: error.message || 'Apple sign-in failed.' };
  }
  const parsed = parseAuthLoginRegisterResponse(data);
  if (!parsed) {
    return { ok: false, error: 'Apple sign-in returned an invalid session.' };
  }
  return {
    ok: true,
    kind: 'session',
    accessToken: parsed.accessToken,
    user: parsed.user as Record<string, unknown>,
    profileMeta: (data as { profile_meta?: unknown })?.profile_meta,
    raw: data,
  };
}

export async function authForgotPassword(email: string): Promise<AuthSimpleResult> {
  const { error } = await request('/api/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email: email.trim() }),
  });
  if (error) {
    return { ok: false, error: error.message || 'Unable to process request. Please try again.' };
  }
  return { ok: true };
}

export async function authResetPassword(token: string, password: string): Promise<AuthSimpleResult> {
  const { error } = await request('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ password, token }),
  });
  if (error) {
    return { ok: false, error: error.message || 'Password reset is not available at this time.' };
  }
  return { ok: true };
}

export async function authDeleteAccount(): Promise<AuthSimpleResult> {
  const { error } = await request('/api/auth/delete', { method: 'POST' });
  if (error) {
    return { ok: false, error: error.message || 'Failed to delete account.' };
  }
  return { ok: true };
}
