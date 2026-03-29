/**
 * Device tokens (push) for Express.
 * POST /api/device-tokens, DELETE /api/device-tokens.
 */

import { Request, Response } from "express";
import { getTokenFromRequest, verifyAuthToken } from "./auth";
import { getPool } from "../lib/postgres";
import { logger } from "../lib/logger";

let deviceTokensTableEnsured = false;
async function ensureDeviceTokensTable(): Promise<void> {
  if (deviceTokensTableEnsured) return;
  const pool = getPool();
  if (!pool) return;
  deviceTokensTableEnsured = true;
}

/** POST /api/device-tokens — register push token; auth required */
export async function handleRegisterDeviceToken(req: Request, res: Response): Promise<void> {
  const token = getTokenFromRequest(req);
  const jwtUser = token ? verifyAuthToken(token) : null;
  if (!jwtUser) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const body = req.body as { userId?: string; token?: string; platform?: string };
  const { userId, token: deviceToken, platform } = body ?? {};
  if (!userId || !deviceToken || !platform) {
    res.status(400).json({ error: "userId, token and platform are required" });
    return;
  }
  if (jwtUser.sub !== userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const pool = getPool();
  if (!pool) {
    res.status(503).json({ error: "Database not configured" });
    return;
  }
  try {
    await ensureDeviceTokensTable();
    await pool.query(
      `INSERT INTO elix_device_tokens (user_id, platform, token, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id, platform) DO UPDATE
         SET token = EXCLUDED.token, updated_at = NOW()`,
      [userId, platform, deviceToken],
    );
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "handleRegisterDeviceToken failed");
    res.status(500).json({ error: "DATABASE_ERROR" });
  }
}

/** DELETE /api/device-tokens — unregister; auth required */
export async function handleDeleteDeviceToken(req: Request, res: Response): Promise<void> {
  const token = getTokenFromRequest(req);
  const jwtUser = token ? verifyAuthToken(token) : null;
  if (!jwtUser) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const body = req.body as { userId?: string; token?: string; platform?: string };
  const { userId, platform } = body ?? {};
  if (!userId || !platform) {
    res.status(400).json({ error: "userId and platform are required" });
    return;
  }
  if (jwtUser.sub !== userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const pool = getPool();
  if (!pool) {
    res.status(503).json({ error: "Database not configured" });
    return;
  }
  try {
    await ensureDeviceTokensTable();
    await pool.query(`DELETE FROM elix_device_tokens WHERE user_id = $1 AND platform = $2`, [userId, platform]);
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "handleDeleteDeviceToken failed");
    res.status(500).json({ error: "DATABASE_ERROR" });
  }
}

