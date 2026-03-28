/**
 * Video store — Neon (PostgreSQL) is the ONLY source of truth.
 * No in-memory cache. All reads go to DB. Horizontally scalable.
 */

import { getPool } from "./postgres";
import { logger } from "./logger";

export interface Video {
  id: string;
  url: string;
  thumbnail: string;
  duration: number;
  userId: string;
  username: string;
  displayName: string;
  avatar: string;
  description: string;
  hashtags: string[];
  music: { id: string; title: string; artist: string; duration: number } | null;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  createdAt: string;
  privacy: string;
}

function rowToVideo(row: Record<string, unknown>): Video {
  return {
    id: String(row.id),
    url: String(row.url ?? row.video_url ?? ""),
    thumbnail: String(row.thumbnail ?? row.thumbnail_url ?? ""),
    duration: Number(row.duration ?? 0),
    userId: String(row.user_id ?? row.userId ?? ""),
    username: String(row.username ?? ""),
    displayName: String(row.display_name ?? row.displayName ?? ""),
    avatar: String(row.avatar ?? ""),
    description: String(row.description ?? ""),
    hashtags: Array.isArray(row.hashtags) ? row.hashtags : [],
    music: row.music && typeof row.music === "object" ? (row.music as Video["music"]) : null,
    views: Number(row.views ?? 0),
    likes: Number(row.likes ?? 0),
    comments: Number(row.comments ?? 0),
    shares: Number(row.shares ?? 0),
    saves: Number(row.saves ?? 0),
    createdAt: String(
      row.created_at instanceof Date
        ? (row.created_at as Date).toISOString()
        : row.createdAt ?? row.created_at ?? "",
    ),
    privacy: String(row.privacy ?? "public"),
  };
}

/** @deprecated No-op — startup bulk loading removed for horizontal scaling. */
export function replaceVideos(_list: Video[]): void {
  // Intentionally empty — DB is the only source of truth.
}

/** No-op for in-memory — caller also calls saveVideoToDb. */
export function addVideo(_video: Video): void {
  // DB write handled by saveVideoToDb in postgres.ts
}

/** No-op — cache removed. Caller also calls deleteVideoFromDb. */
export function deleteVideoFromCache(_id: string): boolean {
  return true;
}

/** Read by id from DB. */
export async function getVideoAsync(id: string): Promise<Video | undefined> {
  const db = getPool();
  if (!db) return undefined;
  try {
    const res = await db.query(`SELECT * FROM videos WHERE id = $1 LIMIT 1`, [id]);
    if (res.rows?.[0]) return rowToVideo(res.rows[0]);
    return undefined;
  } catch (err) {
    logger.error({ err, id }, "getVideoAsync DB read failed");
    return undefined;
  }
}

/** @deprecated Use getVideoAsync instead. Returns undefined (no cache). */
export function getVideoCached(_id: string): Video | undefined {
  return undefined;
}

/** List all videos from DB with limit. */
export async function getAllVideosAsync(limit = 500): Promise<Video[]> {
  const db = getPool();
  if (!db) return [];
  try {
    const res = await db.query(
      `SELECT * FROM videos ORDER BY created_at DESC NULLS LAST LIMIT $1`,
      [limit],
    );
    return (res.rows || []).map(rowToVideo);
  } catch (err) {
    logger.error({ err }, "getAllVideosAsync DB read failed");
    return [];
  }
}

/** List videos by user from DB. */
export async function getVideosByUserAsync(userId: string, limit = 200): Promise<Video[]> {
  const db = getPool();
  if (!db) return [];
  try {
    const res = await db.query(
      `SELECT * FROM videos WHERE user_id = $1 ORDER BY created_at DESC NULLS LAST LIMIT $2`,
      [userId, limit],
    );
    return (res.rows || []).map(rowToVideo);
  } catch (err) {
    logger.error({ err, userId }, "getVideosByUserAsync DB read failed");
    return [];
  }
}

/** Count videos from DB. */
export async function getVideoCountAsync(): Promise<number> {
  const db = getPool();
  if (!db) return 0;
  try {
    const res = await db.query(`SELECT COUNT(*)::int AS cnt FROM videos`);
    return Number(res.rows[0]?.cnt ?? 0);
  } catch {
    return 0;
  }
}

/** Update stat in DB only. */
export function incrementStat(
  videoId: string,
  stat: "views" | "likes" | "comments" | "shares" | "saves",
): void {
  const db = getPool();
  if (db) {
    db.query(`UPDATE videos SET ${stat} = ${stat} + 1 WHERE id = $1`, [videoId]).catch(() => {});
  }
}

export function decrementStat(
  videoId: string,
  stat: "views" | "likes" | "comments" | "shares" | "saves",
): void {
  const db = getPool();
  if (db) {
    db.query(`UPDATE videos SET ${stat} = GREATEST(${stat} - 1, 0) WHERE id = $1`, [videoId]).catch(() => {});
  }
}
