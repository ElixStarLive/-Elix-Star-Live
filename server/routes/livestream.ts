/**
 * Live streaming API: list streams, start/end stream, get LiveKit token.
 * Active stream state stored in Valkey + DB — no in-memory Map.
 */

import { createHash } from 'crypto';
import { Request, Response } from 'express';
import { getTokenFromRequest, verifyAuthToken } from '../routes/auth';
import {
  createLiveToken,
  isLiveKitConfigured,
  getLiveKitUrl,
  listActiveRoomsFromLiveKit,
  isUserPublishingInRoom,
  roomHasActivePublisher,
  getRoomOccupancy,
} from '../services/livekit';
import { broadcastToFeedSubscribers, broadcastStreamEnded } from '../feedBroadcast';
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
import {
  hasBattlePublishGrant,
  hasCohostPublishGrant,
  getCohostLayout,
  deleteCohostLayout,
} from '../websocket/index';
import { clearBattleRuntimeForRoom } from '../websocket/battle';
import { getCreatorLiveRoleRoom } from '../websocket/liveCreatorRole';
import { insertNotification, deleteLiveStartedNotificationsForRoom } from '../lib/notifications';
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

/**
 * Which run of this room is live right now.
 *
 * A room id is the creator's own id, so every live they ever start reuses it.
 * `startedAt` is what tells two of those runs apart, and a deferred cleanup that
 * remembers the run it was scheduled for can tell whether it is about to end the
 * live it saw or the one that replaced it. Empty means no live is registered.
 */
export async function readLiveSessionId(roomId: string): Promise<string> {
  if (!roomId || !isValkeyConfigured()) return '';
  const startedAt = await valkeyHget(STREAM_KEY_PREFIX + roomId, 'startedAt');
  return startedAt?.trim() || '';
}

/**
 * Remove active stream from Valkey + DB. Returns true if removed.
 *
 * `expectSessionId` is for callers that decided to end a live earlier and are
 * only now acting on it: pass the session that was live when the decision was
 * made, and a live that has since been restarted is left alone.
 */
