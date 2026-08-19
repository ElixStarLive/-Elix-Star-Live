/**
 * Load optional runtime config values from Neon (fallback when Coolify env missing).
 * Values are stored as plain text in DB (same trust boundary as DATABASE_URL holder).
 */
import { getPool } from "./postgres";
import { logger } from "./logger";

const cache = new Map<string, { at: number; value: string }>();
const CACHE_MS = 15_000;

export async function getRuntimeConfigValue(key: string): Promise<string | null> {
  const k = String(key || "").trim();
  if (!k) return null;
  const hit = cache.get(k);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;

  const pool = getPool();
  if (!pool) return null;
  try {
    const r = await pool.query(
      `SELECT value_ciphertext AS value FROM elix_runtime_config WHERE key = $1 LIMIT 1`,
      [k],
    );
    if (!r.rowCount) return null;
    const value = String(r.rows[0].value || "").trim();
    if (!value) return null;
    cache.set(k, { at: Date.now(), value });
    return value;
  } catch (err) {
    logger.warn({ err, key: k }, "getRuntimeConfigValue failed");
    return null;
  }
}
