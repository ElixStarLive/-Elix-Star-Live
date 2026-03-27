// WebSocket Real-Time Service — single connection per room; URL from api.getWsUrl()

import { getWsUrl } from "./api";

export type WebSocketEvent =
  // Room events
  | "room_state"
  | "viewer_count_update"
  | "user_joined"
  | "user_left"
  | "connected"
  // Chat events
  | "chat_message"
  | "chat_deleted"
  // Gift events
  | "gift_sent"
  | "big_gift_queue_update"
  | "leaderboard_update"
  // Heart events
  | "heart_sent"
  // Battle events (server-controlled)
  | "battle_invite"
  | "battle_invite_accepted"
  | "battle_ended"
  | "battle_created"
  | "battle_state_sync"
  | "battle_countdown"
  | "battle_score"
  | "battle_error"
  | "battle_ready"
  | "battle_ready_state"
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
  // Battle (server-authoritative; colon names match server events)
  | "battle:score_update"
  | "likes:update"
  | "booster:spawn"
  | "booster:activated";

export interface WebSocketMessage {
  event: WebSocketEvent | string;
  data: any;
  timestamp: string;
}

class WebSocketService {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 15;
  private reconnectDelay = 1000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Map<string, Set<(data: any) => void>>();
  private roomId: string | null = null;
  private token: string | null = null;
  private pendingMessages: string[] = [];
  private keepAliveTimer: ReturnType<typeof setInterval> | null = null;

  connect(roomId: string, token: string) {
    if (
      this.ws?.readyState === WebSocket.OPEN ||
      this.ws?.readyState === WebSocket.CONNECTING
    ) {
      if (this.roomId === roomId) return;
      this.disconnect();
    }

    this.roomId = roomId;
    this.token = token;
    const wsUrl = getWsUrl();
    this.ws = new WebSocket(
      `${wsUrl}/live/${roomId}?token=${encodeURIComponent(token)}`,
    );

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      while (this.pendingMessages.length > 0) {
        const msg = this.pendingMessages.shift()!;
        try {
          this.ws?.send(msg);
        } catch {
          /* pending message flush */
        }
      }
      if (this.keepAliveTimer) clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send("ping");
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

    this.ws.onerror = () => {};

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
    this.reconnectAttempts = 0;
    this.pendingMessages = [];
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  send(event: string, data: any) {
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

  on(event: WebSocketEvent | string, callback: (data: any) => void) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  off(event: WebSocketEvent | string, callback: (data: any) => void) {
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

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      return;
    }

    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts);
    this.reconnectAttempts++;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.roomId && this.token) {
        this.connect(this.roomId, this.token);
      }
    }, delay);
  }
}

export const websocket = new WebSocketService();