export async function removeActiveStream(
  roomId: string,
  userId?: string,
  expectSessionId?: string,
): Promise<boolean> {
  try {
    if (expectSessionId) {
      const current = await readLiveSessionId(roomId);
      if (current && current !== expectSessionId) {
        logger.info(
          { roomId, expectSessionId, current },
          'removeActiveStream skipped — this live was already replaced by a newer one',
        );
        return false;
      }
    }
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
      // The stage dies with the stream. Room ids are the creator's own id, so
      // they are reused by their next live: seats, pending invites, the request
      // queue and publish grants left behind here would be inherited by that
      // live — a stale invite could be accepted into it, and an old grant would
      // still read as publish authority. Every end path funnels through here
      // (creator ends, WS stream_end, host disconnect grace, LiveKit
      // room_finished), so this is where that state is cleaned once.
      //
      // Ending the stream itself must not depend on it: if the stage cannot be
      // cleared, the DB row still has to stop saying this creator is live, or the
      // live would keep showing in For You with nobody in it.
      try {
        await deleteCohostLayout(roomId);
      } catch (err) {
        logger.error({ err, roomId }, "removeActiveStream: co-host stage not cleared");
      }
      // The battle stage dies with the stream for the same reason, and it is a
      // separate store: the session, its scores, outstanding battle invites and
      // the accept/publish grants that authorize broadcasting in this room.
      try {
        await clearBattleRuntimeForRoom(roomId);
      } catch (err) {
        logger.error({ err, roomId }, "removeActiveStream: battle stage not cleared");
      }
    } else if (userId) {
      // No Valkey: enforce host ownership from the DB so a non-host cannot end another user's stream.
      const ownerUserId = await resolveStreamOwnerUserId(roomId);
      if (ownerUserId && ownerUserId !== roomId && ownerUserId !== userId) return false;
    }
    await dbEndLiveStream(roomId);
    await invalidateLiveStreamsListCache();
    // Best-effort: drop "is live" inbox rows whenever the stream is removed.
    try {
      await deleteLiveStartedNotificationsForRoom(roomId);
    } catch (err) {
      logger.warn({ err, roomId }, "removeActiveStream: live notification cleanup skipped");
    }
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

/**
 * /api/live/start writes the Neon row + Valkey session before the creator has
 * finished connecting to LiveKit, so a just-started stream legitimately has no
 * room yet. Rows younger than this are never treated as stale.
 */
const LIVE_START_CONNECT_WINDOW_MS = 60_000;

type LiveStreamRow = Awaited<ReturnType<typeof dbGetLiveStreams>>[number];

/**
 * End Neon rows still flagged is_live whose LiveKit room is provably gone.
 *
 * The normal end paths (creator End Live, host WS disconnect grace, LiveKit
 * room_finished webhook) all depend on a single delivery: a redeploy inside the
 * grace window, or a webhook that never arrives, leaves is_live = TRUE forever
 * and the creator keeps being reported as live. This reconciles the flag
 * against LiveKit every time the authoritative list is rebuilt, so the row
 * cannot outlive the broadcast.
 */
async function endStaleLiveRows(
  dbRows: LiveStreamRow[],
  roomsByName: Map<string, unknown>,
  listedStreamKeys: Set<string>,
): Promise<void> {
  const now = Date.now();
  // The creator id travels with the key: the row is gone by the time the end is
  // announced, and every live indicator is keyed by creator, not by room.
  const stale: Array<{ key: string; userId: string }> = [];

  for (const row of dbRows) {
    const key = row.stream_key;
    if (!key || listedStreamKeys.has(key) || roomsByName.has(key)) continue;
    const startedAt = Date.parse(row.started_at);
    if (Number.isFinite(startedAt) && now - startedAt < LIVE_START_CONNECT_WINDOW_MS) continue;
    const roleRoom = await getCreatorLiveRoleRoom(row.user_id);
    if (
      roleRoom &&
      roleRoom !== key &&
      (roomsByName.has(roleRoom) ||
        (await isUserPublishingInRoom(roleRoom, row.user_id)))
    ) {
      continue;
    }
    if ((await getRoomOccupancy(key)) !== 'empty') continue;
    stale.push({ key, userId: row.user_id });
  }

  for (const { key, userId } of stale) {
    if (!(await removeActiveStream(key))) continue;
    broadcastStreamEnded(key, userId);
    logger.info({ streamKey: key }, 'live state reconciled: LiveKit room gone, stream marked ended');
  }
}

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
      const roomsByName = new Map(
        named.map((r) => [r.name as NonNullable<typeof r.name>, r]),
      );
      const batchKeys = named.map((r) => STREAM_KEY_PREFIX + (r.name as NonNullable<typeof r.name>));
      const hashList =
        batchKeys.length > 0 && isValkeyConfigured()
          ? await valkeyHgetallBatch(batchKeys)
          : [];

      const fromLiveKit = named.flatMap((room, i) => {
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
        const spectatorCount =
          typeof dbRow?.viewer_count === "number" && Number.isFinite(dbRow.viewer_count)
            ? Math.max(0, Math.floor(dbRow.viewer_count))
            : Math.max(0, (room.numParticipants ?? 1) - 1);
        return [{
          room_id: room.name,
          stream_key: room.name,
          user_id: userId,
          started_at: mem?.startedAt ?? dbRow?.started_at ?? new Date().toISOString(),
          status: "live" as const,
          title: mem?.displayName ?? dbRow?.display_name ?? undefined,
          display_name: mem?.displayName ?? dbRow?.display_name ?? undefined,
          viewer_count: spectatorCount,
        }];
      });

      // Also surface DB-registered lives whose LiveKit room exists but was
      // missed in the Valkey batch path (same room key).
      const seenKeys = new Set(
        fromLiveKit.map((s) => s.stream_key).filter((k): k is string => typeof k === "string" && k.length > 0),
      );
      const fromDbExtras = dbRows.flatMap((row) => {
        if (!row.stream_key || seenKeys.has(row.stream_key)) return [];
        const room = roomsByName.get(row.stream_key);
        if (!room) return [];
        seenKeys.add(row.stream_key);
        const spectatorCount =
          typeof row.viewer_count === "number" && Number.isFinite(row.viewer_count)
            ? Math.max(0, Math.floor(row.viewer_count))
            : Math.max(0, (room.numParticipants ?? 1) - 1);
        return [{
          room_id: row.stream_key,
          stream_key: row.stream_key,
          user_id: row.user_id,
          started_at: row.started_at,
          status: "live" as const,
          title: row.display_name || undefined,
          display_name: row.display_name || undefined,
          viewer_count: spectatorCount,
        }];
      });

      const streams = [...fromLiveKit, ...fromDbExtras];

      // Discovery guard: list every registered room that is actually up.
      // Prefer "any publisher" (host/co-host/battle) over host-identity-only —
      // the old host-only check hid real creators from For You. Rooms with
      // participants stay listed even if track metadata races; empty leftovers
      // still require a publisher so ghost cards do not return.
      const verified = await Promise.all(
        streams.map(async (s) => {
          const key = s.stream_key as string;
          const n = roomsByName.get(key)?.numParticipants ?? s.viewer_count ?? 0;
          if (n > 0) return s;
          if (await roomHasActivePublisher(key)) return s;
          if (await isUserPublishingInRoom(key, s.user_id)) return s;
          return null;
        }),
      );
      const listed = verified.filter((s): s is NonNullable<typeof s> => s !== null);
      await endStaleLiveRows(
        dbRows,
        roomsByName,
        new Set(listed.map((s) => s.stream_key).filter((k): k is string => !!k)),
      );
      return { streams: listed };
    } catch (err) {
      // LiveKit is the authority for who is actually broadcasting. Listing the
      // raw is_live rows here reported creators as live with no media behind
      // them (a stale row stayed on For You for days). Fail loudly instead.
      logger.error({ err }, "LiveKit list streams failed — live state unavailable");
      throw new Error("LIVE_STATE_UNAVAILABLE");
    }
  }

  // LiveKit not configured at all: the DB registry is the only authority.
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

