/**
 * Broadcast to all For You feed subscribers so live creators appear in realtime.
 * When a stream starts (POST /api/live/start) or ends (host disconnect / POST /api/live/end),
 * we push to every client subscribed to the "feed" WebSocket channel.
 */

import { randomUUID } from "crypto";
import { WebSocket } from "ws";
import { valkeyPublish, valkeySubscribe, isValkeyConfigured } from "./lib/valkey";
import { logger } from "./lib/logger";
// #region agent log
function _dbgFB(loc:string,msg:string,data:Record<string,unknown>={}){fetch('http://127.0.0.1:7684/ingest/8c32b730-3e4a-4f4c-9502-6b305be695c7',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'6f8791'},body:JSON.stringify({sessionId:'6f8791',location:loc,message:msg,data,timestamp:Date.now()})}).catch(()=>{});}
// #endregion

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
        // #region agent log
        _dbgFB('feedBroadcast.ts:send','FEED_SEND_FAILURE_SILENT_IN_PROD',{error:err instanceof Error?err.message:String(err),nodeEnv:process.env.NODE_ENV,hypothesisId:'E'});
        // #endregion
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
