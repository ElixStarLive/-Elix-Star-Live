import { Request, Response } from "express";
import { logger } from "../lib/logger";
import { getPool } from "../lib/postgres";
import { getTokenFromRequest, verifyAuthToken } from "./auth";
import { isValkeyConfigured, valkeyGet, valkeySet, valkeyRateCheck, acquireCacheBuildLock, waitForCachePopulate } from "../lib/valkey";
import {
  bumpFeedForyouEpoch,
  feedForyouDataKey,
  getFeedForyouEpoch,
  FEED_FORYOU_CACHE_TTL_MS,
} from "../lib/feedCacheValkey";
import { bumpCacheLayer } from "../lib/cacheLayerMetrics";
import { recordQualifiedRewardView } from "../lib/monetisation/qualifiedViews";
import { queryRankedForYouPage } from "../lib/feed/foryouQuery";
import { bumpFeedSignal, markNotInterested } from "../lib/feed/foryouLifecycle";

const RATE_LIMIT_WINDOW = 60_000;
const RATE_LIMIT_MAX_VIEWS = 120;
const FORYOU_CACHE_SEC = Math.max(5, Math.floor(FEED_FORYOU_CACHE_TTL_MS / 1000));

/** Profile columns of the `user` json_build_object in FRIENDS_SQL / queryRankedForYouPage. */
type FeedRowUser = {
  user_id?: string;
  username?: string;
  display_name?: string;
  avatar_url?: string;
  is_creator?: boolean;
  followers?: number;
  following?: number;
  level?: number;
  /** Alternate id key formatVideoForClient still falls back to. */
  id?: string;
};

/**
 * Video row as selected by FRIENDS_SQL and queryRankedForYouPage. Members marked
 * as fallbacks are not selected columns; formatVideoForClient reads them as
 * alternates and they stay in the type so that behaviour is preserved.
 */
type FeedVideoRow = {
  id: string;
  user_id?: string;
  user?: FeedRowUser;
  url?: string;
  thumbnail?: string;
  duration?: number | string;
  description?: string;
  hashtags?: unknown;
  music?: Record<string, unknown> | unknown[] | string | number | boolean | null;
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  created_at?: string | Date;
  privacy?: string;
  engagement_score?: number;
  /** Fallback keys read by formatVideoForClient. */
  video_url?: string;
  thumbnail_url?: string;
  thumb_url?: string;
  duration_seconds?: number | string;
  caption?: string;
  likes_count?: number;
  comments_count?: number;
  shares_count?: number;
  is_public?: boolean;
  duetWithVideoId?: unknown;
  duetLayout?: unknown;
};

type FeedMusic = {
  id: string;
  title: string;
  artist: string;
  duration: string;
  previewUrl?: string;
  provider?: unknown;
  clipStartSeconds?: number;
  clipEndSeconds?: number;
  duetWithVideoId?: string;
  duetLayout?: "overlay" | "split";
};

type FeedVideo = {
  id: string;
  url: string;
  thumbnail: string;
  duration: string;
  user: {
    id: string;
    username: string;
    name: string;
    avatar: string;
    level: number;
    isVerified: boolean;
    followers: number;
    following: number;
  };
  description: string;
  hashtags: unknown[];
  music: FeedMusic | null;
  stats: {
    views: number;
    likes: number;
    comments: number;
    shares: number;
    saves: number;
  };
  createdAt: string | Date;
  location: string;
  isLiked: boolean;
  isSaved: boolean;
  isFollowing: boolean;
  comments: unknown[];
  quality: string;
  privacy: string;
  engagementScore: number;
  duetWithVideoId?: string;
  duetLayout?: "overlay" | "split";
};

/** Body returned by GET /api/feed/foryou (matches ForYouFeedPage on the client). */
type ForYouFeedResponse = {
  videos: FeedVideo[];
  mutualUserIds: string[];
  page: number;
  limit: number;
  hasMore: boolean;
  total: number;
  source: string;
};

