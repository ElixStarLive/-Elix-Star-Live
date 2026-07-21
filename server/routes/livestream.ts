/**
 * Live streaming API: list streams, start/end stream, get LiveKit token.
 * Active stream state stored in Valkey + DB — no in-memory Map.
 */

import { createHash } from 'crypto';
import { Request, Response } from 'express';
import { getTokenFromRequest, verifyAuthToken } from '../routes/auth';
import { createLiveToken, isLiveKitConfigured, getLiveKitUrl, listActiveRoomsFromLiveKit, isUserPublishingInRoom } from '../services/livekit';
import { broadcastToFeedSubscribers } from '../feedBroadcast';
import { dbInsertLiveStream, dbEndLiveStream, dbGetLiveStreams, dbGetStreamOwnerUserId } from '../lib/postgres';
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
import { hasBattlePublishGrant, hasCohostPublishGrant, getCohostLayout } from '../websocket/index';
import { insertNotification } from '../lib/notifications';
import { getFollowerIdsAsync } from './profiles';

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

/** Check if a user is the host of a given stream room. Reads Valkey, then DB. */
export async function isStreamHost(roomId: string, userId: string): Promise<boolean> {
  if (isValkeyConfigured()) {
    const storedUserId = await valkeyHget(STREAM_KEY_PREFIX + roomId, 'userId');
    if (storedUserId) return storedUserId === userId;
  }
  // Valkey unavailable (or has no record) — fall back to DB ownership so the
  // real host is still authorized (e.g. to end their own stream). Without this
  // the host could never end a stream when Valkey is down.
  try {
    const owner = await dbGetStreamOwnerUserId(roomId);
    return !!owner && owner === userId;
  } catch (err) {
    logger.warn({ err, roomId }, "isStreamHost DB fallback failed");
    return false;
  }
}

