/**
 * Broadcast to all For You feed subscribers so live creators appear in realtime.
 * When a stream starts (POST /api/live/start) or ends (host disconnect / POST /api/live/end),
 * we push to every client subscribed to the "feed" WebSocket channel.
 */

import { randomUUID } from "crypto";
import { WebSocket } from "ws";
import { valkeyPublish, valkeySubscribe, isValkeyConfigured } from "./lib/valkey";
import { logger } from "./lib/logger";

const INSTANCE_ID = randomUUID();
const FEED_CHANNEL = "feed:global";

const feedSubscribers = new Set<WebSocket>();

export function addFeedSubscriber(ws: WebSocket): void {
  feedSubscribers.add(ws);
}

export function removeFeedSubscriber(ws: WebSocket): void {
  feedSubscribers.delete(ws);
}

function sendToLocalSubscribers(message: string): void {
  for (const ws of feedSubscribers) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(message);
      } catch (err) {
        logger.error({ err }, 'feedBroadcast send error');
      }
    }
  }
}

export function broadcastToFeedSubscribers(event: string, data: Record<string, unknown>): void {
  const message = JSON.stringify({
    event,
    data,
    timestamp: new Date().toISOString(),
  });

  sendToLocalSubscribers(message);

  if (isValkeyConfigured()) {
    valkeyPublish(FEED_CHANNEL, { event, data, sourceInstance: INSTANCE_ID });
  }
}

/**
 * Announce that a live has ended, naming the creator.
 *
 * Every live indicator in the app — profile rings, live circles, share rows,
 * Watch Live — is keyed by creator user id, but the room name is only the
 * creator's id by default: `POST /api/live/start` accepts a `room`, so a stream
 * key cannot be read as an identity. Without the id in this payload an open
 * screen has no way to tell WHICH creator stopped, which is why those surfaces
 * could only take a snapshot and then go stale until they were reopened.
 *
 * One function so the six places a live can end cannot drift into six payloads.
 */
export function broadcastStreamEnded(
  streamKey: string,
  hostUserId: string,
): void {
  broadcastToFeedSubscribers("stream_ended", {
    stream_key: streamKey,
    ...(hostUserId ? { host_user_id: hostUserId } : {}),
  });
}

/** Subscribe to Valkey feed channel so events from other instances reach local clients. */
export function initFeedPubSub(): void {
  if (!isValkeyConfigured()) return;

  valkeySubscribe(FEED_CHANNEL, (payload) => {
    const p = payload as Record<string, unknown>;
    if (!p || p.sourceInstance === INSTANCE_ID) return;

    const message = JSON.stringify({
      event: p.event,
      data: p.data,
      timestamp: new Date().toISOString(),
    });
    sendToLocalSubscribers(message);
  });
}
