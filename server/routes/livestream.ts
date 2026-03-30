/**
 * Live streaming API: list streams, start/end stream, get LiveKit token.
 * Active stream state stored in Valkey + DB — no in-memory Map.
 */

import { createHash } from 'crypto';
import { Request, Response } from 'express';
import { getTokenFromRequest, verifyAuthToken } from '../routes/auth';
import { createLiveToken, isLiveKitConfigured, getLiveKitUrl, listActiveRoomsFromLiveKit } from '../services/livekit';
import { broadcastToFeedSubscribers } from '../feedBroadcast';
import { dbInsertLiveStream, dbEndLiveStream, dbGetLiveStreams } from '../lib/postgres';
import { logger } from '../lib/logger';
import {
  isValkeyConfigured,
  valkeyHset,
  valkeyHget,
  valkeyHdel,
  valkeyHgetall,
  valkeyHgetallBatch,
  valkeyExpire,
  valkeyGet,
  valkeySet,
  valkeyDel,
  acquireCacheBuildLock,
  waitForCachePopulate,
} from '../lib/valkey';
import { bumpCacheLayer } from '../lib/cacheLayerMetrics';

const STREAM_KEY_PREFIX = 'stream:';
const STREAM_TTL_SECONDS = 86400;

async function setActiveStream(
  roomId: string,
  userId: string,
  startedAt: string,
  displayName?: string,
): Promise<void> {
  if (!isValkeyConfigured()) return;
  const key = STREAM_KEY_PREFIX + roomId;
  await valkeyHset(key, 'userId', userId);
  await valkeyHset(key, 'startedAt', startedAt);
  await valkeyHset(key, 'displayName', displayName ?? '');
  await valkeyExpire(key, STREAM_TTL_SECONDS);
}

async function getActiveStream(
  roomId: string,
): Promise<{ userId: string; startedAt: string; displayName?: string } | null> {
  if (!isValkeyConfigured()) return null;
  const data = await valkeyHgetall(STREAM_KEY_PREFIX + roomId);
  if (!data || !data.userId) return null;
  return {
    userId: data.userId,
    startedAt: data.startedAt || new Date().toISOString(),
    displayName: data.displayName || undefined,
  };
}

async function deleteActiveStream(roomId: string): Promise<void> {
  if (!isValkeyConfigured()) return;
  await valkeyHdel(STREAM_KEY_PREFIX + roomId, 'userId', 'startedAt', 'displayName');
}

async function isStreamActive(roomId: string): Promise<boolean> {
  if (!isValkeyConfigured()) return false;
  const uid = await valkeyHget(STREAM_KEY_PREFIX + roomId, 'userId');
  return !!uid;
}

/** Check if a user is the host of a given stream room. Reads from Valkey. */
export async function isStreamHost(roomId: string, userId: string): Promise<boolean> {
  if (!isValkeyConfigured()) {
    return false;
  }
  const storedUserId = await valkeyHget(STREAM_KEY_PREFIX + roomId, 'userId');
  return !!storedUserId && storedUserId === userId;
}

/** Remove active stream from Valkey + DB. Returns true if removed. */
export async function removeActiveStream(roomId: string, userId?: string): Promise<boolean> {
  try {
    if (isValkeyConfigured()) {
      if (userId) {
        const storedUserId = await valkeyHget(STREAM_KEY_PREFIX + roomId, 'userId');
        if (storedUserId && storedUserId !== userId) return false;
      }
      await deleteActiveStream(roomId);
    }
    await dbEndLiveStream(roomId);
    await invalidateLiveStreamsListCache();
    return true;
  } catch (err) {
    logger.error({ err, roomId }, "removeActiveStream failed");
    return false;
  }
}

function requireAuth(req: Request, res: Response): { userId: string } | null {
  const token = getTokenFromRequest(req);
  if (!token) {
    res.status(401).json({ error: 'Not authenticated.' });
    return null;
  }
  const payload = verifyAuthToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Invalid or expired session.' });
    return null;
  }
  return { userId: payload.sub };
}

/** Shared across workers — one LiveKit/DB refresh per TTL cluster-wide. */
const STREAMS_HTTP_CACHE_KEY = "elix:http:live_streams:v1";
const STREAMS_CACHE_TTL_MS = Math.min(
  120_000,
  Math.max(3_000, Number(process.env.LIVE_STREAMS_CACHE_TTL_MS) || 14_000),
);

type StreamsListPayload = {
  streams: Array<{
    room_id: string | undefined;
    stream_key: string | undefined;
    user_id: string;
    started_at: string;
    status: "live";
    title: string | undefined;
    display_name: string | undefined;
    viewer_count: number;
  }>;
};