/** Same live-creator list as GET /api/live/streams / For You — used by battle Invite. */
export async function listActiveLiveStreams(): Promise<{
  streams: Array<{ stream_key: string; user_id: string; display_name?: string }>;
}> {
  const result = await buildStreamsResult();
  return {
    streams: result.streams
      .map((s) => {
        const userId = typeof s.user_id === "string" ? s.user_id.trim() : "";
        const streamKey = typeof s.stream_key === "string" && s.stream_key.trim()
          ? s.stream_key.trim()
          : userId;
        if (!userId || !streamKey) return null;
        const displayName =
          (typeof s.display_name === "string" && s.display_name.trim()) ||
          (typeof s.title === "string" && s.title.trim()) ||
          undefined;
        return { stream_key: streamKey, user_id: userId, display_name: displayName };
      })
      .filter((s): s is NonNullable<typeof s> => !!s),
  };
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

  try {
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
  } catch (err) {
    logger.error({ err }, "GET /api/live/streams failed");
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Postgres pool is not initialized")) {
      return res.status(503).json({ error: "DATABASE_UNAVAILABLE", streams: null });
    }
    if (msg.includes("LIVE_STATE_UNAVAILABLE")) {
      return res.status(503).json({ error: "LIVE_STATE_UNAVAILABLE", streams: null });
    }
    return res.status(500).json({ error: "Failed to load streams", streams: null });
  }
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
    /** Reconnect / repeat /start while already live — do not spam followers again. */
    const isReconnect = !!(existing && existing.userId === auth.userId);

    const startedAt = isReconnect
      ? existing.startedAt
      : new Date().toISOString();

    // Mint the publish token before anything is registered or announced. It is
    // local JWT signing with no side effects, so failing here must not leave a
    // registered stream, a stream_started broadcast or follower notifications
    // behind for a live that never starts.
    const token = await createLiveToken({
      userId: auth.userId,
      roomName,
      canPublish: true,
      name: auth.userId,
    });

    // A new live must never inherit the previous one's stage. Room ids are the
    // creator's own id, so this room was theirs before; if that live ended
    // without its cleanup running (crashed worker, missed webhook) its seats,
    // pending invites, request queue and publish grants would still be readable
    // here, and an old invite could be accepted into this live. A reconnect is
    // the same live continuing, so its stage is left exactly as it is.
    // Going live must not fail over this: while Valkey is unreachable no seat can
    // be claimed at all, so a stage that could not be purged cannot be joined
    // either — it is logged and the creator still gets on air.
    if (!isReconnect) {
      try {
        await deleteCohostLayout(roomName);
      } catch (err) {
        logger.error({ err, roomName }, "handleLiveStart: previous co-host stage not cleared");
      }
      try {
        await clearBattleRuntimeForRoom(roomName);
      } catch (err) {
        logger.error({ err, roomName }, "handleLiveStart: previous battle stage not cleared");
      }
    }

    await setActiveStream(roomName, auth.userId, startedAt, safeDisplayName);
    try {
      await dbInsertLiveStream(roomName, auth.userId, safeDisplayName, isReconnect);
    } catch (err) {
      logger.error({ err, roomName, userId: auth.userId }, "handleLiveStart: dbInsertLiveStream failed");
      // Roll back only a registration this call created. On a reconnect the
      // creator is already broadcasting, so tearing the session down over a
      // transient DB blip would end a healthy live; failing the request leaves
      // the existing registration exactly as it was.
      if (!isReconnect) {
        try {
          await removeActiveStream(roomName, auth.userId);
        } catch (cleanupErr) {
          logger.warn(
            { err: cleanupErr, roomName, userId: auth.userId },
            "handleLiveStart: removeActiveStream cleanup failed after DB insert error",
          );
        }
      }
      return res.status(500).json({ error: "Failed to start live stream." });
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

    // One "is live" notification per go-live (not on reconnect). Share stays separate / multi.
    if (!isReconnect) {
      try {
        // Clear any leftover duplicates from prior sessions for this room.
        await deleteLiveStartedNotificationsForRoom(roomName);

        const followers = await getFollowerIdsAsync(auth.userId);
        const hostLabel = safeDisplayName || 'A creator you follow';
        const targets = followers.slice(0, 200);
        let hostAvatar = '';
        try {
          const { getPool } = await import('../lib/postgres');
          const db = getPool();
          if (db) {
            const av = await db.query(
              `SELECT COALESCE(
                 NULLIF(p.avatar_url, ''),
                 NULLIF(u.avatar_url, '')
               ) AS avatar_url
               FROM elix_auth_users u
               LEFT JOIN profiles p ON p.user_id = u.id
               WHERE u.id = $1
               LIMIT 1`,
              [auth.userId],
            );
            hostAvatar = String(av.rows?.[0]?.avatar_url || '').trim();
          }
        } catch { /* avatar optional */ }
        const livePath = `/live/${encodeURIComponent(roomName)}`;
        const actionUrl = hostAvatar
          ? `${livePath}?avatar=${encodeURIComponent(hostAvatar)}`
          : livePath;
        await Promise.all(
          targets.map((followerId) =>
            insertNotification({
              userId: followerId,
              type: 'live_started',
              title: `${hostLabel} is live`,
              body: 'Tap to watch now',
              actionUrl,
              data: {
                path: livePath,
                room_id: roomName,
                actor_id: auth.userId,
                ...(hostAvatar ? { avatar_url: hostAvatar } : {}),
              },
            }),
          ),
        );
      } catch (err) {
        logger.warn({ err, userId: auth.userId }, 'handleLiveStart: follower push skipped');
      }
    }

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
  broadcastStreamEnded(roomName, auth.userId);
  return res.status(200).json({ ok: true, room: roomName });
}

