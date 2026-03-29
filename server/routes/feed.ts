/* eslint-disable @typescript-eslint/no-explicit-any */
import { Request, Response } from "express";
import { logger } from "../lib/logger";
import { getPool } from "../lib/postgres";
import { getTokenFromRequest, verifyAuthToken } from "./auth";
import { isValkeyConfigured, valkeyGet, valkeySet, valkeyRateCheck } from "../lib/valkey";
import {
  bumpFeedForyouEpoch,
  feedForyouDataKey,
  getFeedForyouEpoch,
  FEED_FORYOU_CACHE_TTL_MS,
} from "../lib/feedCacheValkey";
import { bumpCacheLayer } from "../lib/cacheLayerMetrics";

const RATE_LIMIT_WINDOW = 60_000;
const RATE_LIMIT_MAX_VIEWS = 120;
const FORYOU_CACHE_SEC = Math.max(5, Math.floor(FEED_FORYOU_CACHE_TTL_MS / 1000));

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

async function allowViewRateLimit(rateKey: string): Promise<boolean> {
  if (!isValkeyConfigured()) return true;
  return valkeyRateCheck(`elix:ratelimit:feed_view:${rateKey}`, RATE_LIMIT_WINDOW, RATE_LIMIT_MAX_VIEWS);
}

async function getUserId(req: Request): Promise<string | null> {
  const token = getTokenFromRequest(req);
  if (!token) return null;
  const payload = verifyAuthToken(token);
  return payload?.sub ?? null;
}

