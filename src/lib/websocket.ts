// WebSocket Real-Time Service — single connection per room; URL from api.getWsUrl()

import { getWsUrl } from "./api";
import { useAuthStore } from "../store/useAuthStore";

type WebSocketEvent =
  // Room events
  | "room_state"
  /** Server emits `viewer_count` (legacy alias kept for typed listeners). */
  | "viewer_count"
  | "user_joined"
  | "user_left"
  | "connected"
  // Chat events
  | "chat_message"
  | "chat_ack"
  | "chat_deleted"
  // Gift events
  | "gift_sent"
  | "gift_ack"
  | "gift_goal_sync"
  | "big_gift_queue_update"
  | "leaderboard_update"
  // Heart events
  | "heart_sent"
  // Battle events (server-controlled)
  | "battle_invite"
  | "battle_invite_ack"
  | "battle_invite_declined"
  | "battle_invite_accepted"
  | "battle_accept_ack"
  | "battle_ended"
  | "battle_created"
  | "battle_state_sync"
  | "battle_tick"
  | "battle_score"
  | "battle_error"
  | "battle_ready"
  // Co-host events
  | "cohost_invite"
  | "cohost_invite_ack"
  | "cohost_invite_accepted"
  | "cohost_request"
  | "cohost_request_accepted"
  | "cohost_request_declined"
  | "cohost_layout_sync"
  | "live_share"
  | "live_share_ack"
  // Moderation events (AI safety: warning → pause → suspend)
  | "user_muted"
  | "user_kicked"
  | "user_banned"
  | "moderation_warning"
  | "moderation_pause"
  | "moderation_suspend"
  | "room_full"
  | "stream_ended"
  | "stream_started"
  | "booster_activated"
  | "booster_caught"
  | "mist_activated"
  | "engagement_sync"
  | "engagement_milestone"
  | "engagement_stage_unlock"
  /** Client-local: transport failure (not a server stream end). */
  | "ws_error"
  | "ws_reconnect_exhausted"
  /** DM realtime (user-global; not live room chat_message). */
  | "dm_message"
  | "dm_thread_updated";

interface WebSocketMessage {
  event: WebSocketEvent | string;
  data: unknown;
  timestamp: string;
}

class WebSocketService {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 15;
  private reconnectDelay = 1000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Map<string, Set<(data: unknown) => void>>();
  private roomId: string | null = null;
  private token: string | null = null;
  private pendingMessages: string[] = [];
  private keepAliveTimer: ReturnType<typeof setInterval> | null = null;

  /** Host/creator rooms keep reconnecting so brief mobile blips do not end the live. */
  private persistentReconnect = false;
  /** Battle: which creator's gift/chat audience this socket belongs to. */
  private audienceCreatorId: string | null = null;
  /** Ownership tokens for singleton handoff safety (inline/watch/host/feed). */
  private ownerIds = new Set<string>();