type LiveViewerAvailability = {
  streamExists: boolean;
  liveKitLookupFailed: boolean;
  ownerUserId: string | null;
};

async function resolveLiveViewerAvailability(roomName: string): Promise<LiveViewerAvailability> {
  let streamExists = await isStreamActive(roomName);
  let liveKitLookupFailed = false;

  let ownerUserId: string | null = null;
  try {
    const dbRows = await dbGetLiveStreams();
    const dbRow = dbRows.find((row) => row.stream_key === roomName);
    if (dbRow) {
      streamExists = true;
      ownerUserId = dbRow.user_id || null;
    }
  } catch (err) {
    logger.warn({ err, roomName }, "resolveLiveViewerAvailability: dbGetLiveStreams failed");
    throw new Error("DATABASE_UNAVAILABLE");
  }

  if (!ownerUserId) {
    try {
      ownerUserId = await resolveStreamOwnerUserId(roomName);
    } catch {
      ownerUserId = null;
    }
  }

  if (!streamExists) {
    try {
      const rooms = await listActiveRoomsFromLiveKit();
      streamExists = rooms.some((r) => r.name === roomName);
    } catch (err) {
      liveKitLookupFailed = true;
      logger.warn({ err, roomName }, "resolveLiveViewerAvailability: listActiveRoomsFromLiveKit failed");
    }
  }

  if (!streamExists && isLiveKitConfigured()) {
    try {
      // LiveKit publisher presence is the final authority when caches/listing lag.
      streamExists = await roomHasActivePublisher(roomName);
    } catch (err) {
      liveKitLookupFailed = true;
      logger.warn({ err, roomName }, "resolveLiveViewerAvailability: roomHasActivePublisher probe failed");
    }
  }

  return {
    streamExists,
    liveKitLookupFailed,
    ownerUserId,
  };
}