let streamsMemFallback: { etag: string; payload: StreamsListPayload; ts: number } | null = null;

export async function invalidateLiveStreamsListCache(): Promise<void> {
  streamsMemFallback = null;
  await valkeyDel(STREAMS_HTTP_CACHE_KEY);
}

async function buildStreamsResult(): Promise<StreamsListPayload> {
  if (isLiveKitConfigured()) {
    try {
      const liveRooms = await listActiveRoomsFromLiveKit();
      const named = liveRooms.filter((r) => r.name);
      const batchKeys = named.map((r) => STREAM_KEY_PREFIX + r.name!);
      const hashList =
        batchKeys.length > 0 && isValkeyConfigured()
          ? await valkeyHgetallBatch(batchKeys)
          : [];

      const streams = named.map((room, i) => {
        const data = hashList[i] || {};
        const mem =
          data.userId != null && data.userId !== ""
            ? {
                userId: data.userId,
                startedAt: data.startedAt || new Date().toISOString(),
                displayName: data.displayName || undefined,
              }
            : null;
        return {
          room_id: room.name,
          stream_key: room.name,
          user_id: mem?.userId ?? room.name!,
          started_at: mem?.startedAt ?? new Date().toISOString(),
          status: "live" as const,
          title: mem?.displayName ?? undefined,
          display_name: mem?.displayName ?? undefined,
          viewer_count: room.numParticipants,
        };
      });
      return { streams };
    } catch (err) {
      logger.warn({ err }, "LiveKit list streams failed, falling back to DB");
    }
  }

  const dbRows = await dbGetLiveStreams();
  const streams = dbRows.map((row) => ({
    room_id: row.stream_key,
    stream_key: row.stream_key,
    user_id: row.user_id,
    started_at: row.started_at,
    status: "live" as const,
    title: row.display_name || undefined,
    display_name: row.display_name || undefined,
    viewer_count: row.viewer_count ?? 0,
  }));
  return { streams };
}

function setStreamsCacheHeaders(res: Response): void {
  const sec = Math.max(3, Math.floor(STREAMS_CACHE_TTL_MS / 1000));
  res.setHeader(
    "Cache-Control",
    `public, s-maxage=${sec}, max-age=${Math.max(2, Math.floor(sec * 0.7))}, stale-while-revalidate=${Math.min(120, sec * 3)}`,
  );
}

/** GET /api/live/streams — list active streams */
export async function handleGetStreams(req: Request, res: Response) {
  const inm = typeof req.headers["if-none-match"] === "string" ? req.headers["if-none-match"] : undefined;
  const now = Date.now();

  if (isValkeyConfigured()) {
    const raw = await valkeyGet(STREAMS_HTTP_CACHE_KEY);
    if (raw) {
      try {
        const { etag, payload } = JSON.parse(raw) as { etag: string; payload: StreamsListPayload };
        setStreamsCacheHeaders(res);
        res.setHeader("ETag", etag);
        bumpCacheLayer("live_streams_valkey_hits");
        if (inm && inm === etag) return res.status(304).end();
        return res.status(200).json(payload);
      } catch {
        /* rebuild */
      }
    }
  } else if (streamsMemFallback && now - streamsMemFallback.ts < STREAMS_CACHE_TTL_MS) {
    const { etag, payload } = streamsMemFallback;
    setStreamsCacheHeaders(res);
    res.setHeader("ETag", etag);
    bumpCacheLayer("live_streams_valkey_hits");
    if (inm && inm === etag) return res.status(304).end();
    return res.status(200).json(payload);
  }

  const gotLock = await acquireCacheBuildLock(STREAMS_HTTP_CACHE_KEY);
  if (!gotLock && isValkeyConfigured()) {
    const waited = await waitForCachePopulate(STREAMS_HTTP_CACHE_KEY);
    if (waited) {
      try {
        const { etag: wEtag, payload } = JSON.parse(waited) as { etag: string; payload: StreamsListPayload };
        setStreamsCacheHeaders(res);
        res.setHeader("ETag", wEtag);
        bumpCacheLayer("live_streams_valkey_hits");
        if (inm && inm === wEtag) return res.status(304).end();
        return res.status(200).json(payload);
      } catch { /* fall through to build */ }
    }
  }

  const result = await buildStreamsResult();
  bumpCacheLayer("live_streams_builds");
  const bodyStr = JSON.stringify(result);
  const etag = `W/"${createHash("sha256").update(bodyStr).digest("hex").slice(0, 32)}"`;
  setStreamsCacheHeaders(res);
  res.setHeader("ETag", etag);

  if (isValkeyConfigured()) {
    valkeySet(STREAMS_HTTP_CACHE_KEY, JSON.stringify({ etag, payload: result }), STREAMS_CACHE_TTL_MS).catch(() => {});
  } else {
    streamsMemFallback = { etag, payload: result, ts: now };
  }

  if (inm && inm === etag) return res.status(304).end();
  return res.status(200).json(result);
}

