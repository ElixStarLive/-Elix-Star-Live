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
  // Gift events
  | "gift_sent"
  | "gift_ack"
  | "gift_goal_sync"
  // Heart events
  | "heart_sent"
  // Battle events (server-controlled)
  | "battle_invite"
  | "battle_invite_ack"
  | "battle_invite_declined"
  | "battle_invite_accepted"
  | "battle_accept_ack"
  | "battle_ended"
  | "battle_state_sync"
  | "battle_tick"
  | "battle_score"
  | "battle_error"
  // Co-host events
  | "cohost_invite"
  | "cohost_invite_ack"
  | "cohost_invite_accepted"
  | "cohost_request"
  | "cohost_request_accepted"
  | "cohost_request_declined"
  | "cohost_layout_sync"
  | "cohost_seat_released"
  | "live_share"
  // Moderation events (AI safety)
  | "moderation_warning"
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
  /**
   * Ownership claims for singleton handoff safety (inline/watch/host/feed),
   * mapped owner → the room that owner claimed. A plain Set of owner ids cannot
   * survive a room switch: the switch tears the old transport down, and clearing
   * every claim there also erased the owner that had just arrived, so that
   * owner's own cleanup became a no-op and the room stayed connected — and kept
   * reconnecting — after the user had left it.
   */
  private owners = new Map<string, string>();

  connect(
    roomId: string,
    token: string,
    options?: { persistent?: boolean; audienceCreatorId?: string; ownerId?: string },
  ) {
    const providedAudience =
      options?.audienceCreatorId !== undefined
        ? options.audienceCreatorId.trim() || null
        : undefined;
    if (providedAudience !== undefined) this.audienceCreatorId = providedAudience;
    const nextOwner =
      options?.ownerId !== undefined ? options.ownerId.trim() : "";
    if (nextOwner) this.owners.set(nextOwner, roomId);

    const transportLive =
      this.ws?.readyState === WebSocket.OPEN ||
      this.ws?.readyState === WebSocket.CONNECTING;
    if (this.roomId === roomId) {
      if (transportLive) {
        this.persistentReconnect = options?.persistent ?? this.persistentReconnect;
        return;
      }
      // Same room, dead transport: this is a reconnect, so the room's pending
      // messages and owner claims are still valid and must be kept.
    } else if (this.roomId !== null) {
      // Leaving a room. This has to happen whether or not the old socket was
      // still live: one that is closed and mid-backoff still holds that room's
      // pending messages, reconnect timer and owner claims, and none of those
      // belong to the room being joined. Only the claim this caller just made
      // survives.
      this.teardownTransport();
      this.releaseOwnersOtherThan(roomId);
      // The old room's audience must not leak into the new one, but an audience
      // this caller passed for the new room must survive the switch.
      this.audienceCreatorId = providedAudience ?? null;
      this.persistentReconnect = false;
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
      let message: WebSocketMessage;
      try {
        message = JSON.parse(event.data);
      } catch {
        // Protocol-level discard: an unparseable frame carries no event to
        // dispatch. Dispatch is deliberately outside this catch so a throwing
        // consumer is not misreported as a malformed frame.
        return;
      }
      this.handleMessage(message);
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

  /**
   * Close the transport and stop its timers. Deliberately leaves ownership
   * claims alone so a room switch can reuse it without erasing the incoming
   * owner; `disconnect()` is the call that also gives up ownership.
   */
  private teardownTransport() {
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
    this.reconnectAttempts = 0;
    this.pendingMessages = [];
  }

  private releaseOwnersOtherThan(roomId: string) {
    for (const [owner, claimed] of this.owners) {
      if (claimed !== roomId) this.owners.delete(owner);
    }
  }

  private hasOwnerForCurrentRoom(): boolean {
    if (!this.roomId) return false;
    for (const claimed of this.owners.values()) {
      if (claimed === this.roomId) return true;
    }
    return false;
  }

  disconnect() {
    this.teardownTransport();
    this.roomId = null;
    this.token = null;
    this.persistentReconnect = false;
    this.audienceCreatorId = null;
    this.owners.clear();
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
    if (!this.owners.has(owner)) return;
    this.owners.delete(owner);
    if (!this.hasOwnerForCurrentRoom()) {
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
    if (!listeners) return;
    // Snapshot first: a consumer may bind or unbind during dispatch, and
    // iterating the live Set would visit listeners added mid-dispatch.
    for (const callback of Array.from(listeners)) {
      try {
        callback(message.data);
      } catch (err) {
        // One failing consumer must not stop the rest of the room from seeing
        // this event, and must not disappear either — rethrow out of band so
        // global error reporting still receives it.
        setTimeout(() => {
          throw err;
        }, 0);
      }
    }
  }

  reconnectOnForeground() {
    if (!this.roomId) return;
    if (
      this.ws?.readyState === WebSocket.OPEN ||
      this.ws?.readyState === WebSocket.CONNECTING
    ) {
      return;
    }
    // Same token policy as the backoff reconnect: the session may have rotated
    // while the app was backgrounded, and the token this socket first connected
    // with can already be expired.
    const token = useAuthStore.getState().session?.access_token || this.token;
    if (!token) return;
    // A pending backoff attempt would otherwise fire a second connect after this
    // one; foregrounding is the more current signal.
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = 0;
    this.connect(this.roomId, token);
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
