/**
 * Auth API: login, register, logout, me, resend-confirmation, apple/start.
 * Uses Neon/Postgres user store + custom HS256 JWT.
 */

import { Request, Response } from 'express';
import crypto from 'crypto';
import { getPool } from '../lib/postgres';
import { logger } from '../lib/logger';

const COOKIE_NAME = 'auth_token';
const TOKEN_EXPIRY_SEC = 60 * 60 * 24 * 7; // 7 days
const SALT_LEN = 16;
const KEY_LEN = 64;
const SCRYPT_OPTS = { N: 16384, r: 8, p: 1 };

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

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(SALT_LEN);
  const key = crypto.scryptSync(password, salt, KEY_LEN, SCRYPT_OPTS);
  return salt.toString('base64') + ':' + key.toString('base64');
}

function verifyPassword(password: string, stored: string): boolean {
  const [saltB64, keyB64] = stored.split(':');
  if (!saltB64 || !keyB64) return false;
  const salt = Buffer.from(saltB64, 'base64');
  const key = crypto.scryptSync(password, salt, KEY_LEN, SCRYPT_OPTS);
  return key.toString('base64') === keyB64;
}

function signToken(payload: { sub: string; email: string }): string {
  const secret = getSecret();
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const body = {
    sub: payload.sub,
    email: payload.email,
    iat: now,
    exp: now + TOKEN_EXPIRY_SEC,
  };
  const b64 = (obj: object) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const part1 = b64(header);
  const part2 = b64(body);
  const sig = crypto.createHmac('sha256', secret).update(`${part1}.${part2}`).digest('base64url');
  return `${part1}.${part2}.${sig}`;
}

function verifyToken(token: string): { sub: string; email: string } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [, payloadB64, sig] = parts;
    const secret = getSecret();
    const expectedSig = crypto.createHmac('sha256', secret).update(`${parts[0]}.${payloadB64}`).digest('base64url');
    if (sig !== expectedSig) return null;
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return { sub: payload.sub, email: payload.email ?? '' };
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
  return verifyToken(token);
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
  await pool.query(`
    CREATE TABLE IF NOT EXISTS elix_auth_users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      email_lower TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      username TEXT NOT NULL,
      avatar_url TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  authTableEnsured = true;
}

async function ensureAuthSessionsTable(): Promise<void> {
  if (sessionTableEnsured) return;
  const pool = getPool();
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS elix_auth_sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL
    )
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_elix_auth_sessions_user ON elix_auth_sessions(user_id, expires_at DESC)`,
  ).catch(() => {});
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

async function dbDeleteUserById(id: string): Promise<void> {
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
}

function toAuthUser(u: StoredUser): { id: string; email?: string; user_metadata?: Record<string, unknown>; email_confirmed_at?: string; created_at?: string } {
  return {
    id: u.id,
    email: u.email,
    user_metadata: { username: u.username, full_name: u.username, avatar_url: u.avatar_url },
    email_confirmed_at: new Date().toISOString(),
    created_at: u.created_at,
  };
}

export async function handleLogin(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { email, password } = req.body ?? {};
  const e = typeof email === 'string' ? email.trim() : '';
  if (!e || !password) {
    return res.status(400).json({ error: 'Please enter both email and password.' });
  }
  if (!getPool()) return res.status(503).json({ error: 'Database not configured' });
  const user = await dbFindUserByEmail(e);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return res.status(401).json({ error: 'Invalid login credentials.' });
  }
  const token = signToken({ sub: user.id, email: user.email });
  await dbUpsertSession(user.id, token);
  setAuthCookie(res, token);
  return res.status(200).json({
    user: toAuthUser(user),
    session: { access_token: token, accessToken: token },
  });
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
      passwordHash: hashPassword(crypto.randomUUID()),
      username: uname,
      avatar_url,
      created_at,
    };
    await dbInsertUser(guest);
  }

  const token = signToken({ sub: guest.id, email: guest.email });
  await dbUpsertSession(guest.id, token);
  setAuthCookie(res, token);
  return res.status(200).json({
    user: toAuthUser(guest),
    session: { access_token: token, accessToken: token },
  });
}

