/**
 * The client half of the auth wire contract.
 *
 * These types mirror `server/auth/contract.ts` exactly. Responses are validated
 * before use rather than cast: the compiler cannot check what arrives over the
 * network, and a body that does not match the contract is a failure to report,
 * not a shape to hope about.
 */

import { request, type ApiResult } from '../../lib/apiClient';

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  /** Empty string when the address has not been confirmed. */
  emailConfirmedAt: string;
  createdAt: string;
  isAdmin: boolean;
  isVerified: boolean;
}

export interface AuthSession {
  accessToken: string;
  expiresAt: string;
}

export interface AuthSuccess {
  user: AuthUser;
  session: AuthSession;
}

function isAuthSuccess(value: unknown): value is AuthSuccess {
  if (value === null || typeof value !== 'object') return false;
  const { user, session } = value as { user?: unknown; session?: unknown };

  if (user === null || typeof user !== 'object') return false;
  const u = user as Record<string, unknown>;
  const stringFields = ['id', 'email', 'username', 'displayName', 'avatarUrl', 'emailConfirmedAt', 'createdAt'];
  if (!stringFields.every((field) => typeof u[field] === 'string')) return false;
  if (typeof u.id === 'string' && u.id.length === 0) return false;
  if (typeof u.isAdmin !== 'boolean' || typeof u.isVerified !== 'boolean') return false;

  if (session === null || typeof session !== 'object') return false;
  const s = session as Record<string, unknown>;
  return typeof s.accessToken === 'string' && s.accessToken.length > 0 && typeof s.expiresAt === 'string';
}

function validated(result: ApiResult<unknown>): ApiResult<AuthSuccess> {
  if (result.error) return { data: null, error: result.error };
  if (!isAuthSuccess(result.data)) {
    return {
      data: null,
      error: { code: 'invalid_response', message: 'The server returned an unexpected response.', status: 0 },
    };
  }
  return { data: result.data, error: null };
}

export async function login(identifier: string, password: string): Promise<ApiResult<AuthSuccess>> {
  return validated(
    await request<unknown>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password }),
    }),
  );
}

export async function fetchCurrentSession(): Promise<ApiResult<AuthSuccess>> {
  return validated(await request<unknown>('/api/auth/me'));
}

export async function logout(): Promise<ApiResult<void>> {
  return request<void>('/api/auth/logout', { method: 'POST' });
}