function formatDurationSeconds(sec: unknown): string {
  const n = Number(sec);
  if (!Number.isFinite(n) || n < 0) return "0:00";
  const m = Math.floor(n / 60);
  const s = Math.floor(n % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatMusicFromRow(v: any, displayName: string): any {
  const m = v.music;
  if (m && typeof m === "object" && !Array.isArray(m)) {
    return {
      id: String(m.id ?? "original"),
      title: String(m.title ?? ""),
      artist: String(m.artist ?? displayName),
      duration: typeof m.duration === "string" ? m.duration : formatDurationSeconds(m.duration),
    };
  }
  return null;
}

function formatVideoForClient(
  v: any,
  likedSet: Set<string>,
  followingSet: Set<string>,
  locationLabel: string,
): any {
  const u = v.user;
  const uid = u?.user_id ?? u?.id ?? v.user_id ?? "unknown";
  const uname = u?.username ?? "user";
  const displayName = String(u?.display_name ?? uname);
  const music = formatMusicFromRow(v, displayName);
  return {
    id: v.id,
    url: v.url || v.video_url,
    thumbnail: v.thumbnail || v.thumbnail_url || v.thumb_url || "",
    duration: formatDurationSeconds(v.duration_seconds ?? v.duration),
    user: {
      id: uid,
      username: uname,
      name: displayName,
      avatar:
        u?.avatar_url ??
        `https://ui-avatars.com/api/?name=${encodeURIComponent(uname)}`,
      level: Number(u?.level ?? 1),
      isVerified: !!u?.is_creator,
      followers: Number(u?.followers ?? 0),
      following: Number(u?.following ?? 0),
    },
    description: v.description || v.caption || "",
    hashtags: Array.isArray(v.hashtags) ? v.hashtags : [],
    music,
    stats: {
      views: v.views ?? 0,
      likes: v.likes ?? v.likes_count ?? 0,
      comments: v.comments ?? v.comments_count ?? 0,
      shares: v.shares ?? v.shares_count ?? 0,
      saves: v.saves ?? 0,
    },
    createdAt: v.created_at,
    location: locationLabel,
    isLiked: likedSet.has(v.id),
    isSaved: false,
    isFollowing: uid !== "unknown" && followingSet.has(uid),
    comments: [],
    quality: "auto",
    privacy:
      v.privacy === "private" || v.is_public === false ? "private" : "public",
    engagementScore: Number(v.engagement_score ?? 0),
  };
}

const FORYOU_SQL = `SELECT v.id, v.url, v.thumbnail, v.duration, v.description, v.hashtags, v.music,
                v.views, v.likes, v.comments, v.shares, v.saves,
                v.created_at, v.privacy, v.user_id,
                (COALESCE(v.views,0) + COALESCE(v.likes,0)*2 + COALESCE(v.comments,0) + COALESCE(v.shares,0))::int AS engagement_score,
                (json_build_object(
                  'user_id', p.user_id,
                  'username', p.username,
                  'display_name', p.display_name,
                  'avatar_url', p.avatar_url,
                  'is_creator', COALESCE(p.is_verified, false),
                  'followers', COALESCE(p.followers, 0),
                  'following', COALESCE(p.following, 0),
                  'level', COALESCE(p.level, 1)
                ))::json AS user
         FROM videos v
         LEFT JOIN profiles p ON p.user_id = v.user_id
         WHERE (v.privacy IS NULL OR v.privacy <> 'private')
           AND v.url IS NOT NULL AND btrim(v.url) <> ''
         ORDER BY v.created_at DESC NULLS LAST
         LIMIT $1 OFFSET $2`;

/** For You — Postgres + Valkey cache; no in-memory feed state. */
export async function handleForYouFeed(req: Request, res: Response) {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
    const limit = Math.min(
      50,
      Math.max(1, parseInt(String(req.query.limit || "20"), 10) || 20),
    );
    const offset = (page - 1) * limit;

    const db = getPool();
    if (!db) {
      return res.status(503).json({ error: "DATABASE_UNAVAILABLE" });
    }

    const followingSet = new Set<string>();
    const likedSet = new Set<string>();

    const epoch = await getFeedForyouEpoch();
    const valkeyKey = feedForyouDataKey(epoch, page, limit);

    if (isValkeyConfigured()) {
      const raw = await valkeyGet(valkeyKey);
      if (raw) {
        try {
          const payload = JSON.parse(raw) as { videos: any[] };
          res.setHeader(
            "Cache-Control",
            `public, s-maxage=${FORYOU_CACHE_SEC}, max-age=${Math.max(5, Math.floor(FORYOU_CACHE_SEC / 2))}`,
          );
          bumpCacheLayer("feed_foryou_valkey_hits");
          return res.json({
            videos: payload.videos,
            mutualUserIds: [],
            page,
            limit,
            hasMore: payload.videos.length >= limit,
            total: offset + payload.videos.length,
            source: "valkey",
          });
        } catch {
          /* miss */
        }
      }
    }

    const { rows } = await db.query(FORYOU_SQL, [limit, offset]);
    const formatted = (rows || []).map((v: any) =>
      formatVideoForClient(v, likedSet, followingSet, "For You"),
    );
    bumpCacheLayer("feed_foryou_builds");

    if (isValkeyConfigured() && formatted.length > 0) {
      await valkeySet(
        valkeyKey,
        JSON.stringify({ videos: formatted }),
        FEED_FORYOU_CACHE_TTL_MS,
      );
    }

    res.setHeader(
      "Cache-Control",
      `public, s-maxage=${FORYOU_CACHE_SEC}, max-age=${Math.max(5, Math.floor(FORYOU_CACHE_SEC / 2))}`,
    );
    return res.json({
      videos: formatted,
      mutualUserIds: [],
      page,
      limit,
      hasMore: formatted.length >= limit,
      total: offset + formatted.length,
      source: "postgres",
    });
  } catch (err: any) {
    logger.error({ err: err?.message }, "ForYouFeed error");
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
    if (!db) {
      return res.status(503).json({ error: "DATABASE_UNAVAILABLE" });
    }

    const userId = await getUserId(req);
    const ipHash = getIpHash(req);
    const rateKey = userId ? `${userId}:${ipHash}` : ipHash;

    if (!(await allowViewRateLimit(rateKey))) {
      return res.status(429).json({ error: "Rate limit exceeded" });
    }

    if (watchTime && videoDuration && watchTime > videoDuration * 1.5) {
      return res.status(400).json({ error: "Invalid watch time" });
    }

    res.status(202).json({ accepted: true });

    db.query(
      `INSERT INTO video_views (id, user_id, video_id, watch_time_seconds, video_duration_seconds, completed, ip_hash, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT DO NOTHING`,
      [
        `v_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        userId || "anonymous",
        videoId,
        watchTime || 0,
        videoDuration || 0,
        completed || false,
        ipHash,
      ],
    ).catch((err: any) => {
      logger.warn(
        { err: err?.message },
        "Failed to insert video_views row after track view",
      );
    });

    db.query(`UPDATE videos SET views = views + 1 WHERE id = $1`, [videoId]).catch(
      (err: any) => {
        logger.warn(
          { err: err?.message },
          "Failed to increment video views in DB after track view",
        );
      },
    );
  } catch (err: any) {
    logger.error({ err: err?.message }, "TrackView error");
    res.status(500).json({ error: "Failed to track view" });
  }
}

export async function handleTrackInteraction(req: Request, res: Response) {
  try {
    const userId = await getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { videoId, type, data: _data } = req.body;
    if (!videoId || !type)
      return res.status(400).json({ error: "videoId and type required" });

    const db = getPool();
    if (!db) {
      return res.status(503).json({ error: "DATABASE_UNAVAILABLE" });
    }
    const col =
      type === "like"
        ? "likes"
        : type === "comment"
          ? "comments"
          : type === "share"
            ? "shares"
            : type === "save"
              ? "saves"
              : null;
    if (!col) {
      return res.status(400).json({ error: "Invalid interaction type" });
    }
    await db.query(`UPDATE videos SET ${col} = ${col} + 1 WHERE id = $1`, [videoId]);

    res.json({ ok: true });
  } catch (err: any) {
    logger.error({ err: err?.message }, "TrackInteraction error");
    res.status(500).json({ error: "Failed to track interaction" });
  }
}

export async function handleGetVideoScore(req: Request, res: Response) {
  try {
    const videoId = req.params.videoId;
    if (!videoId) return res.status(400).json({ error: "videoId required" });
    res.setHeader("Cache-Control", "private, no-store");

    const db = getPool();
    if (!db) {
      return res.status(503).json({ error: "DATABASE_UNAVAILABLE" });
    }

    try {
      const result = await db.query(`SELECT * FROM video_scores WHERE video_id = $1 LIMIT 1`, [videoId]);
      res.json({ score: result.rows?.[0] ?? null });
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === "42P01") {
        return res.json({ score: null });
      }
      throw err;
    }
  } catch (err: any) {
    logger.error({ err: err?.message }, "GetVideoScore error");
    res.status(500).json({ error: "Failed to get score" });
  }
}

const FRIENDS_SQL = `SELECT v.id, v.url, v.thumbnail, v.duration, v.description, v.hashtags, v.music,
                v.views, v.likes, v.comments, v.shares, v.saves,
                v.created_at, v.privacy, v.user_id,
                (COALESCE(v.views,0) + COALESCE(v.likes,0)*2 + COALESCE(v.comments,0) + COALESCE(v.shares,0))::int AS engagement_score,
                (json_build_object(
                  'user_id', p.user_id,
                  'username', p.username,
                  'display_name', p.display_name,
                  'avatar_url', p.avatar_url,
                  'is_creator', COALESCE(p.is_verified, false),
                  'followers', COALESCE(p.followers, 0),
                  'following', COALESCE(p.following, 0),
                  'level', COALESCE(p.level, 1)
                ))::json AS user
         FROM videos v
         LEFT JOIN profiles p ON p.user_id = v.user_id
         WHERE v.user_id = ANY($1::text[])
           AND (v.privacy IS NULL OR v.privacy <> 'private')
           AND v.url IS NOT NULL AND btrim(v.url) <> ''
         ORDER BY v.created_at DESC NULLS LAST
         LIMIT 80`;

/** GET /api/feed/friends — DB only (private; not Valkey-cached). */
export async function handleFriendsFeed(req: Request, res: Response) {
  try {
    const token = getTokenFromRequest(req);
    const jwtUser = token ? verifyAuthToken(token) : null;
    res.setHeader("Cache-Control", "private, no-store");
    if (!jwtUser) {
      return res.json({ videos: [] });
    }

    const { getFollowingIdsAsync, getFollowerIdsAsync } = await import("./profiles");
    const [followingIds, followerIds] = await Promise.all([
      getFollowingIdsAsync(jwtUser.sub),
      getFollowerIdsAsync(jwtUser.sub),
    ]);
    const networkIds = [...new Set([...followingIds, ...followerIds])].filter(
      (id) => id && id !== jwtUser.sub,
    );
    if (networkIds.length === 0) {
      return res.json({ videos: [] });
    }

    const followingSet = new Set(followingIds);
    const likedSet = new Set<string>();

    const db = getPool();
    if (!db) {
      return res.status(503).json({ error: "DATABASE_UNAVAILABLE" });
    }

    const { rows } = await db.query(FRIENDS_SQL, [networkIds]);
    const mapped = (rows || []).map((v: any) =>
      formatVideoForClient(v, likedSet, followingSet, "Friends"),
    );
    return res.json({ videos: mapped });
  } catch (err: any) {
    logger.error({ err: err?.message }, "Friends feed error");
    return res.status(500).json({ error: "FEED_ERROR" });
  }
}

/** Invalidate For You Valkey cache (epoch bump). userId ignored — global feed invalidation. */
export function invalidateFeedCache(_userId?: string): void {
  void bumpFeedForyouEpoch();
}
