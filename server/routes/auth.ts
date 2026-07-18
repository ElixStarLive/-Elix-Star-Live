/**
 * Auth API: login, register, logout, me, resend-confirmation, apple/start.
 * Uses Neon/Postgres user store + custom HS256 JWT.
 */

import { Request, Response } from 'express';
import crypto from 'crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { getPool } from '../lib/postgres';
import { logger } from '../lib/logger';
import {
  isValkeyConfigured,
  valkeyGet,
  valkeySet,
  valkeyDel,
  valkeySadd,
  valkeySmembers,
  valkeyExpire,
} from '../lib/valkey';
import { isEmailConfigured, sendTransactionalEmail } from '../lib/email';
import {
  getProgressionSnapshot,
  initializeNewUserStarterProgression,
} from '../lib/starterCoinsXp';

const COOKIE_NAME = 'auth_token';
const TOKEN_EXPIRY_SEC = 60 * 60 * 24 * 7; // 7 days
const SALT_LEN = 16;
const KEY_LEN = 64;
const SCRYPT_OPTS = { N: 16384, r: 8, p: 1 };
const APPLE_JWKS = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

function getSecret(): string {
  const s = process.env.JWT_SECRET || process.env.AUTH_SECRET || '';
  if (!s) {
    throw new Error('FATAL: JWT_SECRET (or AUTH_SECRET) is not set. Cannot sign or verify tokens.');
  }
  return s;
}

export function validateAuthSecretOrDie(): void {
  const s = process.env.JWT_SECRET || process.env.AUTH_SECRET || '';
  if (!s) {
    logger.fatal('JWT_SECRET / AUTH_SECRET is not configured. Server cannot start safely.');
    process.exit(1);
  }
  if (s.length < 32) {
    logger.warn('JWT_SECRET is shorter than 32 characters — consider using a stronger secret.');
  }
}

function scryptAsync(password: string, salt: Buffer, keyLen: number, opts: crypto.ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keyLen, opts, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(SALT_LEN);
  const key = await scryptAsync(password, salt, KEY_LEN, SCRYPT_OPTS);
  return salt.toString('base64') + ':' + key.toString('base64');
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltB64, keyB64] = stored.split(':');
  if (!saltB64 || !keyB64) return false;
  const salt = Buffer.from(saltB64, 'base64');
  const key = await scryptAsync(password, salt, KEY_LEN, SCRYPT_OPTS);
  const a = Buffer.from(key.toString('base64'));
  const b = Buffer.from(keyB64);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** Fixed decoy hash so missing-user login takes the same scrypt cost as a real miss. */
let loginDecoyHashPromise: Promise<string> | null = null;
function getLoginDecoyHash(): Promise<string> {
  if (!loginDecoyHashPromise) {
    loginDecoyHashPromise = hashPassword('__elix_login_timing_decoy__');
  }
  return loginDecoyHashPromise;
}

const RESET_TOKEN_EXPIRY_SEC = 60 * 60; // 1 hour — purpose-bound, not a session

// Binds a purpose-bound token (e.g. password reset) to the account's current
// password hash. After a successful reset the hash changes, so an old token's
// binding no longer matches — making reset links effectively single-use.
export function passwordResetBinding(passwordHash: string): string {
  return crypto.createHash('sha256').update(String(passwordHash)).digest('base64url').slice(0, 22);
}

function signToken(
  payload: { sub: string; email: string },
  opts?: { purpose?: string; expirySec?: number; pv?: string },
): string {
  const secret = getSecret();
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const body: Record<string, unknown> = {
    sub: payload.sub,
    email: payload.email,
    iat: now,
    exp: now + (opts?.expirySec ?? TOKEN_EXPIRY_SEC),
  };
  if (opts?.purpose) body.purpose = opts.purpose;
  if (opts?.pv) body.pv = opts.pv;
  const b64 = (obj: object) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const part1 = b64(header);
  const part2 = b64(body);
  const sig = crypto.createHmac('sha256', secret).update(`${part1}.${part2}`).digest('base64url');
  return `${part1}.${part2}.${sig}`;
}

function verifyToken(token: string): { sub: string; email: string; purpose?: string; pv?: string } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [, payloadB64, sig] = parts;
    const secret = getSecret();
    const expectedSig = crypto.createHmac('sha256', secret).update(`${parts[0]}.${payloadB64}`).digest('base64url');
    const sigBuf = Buffer.from(sig);
    const expectedBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return {
      sub: payload.sub,
      email: payload.email ?? '',
      purpose: typeof payload.purpose === 'string' ? payload.purpose : undefined,
      pv: typeof payload.pv === 'string' ? payload.pv : undefined,
    };
  } catch {
    return null;
  }
}