/** GET /api/live/status?room=... — authoritative live status for spectators. */
export async function handleGetLiveStatus(req: Request, res: Response) {
  const auth = requireAuth(req, res);
  if (!auth) return;
  res.setHeader("Cache-Control", "private, no-store");

  const room = req.query.room as string | undefined;
  const raw = typeof room === "string" ? room.trim() : "";
  const roomName = raw.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 128) || null;
  if (!roomName) {
    return res.status(400).json({ error: 'Query parameter "room" is required and must be alphanumeric.' });
  }

  if (!isLiveKitConfigured()) {
    return res.status(503).json({ error: "Live streaming is not configured." });
  }

  try {
    const availability = await resolveLiveViewerAvailability(roomName);
    if (!availability.streamExists) {
      if (availability.liveKitLookupFailed) {
        return res.status(503).json({ room: roomName, active: false, error: "LIVE_LOOKUP_UNAVAILABLE" });
      }
      return res.status(200).json({ room: roomName, active: false });
    }

    const ownerId = availability.ownerUserId;
    if (ownerId && ownerId !== auth.userId) {
      const { dbIsBlockedEitherWay } = await import('../lib/postgres');
      if (await dbIsBlockedEitherWay(auth.userId, ownerId)) {
        return res.status(403).json({ error: 'You cannot view this stream.' });
      }
    }

    return res.status(200).json({
      room: roomName,
      active: true,
      host_user_id: ownerId || undefined,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err || "");
    if (msg.includes("DATABASE_UNAVAILABLE")) {
      return res.status(503).json({ error: "DATABASE_UNAVAILABLE" });
    }
    logger.error({ err, roomName }, "handleGetLiveStatus failed");
    return res.status(500).json({ error: "Failed to resolve live status." });
  }
}

/** GET /api/live/token?room=... — viewer gets token */
/**
 * The server's answer to "may this user publish in this live room?".
 *
 * One predicate, two callers: the publish token endpoint, and the
 * re-verification of a participant who turns up in LiveKit already holding
 * publish rights. A LiveKit token carries its grants for its whole lifetime, so
 * revoking a seat cannot invalidate a token already handed out — the join has to
 * be re-checked against this same authority instead.
 *
 * `unknown` is not `unauthorized`: when the room's owner cannot be established
 * (registry or DB unreachable) the answer is "cannot say", and a caller that
 * would take publishing away must leave it alone.
 */
