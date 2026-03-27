/* eslint-disable @typescript-eslint/no-explicit-any */
import { Request, Response } from "express";
import { logger } from "../lib/logger";
import {
  getAllVideosAsync,
  getVideoCached,
  getVideoAsync,
  incrementStat,
  decrementStat,
} from "../lib/videoStore";
import { getPool } from "../lib/postgres";
import { getTokenFromRequest, verifyAuthToken } from "./auth";

const feedCache = new Map<string, { data: any[]; ts: number }>();
const CACHE_TTL = 15_000;
const trendingCache: { data: any[] | null; ts: number } = { data: null, ts: 0 };
const TRENDING_CACHE_TTL = 30_000;

const viewRateLimit = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT_WINDOW = 60_000;
const RATE_LIMIT_MAX_VIEWS = 120;

function getIpHash(req: Request): string {
  const ip =
    req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() ||
    req.ip ||
    "unknown";
  let hash = 0;
  for (let i = 0; i < ip.length; i++) {
    hash = (hash << 5) - hash + ip.charCodeAt(i);
    hash |= 0;
  }
  return "ip_" + Math.abs(hash).toString(36);
}

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = viewRateLimit.get(key);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW) {
    viewRateLimit.set(key, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX_VIEWS) return false;
  entry.count++;
  return true;
}

async function getUserId(req: Request): Promise<string | null> {
  const token = getTokenFromRequest(req);
  if (!token) return null;
  const payload = verifyAuthToken(token);
  return payload?.sub ?? null;
}

function formatVideoForClient(
  v: any,
  likedSet: Set<string>,
  followingSet: Set<string>,
): any {
  const u = v.user;
  const uid = u?.user_id ?? u?.id ?? v.user_id ?? "unknown";
  const uname = u?.username ?? "user";
  return {
    id: v.id,
    url: v.url || v.video_url, // Handle both
    thumbnail: v.thumbnail_url || v.thumb_url || "",
    duration: v.duration_seconds
      ? `${Math.floor(v.duration_seconds / 60)}:${String(Math.floor(v.duration_seconds % 60)).padStart(2, "0")}`
      : "0:15",
    user: {
      id: uid,
      username: uname,
      name: u?.display_name ?? uname,
      avatar:
        u?.avatar_url ??
        `https://ui-avatars.com/api/?name=${encodeURIComponent(uname)}`,
      level: 1,
      isVerified: !!u?.is_creator,
      followers: 0,
      following: 0,
    },
    description: v.description || v.caption || "",
    hashtags: v.hashtags || [],
    music: {
      id: "original",
      title: "Original Sound",
      artist: u?.display_name ?? uname,
      duration: "0:15",
    },
    stats: {
      views: v.views || 0,
      likes: v.likes || v.likes_count || 0,
      comments: v.comments || v.comments_count || 0,
      shares: v.shares || v.shares_count || 0,
      saves: 0,
    },
    createdAt: v.created_at,
    location: "For You",
    isLiked: likedSet.has(v.id),
    isSaved: false,
    isFollowing: uid !== "unknown" && followingSet.has(uid),
    comments: [],
    quality: "auto",
    privacy:
      v.privacy === "private" || v.is_public === false ? "private" : "public",
    engagementScore: v.engagement_score || 0,
  };
}