/** Exactly what `err?.message` returned before: the carried message, else undefined. */
function errMessage(err: unknown): unknown {
  if (err === null || err === undefined) return undefined;
  if (typeof err !== "object" && typeof err !== "function") return undefined;
  return "message" in err ? err.message : undefined;
}

function getIpHash(req: Request): string {
  // With app.set("trust proxy", 1) Express resolves req.ip to the real client hop.
  // Reading the left-most X-Forwarded-For entry first let a caller pick their own
  // key: rotating the header gave an unlimited view rate AND a fresh viewer_key
  // per request, so an anonymous client could inflate a video's public view count
  // without limit. Same rule as getClientIp in middleware/rateLimit.
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  let hash = 0;
  for (let i = 0; i < ip.length; i++) {
    hash = (hash << 5) - hash + ip.charCodeAt(i);
    hash |= 0;
  }
  return "ip_" + Math.abs(hash).toString(36);
}

/**
 * Fails CLOSED in production, like wsRateCheck and checkRateLimit: an unanswerable
 * window used to return true, which turned a Valkey blip into an unlimited view
 * rate on the counter that drives the public view count and For You ranking.
 * Outside production there is no Valkey, so the limit is skipped as before.
 */
async function allowViewRateLimit(rateKey: string): Promise<boolean> {
  const requireLimiter = process.env.NODE_ENV === "production";
  if (!isValkeyConfigured()) {
    if (requireLimiter) {
      logger.error("allowViewRateLimit: Valkey required in production — refusing view");
      return false;
    }
    return true;
  }
  try {
    return await valkeyRateCheck(`elix:ratelimit:feed_view:${rateKey}`, RATE_LIMIT_WINDOW, RATE_LIMIT_MAX_VIEWS);
  } catch (err) {
    if (requireLimiter) {
      logger.error({ err: errMessage(err) }, "allowViewRateLimit: Valkey error — refusing view (fail closed)");
      return false;
    }
    return true;
  }
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

function formatMusicFromRow(v: FeedVideoRow, displayName: string): FeedMusic | null {
  const m = v.music;
  if (m && typeof m === "object" && !Array.isArray(m)) {
    const previewUrl =
      typeof m.previewUrl === "string"
        ? m.previewUrl
        : typeof m.url === "string"
          ? m.url
          : undefined;
    return {
      id: String(m.id ?? "original"),
      title: String(m.title ?? ""),
      artist: String(m.artist ?? displayName),
      duration: typeof m.duration === "string" ? m.duration : formatDurationSeconds(m.duration),
      ...(previewUrl ? { previewUrl } : {}),
      ...(m.provider ? { provider: m.provider } : {}),
      ...(typeof m.clipStartSeconds === "number"
        ? { clipStartSeconds: m.clipStartSeconds }
        : {}),
      ...(typeof m.clipEndSeconds === "number"
        ? { clipEndSeconds: m.clipEndSeconds }
        : {}),
      ...(m.duetWithVideoId ? { duetWithVideoId: String(m.duetWithVideoId) } : {}),
      ...(m.duetLayout === "overlay" || m.duetLayout === "split"
        ? { duetLayout: m.duetLayout }
        : {}),
    };
  }
  return null;
}

function formatVideoForClient(
  v: FeedVideoRow,
  likedSet: Set<string>,
  followingSet: Set<string>,
  locationLabel: string,
): FeedVideo {
  const u = v.user;
  const uid = u?.user_id ?? u?.id ?? v.user_id ?? "unknown";
  const uname = u?.username ?? "user";
  const displayName = String(u?.display_name ?? uname);
  const music = formatMusicFromRow(v, displayName);
  const rawMusic =
    v.music && typeof v.music === "object" && !Array.isArray(v.music)
      ? (v.music as Record<string, unknown>)
      : null;
  const duetWithVideoId =
    (typeof v.duetWithVideoId === "string" && v.duetWithVideoId) ||
    (typeof rawMusic?.duetWithVideoId === "string" && rawMusic.duetWithVideoId) ||
    (typeof music?.duetWithVideoId === "string" && music.duetWithVideoId) ||
    null;
  const duetLayoutRaw =
    v.duetLayout || rawMusic?.duetLayout || music?.duetLayout || null;
  const duetLayout =
    duetLayoutRaw === "overlay" || duetLayoutRaw === "split"
      ? duetLayoutRaw
      : null;
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
    ...(duetWithVideoId ? { duetWithVideoId: String(duetWithVideoId) } : {}),
    ...(duetLayout ? { duetLayout } : {}),
  };
}