export async function handleRegister(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { email, password, username } = req.body ?? {};
  const e = typeof email === 'string' ? email.trim() : '';
  if (!e || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }
  const key = e.toLowerCase();
  if (!getPool()) return res.status(503).json({ error: 'Database not configured' });
  const existing = await dbFindUserByEmail(e);
  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists.' });
  }
  const id = crypto.randomUUID();
  const uname = typeof username === 'string' && username.trim() ? username.trim() : e.split('@')[0];
  const avatar_url = `https://ui-avatars.com/api/?name=${encodeURIComponent(uname)}&background=random`;
  const created_at = new Date().toISOString();
  const stored: StoredUser = {
    id,
    email: e,
    passwordHash: hashPassword(password),
    username: uname,
    avatar_url,
    created_at,
  };
  await dbInsertUser(stored);
  const token = signToken({ sub: id, email: e });
  await dbUpsertSession(id, token);
  setAuthCookie(res, token);
  return res.status(201).json({
    user: toAuthUser(stored),
    session: { access_token: token, accessToken: token },
  });
}

export async function handleLogout(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const token = getTokenFromRequest(req);
  if (token) {
    await dbDeleteSessionByToken(token).catch(() => {});
  }
  clearAuthCookie(res);
  return res.status(200).json({ ok: true });
}

export async function handleMe(req: Request, res: Response) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const token = getTokenFromRequest(req);
  if (!token) return res.status(401).json({ error: 'Not authenticated.' });
  const payload = verifyAuthToken(token);
  if (!payload) return res.status(401).json({ error: 'Invalid or expired session.' });
  if (!getPool()) return res.status(503).json({ error: 'Database not configured' });
  const user = await dbFindUserById(payload.sub);
  if (!user) return res.status(401).json({ error: 'User not found.' });
  return res.status(200).json({
    user: toAuthUser(user),
    session: { access_token: token, accessToken: token },
  });
}

export async function handleDeleteAccount(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const token = getTokenFromRequest(req);
  if (!token) return res.status(401).json({ error: 'Not authenticated.' });
  const payload = verifyAuthToken(token);
  if (!payload) return res.status(401).json({ error: 'Invalid or expired session.' });

  if (!getPool()) return res.status(503).json({ error: 'Database not configured' });
  const user = await dbFindUserById(payload.sub);
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  await dbDeleteUserById(user.id);

  clearAuthCookie(res);
  return res.status(200).json({ ok: true });
}

export async function handleResendConfirmation(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { email } = req.body ?? {};
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Email is required.' });
  }
  // No-op: no email sender configured. Return success so UI does not block.
  return res.status(200).json({ message: 'If an account exists, a confirmation email was sent.' });
}

export async function handleAppleStart(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  return res.status(400).json({ error: 'Apple Sign-In is not configured. Use email/password for now.' });
}

export async function handleForgotPassword(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { email } = req.body ?? {};
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Email is required.' });
  }
  return res.status(200).json({ message: 'If an account exists, reset instructions were sent.' });
}

export async function handleResetPassword(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { password } = req.body ?? {};
  if (!password || typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'Valid password is required.' });
  }
  const token = getTokenFromRequest(req);
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  const payload = verifyAuthToken(token);
  if (!payload) return res.status(401).json({ error: 'Invalid or expired session.' });

  const user = await dbFindUserById(payload.sub);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not configured' });
  await ensureAuthUsersTable();
  await pool.query(`UPDATE elix_auth_users SET password_hash = $2 WHERE id = $1`, [
    user.id,
    hashPassword(password),
  ]);
  return res.status(200).json({ success: true });
}