/** Map stream room id to auth userId for WebSocket delivery (cohost invites). */
export async function resolveStreamOwnerUserId(roomOrUserId: string): Promise<string> {
  const raw = roomOrUserId.trim();
  if (!raw) return raw;
  if (isValkeyConfigured()) {
    const ownerUserId = await valkeyHget(STREAM_KEY_PREFIX + raw, 'userId');
    if (ownerUserId && ownerUserId.trim()) return ownerUserId.trim();
  }
  try {
    const owner = await dbGetStreamOwnerUserId(raw);
    if (owner) return owner;
  } catch (err) {
    logger.warn({ err, roomOrUserId: raw }, "resolveStreamOwnerUserId DB lookup failed");
  }
  return raw;
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
      // Clear the room member set too. Without this the SCARD-based viewer count
      // lingers (up to ROOM_MEMBER_TTL) as a ghost count after the stream ends
      // and can inflate the count if the room id is reused.
      await valkeyDel(`room:members:${roomId}`);
    } else if (userId) {
      // No Valkey: enforce host ownership from the DB so a non-host cannot end another user's stream.
      const ownerUserId = await resolveStreamOwnerUserId(roomId);
      if (ownerUserId && ownerUserId !== roomId && ownerUserId !== userId) return false;
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
  const dbRows = await dbGetLiveStreams();
  const dbByStreamKey = new Map(dbRows.map((r) => [r.stream_key, r]));

  if (isLiveKitConfigured()) {
    try {
      const liveRooms = await listActiveRoomsFromLiveKit();
      const named = liveRooms.filter((r) => r.name);
      const batchKeys = named.map((r) => STREAM_KEY_PREFIX + (r.name as NonNullable<typeof r.name>));
      const hashList =
        batchKeys.length > 0 && isValkeyConfigured()
          ? await valkeyHgetallBatch(batchKeys)
          : [];

      const streams = named.flatMap((room, i) => {
        const data = hashList[i] || {};
        const dbRow = room.name ? dbByStreamKey.get(room.name) : undefined;
        const mem =
          data.userId != null && data.userId !== ""
            ? {
                userId: data.userId,
                startedAt: data.startedAt || new Date().toISOString(),
                displayName: data.displayName || undefined,
              }
            : null;
        // Ghost room guard: every real stream registers via /api/live/start
        // (Valkey + DB). A LiveKit room with neither record is a leftover
        // (stale subscription / ended stream) and must never be listed as a
        // live creator.
        if (!mem && !dbRow) return [];
        const userId = mem?.userId ?? dbRow?.user_id ?? (room.name as NonNullable<typeof room.name>);
        return [{
          room_id: room.name,
          stream_key: room.name,
          user_id: userId,
          started_at: mem?.startedAt ?? dbRow?.started_at ?? new Date().toISOString(),
          status: "live" as const,
          title: mem?.displayName ?? dbRow?.display_name ?? undefined,
          display_name: mem?.displayName ?? dbRow?.display_name ?? undefined,
          viewer_count: room.numParticipants,
        }];
      });
      // Publishing guard: only list rooms whose host is actually broadcasting
      // (publishing tracks) right now. A stale Valkey/DB "live" record for a
      // user who is really just a spectator can never pass this.
      const verified = await Promise.all(
        streams.map(async (s) =>
          (await isUserPublishingInRoom(s.stream_key as string, s.user_id)) ? s : null,
        ),
      );
      return { streams: verified.filter((s): s is NonNullable<typeof s> => s !== null) };
    } catch (err) {
      logger.warn({ err }, "LiveKit list streams failed, falling back to DB");
    }
  }

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
  // Live cards must be fresh for every spectator. Public/shared caching made
  // some devices see an empty list while others still had the stream.
  res.setHeader("Cache-Control", "private, no-store");
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

    const existing = await getActiveStream(roomName);
    if (existing && existing.userId !== auth.userId) {
      return res.status(409).json({ error: 'Room is already live by another host.' });
    }

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

    // Notify followers (capped) — best-effort, never blocks going live.
    try {
      const followers = await getFollowerIdsAsync(auth.userId);
      const hostLabel = safeDisplayName || 'A creator you follow';
      const targets = followers.slice(0, 200);
      await Promise.all(
        targets.map((followerId) =>
          insertNotification({
            userId: followerId,
            type: 'live_started',
            title: `${hostLabel} is live`,
            body: 'Tap to watch now',
            actionUrl: `/live/${encodeURIComponent(roomName)}`,
            data: { path: `/live/${roomName}`, room_id: roomName },
          }),
        ),
      );
    } catch (err) {
      logger.warn({ err, userId: auth.userId }, 'handleLiveStart: follower push skipped');
    }

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
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create token';
    logger.error({ err: message }, "live/start failed");
    return res.status(500).json({ error: 'Failed to start live stream.' });
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

  // Publishing must be server-authorized: only the host or a host-approved
  // co-host may receive a publish token. Never trust a client "publish" flag alone.
  if (publish) {
    const isHost = await isStreamHost(roomName, auth.userId);
    if (!isHost) {
      let authorized =
        (await hasBattlePublishGrant(roomName, auth.userId)) ||
        (await hasCohostPublishGrant(roomName, auth.userId));
      if (!authorized) {
        const ownerId = await resolveStreamOwnerUserId(roomName);
        const layout = await getCohostLayout(roomName);
        authorized =
          !!ownerId &&
          layout?.hostUserId === ownerId &&
          Array.isArray(layout?.coHosts) &&
          (layout as NonNullable<typeof layout>).coHosts.some(
            (h) =>
              h &&
              typeof h === 'object' &&
              (h as { userId?: string }).userId === auth.userId,
          );
      }
      if (!authorized) {
        return res.status(403).json({ error: 'Not authorized to publish in this room.' });
      }
    }
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

    // A blocked user must not obtain a subscribe token and watch the host's
    // media (block is otherwise only enforced on the WS/chat channel).
    const ownerId = await resolveStreamOwnerUserId(roomName);
    if (ownerId && ownerId !== auth.userId) {
      const { dbIsBlockedEitherWay } = await import('../lib/postgres');
      if (await dbIsBlockedEitherWay(auth.userId, ownerId)) {
        return res.status(403).json({ error: 'You cannot view this stream.' });
      }
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
    logger.error({ err: message }, "live/token failed");
    return res.status(500).json({ error: 'Failed to create live token.' });
  }
}