/** For You = ALL public videos & livestreams from everyone. */
export async function handleForYouFeed(req: Request, res: Response) {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
    const limit = Math.min(
      50,
      Math.max(1, parseInt(String(req.query.limit || "20"), 10) || 20),
    );
    const offset = (page - 1) * limit;

    const token = getTokenFromRequest(req);
    const jwtUser = token ? verifyAuthToken(token) : null;

    const followingSet = new Set<string>();
    const likedSet = new Set<string>();

    if (jwtUser?.sub) {
      try {
        const { getFollowingIdsAsync } = await import("./profiles");
        const ids = await getFollowingIdsAsync(jwtUser.sub);
        ids.forEach((id: string) => followingSet.add(id));
      } catch { /* non-fatal */ }
    }

    const cacheKey = `foryou:all:${page}:${limit}`;
    const cached = feedCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return res.json({
        videos: cached.data,
        mutualUserIds: [],
        page,
        limit,
        hasMore: cached.data.length >= limit,
        total: offset + cached.data.length,
        source: "cache",
      });
    }

    const db = getPool();
    let formatted: any[] = [];

    if (db) {
      const { rows } = await db.query(
        `SELECT v.*, row_to_json(p) AS user
         FROM videos v
         LEFT JOIN profiles p ON p.user_id = v.user_id
         WHERE (v.privacy IS NULL OR v.privacy <> 'private')
           AND v.url IS NOT NULL AND btrim(v.url) <> ''
         ORDER BY v.created_at DESC NULLS LAST
         LIMIT $1 OFFSET $2`,
        [limit, offset],
      );
      formatted = (rows || []).map((v: any) => formatVideoForClient(v, likedSet, followingSet));
    } else {
      const allVids = await getAllVideosAsync();
      const memVideos = allVids.filter((v) => {
        const url = (v.url || "").trim();
        if (!url || url.startsWith("https://example.com/")) return false;
        return v.privacy !== "private";
      });
      const paginated = memVideos.slice(offset, offset + limit);
      formatted = paginated.map((v) => ({
        id: v.id,
        url: v.url,
        thumbnail: v.thumbnail,
        duration: v.duration,
        user: {
          id: v.userId,
          username: v.username,
          name: v.displayName,
          avatar: v.avatar,
        },
        description: v.description,
        hashtags: v.hashtags,
        music: v.music,
        stats: {
          views: v.views,
          likes: v.likes,
          comments: v.comments,
          shares: v.shares,
          saves: v.saves,
        },
        createdAt: v.createdAt,
      }));
    }

    if (formatted.length > 0) {
      feedCache.set(cacheKey, { data: formatted, ts: Date.now() });
    }

    return res.json({
      videos: formatted,
      mutualUserIds: [],
      page,
      limit,
      hasMore: formatted.length >= limit,
      total: offset + formatted.length,
      source: db ? "postgres_all" : "memory_all",
    });
  } catch (err: any) {
    console.error("[ForYouFeed] Error:", err?.message || err);
    res.status(500).json({ error: "Failed to generate feed" });
  }
}

