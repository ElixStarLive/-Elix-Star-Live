/**
 * Live stream moderators — host-only grant/revoke; GET for room clients.
 * NEW CONTRACT: GET/POST/DELETE /api/live/:streamKey/moderators
 * Schema required via migration `20260810180000_live_stream_moderators.sql`.
 */
import { Request, Response } from "express";
import { getPool } from "../lib/postgres";
import { logger } from "../lib/logger";
import { getTokenFromRequest, verifyAuthToken } from "./auth";
import { isStreamHost } from "./livestream";

function isSchemaMissing(err: unknown): boolean {
  return (err as { code?: string })?.code === "42P01";
}

function requireAuthUser(req: Request, res: Response): string | null {
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

async function listModeratorIds(streamKey: string): Promise<string[]> {
  const db = getPool();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const { rows } = await db.query(
    `SELECT user_id FROM live_stream_moderators WHERE stream_key = $1 ORDER BY created_at ASC`,
    [streamKey],
  );
  return (rows || []).map((r) => String(r.user_id));
}

function respondSchemaOrDbError(res: Response, err: unknown, logMsg: string, context: Record<string, unknown>, failCode: string): void {
  if (isSchemaMissing(err)) {
    logger.error({ err, ...context }, `${logMsg} missing table`);
    res.status(503).json({ error: "SCHEMA_UNAVAILABLE" });
    return;
  }
  logger.error({ err, ...context }, logMsg);
  res.status(500).json({ error: failCode });
}

/** GET /api/live/:streamKey/moderators — signed-in viewers only */
export async function handleListLiveModerators(req: Request, res: Response): Promise<void> {
  // This returns the moderator user ids for a room. Unauthenticated, it let anyone
  // enumerate who polices any creator's live — a targeting list. Every real caller
  // is a signed-in viewer or the host, so requiring a session costs nothing.
  if (!requireAuthUser(req, res)) return;

  const streamKey = String(req.params.streamKey || "").trim();
  if (!streamKey) {
    res.status(400).json({ error: "streamKey required" });
    return;
  }
  const db = getPool();
  if (!db) {
    res.status(503).json({ error: "DATABASE_UNAVAILABLE" });
    return;
  }
  try {
    const moderators = await listModeratorIds(streamKey);
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ moderators });
  } catch (err) {
    respondSchemaOrDbError(res, err, "handleListLiveModerators failed", { streamKey }, "MODERATORS_LIST_FAILED");
  }
}

/** POST /api/live/:streamKey/moderators { userId } — host only */
export async function handleAddLiveModerator(req: Request, res: Response): Promise<void> {
  const hostId = requireAuthUser(req, res);
  if (!hostId) return;

  const streamKey = String(req.params.streamKey || "").trim();
  const userId = String((req.body as { userId?: unknown })?.userId || "").trim();
  if (!streamKey || !userId) {
    res.status(400).json({ error: "streamKey and userId required" });
    return;
  }
  if (!(await isStreamHost(streamKey, hostId))) {
    res.status(403).json({ error: "Only the stream host can assign moderators" });
    return;
  }
  if (userId === hostId) {
    res.status(400).json({ error: "Host is already privileged" });
    return;
  }

  const db = getPool();
  if (!db) {
    res.status(503).json({ error: "DATABASE_UNAVAILABLE" });
    return;
  }
  try {
    await db.query(
      `INSERT INTO live_stream_moderators (stream_key, user_id, granted_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (stream_key, user_id) DO NOTHING`,
      [streamKey, userId, hostId],
    );
    const moderators = await listModeratorIds(streamKey);
    res.json({ ok: true, moderators });
  } catch (err) {
    respondSchemaOrDbError(res, err, "handleAddLiveModerator failed", { streamKey, userId }, "MODERATOR_ADD_FAILED");
  }
}

/** DELETE /api/live/:streamKey/moderators/:userId — host only */
export async function handleRemoveLiveModerator(req: Request, res: Response): Promise<void> {
  const hostId = requireAuthUser(req, res);
  if (!hostId) return;

  const streamKey = String(req.params.streamKey || "").trim();
  const userId = String(req.params.userId || "").trim();
  if (!streamKey || !userId) {
    res.status(400).json({ error: "streamKey and userId required" });
    return;
  }
  if (!(await isStreamHost(streamKey, hostId))) {
    res.status(403).json({ error: "Only the stream host can remove moderators" });
    return;
  }

  const db = getPool();
  if (!db) {
    res.status(503).json({ error: "DATABASE_UNAVAILABLE" });
    return;
  }
  try {
    await db.query(
      `DELETE FROM live_stream_moderators WHERE stream_key = $1 AND user_id = $2`,
      [streamKey, userId],
    );
    const moderators = await listModeratorIds(streamKey);
    res.json({ ok: true, moderators });
  } catch (err) {
    respondSchemaOrDbError(res, err, "handleRemoveLiveModerator failed", { streamKey, userId }, "MODERATOR_REMOVE_FAILED");
  }
}

