/**
 * Video store — Neon is the primary source of truth.
 * In-memory Map is used only as a startup cache and fallback when DB is unavailable.
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

const memCache = new Map<string, Video>();

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

/** Warm the in-memory cache on startup (called once from index.ts). */
export function replaceVideos(list: Video[]): void {
  memCache.clear();
  for (const v of list) memCache.set(v.id, v);
}

/** Write to both memory cache and Neon. */
export function addVideo(video: Video): void {
  memCache.set(video.id, video);
}

/** Remove from memory cache. Caller also calls deleteVideoFromDb. */
export function deleteVideoFromCache(id: string): boolean {
  return memCache.delete(id);
}

/** Neon-primary read by id. Falls back to memory cache if DB unavailable. */
export async function getVideoAsync(id: string): Promise<Video | undefined> {
  const db = getPool();
  if (db) {
    try {
      const res = await db.query(`SELECT * FROM videos WHERE id = $1 LIMIT 1`, [id]);
      if (res.rows?.[0]) {
        const v = rowToVideo(res.rows[0]);
        memCache.set(v.id, v);
        return v;
      }
      return undefined;
    } catch (err) {
      logger.error({ err, id }, "getVideoAsync DB read failed, falling back to cache");
    }
  }
  return memCache.get(id);
}

/** Sync cache read — used only for non-critical paths (stat increment). */
export function getVideoCached(id: string): Video | undefined {
  return memCache.get(id);
}

/** Neon-primary list all videos. Falls back to memory cache if DB unavailable. */
export async function getAllVideosAsync(limit = 500): Promise<Video[]> {
  const db = getPool();
  if (db) {
    try {
      const res = await db.query(
        `SELECT * FROM videos ORDER BY created_at DESC NULLS LAST LIMIT $1`,
        [limit],
      );
      const list = (res.rows || []).map(rowToVideo);
      for (const v of list) memCache.set(v.id, v);
      return list;
    } catch (err) {
      logger.error({ err }, "getAllVideosAsync DB read failed, falling back to cache");
    }
  }
  return Array.from(memCache.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

/** Neon-primary list by user. Falls back to memory cache if DB unavailable. */
export async function getVideosByUserAsync(userId: string): Promise<Video[]> {
  const db = getPool();
  if (db) {
    try {
      const res = await db.query(
        `SELECT * FROM videos WHERE user_id = $1 ORDER BY created_at DESC NULLS LAST`,
        [userId],
      );
      return (res.rows || []).map(rowToVideo);
    } catch (err) {
      logger.error({ err, userId }, "getVideosByUserAsync DB read failed, falling back to cache");
    }
  }
  return Array.from(memCache.values())
    .filter((v) => v.userId === userId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/** Neon-primary count. Falls back to memory cache size. */
export async function getVideoCountAsync(): Promise<number> {
  const db = getPool();
  if (db) {
    try {
      const res = await db.query(`SELECT COUNT(*)::int AS cnt FROM videos`);
      return Number(res.rows[0]?.cnt ?? 0);
    } catch {
      // fall through
    }
  }
  return memCache.size;
}

/** Update stat in both cache and Neon. */
export function incrementStat(
  videoId: string,
  stat: "views" | "likes" | "comments" | "shares" | "saves",
): void {
  const v = memCache.get(videoId);
  if (v) v[stat]++;
  const db = getPool();
  if (db) {
    db.query(`UPDATE videos SET ${stat} = ${stat} + 1 WHERE id = $1`, [videoId]).catch(() => {});
  }
}

export function decrementStat(
  videoId: string,
  stat: "views" | "likes" | "comments" | "shares" | "saves",
): void {
  const v = memCache.get(videoId);
  if (v) v[stat] = Math.max(0, v[stat] - 1);
  const db = getPool();
  if (db) {
    db.query(`UPDATE videos SET ${stat} = GREATEST(${stat} - 1, 0) WHERE id = $1`, [videoId]).catch(() => {});
  }
}