export async function handleTrackView(req: Request, res: Response) {
  try {
    const {
      videoId,
      watchTime,
      videoDuration,
      completed,
    } = req.body;
    if (!videoId) return res.status(400).json({ error: "videoId required" });

    const db = getPool();

    // Always increment the in-memory stat (used for feed ranking)
    incrementStat(videoId, "views");

    if (!db) {
      return res.json({ ok: true });
    }

    const userId = await getUserId(req);
    const ipHash = getIpHash(req);
    const rateKey = userId ? `${userId}:${ipHash}` : ipHash;

    if (!checkRateLimit(rateKey)) {
      return res.status(429).json({ error: "Rate limit exceeded" });
    }

    if (watchTime && videoDuration && watchTime > videoDuration * 1.5) {
      return res.status(400).json({ error: "Invalid watch time" });
    }

    // Persist view to Postgres if the table exists
    try {
      await db.query(
        `INSERT INTO video_views (id, user_id, video_id, watch_time_seconds, video_duration_seconds, completed, ip_hash, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         ON CONFLICT DO NOTHING`,
        [
          `v_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          userId || 'anonymous',
          videoId,
          watchTime || 0,
          videoDuration || 0,
          completed || false,
          ipHash,
        ],
      );
    } catch {
      // video_views table may not exist yet — non-fatal
    }

    // Update video stats in the videos table
    try {
      await db.query(`UPDATE videos SET views = views + 1 WHERE id = $1`, [videoId]);
    } catch {
      // non-fatal
    }

    res.json({ ok: true });
  } catch (err: any) {
    console.error("[TrackView] Error:", err?.message || err);
    res.status(500).json({ error: "Failed to track view" });
  }
}

export async function handleTrackInteraction(req: Request, res: Response) {
  try {
    const { videoId, type, data: _data } = req.body;
    if (!videoId || !type)
      return res.status(400).json({ error: "videoId and type required" });

    if (type === "like") incrementStat(videoId, "likes");
    else if (type === "comment") incrementStat(videoId, "comments");
    else if (type === "share") incrementStat(videoId, "shares");
    else if (type === "save") incrementStat(videoId, "saves");

    const db = getPool();
    if (db) {
      const col = type === "like" ? "likes" : type === "comment" ? "comments" : type === "share" ? "shares" : type === "save" ? "saves" : null;
      if (col) {
        try { await db.query(`UPDATE videos SET ${col} = ${col} + 1 WHERE id = $1`, [videoId]); } catch (err) { logger.warn({ err, videoId, col }, 'Failed to increment video stat'); }
      }
    }

    res.json({ ok: true });
  } catch (err: any) {
    console.error("[TrackInteraction] Error:", err?.message || err);
    res.status(500).json({ error: "Failed to track interaction" });
  }
}


export async function handleGetVideoScore(req: Request, res: Response) {
  try {
    const videoId = req.params.videoId;
    if (!videoId) return res.status(400).json({ error: "videoId required" });

    const db = getPool();
    if (!db) {
      const memVideo = await getVideoAsync(videoId);
      return res.json({
        score: memVideo
          ? {
              video_id: videoId,
              total_views: memVideo.views,
              total_likes: memVideo.likes,
              total_comments: memVideo.comments,
              total_shares: memVideo.shares,
              score: 0,
            }
          : 0,
      });
    }

    try {
      const result = await db.query(`SELECT * FROM video_scores WHERE video_id = $1 LIMIT 1`, [videoId]);
      res.json({ score: result.rows?.[0] || null });
    } catch {
      const memVideo = await getVideoAsync(videoId);
      res.json({ score: memVideo ? { video_id: videoId, total_views: memVideo.views, score: 0 } : null });
    }
  } catch (_err) {
    res.status(500).json({ error: "Failed to get score" });
  }
}

/** GET /api/feed/friends — videos from people you follow and people who follow you (one social graph feed) */
export async function handleFriendsFeed(req: Request, res: Response) {
  try {
    const token = getTokenFromRequest(req);
    const jwtUser = token ? verifyAuthToken(token) : null;
    if (!jwtUser) {
      return res.json({ videos: [] });
    }

    const { getFollowingIdsAsync, getFollowerIdsAsync } = await import("./profiles");
    const followingIds = await getFollowingIdsAsync(jwtUser.sub);
    const followerIds = await getFollowerIdsAsync(jwtUser.sub);
    const networkIds = [...new Set([...followingIds, ...followerIds])].filter(
      (id) => id && id !== jwtUser.sub,
    );
    if (networkIds.length === 0) {
      return res.json({ videos: [] });
    }

    const followingSet = new Set(followingIds);
    const likedSet = new Set<string>();

    const db = getPool();
    if (db) {
      const { rows } = await db.query(
        `SELECT v.*, row_to_json(p) AS user
         FROM videos v
         LEFT JOIN profiles p ON p.user_id = v.user_id
         WHERE v.user_id = ANY($1::text[])
           AND (v.privacy IS NULL OR v.privacy <> 'private')
           AND v.url IS NOT NULL AND btrim(v.url) <> ''
         ORDER BY v.created_at DESC NULLS LAST
         LIMIT 80`,
        [networkIds],
      );
      const mapped = (rows || []).map((v: any) => formatVideoForClient(v, likedSet, followingSet));
      return res.json({ videos: mapped });
    }

    const networkSet = new Set(networkIds);
    const allVideos = await getAllVideosAsync();
    const friendVids = allVideos
      .filter((v) => {
        const url = (v.url || "").trim();
        if (!url) return false;
        return networkSet.has(v.userId) && v.privacy !== "private";
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 80);

    const mapped = friendVids.map((v) => formatVideoForClient(v, likedSet, followingSet));
    return res.json({ videos: mapped });
  } catch (err) {
    console.error("[friends feed]", err);
    return res.json({ videos: [] });
  }
}

export function invalidateFeedCache(userId?: string) {
  if (userId) {
    const prefix = `foryou:mutual:${userId}:`;
    for (const key of [...feedCache.keys()]) {
      if (key.startsWith(prefix) || key.startsWith(userId)) feedCache.delete(key);
    }
  } else {
    feedCache.clear();
  }
  trendingCache.data = null;
}
