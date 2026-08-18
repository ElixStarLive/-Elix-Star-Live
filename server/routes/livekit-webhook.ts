/**
 * LiveKit webhook: receives room/participant events from LiveKit Cloud.
 * URL: https://www.elixstarlive.co.uk/api/livekit/webhook
 * In LiveKit Cloud: create webhook with this URL and sign with the same API key used for tokens.
 *
 * Delivery is best-effort: if this never arrives (webhook misconfigured, or a
 * redeploy inside the grace window below), the live list rebuild in
 * routes/livestream.ts reconciles the stale is_live row against LiveKit.
 */

import { Request, Response } from 'express';
import { WebhookReceiver } from 'livekit-server-sdk';
import {
  readLiveSessionId,
  removeActiveStream,
  resolveLivePublishAuthority,
  resolveStreamOwnerUserId,
} from './livestream';
import { broadcastStreamEnded } from '../feedBroadcast';
import {
  listActiveRoomsFromLiveKit,
  isUserPublishingInRoom,
  revokeParticipantPublish,
  userIdFromLiveKitIdentity,
} from '../services/livekit';
import { logger } from '../lib/logger';
import { getCreatorLiveRoleRoom } from '../websocket/liveCreatorRole';

const API_KEY = (process.env.LIVEKIT_API_KEY || '').trim();
const API_SECRET = (process.env.LIVEKIT_API_SECRET || '').trim();

const receiver =
  API_KEY && API_SECRET ? new WebhookReceiver(API_KEY, API_SECRET) : null;

/** Delay before trusting room_finished — covers DUPLICATE_IDENTITY / brief empties. */
const ROOM_FINISHED_GRACE_MS = 20_000;
const pendingRoomFinished = new Map<string, ReturnType<typeof setTimeout>>();

async function finalizeRoomFinished(
  roomName: string,
  sessionId: string,
): Promise<void> {
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
    const roleRoom = ownerId ? await getCreatorLiveRoleRoom(ownerId) : null;
    if (
      ownerId &&
      roleRoom &&
      roleRoom !== roomName &&
      (await isUserPublishingInRoom(roleRoom, ownerId))
    ) {
      logger.info(
        { roomName, ownerId, roleRoom },
        '[livekit-webhook] room_finished ignored — creator publishing in another live role',
      );
      return;
    }
    // The room id is the creator's own id, so the live that ended and the live
    // they started thirty seconds later share it. Ending "the live in this room"
    // without saying which one would take the new one off the air.
    if (!(await removeActiveStream(roomName, undefined, sessionId))) return;
    broadcastStreamEnded(roomName, ownerId || '');
    logger.info({ roomName }, '[livekit-webhook] room_finished applied after grace');
  } catch (err) {
    logger.error({ err, roomName }, '[livekit-webhook] finalizeRoomFinished failed');
  }
}

/**
 * A participant arrived holding publish rights — check that the server still
 * agrees before they can use them.
 *
 * Publish permission is granted by the token, and a token keeps its grants until
 * it expires. Freeing a co-host seat revokes the permission on the connection
 * they hold at that moment, but it cannot invalidate the token itself, so a
 * released co-host who rejoins (network drop, reload with a cached token) would
 * otherwise arrive able to publish again. This join is where the current seat
 * state gets the last word.
 *
 * Only a proven refusal revokes: an unreachable registry answers "cannot say",
 * and a live host must never be silenced because a lookup failed.
 */
async function reverifyJoinedPublisher(
  roomName: string | undefined,
  participant: { identity?: string; permission?: { canPublish?: boolean } } | undefined,
): Promise<void> {
  const room = (roomName || '').trim();
  const identity = (participant?.identity || '').trim();
  // 1:1 call rooms are mutual-publish by design and have no live seat table.
  if (!room || !identity || room.startsWith('call_')) return;
  if (participant?.permission?.canPublish !== true) return;

  const userId = userIdFromLiveKitIdentity(identity);
  if (!userId) return;

  try {
    const authority = await resolveLivePublishAuthority(room, userId);
    if (authority !== 'unauthorized') return;
    const revocation = await revokeParticipantPublish(room, userId);
    logger.warn(
      { roomName: room, userId, revocation },
      '[livekit-webhook] participant joined with publish rights the server has not granted',
    );
  } catch (err) {
    logger.error(
      { err, roomName: room, userId },
      '[livekit-webhook] publish re-verification failed — permission left as issued',
    );
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
          // Remember which live this is about, so the delayed cleanup cannot end
          // a different one that has taken the room over in the meantime.
          const sessionId = await readLiveSessionId(roomName);
          pendingRoomFinished.set(
            roomName,
            setTimeout(() => {
              pendingRoomFinished.delete(roomName);
              void finalizeRoomFinished(roomName, sessionId);
            }, ROOM_FINISHED_GRACE_MS),
          );
          logger.debug({ roomName, sessionId }, '[livekit-webhook] room_finished scheduled');
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
        logger.debug({ roomName: event.room?.name }, '[livekit-webhook] room_started');
        break;
      case 'participant_joined':
        await reverifyJoinedPublisher(event.room?.name, event.participant);
        break;
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
