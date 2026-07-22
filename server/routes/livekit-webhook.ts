/**
 * LiveKit webhook: receives room/participant events from LiveKit Cloud.
 * URL: https://www.anberlive.co.uk/api/livekit/webhook
 * In LiveKit Cloud: create webhook with this URL and sign with the same API key used for tokens.
 */

import { Request, Response } from 'express';
import { WebhookReceiver } from 'livekit-server-sdk';
import { removeActiveStream, resolveStreamOwnerUserId } from './livestream';
import { broadcastToFeedSubscribers } from '../feedBroadcast';
import { listActiveRoomsFromLiveKit, isUserPublishingInRoom } from '../services/livekit';
import { logger } from '../lib/logger';

const API_KEY = (process.env.LIVEKIT_API_KEY || '').trim();
const API_SECRET = (process.env.LIVEKIT_API_SECRET || '').trim();

const receiver =
  API_KEY && API_SECRET ? new WebhookReceiver(API_KEY, API_SECRET) : null;

/** Delay before trusting room_finished — covers DUPLICATE_IDENTITY / brief empties. */
const ROOM_FINISHED_GRACE_MS = 20_000;
const pendingRoomFinished = new Map<string, ReturnType<typeof setTimeout>>();

async function finalizeRoomFinished(roomName: string): Promise<void> {
  try {
    const rooms = await listActiveRoomsFromLiveKit();
    if (rooms.some((r) => r.name === roomName)) {
      logger.info({ roomName }, '[livekit-webhook] room_finished ignored — room active again');
      return;
    }
    const ownerId = await resolveStreamOwnerUserId(roomName);
    if (ownerId && (await isUserPublishingInRoom(roomName, ownerId))) {
      logger.info({ roomName, ownerId }, '[livekit-webhook] room_finished ignored — host still publishing');
      return;
    }
    await removeActiveStream(roomName);
    broadcastToFeedSubscribers('stream_ended', { stream_key: roomName });
    logger.info({ roomName }, '[livekit-webhook] room_finished applied after grace');
  } catch (err) {
    logger.error({ err, roomName }, '[livekit-webhook] finalizeRoomFinished failed');
  }
}

/**
 * POST /api/livekit/webhook
 * Body: application/webhook+json (raw body required for signature verification).
 * Authorization: LiveKit-signed JWT (sha256 of body).
 */
export async function handleLiveKitWebhook(req: Request, res: Response) {
  if (!receiver) {
    logger.warn('[livekit-webhook] LiveKit not configured, ignoring webhook');
    return res.status(200).end();
  }

  const rawBody = req.body;
  if (rawBody === undefined || rawBody === null) {
    return res.status(400).json({ error: 'Missing body' });
  }
  const bodyStr = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody);
  const authHeader = req.get('Authorization');

  try {
    const event = await receiver.receive(bodyStr, authHeader ?? undefined);

    switch (event.event) {
      case 'room_finished':
        if (event.room?.name) {
          const roomName = event.room.name;
          // Do not wipe the live immediately: same-account join can kick the
          // host publisher and emit room_finished while the host app recovers.
          const existing = pendingRoomFinished.get(roomName);
          if (existing) clearTimeout(existing);
          pendingRoomFinished.set(
            roomName,
            setTimeout(() => {
              pendingRoomFinished.delete(roomName);
              void finalizeRoomFinished(roomName);
            }, ROOM_FINISHED_GRACE_MS),
          );
          if (process.env.NODE_ENV !== 'production') {
            console.log('[livekit-webhook] room_finished scheduled:', roomName);
          }
        }
        break;
      case 'room_started':
        if (event.room?.name) {
          const t = pendingRoomFinished.get(event.room.name);
          if (t) {
            clearTimeout(t);
            pendingRoomFinished.delete(event.room.name);
          }
        }
        if (process.env.NODE_ENV !== 'production') {
          console.log('[livekit-webhook] room_started:', event.room?.name);
        }
        break;
      case 'participant_joined':
      case 'participant_left':
      case 'track_published':
      case 'track_unpublished':
        // Optional: log or persist for analytics
        break;
      default:
        break;
    }

    return res.status(200).end();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Webhook validation failed';
    logger.error({ err: message }, '[livekit-webhook] Validation failed');
    return res.status(401).json({ error: 'Webhook validation failed.' });
  }
}
