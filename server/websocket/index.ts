import { WebSocketServer, WebSocket } from "ws";
import { Server as HttpServer } from "http";
import { randomUUID } from "crypto";
import {
  addFeedSubscriber,
  removeFeedSubscriber,
  broadcastToFeedSubscribers,
} from "../feedBroadcast";
import { isStreamHost, removeActiveStream } from "../routes/livestream";
import { dbUpdateViewerCount } from "../lib/postgres";
import { logger } from "../lib/logger";
import {
  isValkeyConfigured,
  valkeyPublish,
  valkeyPSubscribe,
  valkeyRateCheck as valkeyRateCheckFn,
  valkeySet,
  valkeyGet,
  valkeyExists,
  valkeyDel,
} from "../lib/valkey";
import { battles, userBattleRoom, endBattle, getBattleFromStore } from "./battle";
import { handleMessage } from "./handlers";

export interface Client {
  ws: WebSocket;
  userId: string;
  roomId: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  level: number;
  country: string;
  connectedAt: Date;
}

const INSTANCE_ID = randomUUID();

const rooms = new Map<string, Set<Client>>();
const clients = new Map<WebSocket, Client>();
export const processedTransactions = new Map<string, number>();
export const lastCohostLayoutByRoom = new Map<
  string,
  { coHosts: unknown[]; hostUserId: string }
>();

const wsRateLimits = new Map<string, number[]>();

export async function wsRateCheck(
  userId: string,
  event: string,
  maxPerWindow: number,
  windowMs: number,
): Promise<boolean> {
  if (isValkeyConfigured()) {
    return valkeyRateCheckFn(`wsrl:${userId}:${event}`, windowMs, maxPerWindow);
  }
  const key = `${userId}:${event}`;
  const now = Date.now();
  const timestamps = (wsRateLimits.get(key) || []).filter(
    (t) => now - t < windowMs,
  );
  if (timestamps.length >= maxPerWindow) return false;
  timestamps.push(now);
  wsRateLimits.set(key, timestamps);
  return true;
}

function decodeUserIdFromToken(token: string): string | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64").toString(),
    );
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

export function sendToClient(
  client: Client,
  event: string,
  data: any,
): void {
  try {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(
        JSON.stringify({
          event,
          data,
          timestamp: new Date().toISOString(),
        }),
      );
    }
  } catch (error) {
    console.error("Failed to send to client:", error);
  }
}

