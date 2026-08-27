/**
 * Session lifecycle.
 *
 * Postgres is the authority: a session exists because a row exists. Valkey only
 * caches the resolved state so a request on a hot path does not need a round
 * trip to the database, and a cache miss or outage falls through to Postgres
 * rather than rejecting the request. Revocation writes to Postgres first and
 * only then drops the cache entry, so the window can never leave a revoked
 * session usable.
 */

import crypto from 'node:crypto';
import { query } from '../lib/postgres.js';
import { valkeyDel, valkeyGet, valkeySaddWithTtl, valkeySet, valkeySmembers } from '../lib/valkey.js';
import { SESSION_TTL_SECONDS, signToken, verifyToken } from './tokens.js';

const CACHE_TTL_SECONDS = 300;

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function cacheKey(tokenHash: string): string {
  return `session:${tokenHash}`;
}

/** Index of a user's live cache keys, so revoking every session can clear them. */
function userSessionsKey(userId: string): string {
  return `session:by-user:${userId}`;
}

export async function createSession(
  userId: string,
  userAgent: string,
): Promise<{ token: string; expiresAt: Date }> {
  const token = await signToken({ userId, purpose: 'session' }, SESSION_TTL_SECONDS);
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);

  await query(
    `INSERT INTO auth_sessions (token_hash, user_id, expires_at, user_agent)
     VALUES ($1, $2, $3, $4)`,
    [tokenHash, userId, expiresAt, userAgent.slice(0, 400)],
  );

  await valkeySaddWithTtl(userSessionsKey(userId), tokenHash, SESSION_TTL_SECONDS);
  return { token, expiresAt };
}

export interface ResolvedSession {
  userId: string;
  expiresAt: Date;
}

/**
 * Resolves a bearer token to its session, or null when the token is not a
 * valid, unexpired, unrevoked session.
 */
export async function resolveSession(token: string): Promise<ResolvedSession | null> {
  const claims = await verifyToken(token, 'session');
  if (!claims) return null;

  const tokenHash = hashToken(token);

  const cached = await valkeyGet(cacheKey(tokenHash));
  if (cached.status === 'ok' && cached.value !== null) {
    // A cached entry only exists for a session that was valid when written, and
    // is deleted on revocation, so it can be trusted for its short lifetime.
    const [userId, expiresAtIso] = cached.value.split('|');
    const expiresAt = expiresAtIso === undefined ? null : new Date(expiresAtIso);
    if (userId === claims.userId && expiresAt && expiresAt.getTime() > Date.now()) {
      return { userId, expiresAt };
    }
    return null;
  }

  const { rows } = await query<{ user_id: string; expires_at: Date }>(
    `UPDATE auth_sessions
        SET last_seen_at = now()
      WHERE token_hash = $1
        AND expires_at > now()
      RETURNING user_id, expires_at`,
    [tokenHash],
  );

  const row = rows[0];
  if (!row || row.user_id !== claims.userId) return null;

  // The cache entry must never outlive the session it describes.
  const remainingSeconds = Math.floor((row.expires_at.getTime() - Date.now()) / 1000);
  if (remainingSeconds > 0) {
    await valkeySet(
      cacheKey(tokenHash),
      `${row.user_id}|${row.expires_at.toISOString()}`,
      Math.min(CACHE_TTL_SECONDS, remainingSeconds),
    );
  }

  return { userId: row.user_id, expiresAt: row.expires_at };
}

export async function revokeSession(token: string): Promise<void> {
  const tokenHash = hashToken(token);
  await query('DELETE FROM auth_sessions WHERE token_hash = $1', [tokenHash]);
  await valkeyDel(cacheKey(tokenHash));
}

/** Used when a password changes or an account is suspended. */
export async function revokeAllSessions(userId: string): Promise<void> {
  await query('DELETE FROM auth_sessions WHERE user_id = $1', [userId]);

  const indexed = await valkeySmembers(userSessionsKey(userId));
  if (indexed.status === 'ok' && indexed.value.length > 0) {
    await valkeyDel(...indexed.value.map(cacheKey));
  }
  await valkeyDel(userSessionsKey(userId));
}

/** Removes rows whose expiry has passed. Called on a schedule, not per request. */
export async function purgeExpiredSessions(): Promise<number> {
  const { rowCount } = await query('DELETE FROM auth_sessions WHERE expires_at <= now()');
  return rowCount ?? 0;
}
