/**
 * TOTP 2FA — RFC 6238 via Node crypto (no new dependency).
 * NEW CONTRACTS:
 *   GET  /api/auth/2fa/status
 *   POST /api/auth/2fa/enroll
 *   POST /api/auth/2fa/verify  { code }
 *   POST /api/auth/2fa/disable { code }
 */
import { Request, Response } from "express";
import crypto from "crypto";
import { getPool } from "../lib/postgres";
import { logger } from "../lib/logger";
import { getTokenFromRequest, verifyAuthToken } from "./auth";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const ISSUER = "Elix Star Live";

function isSchemaMissing(err: unknown): boolean {
  return (err as { code?: string })?.code === "42P01";
}

function requireUserId(req: Request, res: Response): string | null {
  const token = getTokenFromRequest(req);
  if (!token) {
    res.status(401).json({ error: "Not authenticated." });
    return null;
  }
  const payload = verifyAuthToken(token);
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired session." });
    return null;
  }
  return payload.sub;
}

function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

function base32Decode(input: string): Buffer {
  const cleaned = input.replace(/=+$/, "").toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of cleaned) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function hotp(secret: Buffer, counter: number, digits = 6): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac("sha1", secret).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  const str = String(code % 10 ** digits);
  return str.padStart(digits, "0");
}

/** Accept current and ±1 window for clock skew. */
export function verifyTotpCode(secretBase32: string, code: string, window = 1): boolean {
  const cleaned = String(code || "").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(cleaned)) return false;
  const secret = base32Decode(secretBase32);
  if (secret.length < 10) return false;
  const step = 30;
  const counter = Math.floor(Date.now() / 1000 / step);
  for (let i = -window; i <= window; i++) {
    if (hotp(secret, counter + i) === cleaned) return true;
  }
  return false;
}

function otpauthUrl(emailOrUser: string, secretBase32: string): string {
  const label = encodeURIComponent(`${ISSUER}:${emailOrUser}`);
  const issuer = encodeURIComponent(ISSUER);
  return `otpauth://totp/${label}?secret=${secretBase32}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
}

type TwoFactorRow = {
  enabled: boolean;
  secret: string | null;
};

async function getRow(userId: string): Promise<TwoFactorRow | null> {
  const db = getPool();
  if (!db) return null;
  const { rows } = await db.query(
    `SELECT enabled, secret FROM user_two_factor WHERE user_id = $1 LIMIT 1`,
    [userId],
  );
  if (!rows?.[0]) return null;
  return {
    enabled: Boolean(rows[0].enabled),
    secret: rows[0].secret != null ? String(rows[0].secret) : null,
  };
}

/** GET /api/auth/2fa/status */
export async function handleTwoFactorStatus(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req, res);
  if (!userId) return;
  if (!getPool()) {
    res.status(503).json({ error: "DATABASE_UNAVAILABLE" });
    return;
  }
  try {
    const row = await getRow(userId);
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ enabled: Boolean(row?.enabled), enrolled: Boolean(row?.secret) });
  } catch (err) {
    if (isSchemaMissing(err)) {
      logger.error({ err, userId }, "handleTwoFactorStatus missing table");
      res.status(503).json({ error: "SCHEMA_UNAVAILABLE" });
      return;
    }
    logger.error({ err, userId }, "handleTwoFactorStatus failed");
    res.status(500).json({ error: "2FA_STATUS_FAILED" });
  }
}

/** POST /api/auth/2fa/enroll — returns secret + otpauth URL; enable after verify */
export async function handleTwoFactorEnroll(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req, res);
  if (!userId) return;
  const db = getPool();
  if (!db) {
    res.status(503).json({ error: "DATABASE_UNAVAILABLE" });
    return;
  }
  try {
    const existing = await getRow(userId);
    if (existing?.enabled) {
      res.status(409).json({ error: "2FA already enabled" });
      return;
    }
    const secret = base32Encode(crypto.randomBytes(20));
    await db.query(
      `INSERT INTO user_two_factor (user_id, enabled, secret, updated_at)
       VALUES ($1, FALSE, $2, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         enabled = FALSE,
         secret = EXCLUDED.secret,
         updated_at = NOW()`,
      [userId, secret],
    );
    const token = getTokenFromRequest(req);
    const payload = token ? verifyAuthToken(token) : null;
    const account = (payload?.email && String(payload.email).trim()) || userId;
    res.json({
      enabled: false,
      secret,
      otpauth_url: otpauthUrl(account, secret),
    });
  } catch (err) {
    if (isSchemaMissing(err)) {
      logger.error({ err, userId }, "handleTwoFactorEnroll missing table");
      res.status(503).json({ error: "SCHEMA_UNAVAILABLE" });
      return;
    }
    logger.error({ err, userId }, "handleTwoFactorEnroll failed");
    res.status(500).json({ error: "2FA_ENROLL_FAILED" });
  }
}

/** POST /api/auth/2fa/verify { code } — enables 2FA */
export async function handleTwoFactorVerify(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req, res);
  if (!userId) return;
  const code = String((req.body as { code?: unknown })?.code || "").trim();
  const db = getPool();
  if (!db) {
    res.status(503).json({ error: "DATABASE_UNAVAILABLE" });
    return;
  }
  try {
    const row = await getRow(userId);
    if (!row?.secret) {
      res.status(400).json({ error: "Enroll 2FA before verifying" });
      return;
    }
    if (!verifyTotpCode(row.secret, code)) {
      res.status(401).json({ error: "Invalid authentication code" });
      return;
    }
    await db.query(
      `UPDATE user_two_factor SET enabled = TRUE, updated_at = NOW() WHERE user_id = $1`,
      [userId],
    );
    res.json({ ok: true, enabled: true });
  } catch (err) {
    if (isSchemaMissing(err)) {
      logger.error({ err, userId }, "handleTwoFactorVerify missing table");
      res.status(503).json({ error: "SCHEMA_UNAVAILABLE" });
      return;
    }
    logger.error({ err, userId }, "handleTwoFactorVerify failed");
    res.status(500).json({ error: "2FA_VERIFY_FAILED" });
  }
}

/** POST /api/auth/2fa/disable { code } */
export async function handleTwoFactorDisable(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req, res);
  if (!userId) return;
  const code = String((req.body as { code?: unknown })?.code || "").trim();
  const db = getPool();
  if (!db) {
    res.status(503).json({ error: "DATABASE_UNAVAILABLE" });
    return;
  }
  try {
    const row = await getRow(userId);
    if (!row?.enabled || !row.secret) {
      res.status(400).json({ error: "2FA is not enabled" });
      return;
    }
    if (!verifyTotpCode(row.secret, code)) {
      res.status(401).json({ error: "Invalid authentication code" });
      return;
    }
    await db.query(
      `UPDATE user_two_factor SET enabled = FALSE, secret = NULL, backup_codes = NULL, updated_at = NOW()
       WHERE user_id = $1`,
      [userId],
    );
    res.json({ ok: true, enabled: false });
  } catch (err) {
    if (isSchemaMissing(err)) {
      logger.error({ err, userId }, "handleTwoFactorDisable missing table");
      res.status(503).json({ error: "SCHEMA_UNAVAILABLE" });
      return;
    }
    logger.error({ err, userId }, "handleTwoFactorDisable failed");
    res.status(500).json({ error: "2FA_DISABLE_FAILED" });
  }
}