export function sendToUser(
  roomId: string,
  userId: string,
  event: string,
  data: any,
): void {
  const room = rooms.get(roomId);
  if (!room) return;

  let message: string;
  try {
    message = JSON.stringify({
      event,
      data,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Failed to serialize message:", error);
    return;
  }

  room.forEach((client) => {
    if (client.userId === userId && client.ws.readyState === WebSocket.OPEN) {
      try {
        client.ws.send(message);
      } catch (error) {
        console.error("Failed to send to user:", error);
      }
    }
  });
}

export function sendToUserGlobal(
  userId: string,
  event: string,
  data: any,
): number {
  const ts = new Date().toISOString();
  let message: string;
  try {
    message = JSON.stringify({ event, data, timestamp: ts });
  } catch (error) {
    console.error("Failed to serialize message:", error);
    return 0;
  }

  let sent = 0;
  clients.forEach((client) => {
    if (client.userId === userId && client.ws.readyState === WebSocket.OPEN) {
      try {
        client.ws.send(message);
        sent += 1;
      } catch (error) {
        console.error("Failed to send to user (global):", error);
      }
    }
  });

  if (isValkeyConfigured()) {
    valkeyPublish(`user:${userId}`, {
      event,
      data,
      timestamp: ts,
      sourceInstanceId: INSTANCE_ID,
    });
  }

  if (sent === 0 && !isValkeyConfigured()) {
    console.warn(
      `[${event}] no connected client for userId:`,
      userId,
      "(invitee may be offline or on another page)",
    );
  }
  return sent;
}

export function broadcastToRoom(
  roomId: string,
  event: string,
  data: any,
  exclude?: Client,
): void {
  const room = rooms.get(roomId);

  const ts = new Date().toISOString();
  let message: string;
  try {
    message = JSON.stringify({ event, data, timestamp: ts });
  } catch (error) {
    console.error("Failed to serialize message:", error);
    return;
  }

  if (room) {
    room.forEach((client) => {
      if (client !== exclude && client.ws.readyState === WebSocket.OPEN) {
        try {
          client.ws.send(message);
        } catch (error) {
          console.error("Failed to send to client:", error);
        }
      }
    });
  }

  if (isValkeyConfigured()) {
    valkeyPublish(`room:${roomId}`, {
      event,
      data,
      timestamp: ts,
      sourceInstanceId: INSTANCE_ID,
    });
  }
}

// ── Transaction dedup (Valkey-backed with local fallback) ────────

export async function isTransactionDuplicate(
  transactionId: string,
): Promise<{ duplicate: boolean; timestamp?: number }> {
  if (isValkeyConfigured()) {
    const exists = await valkeyExists(`txn:${transactionId}`);
    if (exists) {
      const val = await valkeyGet(`txn:${transactionId}`);
      return { duplicate: true, timestamp: val ? Number(val) : undefined };
    }
    return { duplicate: false };
  }
  if (processedTransactions.has(transactionId)) {
    return { duplicate: true, timestamp: processedTransactions.get(transactionId) };
  }
  return { duplicate: false };
}

export async function markTransactionProcessed(
  transactionId: string,
  timestamp: number,
): Promise<void> {
  if (isValkeyConfigured()) {
    await valkeySet(`txn:${transactionId}`, String(timestamp), 300_000);
    return;
  }
  processedTransactions.set(transactionId, timestamp);
  const fiveMinutesAgo = timestamp - 5 * 60 * 1000;
  for (const [id, ts] of processedTransactions) {
    if (ts < fiveMinutesAgo) processedTransactions.delete(id);
  }
}

// ── Cohost layout (Valkey-backed with local fallback) ────────────

export async function getCohostLayout(
  roomId: string,
): Promise<{ coHosts: unknown[]; hostUserId: string } | null> {
  if (isValkeyConfigured()) {
    const val = await valkeyGet(`cohost:${roomId}`);
    if (val) {
      try {
        return JSON.parse(val);
      } catch {
        return null;
      }
    }
    return null;
  }
  return lastCohostLayoutByRoom.get(roomId) ?? null;
}

export async function setCohostLayout(
  roomId: string,
  coHosts: unknown[],
  hostUserId: string,
): Promise<void> {
  if (isValkeyConfigured()) {
    await valkeySet(
      `cohost:${roomId}`,
      JSON.stringify({ coHosts, hostUserId }),
      3_600_000,
    );
  }
  lastCohostLayoutByRoom.set(roomId, { coHosts, hostUserId });
}

export async function deleteCohostLayout(roomId: string): Promise<void> {
  if (isValkeyConfigured()) {
    await valkeyDel(`cohost:${roomId}`);
  }
  lastCohostLayoutByRoom.delete(roomId);
}

// ── Valkey pub/sub for cross-instance WS broadcasting ────────────

export function initWsPubSub(): void {
  if (!isValkeyConfigured()) {
    console.log("Valkey not configured – skipping WS pub/sub init");
    return;
  }

  valkeyPSubscribe("room:*", (channel, payload) => {
    if (payload.sourceInstanceId === INSTANCE_ID) return;
    const roomId = channel.replace(/^room:/, "");
    const room = rooms.get(roomId);
    if (!room) return;
    let message: string;
    try {
      message = JSON.stringify({
        event: payload.event,
        data: payload.data,
        timestamp: payload.timestamp,
      });
    } catch {
      return;
    }
    room.forEach((client) => {
      if (client.ws.readyState === WebSocket.OPEN) {
        try {
          client.ws.send(message);
        } catch {
          /* ignore */
        }
      }
    });
  });

  valkeyPSubscribe("user:*", (channel, payload) => {
    if (payload.sourceInstanceId === INSTANCE_ID) return;
    const userId = channel.replace(/^user:/, "");
    let message: string;
    try {
      message = JSON.stringify({
        event: payload.event,
        data: payload.data,
        timestamp: payload.timestamp,
      });
    } catch {
      return;
    }
    clients.forEach((client) => {
      if (client.userId === userId && client.ws.readyState === WebSocket.OPEN) {
        try {
          client.ws.send(message);
        } catch {
          /* ignore */
        }
      }
    });
  });

  console.log(`WS pub/sub initialized (instance: ${INSTANCE_ID})`);
}

async function updateViewerCount(roomId: string): Promise<void> {
  const room = rooms.get(roomId);
  const count = room ? room.size : 0;
  broadcastToRoom(roomId, "viewer_count", { count });
  dbUpdateViewerCount(roomId, count).catch(() => {});
}

async function checkAndBroadcastStreamEnd(
  roomId: string,
  userId: string,
): Promise<void> {
  if (!isStreamHost(roomId, userId)) return;
  removeActiveStream(roomId, userId);
  await deleteCohostLayout(roomId);
  broadcastToRoom(roomId, "stream_ended", {
    stream_key: roomId,
    host_user_id: userId,
    reason: "host_disconnected",
  });
  broadcastToFeedSubscribers("stream_ended", { stream_key: roomId });
}

export function attachWebSocket(server: HttpServer): WebSocketServer {
  const wss = new WebSocketServer({ server });
  const aliveClients = new WeakSet<WebSocket>();

  console.log("WebSocket server attached to HTTP server");

  wss.on("connection", async (ws: WebSocket, req) => {
    let client: Client | null = null;

    try {
      if (!req.url) {
        ws.close(1008, "Missing URL");
        return;
      }

      const url = new URL(
        req.url,
        `http://${req.headers.host || "0.0.0.0"}`,
      );
      let roomId = url.searchParams.get("room");
      const token = url.searchParams.get("token");

      if (!roomId && url.pathname.startsWith("/live/")) {
        roomId = url.pathname.split("/")[2];
      }

      if (!roomId || !token) {
        ws.close(1008, "Missing room or token");
        return;
      }

      const userId = decodeUserIdFromToken(token);
      if (!userId) {
        ws.close(1008, "Invalid token");
        return;
      }

      if (roomId === "__feed__" || roomId === "feed") {
        client = {
          ws,
          userId,
          roomId: "__feed__",
          username: "Anonymous",
          displayName: "",
          avatarUrl: "",
          level: 1,
          country: "",
          connectedAt: new Date(),
        };
        clients.set(ws, client);
        addFeedSubscriber(ws);
        try {
          ws.send(
            JSON.stringify({
              event: "connected",
              data: { feed: true },
              timestamp: new Date().toISOString(),
            }),
          );
        } catch {
          /* ignore */
        }
        return;
      }

      client = {
        ws,
        userId,
        roomId,
        username: "Anonymous",
        displayName: "",
        avatarUrl: "",
        level: 1,
        country: "",
        connectedAt: new Date(),
      };

      clients.set(ws, client);

      if (!rooms.has(roomId)) rooms.set(roomId, new Set());
      rooms.get(roomId)!.add(client);

      const roomClients = rooms.get(roomId)!;
      const seenUserIds = new Set<string>();
      const viewers: {
        user_id: string;
        username: string;
        display_name: string;
        avatar_url: string;
        level: number;
        country: string;
      }[] = [];
      for (const c of roomClients) {
        if (seenUserIds.has(c.userId)) continue;
        seenUserIds.add(c.userId);
        viewers.push({
          user_id: c.userId,
          username: c.username,
          display_name: c.displayName,
          avatar_url: c.avatarUrl,
          level: c.level,
          country: c.country,
        });
      }

      sendToClient(client, "connected", {
        room_id: roomId,
        user_count: roomClients.size,
      });

      sendToClient(client, "room_state", { viewers });

      const lastCohost = await getCohostLayout(roomId);
      if (lastCohost) {
        sendToClient(client, "cohost_layout_sync", {
          coHosts: lastCohost.coHosts,
          hostUserId: lastCohost.hostUserId,
        });
      }

      broadcastToRoom(
        roomId,
        "user_joined",
        {
          user_id: client.userId,
          username: client.username,
          display_name: client.displayName,
          avatar_url: client.avatarUrl,
          level: client.level,
          country: client.country,
        },
        client,
      );

      await updateViewerCount(roomId);

      const activeBattleOnJoin = battles.get(roomId);
      if (activeBattleOnJoin && activeBattleOnJoin.status !== "ENDED") {
        if (activeBattleOnJoin.endsAt > 0) {
          activeBattleOnJoin.timeLeft = Math.max(
            0,
            Math.round((activeBattleOnJoin.endsAt - Date.now()) / 1000),
          );
        }
        sendToClient(client, "battle_state_sync", {
          id: activeBattleOnJoin.id,
          status: activeBattleOnJoin.status,
          hostUserId: activeBattleOnJoin.hostUserId,
          hostName: activeBattleOnJoin.hostName,
          opponentUserId: activeBattleOnJoin.opponentUserId,
          opponentName: activeBattleOnJoin.opponentName,
          player3UserId: activeBattleOnJoin.player3UserId,
          player3Name: activeBattleOnJoin.player3Name,
          player4UserId: activeBattleOnJoin.player4UserId,
          player4Name: activeBattleOnJoin.player4Name,
          hostScore: activeBattleOnJoin.hostScore,
          opponentScore: activeBattleOnJoin.opponentScore,
          player3Score: activeBattleOnJoin.player3Score,
          player4Score: activeBattleOnJoin.player4Score,
          timeLeft: activeBattleOnJoin.timeLeft,
          endsAt: activeBattleOnJoin.endsAt,
          winner: activeBattleOnJoin.winner,
        });
      }
    } catch (error) {
      console.error("Connection setup error:", error);
      ws.close(1011, "Server error");
      return;
    }

    ws.on("error", (error) => {
      console.error("WebSocket error:", error);
    });

    ws.on("message", async (data) => {
      aliveClients.add(ws);
      try {
        let parsed: any;
        try {
          parsed = JSON.parse(data.toString());
        } catch {
          return;
        }
        const { event, data: eventData } = parsed;

        if (process.env.NODE_ENV !== "production")
          console.log("Received message:", event, eventData);

        if (
          process.env.NODE_ENV !== "production" &&
          event === "join_room" &&
          eventData?.skipAuth
        ) {
          const { roomId, userId, username } = eventData;
          client = {
            ws,
            userId,
            roomId,
            username,
            displayName: username,
            avatarUrl: "",
            level: 1,
            country: "",
            connectedAt: new Date(),
          };
          clients.set(ws, client);
          if (!rooms.has(roomId)) rooms.set(roomId, new Set());
          rooms.get(roomId)!.add(client);
          sendToClient(client, "room_joined", { roomId, userId, username });
          return;
        }

        if (!client) {
          console.error("Message from unauthenticated client");
          return;
        }

        await handleMessage(client, event, eventData);
      } catch (error) {
        console.error("Failed to handle message:", error);
        try {
          if (client) {
            sendToClient(client, "error", {
              message: "Invalid message format",
            });
          }
        } catch {
          /* prevent double-throw */
        }
      }
    });

    ws.on("close", async () => {
      if (!client) return;

      try {
        if (client.roomId === "__feed__") {
          removeFeedSubscriber(ws);
          clients.delete(ws);
          return;
        }

        const room = rooms.get(client.roomId);
        if (room) {
          room.delete(client);

          broadcastToRoom(client.roomId, "user_left", {
            user_id: client.userId,
            username: client.username,
            avatar_url: client.avatarUrl,
          });

          updateViewerCount(client.roomId).catch(() => {});
          checkAndBroadcastStreamEnd(client.roomId, client.userId);

          if (room.size === 0) rooms.delete(client.roomId);
        }

        const battleRoomId = userBattleRoom.get(client.userId);
        if (battleRoomId) {
          const battle = await getBattleFromStore(battleRoomId);
          if (battle && battle.status !== "ENDED") {
            const isHost = battle.hostUserId === client.userId;
            const isOpponent = battle.opponentUserId === client.userId;
            if (isHost || isOpponent) {
              logger.info(
                { battleRoomId, role: isHost ? "host" : "opponent" },
                "Battle participant disconnected, ending battle",
              );
              await endBattle(battleRoomId);
            }
          }
        }

        clients.delete(ws);
      } catch (err) {
        console.error("Error in close handler:", err);
      }
    });
  });

  const HEARTBEAT_INTERVAL = 30_000;
  const heartbeatTimer = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (!aliveClients.has(ws)) {
        ws.terminate();
        return;
      }
      aliveClients.delete(ws);
      ws.ping();
    });
  }, HEARTBEAT_INTERVAL);

  wss.on("connection", (ws) => {
    aliveClients.add(ws);
    ws.on("pong", () => {
      aliveClients.add(ws);
    });
  });

  wss.on("close", () => {
    clearInterval(heartbeatTimer);
  });

  return wss;
}
