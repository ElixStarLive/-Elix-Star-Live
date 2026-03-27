/**
 * LiveKit webhook: receives room/participant events from LiveKit Cloud.
 * URL: https://www.anberlive.co.uk/api/livekit/webhook
 * In LiveKit Cloud: create webhook with this URL and sign with the same API key used for tokens.
 */

import { Request, Response } from 'express';
import { WebhookReceiver } from 'livekit-server-sdk';
import { removeActiveStream } from './livestream';
import { broadcastToFeedSubscribers } from '../feedBroadcast';

const API_KEY = (process.env.LIVEKIT_API_KEY || '').trim();
const API_SECRET = (process.env.LIVEKIT_API_SECRET || '').trim();

const receiver =
  API_KEY && API_SECRET ? new WebhookReceiver(API_KEY, API_SECRET) : null;

/**
 * POST /api/livekit/webhook
 * Body: application/webhook+json (raw body required for signature verification).
 * Authorization: LiveKit-signed JWT (sha256 of body).
 */
export async function handleLiveKitWebhook(req: Request, res: Response) {
  if (!receiver) {
    console.warn('[livekit-webhook] LiveKit not configured, ignoring webhook');
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
          await removeActiveStream(event.room.name);
          broadcastToFeedSubscribers('stream_ended', { stream_key: event.room.name });
          if (process.env.NODE_ENV !== 'production') {
            console.log('[livekit-webhook] room_finished:', event.room.name);
          }
        }
        break;
      case 'room_started':
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
    console.error('[livekit-webhook]', message);
    return res.status(401).json({ error: message });
  }
}
