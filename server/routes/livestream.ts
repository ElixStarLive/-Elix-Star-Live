/**
 * Live streaming API: list streams, start/end stream, get LiveKit token.
 * Active stream state stored in Valkey + DB — no in-memory Map.
 */

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
  valkeyExpire,
} from '../lib/valkey';

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
  if (isValkeyConfigured()) {
    if (userId) {
      const storedUserId = await valkeyHget(STREAM_KEY_PREFIX + roomId, 'userId');
      if (storedUserId && storedUserId !== userId) return false;
    }
    await deleteActiveStream(roomId);
  }
  dbEndLiveStream(roomId).catch(() => {});
  return true;
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

/** GET /api/live/streams — list active streams */
export async function handleGetStreams(_req: Request, res: Response) {
  if (isLiveKitConfigured()) {
    try {
      const liveRooms = await listActiveRoomsFromLiveKit();

      const streams = await Promise.all(
        liveRooms
          .filter((r) => r.name)
          .map(async (room) => {
            const mem = await getActiveStream(room.name);
            return {
              room_id: room.name,
              stream_key: room.name,
              user_id: mem?.userId ?? room.name,
              started_at: mem?.startedAt ?? new Date().toISOString(),
              status: 'live' as const,
              title: mem?.displayName ?? undefined,
              display_name: mem?.displayName ?? undefined,
              viewer_count: room.numParticipants,
            };
          }),
      );

      return res.status(200).json({ streams });
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
    status: 'live' as const,
    title: row.display_name || undefined,
    display_name: row.display_name || undefined,
    viewer_count: row.viewer_count ?? 0,
  }));

  return res.status(200).json({ streams });
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
    dbInsertLiveStream(roomName, auth.userId, safeDisplayName).catch(() => {});

    broadcastToFeedSubscribers('stream_started', {
      room_id: roomName,
      stream_key: roomName,
      user_id: auth.userId,
      title: safeDisplayName,
      display_name: safeDisplayName,
      started_at: startedAt,
      status: 'live',
    });

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
      } catch {
        // Ignore LiveKit list errors
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