/** POST /api/live/start — creator starts stream */
export async function handleLiveStart(req: Request, res: Response) {
  try {
    const auth = requireAuth(req, res);
    if (!auth) return;

    if (!isLiveKitConfigured()) {
      return res.status(503).json({ error: 'Live streaming is not configured.' });
    }

    const { room, displayName } = req.body ?? {};
    const raw = typeof room === "string" && room.trim() ? room.trim() : auth.userId;
    const roomName =
      raw.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 128) ||
      auth.userId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 128);

    const safeDisplayName =
      typeof displayName === 'string'
        ? displayName.toString().slice(0, 80)
        : undefined;

    const startedAt = new Date().toISOString();
    await setActiveStream(roomName, auth.userId, startedAt, safeDisplayName);
    try {
      await dbInsertLiveStream(roomName, auth.userId, safeDisplayName);
    } catch (err) {
      logger.error({ err, roomName, userId: auth.userId }, "handleLiveStart: dbInsertLiveStream failed");
    }

    broadcastToFeedSubscribers('stream_started', {
      room_id: roomName,
      stream_key: roomName,
      user_id: auth.userId,
      title: safeDisplayName,
      display_name: safeDisplayName,
      started_at: startedAt,
      status: 'live',
    });

    await invalidateLiveStreamsListCache();

    const token = await createLiveToken({
      userId: auth.userId,
      roomName,
      canPublish: true,
      name: auth.userId,
    });

    return res.status(200).json({
      room: roomName,
      token,
      stream_key: roomName,
      url: getLiveKitUrl(),
    });
  } catch (err: any) {
    const message = err instanceof Error ? err.message : 'Failed to create token';
    logger.error({ err: message }, "live/start failed");
    return res.status(500).json({ error: message });
  }
}

/** POST /api/live/end — creator ends stream */
export async function handleLiveEnd(req: Request, res: Response) {
  const auth = requireAuth(req, res);
  if (!auth) return;

  const { room } = req.body ?? {};
  const roomName = typeof room === 'string' && room.trim() ? room.trim() : auth.userId;

  const isHost = await isStreamHost(roomName, auth.userId);
  if (!isHost) {
    return res.status(404).json({ error: 'Stream not found or you are not the host.' });
  }

  await removeActiveStream(roomName, auth.userId);
  broadcastToFeedSubscribers('stream_ended', { stream_key: roomName });
  return res.status(200).json({ ok: true, room: roomName });
}

/** GET /api/live/token?room=... — viewer gets token */
export async function handleGetLiveToken(req: Request, res: Response) {
  const auth = requireAuth(req, res);
  if (!auth) return;
  res.setHeader("Cache-Control", "private, no-store");

  if (!isLiveKitConfigured()) {
    return res.status(503).json({ error: 'Live streaming is not configured.' });
  }

  const room = req.query.room as string | undefined;
  const raw = typeof room === 'string' ? room.trim() : '';
  const roomName = raw.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128) || null;
  const publish = req.query.publish === '1' || req.query.publish === 'true';

  if (!roomName) {
    return res.status(400).json({ error: 'Query parameter "room" is required and must be alphanumeric.' });
  }

  if (!publish) {
    let streamExists = await isStreamActive(roomName);
    if (!streamExists) {
      const dbRows = await dbGetLiveStreams();
      streamExists = dbRows.some((row) => row.stream_key === roomName);
    }
    if (!streamExists) {
      try {
        const rooms = await listActiveRoomsFromLiveKit();
        streamExists = rooms.some((r) => r.name === roomName);
      } catch (err) {
        logger.warn({ err, roomName }, "handleGetLiveToken: listActiveRoomsFromLiveKit failed");
      }
    }
    if (!streamExists) {
      return res.status(404).json({ error: 'Stream not found or already ended.' });
    }
  }

  try {
    const token = await createLiveToken({
      userId: auth.userId,
      roomName,
      canPublish: publish,
      name: auth.userId,
    });
    if (!token || token.length < 50) {
      return res.status(500).json({ error: 'Token generation failed.' });
    }
    const url = getLiveKitUrl();
    if (process.env.NODE_ENV !== 'production') {
      logger.debug({ room: roomName, urlSet: Boolean(url) }, "LiveKit token issued");
    }
    return res.status(200).json({ room: roomName, token, url });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create token';
    return res.status(500).json({ error: message });
  }
}