function foryouResponse(videos: FeedVideo[], page: number, limit: number, offset: number, source: string): ForYouFeedResponse {
  return {
    videos,
    mutualUserIds: [],
    page,
    limit,
    hasMore: videos.length >= limit,
    total: offset + videos.length,
    source,
  };
}

function setCacheHeaders(res: Response, personalized: boolean) {
  if (personalized) {
    res.setHeader("Cache-Control", "private, no-store");
    return;
  }
  res.setHeader("Cache-Control", `public, s-maxage=${FORYOU_CACHE_SEC}, max-age=${Math.max(5, Math.floor(FORYOU_CACHE_SEC / 2))}`);
}

async function buildFeedFromDb(
  limit: number,
  offset: number,
  viewerUserId?: string | null,
): Promise<FeedVideo[]> {
  // queryRankedForYouPage declares the loose ForYouCandidateRow shape; its SELECT
  // returns the FeedVideoRow columns (plus ranking columns this file ignores).
  const rows = (await queryRankedForYouPage({ limit, offset, viewerUserId })) as FeedVideoRow[];
  return (rows || []).map((v: FeedVideoRow) =>
    formatVideoForClient(v, new Set(), new Set(), "For You"),
  );
}

/** For You — backend ranking; Valkey cache is global for anon, private for logged-in. */
export async function handleForYouFeed(req: Request, res: Response) {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit || "20"), 10) || 20));
    const offset = (page - 1) * limit;
    const viewerUserId = await getUserId(req);
    const personalized = !!viewerUserId;

    const db = getPool();
    if (!db) return res.status(503).json({ error: "DATABASE_UNAVAILABLE" });

    // Personalized feeds must not share a global Valkey payload (not-interested / fraud gates).
    if (!personalized && isValkeyConfigured()) {
      const epoch = await getFeedForyouEpoch();
      const valkeyKey = feedForyouDataKey(epoch, page, limit);
      const cached = await valkeyGet(valkeyKey);
      if (cached) {
        try {
          const payload = JSON.parse(cached) as { videos: FeedVideo[] };
          setCacheHeaders(res, false);
          bumpCacheLayer("feed_foryou_valkey_hits");
          return res.json(foryouResponse(payload.videos, page, limit, offset, "valkey"));
        } catch { /* corrupted cache, rebuild */ }
      }

      const gotLock = await acquireCacheBuildLock(valkeyKey);
      if (!gotLock) {
        const waited = await waitForCachePopulate(valkeyKey);
        if (waited) {
          try {
            const payload = JSON.parse(waited) as { videos: FeedVideo[] };
            setCacheHeaders(res, false);
            bumpCacheLayer("feed_foryou_valkey_hits");
            return res.json(foryouResponse(payload.videos, page, limit, offset, "valkey"));
          } catch { /* fall through */ }
        }
      }

      const videos = await buildFeedFromDb(limit, offset, null);
      bumpCacheLayer("feed_foryou_builds");
      if (videos.length > 0) {
        valkeySet(valkeyKey, JSON.stringify({ videos }), FEED_FORYOU_CACHE_TTL_MS).catch(() => {});
      }
      setCacheHeaders(res, false);
      return res.json(foryouResponse(videos, page, limit, offset, "postgres"));
    }

    const videos = await buildFeedFromDb(limit, offset, viewerUserId);
    bumpCacheLayer("feed_foryou_builds");
    setCacheHeaders(res, personalized);
    return res.json(foryouResponse(videos, page, limit, offset, "postgres"));
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "DATABASE_UNAVAILABLE") {
      return res.status(503).json({ error: "DATABASE_UNAVAILABLE" });
    }
    logger.error({ err: errMessage(err) }, "ForYouFeed error");
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

    // One viewer = one public view per video (scroll-back must not inflate views).
    const isNamedUser = !!userId && userId !== "anonymous";
    const viewerKey = isNamedUser ? `u:${userId}` : `ip:${ipHash}`;
    let counted = false;

    try {
      const uniq = await db.query(
        `INSERT INTO video_view_counters (video_id, viewer_key)
         VALUES ($1, $2)
         ON CONFLICT (video_id, viewer_key) DO NOTHING
         RETURNING video_id`,
        [String(videoId), viewerKey],
      );
      counted = (uniq.rowCount ?? 0) > 0;
      if (counted) {
        await db.query(`UPDATE videos SET views = views + 1 WHERE id = $1`, [videoId]);
      }
    } catch (err: unknown) {
      // Fallback if migration not applied yet: prior-row check on video_views.
      logger.warn({ err: errMessage(err) }, "video_view_counters insert failed; falling back");
      try {
        const viewerCol = isNamedUser ? "user_id" : "ip_hash";
        const viewerVal = isNamedUser ? userId : ipHash;
        const prior = await db.query(
          `SELECT 1 FROM video_views WHERE video_id = $1 AND ${viewerCol} = $2 LIMIT 1`,
          [videoId, viewerVal],
        );
        counted = (prior.rowCount ?? 0) === 0;
        if (counted) {
          await db.query(`UPDATE videos SET views = views + 1 WHERE id = $1`, [videoId]);
        }
      } catch (err2: unknown) {
        logger.warn({ err: errMessage(err2) }, "track view dedup fallback failed");
      }
    }

    res.status(200).json({ accepted: true, counted });

    const isFirstView = counted;
    void (async () => {
      try {
        await db.query(
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
        );
      } catch (err: unknown) {
        logger.warn({ err: errMessage(err) }, "Failed to insert video_views row after track view");
      }

      // Creator Rewards: qualified unique views (logged-in only; DB unique on video+viewer).
      try {
        let creatorUserId = "";
        const owner = await db.query(`SELECT user_id FROM videos WHERE id = $1 LIMIT 1`, [
          videoId,
        ]);
        if (owner.rowCount) creatorUserId = String(owner.rows[0].user_id || "");
        const { evaluateViewFraud } = await import("../lib/monetisation/fraud");
        const { loadMonetisationConfig } = await import("../lib/monetisation/config");
        const cfg = await loadMonetisationConfig();
        const ua = String(req.headers["user-agent"] || "");
        const fraud = await evaluateViewFraud({
          videoId: String(videoId),
          viewerUserId: isNamedUser ? String(userId) : "",
          creatorUserId,
          watchSeconds: Math.floor(Number(watchTime) || 0),
          minWatchSeconds: cfg.rewardsMinWatchSeconds,
          userAgent: ua,
          ipHash,
        });
        const rejectMap: Record<string, "bot" | "fraud" | "logged_out" | "self" | "watch_time" | null> = {
          logged_out: "logged_out",
          self_view: "self",
          watch_time: "watch_time",
          bot_ua: "bot",
          rate_view_farm: "fraud",
          account_not_good_standing: "fraud",
        };
        const qResult = await recordQualifiedRewardView({
          videoId: String(videoId),
          viewerUserId: isNamedUser ? String(userId) : "",
          creatorUserId,
          watchSeconds: Math.floor(Number(watchTime) || 0),
          rejectReason: fraud.reject
            ? rejectMap[fraud.reason || ""] || "fraud"
            : null,
        });

        const watchSec = Math.floor(Number(watchTime) || 0);
        if (watchSec > 0) {
          void bumpFeedSignal(String(videoId), "watch_time_seconds", watchSec);
        }
        if (completed) {
          void bumpFeedSignal(String(videoId), "completions", 1);
        }
        if (!isFirstView && isNamedUser) {
          void bumpFeedSignal(String(videoId), "rewatches_unique", 1);
        }

        if (qResult.qualified) {
          const { onQualifiedUniqueViewForFeed } = await import("../lib/feed/foryouLifecycle");
          await onQualifiedUniqueViewForFeed({
            videoId: String(videoId),
            creatorUserId,
          });
        }
      } catch (err: unknown) {
        logger.warn({ err: errMessage(err) }, "qualified reward view recording failed");
      }
    })();
  } catch (err: unknown) {
    logger.error({ err: errMessage(err) }, "TrackView error");
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
    const KNOWN_TYPES = new Set([
      "like",
      "comment",
      "share",
      "save",
      "follow",
      "view",
      "not_interested",
      "profile_visit",
    ]);
    if (!KNOWN_TYPES.has(type)) {
      return res.status(400).json({ error: "Invalid interaction type" });
    }
    // Only `shares` is maintained here — it has no other counter path. like /
    // comment / save are incremented transactionally AND deduped by
    // /api/videos/:id/{like,save,comment}; incrementing them again here
    // double-counted every action and let any user inflate arbitrary videos'
    // public counters. Those types are now analytics-only no-ops.
    if (type === "share") {
      await db.query(`UPDATE videos SET shares = shares + 1 WHERE id = $1`, [videoId]);
    }
    if (type === "not_interested") {
      await markNotInterested(String(videoId), userId);
    }
    if (type === "follow") {
      void bumpFeedSignal(String(videoId), "follows_generated", 1);
    }
    if (type === "profile_visit") {
      void bumpFeedSignal(String(videoId), "profile_visits_generated", 1);
    }

    res.json({ ok: true });
  } catch (err: unknown) {
    logger.error({ err: errMessage(err) }, "TrackInteraction error");
    res.status(500).json({ error: "Failed to track interaction" });
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
           AND v.url NOT ILIKE '%/stories/%'
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

    const { rows } = await db.query<FeedVideoRow>(FRIENDS_SQL, [networkIds]);
    const mapped = (rows || []).map((v: FeedVideoRow) =>
      formatVideoForClient(v, likedSet, followingSet, "Friends"),
    );
    return res.json({ videos: mapped });
  } catch (err: unknown) {
    logger.error({ err: errMessage(err) }, "Friends feed error");
    return res.status(500).json({ error: "FEED_ERROR" });
  }
}

