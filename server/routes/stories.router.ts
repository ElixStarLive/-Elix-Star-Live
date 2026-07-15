/**
 * Stories API — Neon-backed 24h stories for For You rings / Add story.
 * Ensures `stories` table exists (CREATE IF NOT EXISTS) so deploy works even if migrate lag.
 */

import { Router, Request, Response } from "express";
import { getTokenFromRequest, verifyAuthToken } from "./auth";
import { getPool } from "../lib/postgres";
import { logger } from "../lib/logger";
import type { Pool } from "pg";

const router = Router();
const STORY_TTL_MS = 24 * 60 * 60 * 1000;

let storiesTableReady: Promise<void> | null = null;

export type StoryRow = {
  id: string;
  user_id: string;
  username: string;
  display_name: string;
  avatar: string;
  media_url: string;
  thumbnail: string;
  media_type: string;
  created_at: string;
  expires_at: string;
};

async function ensureStoriesTable(db: Pool): Promise<void> {
  if (!storiesTableReady) {
    storiesTableReady = (async () => {
      await db.query(`
        CREATE TABLE IF NOT EXISTS stories (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          username TEXT DEFAULT '',
          display_name TEXT DEFAULT '',
          avatar TEXT DEFAULT '',
          media_url TEXT NOT NULL,
          thumbnail TEXT DEFAULT '',
          media_type TEXT DEFAULT 'video',
          created_at TIMESTAMPTZ DEFAULT NOW(),
          expires_at TIMESTAMPTZ NOT NULL
        )
      `);
      await db.query(`CREATE INDEX IF NOT EXISTS idx_stories_expires_at ON stories (expires_at)`);
      await db.query(`CREATE INDEX IF NOT EXISTS idx_stories_user_id_created ON stories (user_id, created_at DESC)`);
      logger.info("stories table ensured");
    })().catch((err) => {
      storiesTableReady = null;
      throw err;
    });
  }
  await storiesTableReady;
}

async function purgeExpired(db: Pool): Promise<void> {
  try {
    await db.query(`DELETE FROM stories WHERE expires_at <= NOW()`);
  } catch (err) {
    logger.warn({ err }, "stories purge failed");
  }
}

/** GET /api/stories — active stories grouped by user (newest first). */
router.get("/", async (_req: Request, res: Response) => {
  const db = getPool();
  if (!db) return res.status(503).json({ error: "Database not configured", stories: [] });
  try {
    await ensureStoriesTable(db);
    await purgeExpired(db);
    const r = await db.query(
      `SELECT id, user_id, username, display_name, avatar, media_url, thumbnail, media_type,
              created_at::text, expires_at::text
       FROM stories
       WHERE expires_at > NOW()
       ORDER BY created_at DESC
       LIMIT 400`,
    );
    const byUser = new Map<
      string,
      {
        userId: string;
        username: string;
        displayName: string;
        avatar: string;
        items: Array<{
          id: string;
          mediaUrl: string;
          thumbnail: string;
          mediaType: string;
          createdAt: string;
          expiresAt: string;
        }>;
      }
    >();
    for (const row of r.rows as StoryRow[]) {
      const uid = String(row.user_id || "");
      if (!uid) continue;
      if (!byUser.has(uid)) {
        byUser.set(uid, {
          userId: uid,
          username: row.username || "user",
          displayName: row.display_name || row.username || "User",
          avatar: row.avatar || "",
          items: [],
        });
      }
      byUser.get(uid)!.items.push({
        id: row.id,
        mediaUrl: row.media_url,
        thumbnail: row.thumbnail || "",
        mediaType: row.media_type || "video",
        createdAt: row.created_at,
        expiresAt: row.expires_at,
      });
    }
    return res.json({ stories: Array.from(byUser.values()) });
  } catch (err) {
    logger.error({ err }, "GET /api/stories failed");
    return res.status(500).json({ error: "Failed to load stories", stories: [] });
  }
});

/** GET /api/stories/user/:userId — active stories for one user. */
router.get("/user/:userId", async (req: Request, res: Response) => {
  const db = getPool();
  if (!db) return res.status(503).json({ error: "Database not configured", items: [] });
  try {
    await ensureStoriesTable(db);
    await purgeExpired(db);
    const r = await db.query(
      `SELECT id, user_id, username, display_name, avatar, media_url, thumbnail, media_type,
              created_at::text, expires_at::text
       FROM stories
       WHERE user_id = $1 AND expires_at > NOW()
       ORDER BY created_at ASC
       LIMIT 50`,
      [req.params.userId],
    );
    return res.json({
      items: (r.rows as StoryRow[]).map((row) => ({
        id: row.id,
        userId: row.user_id,
        username: row.username,
        displayName: row.display_name,
        avatar: row.avatar,
        mediaUrl: row.media_url,
        thumbnail: row.thumbnail || "",
        mediaType: row.media_type || "video",
        createdAt: row.created_at,
        expiresAt: row.expires_at,
      })),
    });
  } catch (err) {
    logger.error({ err }, "GET /api/stories/user failed");
    return res.status(500).json({ error: "Failed to load user stories", items: [] });
  }
});

/** POST /api/stories — create a story (Neon). Auth required. */
router.post("/", async (req: Request, res: Response) => {
  try {
    const token = getTokenFromRequest(req);
    if (!token) return res.status(401).json({ error: "Not authenticated." });
    const payload = verifyAuthToken(token);
    if (!payload) return res.status(401).json({ error: "Invalid or expired session." });

    const db = getPool();
    if (!db) return res.status(503).json({ error: "Database not configured" });

    await ensureStoriesTable(db);

    const body = req.body || {};
    const mediaUrl = String(body.url || body.mediaUrl || body.media_url || "").trim();
    if (!mediaUrl) return res.status(400).json({ error: "url is required" });

    const { getOrCreateProfile } = await import("./profiles");
    const profile = await getOrCreateProfile(payload.sub);

    const id =
      String(body.id || "").trim() ||
      `story_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const now = Date.now();
    const expiresAt = new Date(now + STORY_TTL_MS).toISOString();
    const createdAt = new Date(now).toISOString();
    const mediaType = String(body.mediaType || body.media_type || "video").toLowerCase() === "image"
      ? "image"
      : "video";
    const thumbnail = String(body.thumbnailUrl || body.thumbnail_url || body.thumbnail || "");

    await db.query(
      `INSERT INTO stories
        (id, user_id, username, display_name, avatar, media_url, thumbnail, media_type, created_at, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::timestamptz,$10::timestamptz)
       ON CONFLICT (id) DO UPDATE SET
         media_url = EXCLUDED.media_url,
         thumbnail = EXCLUDED.thumbnail,
         media_type = EXCLUDED.media_type,
         expires_at = EXCLUDED.expires_at`,
      [
        id,
        payload.sub,
        profile.username || "user",
        profile.displayName || "User",
        profile.avatarUrl || "",
        mediaUrl,
        thumbnail,
        mediaType,
        createdAt,
        expiresAt,
      ],
    );

    logger.info({ storyId: id, userId: payload.sub }, "Story created");
    return res.status(201).json({
      id,
      userId: payload.sub,
      mediaUrl,
      thumbnail,
      mediaType,
      createdAt,
      expiresAt,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err: msg }, "POST /api/stories failed");
    return res.status(500).json({ error: msg || "Failed to create story" });
  }
});

export default router;