export function getTokenFromRequest(req: Request): string | null {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  const cookie = req.headers.cookie;
  if (!cookie) return null;
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function verifyAuthToken(token: string): { sub: string; email: string } | null {
  const payload = verifyToken(token);
  // Purpose-bound tokens (e.g. password_reset) must never authenticate API sessions.
  if (!payload || payload.purpose) return null;
  return { sub: payload.sub, email: payload.email };
}

/**
 * Server-side session + ban state for a bearer token.
 * - "ok": valid JWT, live session row, not banned
 * - "revoked": valid JWT but the session row is missing/expired (logged out / expired)
 * - "banned": valid JWT + live session but the account is suspended
 * - "unavailable": session state could not be verified safely
 * - null: JWT is invalid/expired (treat as anonymous)
 */
type SessionState = { state: 'ok' | 'revoked' | 'banned' | 'unavailable'; userId: string };

/**
 * Session-validation cache (Valkey).
 *
 * checkSessionState runs on EVERY authenticated request (sessionGuard) and every
 * WS connect, so at scale it is the highest-volume DB read on the platform. The
 * cache keeps the DB off that hot path while preserving strong enforcement:
 *
 *  - Postgres remains the source of truth; a cache miss or any Valkey error
 *    falls back to the DB query and NEVER grants access on error.
 *  - Only decided, safe states are cached ("ok"/"revoked"). "banned" and
 *    "unavailable" are never cached, so a ban is enforced the moment the pre-ban
 *    "ok" entry is invalidated (invalidateUserSessionCache) or its short TTL
 *    lapses — whichever comes first.
 *  - A per-user index (sessidx:{userId}) lets ban / logout-all / delete / reset
 *    invalidate every cached token for that user immediately, even though the
 *    cache is keyed by token hash.
 */
const SESSION_CACHE_TTL_MS = 60_000;
const SESSION_INDEX_TTL_SEC = Math.ceil(SESSION_CACHE_TTL_MS / 1000) + 30;

function sessionCacheKey(tokenHash: string): string {
  return `sess:${tokenHash}`;
}
function userSessionIndexKey(userId: string): string {
  return `sessidx:${userId}`;
}

async function readCachedSessionState(tokenHash: string): Promise<SessionState | null> {
  if (!isValkeyConfigured()) return null;
  try {
    const cached = await valkeyGet(sessionCacheKey(tokenHash));
    if (!cached) return null;
    const parsed = JSON.parse(cached) as SessionState;
    if (parsed && (parsed.state === 'ok' || parsed.state === 'revoked') && parsed.userId) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

async function writeCachedSessionState(tokenHash: string, state: SessionState): Promise<void> {
  if (!isValkeyConfigured()) return;
  // Only cache decided, safe-to-cache states.
  if (state.state !== 'ok' && state.state !== 'revoked') return;
  try {
    await valkeySet(sessionCacheKey(tokenHash), JSON.stringify(state), SESSION_CACHE_TTL_MS);
    if (state.userId) {
      await valkeySadd(userSessionIndexKey(state.userId), tokenHash);
      // Index outlives the entries it points at so ban-time invalidation can find them.
      await valkeyExpire(userSessionIndexKey(state.userId), SESSION_INDEX_TTL_SEC);
    }
  } catch (err) {
    logger.warn({ err }, 'writeCachedSessionState failed');
  }
}

/** Invalidate one cached session by its token (logout). Best-effort. */
export async function invalidateSessionCacheByToken(token: string): Promise<void> {
  if (!isValkeyConfigured()) return;
  try {
    await valkeyDel(sessionCacheKey(hashSessionToken(token)));
  } catch (err) {
    logger.warn({ err }, 'invalidateSessionCacheByToken failed');
  }
}

/** Invalidate every cached session for a user (ban / logout-all / delete / reset). Best-effort. */
export async function invalidateUserSessionCache(userId: string): Promise<void> {
  if (!isValkeyConfigured() || !userId) return;
  try {
    const hashes = await valkeySmembers(userSessionIndexKey(userId));
    await Promise.all(hashes.map((h) => valkeyDel(sessionCacheKey(h))));
    await valkeyDel(userSessionIndexKey(userId));
  } catch (err) {
    logger.warn({ err, userId }, 'invalidateUserSessionCache failed');
  }
}

export async function checkSessionState(
  token: string,
): Promise<SessionState | null> {
  const payload = verifyToken(token);
  // Purpose-bound tokens are not sessions.
  if (!payload || payload.purpose) return null;

  const tokenHash = hashSessionToken(token);

  // Fast path: serve a previously-validated state from Valkey. The DB stays the
  // source of truth (see cache doc above); this only short-circuits repeated
  // reads within the short TTL window.
  const cached = await readCachedSessionState(tokenHash);
  if (cached) return cached;

  const pool = getPool();
  if (!pool) return { state: 'unavailable', userId: payload.sub };
  try {
    const r = await pool.query(
      `SELECT (s.token_hash IS NOT NULL) AS has_session, p.banned_until
         FROM (SELECT $1::text AS th, $2::text AS uid) x
         LEFT JOIN elix_auth_sessions s ON s.token_hash = x.th AND s.expires_at > NOW()
         LEFT JOIN profiles p ON p.user_id = x.uid
        LIMIT 1`,
      [tokenHash, payload.sub],
    );
    const row = r.rows[0] as { has_session?: boolean; banned_until?: Date | string | null } | undefined;
    let result: SessionState;
    if (!row || row.has_session !== true) {
      result = { state: 'revoked', userId: payload.sub };
    } else {
      const bu = row.banned_until;
      result = bu && new Date(bu).getTime() > Date.now()
        ? { state: 'banned', userId: payload.sub }
        : { state: 'ok', userId: payload.sub };
    }
    await writeCachedSessionState(tokenHash, result);
    return result;
  } catch (err) {
    logger.error({ err, userId: payload.sub }, 'checkSessionState query failed');
    return { state: 'unavailable', userId: payload.sub };
  }
}

/** Remove bearer + auth cookie from the request so downstream treats it as anonymous. */
export function stripAuthCredentials(req: Request): void {
  delete req.headers.authorization;
  const cookie = req.headers.cookie;
  if (cookie) {
    const filtered = cookie
      .split(';')
      .map((s) => s.trim())
      .filter((c) => c && !c.startsWith(`${COOKIE_NAME}=`))
      .join('; ');
    if (filtered) req.headers.cookie = filtered;
    else delete req.headers.cookie;
  }
}

function setAuthCookie(res: Response, token: string) {
  const isProd = process.env.NODE_ENV === 'production';
  res.setHeader('Set-Cookie', [
    `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${TOKEN_EXPIRY_SEC}${isProd ? '; Secure' : ''}`,
  ].join(', '));
}

function clearAuthCookie(res: Response) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

interface StoredUser {
  id: string;
  email: string;
  passwordHash: string;
  username: string;
  avatar_url: string;
  created_at: string;
}
let authTableEnsured = false;
let sessionTableEnsured = false;

async function ensureAuthUsersTable(): Promise<void> {
  if (authTableEnsured) return;
  const pool = getPool();
  if (!pool) return;
  authTableEnsured = true;
}

async function ensureAuthSessionsTable(): Promise<void> {
  if (sessionTableEnsured) return;
  const pool = getPool();
  if (!pool) return;
  sessionTableEnsured = true;
}

function hashSessionToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function rowToStoredUser(row: Record<string, unknown>): StoredUser {
  return {
    id: String(row.id),
    email: String(row.email ?? ''),
    passwordHash: String(row.password_hash ?? ''),
    username: String(row.username ?? ''),
    avatar_url: String(row.avatar_url ?? ''),
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at ?? new Date().toISOString()),
  };
}

async function dbFindUserByEmail(email: string): Promise<StoredUser | null> {
  const pool = getPool();
  if (!pool) return null;
  await ensureAuthUsersTable();
  const r = await pool.query(
    `SELECT id, email, password_hash, username, avatar_url, created_at
       FROM elix_auth_users
      WHERE email_lower = $1
      LIMIT 1`,
    [email.toLowerCase()],
  );
  if (!r.rowCount) return null;
  return rowToStoredUser(r.rows[0] as Record<string, unknown>);
}

async function dbFindUserByEmailOrUsername(identifier: string): Promise<StoredUser | null> {
  const pool = getPool();
  if (!pool) return null;
  await ensureAuthUsersTable();
  const lower = identifier.toLowerCase();
  const emailResult = await pool.query(
    `SELECT u.id, u.email, u.password_hash, u.username, u.avatar_url, u.created_at
       FROM elix_auth_users u
      WHERE u.email_lower = $1
      LIMIT 1`,
    [lower],
  );
  if (emailResult.rowCount) {
    return rowToStoredUser(emailResult.rows[0] as Record<string, unknown>);
  }
  const usernameResult = await pool.query(
    `SELECT u.id, u.email, u.password_hash, u.username, u.avatar_url, u.created_at
       FROM elix_auth_users u
      WHERE LOWER(u.username) = $1
      ORDER BY u.created_at ASC
      LIMIT 2`,
    [lower],
  );
  // Legacy duplicate usernames must use their unique email; never choose an
  // arbitrary account. Display names are public and are not login identifiers.
  if (usernameResult.rowCount !== 1) return null;
  return rowToStoredUser(usernameResult.rows[0] as Record<string, unknown>);
}

async function dbFindUserById(id: string): Promise<StoredUser | null> {
  const pool = getPool();
  if (!pool) return null;
  await ensureAuthUsersTable();
  const r = await pool.query(
    `SELECT id, email, password_hash, username, avatar_url, created_at
       FROM elix_auth_users
      WHERE id = $1
      LIMIT 1`,
    [id],
  );
  if (!r.rowCount) return null;
  return rowToStoredUser(r.rows[0] as Record<string, unknown>);
}

async function dbInsertUser(user: StoredUser): Promise<void> {
  const pool = getPool();
  if (!pool) return;
  await ensureAuthUsersTable();
  await pool.query(
    `INSERT INTO elix_auth_users (id, email, email_lower, password_hash, username, avatar_url, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [user.id, user.email, user.email.toLowerCase(), user.passwordHash, user.username, user.avatar_url, user.created_at],
  );
}

async function dbRegisterUser(
  user: StoredUser,
): Promise<"ok" | "email_exists" | "username_exists"> {
  const pool = getPool();
  if (!pool) throw new Error("DATABASE_UNAVAILABLE");
  await ensureAuthUsersTable();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Serialize registrations for the same case-insensitive username. Email
    // uniqueness is also enforced by elix_auth_users.email_lower.
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
      `register:${user.username.toLowerCase()}`,
    ]);
    const existing = await client.query(
      `SELECT email_lower, LOWER(username) AS username_lower
         FROM elix_auth_users
        WHERE email_lower = $1 OR LOWER(username) = $2
        LIMIT 1`,
      [user.email.toLowerCase(), user.username.toLowerCase()],
    );
    if (existing.rowCount) {
      await client.query("ROLLBACK");
      return existing.rows[0]?.email_lower === user.email.toLowerCase()
        ? "email_exists"
        : "username_exists";
    }
    await client.query(
      `INSERT INTO elix_auth_users
         (id, email, email_lower, password_hash, username, avatar_url, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        user.id,
        user.email,
        user.email.toLowerCase(),
        user.passwordHash,
        user.username,
        user.avatar_url,
        user.created_at,
      ],
    );
    await client.query(
      `INSERT INTO profiles
         (user_id, username, display_name, avatar_url, level, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 0, NOW(), NOW())
       ON CONFLICT (user_id) DO NOTHING`,
      [user.id, user.username, user.username, user.avatar_url],
    );
    await initializeNewUserStarterProgression(client, user.id);
    await client.query("COMMIT");
    return "ok";
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function _dbDeleteUserById(id: string): Promise<void> {
  const pool = getPool();
  if (!pool) return;
  await ensureAuthUsersTable();
  await pool.query(`DELETE FROM elix_auth_users WHERE id = $1`, [id]);
}

async function dbUpsertSession(userId: string, token: string): Promise<void> {
  const pool = getPool();
  if (!pool) return;
  await ensureAuthSessionsTable();
  const tokenHash = hashSessionToken(token);
  await pool.query(
    `INSERT INTO elix_auth_sessions (token_hash, user_id, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '7 days')
     ON CONFLICT (token_hash) DO UPDATE
       SET user_id = EXCLUDED.user_id, expires_at = EXCLUDED.expires_at`,
    [tokenHash, userId],
  );
}

async function dbDeleteSessionByToken(token: string): Promise<void> {
  const pool = getPool();
  if (!pool) return;
  await ensureAuthSessionsTable();
  await pool.query(`DELETE FROM elix_auth_sessions WHERE token_hash = $1`, [hashSessionToken(token)]);
  await invalidateSessionCacheByToken(token);
}

/** Public user object for JSON responses: only strings (no null), so clients do not need null–undefined juggling. */
function toAuthUser(u: StoredUser): {
  id: string;
  email: string;
  user_metadata: { username: string; full_name: string; avatar_url: string };
  email_confirmed_at: string;
  created_at: string;
} {
  return {
    id: u.id,
    email: u.email || '',
    user_metadata: {
      username: u.username || '',
      full_name: u.username || '',
      avatar_url: u.avatar_url || '',
    },
    email_confirmed_at: new Date().toISOString(),
    created_at: u.created_at || new Date().toISOString(),
  };
}

function authSessionJson(token: string) {
  return { access_token: token, accessToken: token };
}

/** Same body for login, register, and guest success — one contract for the app. */
function authLoginRegisterBody(u: StoredUser, token: string) {
  return { user: toAuthUser(u), session: authSessionJson(token) };
}

async function loadProfileMeta(userId: string): Promise<{
  is_admin?: boolean;
  is_creator?: boolean;
  banned_until?: string | null;
  starter_coin_balance?: number;
  total_xp?: number;
  level?: number;
}> {
  const pool = getPool();
  if (!pool) return {};
  try {
    const pr = await pool.query(
      `SELECT COALESCE(is_admin, false) AS is_admin, COALESCE(is_verified, false) AS is_verified, banned_until FROM profiles WHERE user_id = $1`,
      [userId],
    );
    const row = pr.rows[0] as { is_admin?: boolean; is_verified?: boolean; banned_until?: Date } | undefined;
    if (!row) return {};
    const progression = await getProgressionSnapshot(userId);
    return {
      is_admin: Boolean(row.is_admin),
      is_creator: Boolean(row.is_verified),
      banned_until: row.banned_until ? new Date(row.banned_until).toISOString() : null,
      starter_coin_balance: progression?.starter_coin_balance ?? 0,
      total_xp: progression?.total_xp ?? 0,
      level: progression?.current_level ?? 0,
    };
  } catch (err) {
    logger.warn({ err, userId }, 'loadProfileMeta skipped');
    return {};
  }
}

export async function handleLogin(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { email, password } = req.body ?? {};
    const e = typeof email === 'string' ? email.trim() : '';
    if (!e || !password) {
      return res.status(400).json({ error: 'Please enter both email and password.' });
    }
    if (!getPool()) return res.status(503).json({ error: 'Database not configured' });
    const user = await dbFindUserByEmailOrUsername(e);
    if (!user) {
      await verifyPassword(password, await getLoginDecoyHash());
      return res.status(401).json({ error: 'Invalid login credentials.' });
    }
    if (!(await verifyPassword(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Invalid login credentials.' });
    }
    const pool = getPool();
    if (pool) {
      try {
        const ban = await pool.query(`SELECT banned_until FROM profiles WHERE user_id = $1`, [user.id]);
        const bu = ban.rows[0]?.banned_until as Date | string | undefined;
        if (bu && new Date(bu).getTime() > Date.now()) {
          return res.status(403).json({ error: 'Account suspended.' });
        }
      } catch (err) {
        logger.error({ err }, 'login banned_until check failed — blocking login for safety');
        return res.status(500).json({ error: 'Login temporarily unavailable. Please try again.' });
      }
    }
    const token = signToken({ sub: user.id, email: user.email });
    await dbUpsertSession(user.id, token);
    setAuthCookie(res, token);
    const profile_meta = await loadProfileMeta(user.id);
    return res.status(200).json({ ...authLoginRegisterBody(user, token), profile_meta });
  } catch (err) {
    logger.error({ err }, 'handleLogin failed');
    return res.status(500).json({ error: 'Login failed. Please try again.' });
  }
}

/**
 * Guest login: creates or reuses a lightweight guest account with random email.
 * No password required; disabled in production.
 */
export async function handleGuestLogin(_req: Request, res: Response) {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Guest login is disabled in production.' });
  }
  if (!getPool()) return res.status(503).json({ error: 'Database not configured' });
  let guest: StoredUser | null = await dbFindUserByEmail('guest@example.com');
  if (!guest) {
    const id = crypto.randomUUID();
    const uname = 'Guest';
    const avatar_url = `https://ui-avatars.com/api/?name=${encodeURIComponent(
      uname,
    )}&background=random`;
    const created_at = new Date().toISOString();
    guest = {
      id,
      email: 'guest@example.com',
      passwordHash: await hashPassword(crypto.randomUUID()),
      username: uname,
      avatar_url,
      created_at,
    };
    await dbInsertUser(guest);
  }

  const token = signToken({ sub: guest.id, email: guest.email });
  await dbUpsertSession(guest.id, token);
  setAuthCookie(res, token);
  return res.status(200).json(authLoginRegisterBody(guest, token));
}

export async function handleRegister(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { email, password, username } = req.body ?? {};
    const e = typeof email === 'string' ? email.trim() : '';
    if (!e || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }
    if (typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }
    if (!getPool()) return res.status(503).json({ error: 'Database not configured' });
    const id = crypto.randomUUID();
    const uname = typeof username === 'string' && username.trim() ? username.trim() : e.split('@')[0];
    const avatar_url = `https://ui-avatars.com/api/?name=${encodeURIComponent(uname)}&background=random`;
    const created_at = new Date().toISOString();
    const stored: StoredUser = {
      id,
      email: e,
      passwordHash: await hashPassword(password),
      username: uname,
      avatar_url,
      created_at,
    };
    const registration = await dbRegisterUser(stored);
    if (registration === "email_exists") {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }
    if (registration === "username_exists") {
      return res.status(409).json({ error: 'This username is already taken.' });
    }
    const token = signToken({ sub: id, email: e });
    await dbUpsertSession(id, token);
    setAuthCookie(res, token);
    const profile_meta = await loadProfileMeta(id);
    return res.status(201).json({
      ...authLoginRegisterBody(stored, token),
      profile_meta,
      welcome_message:
        'Welcome! You received 50,000 Starter Coins to explore gifts and support creators.',
    });
  } catch (err) {
    logger.error({ err }, 'handleRegister failed');
    return res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
}

export async function handleLogout(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const token = getTokenFromRequest(req);
  if (token) {
    await dbDeleteSessionByToken(token).catch((err) => { logger.error({ err }, "handleLogout: session delete failed"); });
  }
  clearAuthCookie(res);
  return res.status(200).json({ ok: true });
}

export async function handleMe(req: Request, res: Response) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const token = getTokenFromRequest(req);
    if (!token) return res.status(401).json({ error: 'Not authenticated.' });
    const payload = verifyAuthToken(token);
    if (!payload) return res.status(401).json({ error: 'Invalid or expired session.' });
    res.setHeader("Cache-Control", "private, no-store");
    if (!getPool()) return res.status(503).json({ error: 'Database not configured' });
    const user = await dbFindUserById(payload.sub);
    if (!user) return res.status(401).json({ error: 'User not found.' });
    const profile_meta = await loadProfileMeta(payload.sub);
    return res.status(200).json({
      ...authLoginRegisterBody(user, token),
      profile_meta,
    });
  } catch (err) {
    logger.error({ err }, 'handleMe failed');
    return res.status(500).json({ error: 'Session check failed.' });
  }
}

export async function handleDeleteAccount(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const token = getTokenFromRequest(req);
  if (!token) return res.status(401).json({ error: 'Not authenticated.' });
  const payload = verifyAuthToken(token);
  if (!payload) return res.status(401).json({ error: 'Invalid or expired session.' });

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not configured' });
  const user = await dbFindUserById(payload.sub);
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  const client = await pool.connect();
  // Each delete is wrapped in a SAVEPOINT so that an absent optional table/column
  // (schema drift across environments) cannot abort the whole account deletion.
  const del = async (sql: string, params: unknown[]) => {
    await client.query('SAVEPOINT del_sp');
    try {
      await client.query(sql, params);
      await client.query('RELEASE SAVEPOINT del_sp');
    } catch (err) {
      await client.query('ROLLBACK TO SAVEPOINT del_sp');
      logger.warn({ err, sql }, 'handleDeleteAccount: skipped delete (schema drift)');
    }
  };
  try {
    await client.query('BEGIN');
    // Sessions + auth
    await del(`DELETE FROM elix_auth_sessions WHERE user_id = $1`, [user.id]);
    await del(`DELETE FROM elix_device_tokens WHERE user_id = $1`, [user.id]);
    // Messaging (messages reference chat_threads; delete the user's messages then their threads)
    await del(`DELETE FROM messages WHERE sender_id = $1`, [user.id]);
    await del(`DELETE FROM messages WHERE thread_id IN (SELECT id FROM chat_threads WHERE user1_id = $1 OR user2_id = $1)`, [user.id]);
    await del(`DELETE FROM chat_threads WHERE user1_id = $1 OR user2_id = $1`, [user.id]);
    // Social graph & content interactions
    await del(`DELETE FROM comments WHERE user_id = $1`, [user.id]);
    await del(`DELETE FROM likes WHERE user_id = $1`, [user.id]);
    await del(`DELETE FROM saves WHERE user_id = $1`, [user.id]);
    await del(`DELETE FROM follows WHERE follower_id = $1 OR following_id = $1`, [user.id]);
    // Moderation & safety
    await del(`DELETE FROM elix_notifications WHERE user_id = $1`, [user.id]);
    await del(`DELETE FROM elix_reports WHERE reporter_user_id = $1`, [user.id]);
    await del(`DELETE FROM elix_blocked_users WHERE blocker_user_id = $1 OR blocked_user_id = $1`, [user.id]);
    // Analytics
    await del(`DELETE FROM elix_analytics_events WHERE user_id = $1`, [user.id]);
    // Live / stories / gifting side data
    await del(`DELETE FROM live_streams WHERE user_id = $1`, [user.id]);
    await del(`DELETE FROM stories WHERE user_id = $1`, [user.id]);
    await del(`DELETE FROM live_share_inbox WHERE recipient_id = $1 OR sharer_id = $1`, [user.id]);
    await del(`DELETE FROM creator_stickers WHERE creator_user_id = $1`, [user.id]);
    // Wallet (ledger + balances). Coins are non-refundable; records removed on deletion.
    await del(`DELETE FROM elix_wallet_ledger WHERE user_id = $1`, [user.id]);
    await del(`DELETE FROM elix_wallet_balances WHERE user_id = $1`, [user.id]);
    await del(`DELETE FROM elix_gift_transactions WHERE user_id = $1`, [user.id]);
    // Non-monetary Starter Coins + XP progression.
    await del(`DELETE FROM level_history WHERE user_id = $1`, [user.id]);
    await del(`DELETE FROM xp_transactions WHERE user_id = $1`, [user.id]);
    await del(`DELETE FROM user_progression WHERE user_id = $1`, [user.id]);
    await del(`DELETE FROM starter_coin_transactions WHERE user_id = $1 OR recipient_user_id = $1`, [user.id]);
    await del(`DELETE FROM starter_coin_balances WHERE user_id = $1`, [user.id]);
    // Videos + profile + auth row (last)
    await del(`DELETE FROM videos WHERE user_id = $1`, [user.id]);
    await del(`DELETE FROM profiles WHERE user_id = $1`, [user.id]);
    await client.query(`DELETE FROM elix_auth_users WHERE id = $1`, [user.id]);
    await client.query('COMMIT');
    await invalidateUserSessionCache(user.id);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error({ err, userId: user.id }, 'handleDeleteAccount cascade failed');
    return res.status(500).json({ error: 'Account deletion failed. Please try again.' });
  } finally {
    client.release();
  }

  clearAuthCookie(res);
  return res.status(200).json({ ok: true });
}

export async function handleResendConfirmation(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { email } = req.body ?? {};
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Email is required.' });
  }

  if (!isEmailConfigured()) {
    return res.status(501).json({ error: 'Email service is not configured. Please contact support.' });
  }

  try {
    const user = await dbFindUserByEmail(email.trim());
    if (!user) {
      return res.status(200).json({ success: true });
    }

    const result = await sendTransactionalEmail({
      to: user.email,
      subject: 'Confirm your Elix Star account',
      text: 'Your account is already active. You can log in with your email and password.',
      html: '<p>Your account is already active. You can log in with your email and password.</p>',
    });

    if (!result.ok) {
      logger.error({ error: result.error }, 'handleResendConfirmation email send failed');
      return res.status(500).json({ error: 'Failed to send email. Please try again later.' });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    logger.error({ err }, 'handleResendConfirmation failed');
    return res.status(500).json({ error: 'Unable to process request.' });
  }
}

type AppleIdentityClaims = {
  sub: string;
  email?: string;
  email_verified?: string | boolean;
  is_private_email?: string | boolean;
};

async function verifyAppleIdentityToken(idToken: string): Promise<AppleIdentityClaims | null> {
  const audience = (process.env.APPLE_CLIENT_ID || process.env.APPLE_BUNDLE_ID || 'com.elixstarlive.app').trim();
  try {
    const verified = await jwtVerify(idToken, APPLE_JWKS, {
      issuer: 'https://appleid.apple.com',
      audience,
      algorithms: ['RS256'],
    });
    const sub = typeof verified.payload.sub === 'string' ? verified.payload.sub.trim() : '';
    if (!sub) return null;
    return {
      sub,
      email: typeof verified.payload.email === 'string' ? verified.payload.email.trim() : undefined,
      email_verified: verified.payload.email_verified as string | boolean | undefined,
      is_private_email: verified.payload.is_private_email as string | boolean | undefined,
    };
  } catch (err) {
    logger.warn({ err }, 'Apple identity token verification failed');
    return null;
  }
}

async function dbFindUserByAppleSub(appleSub: string): Promise<StoredUser | null> {
  const pool = getPool();
  if (!pool) return null;
  const r = await pool.query(
    `SELECT id, email, password_hash, username, avatar_url, created_at
       FROM elix_auth_users
      WHERE apple_sub = $1
      LIMIT 1`,
    [appleSub],
  );
  return r.rows[0] ? rowToStoredUser(r.rows[0] as Record<string, unknown>) : null;
}

/**
 * Native Sign in with Apple. The iOS plugin supplies Apple's identity token;
 * this endpoint verifies its RS256 signature/issuer/audience/expiry against
 * Apple's live JWKS before linking or creating an account.
 */
export async function handleAppleNative(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (process.env.APPLE_SIGN_IN_ENABLED !== 'true') {
    return res.status(503).json({ error: 'Apple Sign-In is not enabled.' });
  }
  const idToken = typeof req.body?.idToken === 'string' ? req.body.idToken.trim() : '';
  if (!idToken) return res.status(400).json({ error: 'Apple identity token is required.' });
  if (!getPool()) return res.status(503).json({ error: 'Database not configured' });

  const claims = await verifyAppleIdentityToken(idToken);
  if (!claims) return res.status(401).json({ error: 'Invalid Apple identity token.' });

  const emailVerified =
    claims.email_verified === true || String(claims.email_verified).toLowerCase() === 'true';
  const tokenEmail = emailVerified && claims.email ? claims.email.toLowerCase() : '';
  const givenName = typeof req.body?.givenName === 'string' ? req.body.givenName.trim() : '';
  const familyName = typeof req.body?.familyName === 'string' ? req.body.familyName.trim() : '';
  const suppliedName = `${givenName} ${familyName}`.trim();
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not configured' });

  try {
    let user = await dbFindUserByAppleSub(claims.sub);

    // Apple only returns name/email on the first authorization. A verified
    // email can safely link an existing password account to this Apple sub.
    if (!user && tokenEmail) {
      const byEmail = await dbFindUserByEmail(tokenEmail);
      if (byEmail) {
        const linked = await pool.query(
          `UPDATE elix_auth_users
              SET apple_sub = $2
            WHERE id = $1
              AND (apple_sub IS NULL OR apple_sub = $2)
          RETURNING id`,
          [byEmail.id, claims.sub],
        );
        if (!linked.rowCount) {
          return res.status(409).json({ error: 'This account is linked to a different Apple ID.' });
        }
        user = byEmail;
      }
    }

    if (!user) {
      if (!tokenEmail) {
        return res.status(409).json({
          error: 'Apple did not provide an email for this new account. Remove Elix Star Live from Apple ID sign-in settings and try again.',
        });
      }
      const id = crypto.randomUUID();
      const baseName =
        suppliedName ||
        tokenEmail.split('@')[0] ||
        `apple_${crypto.createHash('sha256').update(claims.sub).digest('hex').slice(0, 8)}`;
      const username = `${baseName.replace(/[^a-zA-Z0-9_.]/g, '_').slice(0, 22)}_${id.slice(0, 6)}`;
      const stored: StoredUser = {
        id,
        email: tokenEmail,
        passwordHash: await hashPassword(crypto.randomUUID()),
        username,
        avatar_url: `https://ui-avatars.com/api/?name=${encodeURIComponent(suppliedName || username)}&background=random`,
        created_at: new Date().toISOString(),
      };
      const registered = await dbRegisterUser(stored);
      if (registered !== 'ok') {
        // A concurrent first login may have created/linked the row.
        user = await dbFindUserByAppleSub(claims.sub);
        if (!user) return res.status(409).json({ error: 'Unable to create Apple account.' });
      } else {
        await pool.query(`UPDATE elix_auth_users SET apple_sub = $2 WHERE id = $1`, [
          stored.id,
          claims.sub,
        ]);
        user = stored;
      }
    }

    const token = signToken({ sub: user.id, email: user.email });
    await dbUpsertSession(user.id, token);
    setAuthCookie(res, token);
    const profile_meta = await loadProfileMeta(user.id);
    return res.status(200).json({ ...authLoginRegisterBody(user, token), profile_meta });
  } catch (err) {
    logger.error({ err }, 'handleAppleNative failed');
    return res.status(500).json({ error: 'Apple sign-in failed. Please try again.' });
  }
}

/** Kept for older clients; native iOS must use /apple/native. */
export async function handleAppleStart(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  return res.status(400).json({ error: 'Update the app to use native Sign in with Apple.' });
}

export async function handleForgotPassword(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { email } = req.body ?? {};
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Email is required.' });
  }

  if (!isEmailConfigured()) {
    return res.status(501).json({ error: 'Email service is not configured. Please contact support.' });
  }

  try {
    const user = await dbFindUserByEmail(email.trim());
    // Always return success to avoid leaking whether an account exists
    if (!user) {
      return res.status(200).json({ success: true });
    }

    // Purpose-bound short-lived token — cannot be used as a session JWT.
    // Bound to the current password hash so it can only be redeemed once.
    const resetToken = signToken(
      { sub: user.id, email: user.email },
      {
        purpose: 'password_reset',
        expirySec: RESET_TOKEN_EXPIRY_SEC,
        pv: passwordResetBinding(user.passwordHash),
      },
    );
    const origin = process.env.APP_ORIGIN || req.headers.origin || 'https://www.elixstarlive.co.uk';
    const resetLink = `${origin}/reset-password?token=${encodeURIComponent(resetToken)}`;

    const result = await sendTransactionalEmail({
      to: user.email,
      subject: 'Reset your Elix Star password',
      text: `Click this link to reset your password: ${resetLink}\n\nThis link expires in 1 hour. If you did not request a password reset, ignore this email.`,
      html: `<p>Click the link below to reset your password:</p><p><a href="${resetLink}">Reset Password</a></p><p>This link expires in 1 hour. If you did not request this, you can ignore this email.</p>`,
    });

    if (!result.ok) {
      // Do not reveal whether the account exists by returning a distinct status.
      logger.error({ error: result.error }, 'handleForgotPassword email send failed');
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    logger.error({ err }, 'handleForgotPassword failed');
    return res.status(200).json({ success: true });
  }
}

export async function handleResetPassword(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { password, token: bodyToken } = req.body ?? {};
  if (!password || typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }
  const token = typeof bodyToken === 'string' ? bodyToken : null;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  // Only accept purpose-bound reset tokens — never a normal session JWT.
  const payload = verifyToken(token);
  if (!payload || payload.purpose !== 'password_reset') {
    return res.status(401).json({ error: 'Invalid or expired reset link.' });
  }

  try {
    const user = await dbFindUserById(payload.sub);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    // Single-use enforcement: the token is bound to the password hash that was
    // current when the link was issued. Once used (or if the password changed),
    // the binding no longer matches and the link is rejected.
    if (!payload.pv || payload.pv !== passwordResetBinding(user.passwordHash)) {
      return res.status(401).json({ error: 'This reset link has already been used or is no longer valid.' });
    }
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: 'Database not configured' });
    await ensureAuthUsersTable();
    await pool.query(`UPDATE elix_auth_users SET password_hash = $2 WHERE id = $1`, [
      user.id,
      await hashPassword(password),
    ]);
    // Invalidate every existing session so a stolen old token cannot stay logged in.
    await pool.query(`DELETE FROM elix_auth_sessions WHERE user_id = $1`, [user.id]);
    await invalidateUserSessionCache(user.id);
    return res.status(200).json({ success: true });
  } catch (err) {
    logger.error({ err }, 'handleResetPassword failed');
    return res.status(500).json({ error: 'Password reset failed. Please try again.' });
  }
}
