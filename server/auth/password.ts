/**
 * Password hashing.
 *
 * scrypt with per-password salt, stored as `N$r$p$salt$key` so the cost
 * parameters travel with the hash and can be raised later without invalidating
 * existing passwords.
 */

import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: crypto.ScryptOptions,
) => Promise<Buffer>;

const SALT_BYTES = 16;
const KEY_BYTES = 64;
const PARAMS = { N: 16_384, r: 8, p: 1 } as const;

/** scrypt needs memory ≈ 128·N·r bytes; the default 32 MB cap is below that. */
const MAX_MEMORY = 256 * 1024 * 1024;

function encode(params: typeof PARAMS, salt: Buffer, key: Buffer): string {
  return [params.N, params.r, params.p, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(SALT_BYTES);
  const key = await scrypt(password, salt, KEY_BYTES, { ...PARAMS, maxmem: MAX_MEMORY });
  return encode(PARAMS, salt, key);
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 5) return false;
  const [nRaw, rRaw, pRaw, saltB64, keyB64] = parts as [string, string, string, string, string];

  const N = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;

  const salt = Buffer.from(saltB64, 'base64');
  const expected = Buffer.from(keyB64, 'base64');
  if (salt.length === 0 || expected.length === 0) return false;

  const actual = await scrypt(password, salt, expected.length, { N, r, p, maxmem: MAX_MEMORY });
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

/**
 * A hash of a fixed string, used when the submitted identifier matches no
 * account. Without it, an unknown address returns before any scrypt work and a
 * known one does not, and the difference in response time is enough to
 * enumerate which accounts exist.
 */
let decoy: Promise<string> | null = null;

export function decoyHash(): Promise<string> {
  decoy ??= hashPassword('elix-login-timing-decoy');
  return decoy;
}
