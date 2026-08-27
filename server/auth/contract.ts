/**
 * The auth wire contract, defined once and shared by every auth route.
 *
 * One shape for the authenticated user means login, registration, email
 * verification and session restore all return the same body, and the client has
 * exactly one thing to parse. Fields are never null: an absent value is an empty
 * string or a boolean, so no consumer has to distinguish null from undefined.
 */

import type { AccountRow } from './users.repository.js';

export interface AuthUserBody {
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

export interface AuthSessionBody {
  accessToken: string;
  expiresAt: string;
}

export interface AuthSuccessBody {
  user: AuthUserBody;
  session: AuthSessionBody;
}

/** Machine-readable failure codes. The client maps these to copy; it never matches on message text. */
export type AuthErrorCode =
  | 'invalid_request'
  | 'invalid_credentials'
  | 'email_not_confirmed'
  | 'account_suspended'
  | 'too_many_attempts'
  | 'unauthenticated'
  | 'server_error';

export interface ApiErrorBody {
  error: { code: AuthErrorCode; message: string };
}

export function toAuthUserBody(account: AccountRow): AuthUserBody {
  return {
    id: account.id,
    email: account.email,
    username: account.username,
    displayName: account.displayName,
    avatarUrl: account.avatarUrl,
    emailConfirmedAt: account.emailConfirmedAt?.toISOString() ?? '',
    createdAt: account.createdAt.toISOString(),
    isAdmin: account.isAdmin,
    isVerified: account.isVerified,
  };
}

export function authSuccessBody(account: AccountRow, token: string, expiresAt: Date): AuthSuccessBody {
  return {
    user: toAuthUserBody(account),
    session: { accessToken: token, expiresAt: expiresAt.toISOString() },
  };
}

export function apiError(code: AuthErrorCode, message: string): ApiErrorBody {
  return { error: { code, message } };
}