  connect(
    roomId: string,
    token: string,
    options?: { persistent?: boolean; audienceCreatorId?: string; ownerId?: string },
  ) {
    if (options?.audienceCreatorId !== undefined) {
      const next = options.audienceCreatorId.trim();
      this.audienceCreatorId = next || null;
    }
    const nextOwner =
      options?.ownerId !== undefined ? options.ownerId.trim() : "";
    if (nextOwner) this.ownerIds.add(nextOwner);
    if (
      this.ws?.readyState === WebSocket.OPEN ||
      this.ws?.readyState === WebSocket.CONNECTING
    ) {
      if (this.roomId === roomId) {
        this.persistentReconnect = options?.persistent ?? this.persistentReconnect;
        if (options?.audienceCreatorId !== undefined) {
          const next = options.audienceCreatorId.trim();
          this.audienceCreatorId = next || null;
        }
        return;
      }
      this.disconnect();
    }

    this.roomId = roomId;
    this.token = token;
    this.persistentReconnect = options?.persistent ?? this.persistentReconnect;
    const wsUrl = getWsUrl();
    const audienceQs = this.audienceCreatorId
      ? `&audienceCreatorId=${encodeURIComponent(this.audienceCreatorId)}`
      : "";
    this.ws = new WebSocket(
      `${wsUrl}/live/${roomId}?token=${encodeURIComponent(token)}${audienceQs}`,
    );

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      while (this.pendingMessages.length > 0) {
        const msg = this.pendingMessages.shift() as string;
        try {
          this.ws?.send(msg);
        } catch {
          /* pending message flush */
        }
      }
      if (this.keepAliveTimer) clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          // JSON app-level ping (server also accepts legacy bare "ping" text).
          this.send("ping", {});
        }
      }, 25000);

      this.handleMessage({
        event: "connected",
        data: {},
        timestamp: new Date().toISOString(),
      });
    };

    this.ws.onmessage = (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);
        this.handleMessage(message);
      } catch {
        /* ignored — malformed WS frame */
      }
    };

    this.ws.onerror = () => {
      this.handleMessage({
        event: "ws_error",
        data: { roomId: this.roomId },
        timestamp: new Date().toISOString(),
      });
    };

    this.ws.onclose = (event) => {
      this.attemptReconnect(event.code);
    };
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    this.roomId = null;
    this.token = null;
    this.persistentReconnect = false;
    this.audienceCreatorId = null;
    this.ownerIds.clear();
    this.reconnectAttempts = 0;
    this.pendingMessages = [];
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /** True while a reconnect timer is pending or the socket is mid-handshake. */
  isReconnecting(): boolean {
    return (
      this.reconnectTimer !== null ||
      this.ws?.readyState === WebSocket.CONNECTING ||
      (this.roomId !== null &&
        this.ws?.readyState !== WebSocket.OPEN &&
        this.reconnectAttempts > 0)
    );
  }

  getCurrentRoomId(): string | null {
    return this.roomId;
  }

  /** Tear down only if this owner still controls the singleton connection. */
  disconnectIfOwner(ownerId: string) {
    const owner = ownerId.trim();
    if (!owner) return;
    if (!this.ownerIds.has(owner)) return;
    this.ownerIds.delete(owner);
    if (this.ownerIds.size === 0) {
      this.disconnect();
    }
  }

  send(event: string, data: unknown) {
    const msg = JSON.stringify({
      event,
      data,
      timestamp: new Date().toISOString(),
    });
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(msg);
    } else if (this.roomId && this.pendingMessages.length < 50) {
      this.pendingMessages.push(msg);
    }
  }

  on(event: WebSocketEvent | string, callback: (data: unknown) => void) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    (this.listeners.get(event) as Set<(data: unknown) => void>).add(callback);
  }

  off(event: WebSocketEvent | string, callback: (data: unknown) => void) {
    this.listeners.get(event)?.delete(callback);
  }

  private handleMessage(message: WebSocketMessage) {
    const listeners = this.listeners.get(message.event as string);
    if (listeners) {
      listeners.forEach((callback) => callback(message.data));
    }
  }

  reconnectOnForeground() {
    if (
      this.roomId &&
      this.token &&
      this.ws?.readyState !== WebSocket.OPEN &&
      this.ws?.readyState !== WebSocket.CONNECTING
    ) {
      this.reconnectAttempts = 0;
      this.connect(this.roomId, this.token);
    }
  }

  private attemptReconnect(code?: number) {
    // Don't reconnect on auth/policy failures — these won't succeed on retry
    if (code === 1008 || code === 1003 || code === 4001 || code === 4003) {
      return;
    }

    const maxAttempts = this.persistentReconnect ? 120 : this.maxReconnectAttempts;
    if (this.reconnectAttempts >= maxAttempts) {
      if (!this.persistentReconnect) {
        // Do not invent stream_ended — that is a server lifecycle event only.
        this.handleMessage({
          event: "ws_reconnect_exhausted",
          data: { reason: "max_reconnect_attempts", roomId: this.roomId },
          timestamp: new Date().toISOString(),
        });
      }
      return;
    }

    const base = this.persistentReconnect
      ? 400 + this.reconnectAttempts * 350
      : this.reconnectDelay * Math.pow(2, this.reconnectAttempts);
    const jitter = Math.floor(Math.random() * 400);
    const delay = Math.min(this.persistentReconnect ? 8_000 : 30_000, base + jitter);
    this.reconnectAttempts++;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.roomId) {
        const freshToken = useAuthStore.getState().session?.access_token || this.token;
        if (freshToken) {
          this.connect(this.roomId, freshToken);
        }
      }
    }, delay);
  }
}

export const websocket = new WebSocketService();
