/**
 * Auth API: login, register, logout, me, resend-confirmation, apple/start.
 * Uses Neon/Postgres user store + custom HS256 JWT.
 */

import { Request, Response } from 'express';
import crypto from 'crypto';
import { getPool } from '../lib/postgres';
import { logger } from '../lib/logger';
import { isEmailConfigured, sendTransactionalEmail } from '../lib/email';

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
  const r = await pool.query(
    `SELECT u.id, u.email, u.password_hash, u.username, u.avatar_url, u.created_at
       FROM elix_auth_users u
      WHERE u.email_lower = $1 OR LOWER(u.username) = $1
      LIMIT 1`,
    [lower],
  );
  if (r.rowCount) return rowToStoredUser(r.rows[0] as Record<string, unknown>);
  const r2 = await pool.query(
    `SELECT u.id, u.email, u.password_hash, u.username, u.avatar_url, u.created_at
       FROM elix_auth_users u
       JOIN profiles p ON p.user_id = u.id
      WHERE LOWER(p.username) = $1 OR LOWER(p.display_name) = $1
      LIMIT 1`,
    [lower],
  );
  if (!r2.rowCount) return null;
  return rowToStoredUser(r2.rows[0] as Record<string, unknown>);
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
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
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
    return res.status(200).json(authLoginRegisterBody(user, token));
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
      passwordHash: await hashPassword(password),
      username: uname,
      avatar_url,
      created_at,
    };
    await dbInsertUser(stored);
    const pool = getPool();
    if (pool) {
      try {
        await pool.query(
          `INSERT INTO profiles (user_id, username, display_name, avatar_url, created_at, updated_at)
           VALUES ($1, $2, $3, $4, NOW(), NOW())
           ON CONFLICT (user_id) DO NOTHING`,
          [id, uname, uname, avatar_url],
        );
      } catch (profileErr) {
        logger.warn({ err: profileErr }, 'profile creation during register skipped');
      }
    }
    const token = signToken({ sub: id, email: e });
    await dbUpsertSession(id, token);
    setAuthCookie(res, token);
    return res.status(201).json(authLoginRegisterBody(stored, token));
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
    let profileMeta: { is_admin?: boolean; is_creator?: boolean; banned_until?: string | null } = {};
    const poolMe = getPool();
    if (poolMe) {
      try {
        const pr = await poolMe.query(
          `SELECT COALESCE(is_admin, false) AS is_admin, COALESCE(is_verified, false) AS is_verified, banned_until FROM profiles WHERE user_id = $1`,
          [payload.sub],
        );
        const row = pr.rows[0] as { is_admin?: boolean; is_verified?: boolean; banned_until?: Date } | undefined;
        if (row) {
          profileMeta = {
            is_admin: Boolean(row.is_admin),
            is_creator: Boolean(row.is_verified),
            banned_until: row.banned_until ? new Date(row.banned_until).toISOString() : null,
          };
        }
      } catch (err) {
        logger.warn({ err }, 'handleMe profile meta skipped');
      }
    }
    return res.status(200).json({
      ...authLoginRegisterBody(user, token),
      profile_meta: profileMeta,
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

  try {
    await pool.query('BEGIN');
    await pool.query(`DELETE FROM elix_auth_sessions WHERE user_id = $1`, [user.id]);
    await pool.query(`DELETE FROM chat_messages WHERE sender_id = $1`, [user.id]);
    await pool.query(`DELETE FROM chat_thread_participants WHERE user_id = $1`, [user.id]);
    await pool.query(`DELETE FROM video_comments WHERE user_id = $1`, [user.id]);
    await pool.query(`DELETE FROM video_likes WHERE user_id = $1`, [user.id]);
    await pool.query(`DELETE FROM saved_videos WHERE user_id = $1`, [user.id]);
    await pool.query(`DELETE FROM follows WHERE follower_id = $1 OR following_id = $1`, [user.id]);
    await pool.query(`DELETE FROM notifications WHERE user_id = $1 OR actor_id = $1`, [user.id]);
    await pool.query(`DELETE FROM reports WHERE reporter_id = $1`, [user.id]);
    await pool.query(`DELETE FROM blocked_users WHERE blocker_id = $1 OR blocked_id = $1`, [user.id]);
    await pool.query(`DELETE FROM device_tokens WHERE user_id = $1`, [user.id]);
    await pool.query(`DELETE FROM analytics_events WHERE user_id = $1`, [user.id]);
    await pool.query(`DELETE FROM comment_likes WHERE user_id = $1`, [user.id]).catch(() => {});
    await pool.query(`DELETE FROM wallet_ledger WHERE user_id = $1`, [user.id]);
    await pool.query(`DELETE FROM videos WHERE user_id = $1`, [user.id]);
    await pool.query(`DELETE FROM profiles WHERE user_id = $1`, [user.id]);
    await pool.query(`DELETE FROM elix_auth_users WHERE id = $1`, [user.id]);
    await pool.query('COMMIT');
  } catch (err) {
    await pool.query('ROLLBACK').catch(() => {});
    logger.error({ err, userId: user.id }, 'handleDeleteAccount cascade failed');
    return res.status(500).json({ error: 'Account deletion failed. Please try again.' });
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

  if (!isEmailConfigured()) {
    return res.status(501).json({ error: 'Email service is not configured. Please contact support.' });
  }

  try {
    const user = await dbFindUserByEmail(email.trim());
    // Always return success to avoid leaking whether an account exists
    if (!user) {
      return res.status(200).json({ success: true });
    }

    const resetToken = signToken({ sub: user.id, email: user.email });
    const origin = process.env.APP_ORIGIN || req.headers.origin || 'https://www.elixstarlive.co.uk';
    const resetLink = `${origin}/reset-password?token=${encodeURIComponent(resetToken)}`;

    const result = await sendTransactionalEmail({
      to: user.email,
      subject: 'Reset your Elix Star password',
      text: `Click this link to reset your password: ${resetLink}\n\nThis link expires in 7 days. If you did not request a password reset, ignore this email.`,
      html: `<p>Click the link below to reset your password:</p><p><a href="${resetLink}">Reset Password</a></p><p>This link expires in 7 days. If you did not request this, you can ignore this email.</p>`,
    });

    if (!result.ok) {
      logger.error({ error: result.error }, 'handleForgotPassword email send failed');
      return res.status(500).json({ error: 'Failed to send email. Please try again later.' });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    logger.error({ err }, 'handleForgotPassword failed');
    return res.status(500).json({ error: 'Unable to process request. Please try again.' });
  }
}

export async function handleResetPassword(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { password, token: bodyToken } = req.body ?? {};
  if (!password || typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'Valid password is required.' });
  }
  const token = typeof bodyToken === 'string' ? bodyToken : getTokenFromRequest(req);
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  const payload = verifyAuthToken(token);
  if (!payload) return res.status(401).json({ error: 'Invalid or expired reset link.' });

  try {
    const user = await dbFindUserById(payload.sub);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: 'Database not configured' });
    await ensureAuthUsersTable();
    await pool.query(`UPDATE elix_auth_users SET password_hash = $2 WHERE id = $1`, [
      user.id,
      await hashPassword(password),
    ]);
    return res.status(200).json({ success: true });
  } catch (err) {
    logger.error({ err }, 'handleResetPassword failed');
    return res.status(500).json({ error: 'Password reset failed. Please try again.' });
  }
}