/** GET /api/feed/following — DB only; followingIds only (not followers union). */
export async function handleFollowingFeed(req: Request, res: Response) {
  try {
    const token = getTokenFromRequest(req);
    const jwtUser = token ? verifyAuthToken(token) : null;
    res.setHeader("Cache-Control", "private, no-store");
    if (!jwtUser) {
      return res.json({ videos: [] });
    }

    const { getFollowingIdsAsync } = await import("./profiles");
    const followingIds = (await getFollowingIdsAsync(jwtUser.sub)).filter(
      (id) => id && id !== jwtUser.sub,
    );
    if (followingIds.length === 0) {
      return res.json({ videos: [] });
    }

    const followingSet = new Set(followingIds);
    const likedSet = new Set<string>();

    const db = getPool();
    if (!db) {
      return res.status(503).json({ error: "DATABASE_UNAVAILABLE" });
    }

    const { rows } = await db.query<FeedVideoRow>(FRIENDS_SQL, [followingIds]);
    const mapped = (rows || []).map((v: FeedVideoRow) =>
      formatVideoForClient(v, likedSet, followingSet, "Following"),
    );
    return res.json({ videos: mapped });
  } catch (err: unknown) {
    logger.error({ err: errMessage(err) }, "Following feed error");
    return res.status(500).json({ error: "FEED_ERROR" });
  }
}

/** Invalidate For You Valkey cache (epoch bump). userId ignored — global feed invalidation. */
export function invalidateFeedCache(_userId?: string): void {
  void bumpFeedForyouEpoch();
}
