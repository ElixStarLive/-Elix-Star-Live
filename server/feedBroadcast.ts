/**
 * Broadcast to all For You feed subscribers so live creators appear in realtime.
 * When a stream starts (POST /api/live/start) or ends (host disconnect / POST /api/live/end),
 * we push to every client subscribed to the "feed" WebSocket channel.
 */

import { randomUUID } from "crypto";
import { WebSocket } from "ws";
import { valkeyPublish, valkeySubscribe, isValkeyConfigured } from "./lib/valkey";

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
        if (process.env.NODE_ENV !== "production") {
          console.error("[feedBroadcast] send error:", err);
        }
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

/** Subscribe to Valkey feed channel so events from other instances reach local clients. */
export function initFeedPubSub(): void {
  if (!isValkeyConfigured()) return;

  valkeySubscribe(FEED_CHANNEL, (payload: any) => {
    if (!payload || payload.sourceInstance === INSTANCE_ID) return;

    const message = JSON.stringify({
      event: payload.event,
      data: payload.data,
      timestamp: new Date().toISOString(),
    });
    sendToLocalSubscribers(message);
  });
}
