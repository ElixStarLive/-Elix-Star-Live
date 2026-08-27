import { request, type ApiResult } from '../../lib/apiClient';

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatarUrl: string;
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

export interface RegisterResult {
  status: 'signed_in' | 'verification_required';
  user: AuthUser;
  session?: AuthSession;
  verificationEmailSent?: boolean;
}

function toAuthUser(value: Record<string, unknown>): AuthUser {
  if (
    typeof value.id !== 'string' ||
    typeof value.email !== 'string' ||
    typeof value.username !== 'string' ||
    typeof value.displayName !== 'string' ||
    typeof value.avatarUrl !== 'string' ||
    typeof value.emailConfirmedAt !== 'string' ||
    typeof value.createdAt !== 'string' ||
    typeof value.isAdmin !== 'boolean' ||
    typeof value.isVerified !== 'boolean'
  ) {
    throw new Error('Invalid auth user shape');
  }
  return value as unknown as AuthUser;
}

function asAuthSuccess(value: unknown): AuthSuccess | null {
  if (value === null || typeof value !== 'object') return null;
  const { user, session } = value as { user?: unknown; session?: unknown };

  if (user === null || typeof user !== 'object') return null;
  const u = user as Record<string, unknown>;
  const stringFields = ['id', 'email', 'username', 'displayName', 'avatarUrl', 'emailConfirmedAt', 'createdAt'];
  if (!stringFields.every((field) => typeof u[field] === 'string')) return null;
  if (typeof u.id === 'string' && u.id.length === 0) return null;
  if (typeof u.isAdmin !== 'boolean' || typeof u.isVerified !== 'boolean') return null;

  if (session === null || typeof session !== 'object') return null;
  const s = session as Record<string, unknown>;
  if (typeof s.accessToken !== 'string' || s.accessToken.length === 0 || typeof s.expiresAt !== 'string') {
    return null;
  }
  return { user: toAuthUser(u), session: { accessToken: s.accessToken, expiresAt: s.expiresAt } };
}

function validated(result: ApiResult<unknown>): ApiResult<AuthSuccess> {
  if (result.error) return { data: null, error: result.error };
  const parsed = asAuthSuccess(result.data);
  if (parsed === null) {
    return {
      data: null,
      error: { code: 'invalid_response', message: 'The server returned an unexpected response.', status: 0 },
    };
  }
  return { data: parsed, error: null };
}

export async function register(body: {
  email: string;
  password: string;
  username: string | undefined;
}): Promise<ApiResult<RegisterResult>> {
  const result = await request<unknown>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (result.error) return { data: null, error: result.error };

  const data = result.data as Record<string, unknown>;
  if (typeof data.status !== 'string' || data.user === null || typeof data.user !== 'object') {
    return {
      data: null,
      error: { code: 'invalid_response', message: 'Unexpected registration response.', status: 0 },
    };
  }

  if (data.status !== 'signed_in' && data.status !== 'verification_required') {
    return {
      data: null,
      error: { code: 'invalid_response', message: 'Unexpected registration response.', status: 0 },
    };
  }

  const status = data.status as 'signed_in' | 'verification_required';

  if (status === 'signed_in') {
    const session = data.session;
    if (session === null || typeof session !== 'object') {
      return {
        data: null,
        error: { code: 'invalid_response', message: 'Unexpected registration response.', status: 0 },
      };
    }
    const s = session as Record<string, unknown>;
    if (typeof s.accessToken !== 'string' || s.accessToken.length === 0 || typeof s.expiresAt !== 'string') {
      return {
        data: null,
        error: { code: 'invalid_response', message: 'Unexpected registration response.', status: 0 },
      };
    }
    return {
      data: {
        status,
        user: toAuthUser(data.user as Record<string, unknown>),
        session: { accessToken: s.accessToken, expiresAt: s.expiresAt },
      },
      error: null,
    };
  }

  return {
    data: {
      status,
      user: toAuthUser(data.user as Record<string, unknown>),
      verificationEmailSent: data.verificationEmailSent === true,
    },
    error: null,
  };
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
