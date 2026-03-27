/**
 * Live streaming API: list streams, start/end stream, get LiveKit token.
 * Flow: Creator POST /api/live/start -> get token (canPublish) -> join LiveKit room.
 *       Viewer GET /api/live/token?room=... -> get token (subscribe only) -> join room.
 */

import { Request, Response } from 'express';
import { getTokenFromRequest, verifyAuthToken } from '../routes/auth';
import { createLiveToken, isLiveKitConfigured, getLiveKitUrl, listActiveRoomsFromLiveKit } from '../services/livekit';
import { broadcastToFeedSubscribers } from '../feedBroadcast';
import { dbInsertLiveStream, dbEndLiveStream, dbGetLiveStreams } from '../lib/postgres';
import { logger } from '../lib/logger';

// In-memory active streams (key = roomName). Replace with DB when using Postgres.
// Extended payload so viewers can see the creator's display name.
const activeStreams = new Map<
  string,
  { userId: string; startedAt: string; displayName?: string }
>();

/** Internal helper so other modules (WebSocket server) can mark streams offline. Returns true if removed. */
export function removeActiveStream(roomId: string, userId?: string): boolean {
  const s = activeStreams.get(roomId);
  if (!s) return false;
  if (userId && s.userId !== userId) return false;
  activeStreams.delete(roomId);
  dbEndLiveStream(roomId).catch(() => {});
  return true;
}

/** Check if a user is the host of a given stream room. */
export function isStreamHost(roomId: string, userId: string): boolean {
  const s = activeStreams.get(roomId);
  return !!s && s.userId === userId;
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

/** GET /api/live/streams — list active streams (from LiveKit when configured, so all instances see the same list) */
export async function handleGetStreams(_req: Request, res: Response) {
  if (isLiveKitConfigured()) {
    try {
      const liveRooms = await listActiveRoomsFromLiveKit();
      const liveRoomNames = new Set(liveRooms.map((r) => r.name));

      const fromLiveKit = liveRooms
        .filter((r) => r.name)
        .map((room) => {
          const mem = activeStreams.get(room.name);
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
        });

      const fromMemory = Array.from(activeStreams.entries())
        .filter(([key]) => !liveRoomNames.has(key))
        .map(([room, data]) => ({
          room_id: room,
          stream_key: room,
          user_id: data.userId,
          started_at: data.startedAt,
          status: 'live' as const,
          title: data.displayName || undefined,
          display_name: data.displayName || undefined,
          viewer_count: 0,
        }));

      return res.status(200).json({ streams: [...fromLiveKit, ...fromMemory] });
    } catch (err) {
      logger.warn({ err }, "LiveKit list streams failed, falling back to in-memory");
      // fall through to in-memory
    }
  }

  // In-memory first, then fill from DB for any streams not in memory
  const memStreams = Array.from(activeStreams.entries()).map(([room, data]) => ({
    room_id: room,
    stream_key: room,
    user_id: data.userId,
    started_at: data.startedAt,
    status: 'live' as const,
    title: data.displayName || undefined,
    display_name: data.displayName || undefined,
  }));

  const memKeys = new Set(memStreams.map((s) => s.stream_key));
  const dbRows = await dbGetLiveStreams();
  for (const row of dbRows) {
    if (memKeys.has(row.stream_key)) continue;
    memStreams.push({
      room_id: row.stream_key,
      stream_key: row.stream_key,
      user_id: row.user_id,
      started_at: row.started_at,
      status: 'live',
      title: row.display_name || undefined,
      display_name: row.display_name || undefined,
      viewer_count: row.viewer_count ?? 0,
    });
  }

  return res.status(200).json({ streams: memStreams });
}

/** POST /api/live/start — creator starts stream; returns LiveKit token with canPublish */
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
    activeStreams.set(roomName, {
      userId: auth.userId,
      startedAt,
      displayName: safeDisplayName,
    });
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
  const stream = activeStreams.get(roomName);

  if (!stream || stream.userId !== auth.userId) {
    return res.status(404).json({ error: 'Stream not found or you are not the host.' });
  }

  activeStreams.delete(roomName);
  dbEndLiveStream(roomName).catch(() => {});
  broadcastToFeedSubscribers('stream_ended', { stream_key: roomName });
  return res.status(200).json({ ok: true, room: roomName });
}

/** GET /api/live/token?room=... — viewer gets token to join room (subscribe only) */
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
    let streamExists = activeStreams.has(roomName);
    if (!streamExists) {
      // After server restarts, memory can be empty while stream is still live in DB/LiveKit.
      const dbRows = await dbGetLiveStreams();
      streamExists = dbRows.some((row) => row.stream_key === roomName);
    }
    if (!streamExists) {
      try {
        const rooms = await listActiveRoomsFromLiveKit();
        streamExists = rooms.some((r) => r.name === roomName);
      } catch {
        // Ignore LiveKit list errors and keep current streamExists result.
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
