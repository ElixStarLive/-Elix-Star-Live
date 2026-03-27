/**
 * GET /api/activity — auth required; likes, comments, saves on your videos, and @mentions of you (Postgres).
 */

import type { Request, Response } from "express";
import { getPool } from "../lib/postgres";
import { getTokenFromRequest, verifyAuthToken } from "./auth";
import { logger } from "../lib/logger";

/** Case-insensitive @handle with word boundaries (ASCII alnum + underscore). */
function mentionRegexPatterns(username: string | null | undefined, displayName: string | null | undefined): string[] {
  const patterns: string[] = [];
  const seen = new Set<string>();
  const pushPattern = (raw: string) => {
    const t = raw.trim();
    if (t.length < 2) return;
    const key = t.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    const esc = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    patterns.push(`(^|[^[:alnum:]_])@${esc}([^[:alnum:]_]|$)`);
  };
  pushPattern(username || "");
  const d = (displayName || "").trim();
  if (d && !/\s/.test(d)) pushPattern(d);
  return patterns.slice(0, 4);
}

export async function handleGetMyActivity(req: Request, res: Response): Promise<void> {
  const token = getTokenFromRequest(req);
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const jwt = verifyAuthToken(token);
  if (!jwt?.sub) {
    res.status(401).json({ error: "Invalid session" });
    return;
  }
  const ownerId = jwt.sub;
  const db = getPool();
  if (!db) {
    res.json({ activities: [] });
    return;
  }

  try {
    let mentionPatterns: string[] = [];
    try {
      const prof = await db.query(
        `SELECT username, display_name FROM profiles WHERE user_id = $1 LIMIT 1`,
        [ownerId],
      );
      const row = prof.rows?.[0] as { username?: string; display_name?: string } | undefined;
      mentionPatterns = mentionRegexPatterns(row?.username, row?.display_name);
    } catch (e) {
      logger.warn({ err: e, ownerId }, "activity profile lookup for mentions skipped");
    }

    const mentionCond =
      mentionPatterns.length > 0
        ? ` AND (${mentionPatterns
            .map((_, i) => `($${i + 2}::text IS NOT NULL AND TRIM($${i + 2}::text) <> '' AND c_m.text ~* $${i + 2}::text)`)
            .join(" OR ")})`
        : "";

    const mentionUnion =
      mentionPatterns.length > 0
        ? `
         UNION ALL
         SELECT 'mention'::text AS kind, c_m.video_id::text AS video_id, c_m.user_id::text AS actor_user_id,
                c_m.created_at AS at, LEFT(c_m.text, 140) AS snippet
         FROM comments c_m
         INNER JOIN videos v_m ON v_m.id = c_m.video_id
         WHERE c_m.user_id <> $1
           AND NOT (v_m.user_id = $1 AND c_m.parent_id IS NULL)
           ${mentionCond}`
        : "";

    const params: string[] = [ownerId, ...mentionPatterns];
    const result = await db.query(
      `SELECT sub.kind, sub.video_id, sub.actor_user_id, sub.at, sub.snippet,
              COALESCE(p.username, '') AS actor_username,
              COALESCE(p.display_name, '') AS actor_display_name,
              COALESCE(p.avatar_url, '') AS actor_avatar_url
       FROM (
         SELECT 'like'::text AS kind, l.video_id::text AS video_id, l.user_id::text AS actor_user_id,
                l.created_at AS at, NULL::text AS snippet
         FROM likes l
         INNER JOIN videos v ON v.id = l.video_id
         WHERE v.user_id = $1 AND l.user_id <> $1
         UNION ALL
         SELECT 'comment', c.video_id::text, c.user_id::text, c.created_at,
                LEFT(c.text, 140)
         FROM comments c
         INNER JOIN videos v ON v.id = c.video_id
         WHERE v.user_id = $1 AND c.user_id <> $1 AND c.parent_id IS NULL
         UNION ALL
         SELECT 'save', s.video_id::text, s.user_id::text, s.created_at, NULL::text
         FROM saves s
         INNER JOIN videos v ON v.id = s.video_id
         WHERE v.user_id = $1 AND s.user_id <> $1
         ${mentionUnion}
       ) sub
       LEFT JOIN profiles p ON p.user_id = sub.actor_user_id
       ORDER BY sub.at DESC
       LIMIT 100`,
      params,
    );

    const rows = result.rows || [];
    const activities = rows.map((r: Record<string, unknown>, i: number) => {
      const kind = String(r.kind || "");
      const videoId = String(r.video_id || "");
      const actorId = String(r.actor_user_id || "");
      const at = r.at instanceof Date ? r.at.toISOString() : String(r.at || "");
      const snippet = r.snippet != null ? String(r.snippet) : null;
      return {
        id: `${kind}_${videoId}_${actorId}_${at}_${i}`,
        kind,
        video_id: videoId,
        actor_user_id: actorId,
        actor_username: String(r.actor_username || "user").trim() || "user",
        actor_display_name: String(r.actor_display_name || "").trim() || null,
        actor_avatar_url: String(r.actor_avatar_url || "").trim() || null,
        snippet,
        created_at: at,
      };
    });

    res.json({ activities });
  } catch (err) {
    logger.error({ err, ownerId }, "handleGetMyActivity failed");
    res.status(500).json({ error: "Failed to load activity" });
  }
}