export async function resolveLivePublishAuthority(
  roomName: string,
  userId: string,
): Promise<'authorized' | 'unauthorized' | 'unknown'> {
  const room = (roomName || '').trim();
  const user = (userId || '').trim();
  if (!room || !user) return 'unknown';

  if (await isStreamHost(room, user)) return 'authorized';
  if (await hasBattlePublishGrant(room, user)) return 'authorized';
  if (await hasCohostPublishGrant(room, user)) return 'authorized';

  // Grant set is the primary authority; the seat table is the fallback when a
  // grant key expired mid-live. Only a seat that was actually accepted counts —
  // an unaccepted "invited" row must not authorize publishing.
  const ownerId = await resolveStreamOwnerUserId(room);
  // resolveStreamOwnerUserId echoes the room back when it cannot resolve one.
  const ownerKnown = !!ownerId && ownerId !== room;
  const layout = await getCohostLayout(room);
  const seated =
    ownerKnown &&
    layout?.hostUserId === ownerId &&
    Array.isArray(layout?.coHosts) &&
    (layout as NonNullable<typeof layout>).coHosts.some((h) => {
      if (!h || typeof h !== 'object') return false;
      const seat = h as { userId?: string; status?: string };
      return seat.userId === user && (seat.status === 'live' || seat.status === 'accepted');
    });
  if (seated) return 'authorized';
  return ownerKnown ? 'unauthorized' : 'unknown';
}

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
  // 1:1 video calls use rooms named call_<uuid>. Both parties must publish
  // (camera/mic) and there is no live-stream host registry for these rooms.
  const isCallRoom = !!roomName && roomName.startsWith('call_');

  if (!roomName) {
    return res.status(400).json({ error: 'Query parameter "room" is required and must be alphanumeric.' });
  }

  // Publishing must be server-authorized: only the host or a host-approved
  // co-host may receive a publish token. Never trust a client "publish" flag alone.
  // Exception: call_* rooms are mutual publish for authenticated 1:1 calls.
  if (publish && !isCallRoom) {
    // Anything short of a proven authorization is a refusal here: a token is
    // handed out for hours, so "cannot say" must not mint publish rights.
    if ((await resolveLivePublishAuthority(roomName, auth.userId)) !== 'authorized') {
      return res.status(403).json({ error: 'Not authorized to publish in this room.' });
    }
  }

  if (!publish && !isCallRoom) {
    let availability: LiveViewerAvailability;
    try {
      availability = await resolveLiveViewerAvailability(roomName);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err || "");
      if (msg.includes("DATABASE_UNAVAILABLE")) {
        return res.status(503).json({ error: "DATABASE_UNAVAILABLE" });
      }
      logger.error({ err, roomName }, "handleGetLiveToken: resolveLiveViewerAvailability failed");
      return res.status(500).json({ error: "Failed to resolve live status." });
    }
    if (!availability.streamExists) {
      if (availability.liveKitLookupFailed) {
        return res.status(503).json({ error: "LIVE_LOOKUP_UNAVAILABLE" });
      }
      return res.status(404).json({ error: 'Stream not found or already ended.' });
    }

    // A blocked user must not obtain a subscribe token and watch the host's
    // media (block is otherwise only enforced on the WS/chat channel).
    const ownerId = availability.ownerUserId || await resolveStreamOwnerUserId(roomName);
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
      // Call rooms always publish; live rooms follow the authorized publish flag.
      canPublish: isCallRoom ? true : publish,
      name: auth.userId,
    });
    if (!token || token.length < 50) {
      return res.status(500).json({ error: 'Token generation failed.' });
    }
    const url = getLiveKitUrl();
    if (process.env.NODE_ENV !== 'production') {
      logger.debug({ room: roomName, urlSet: Boolean(url), isCallRoom }, "LiveKit token issued");
    }
    return res.status(200).json({ room: roomName, token, url });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create token';
    logger.error({ err: message }, "live/token failed");
    return res.status(500).json({ error: 'Failed to create live token.' });
  }
}
