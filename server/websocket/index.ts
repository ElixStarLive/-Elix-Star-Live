/**
 * WebSocket server — horizontally scalable.
 *
 * LOCAL Maps (hold actual WebSocket objects — cannot be serialized):
 *   rooms: roomId → Set<Client>   — for routing messages to LOCAL connections
 *   clients: WebSocket → Client   — for looking up client metadata from a WS object
 *
 * SHARED state (Valkey — consistent across all workers/instances):
 *   room:members:{roomId}         — SET of userIds in room (viewer count = SCARD)
 *   txn:{transactionId}           — dedup key
 *   cohost:{roomId}               — JSON of cohost layout
 *   wsrl:{userId}:{event}         — rate limit sorted set
 */

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
import { verifyAuthToken } from "../routes/auth";
import {
  isValkeyConfigured,
  valkeyPublish,
  valkeyPSubscribe,
  valkeyRateCheck as valkeyRateCheckFn,
  valkeySet,
  valkeyGet,
  valkeyDel,
  valkeySadd,
  valkeySrem,
  valkeyScard,
  valkeySmembers,
  valkeySetNx,
  valkeyExpire,
} from "../lib/valkey";
import { getPool } from "../lib/postgres";
import { getUserBattleRoom, endBattle, getBattleFromStore } from "./battle";
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
const ROOM_MEMBER_TTL = 3600;

let _warnedWsRateCheckNoValkey = false;
let _warnedTryClaimNoValkey = false;

const rooms = new Map<string, Set<Client>>();
const clients = new Map<WebSocket, Client>();
const userClients = new Map<string, Set<Client>>();

export async function wsRateCheck(
  userId: string,
  event: string,
  maxPerWindow: number,
  windowMs: number,
): Promise<boolean> {
  if (!isValkeyConfigured()) {
    if (!_warnedWsRateCheckNoValkey) {
      _warnedWsRateCheckNoValkey = true;
      logger.warn(
        { userId, event },
        "wsRateCheck: Valkey not configured — allowing WS event (no rate limit available)",
      );
    }
    return true;
  }
  try {
    return await valkeyRateCheckFn(`wsrl:${userId}:${event}`, windowMs, maxPerWindow);
  } catch (err: any) {
    logger.warn({ err: err?.message, userId, event }, "wsRateCheck: Valkey error — allowing event");
    return true;
  }
}

function verifyAndExtractUserId(token: string): string | null {
  const payload = verifyAuthToken(token);
  if (!payload) return null;
  return payload.sub ?? null;
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
    logger.error({ err: error }, "Failed to send to client");
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
    logger.error({ err: error }, "Failed to serialize message");
    return;
  }

  room.forEach((client) => {
    if (client.userId === userId && client.ws.readyState === WebSocket.OPEN) {
      try {
        client.ws.send(message);
      } catch (error) {
        logger.error({ err: error }, "Failed to send to user");
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
    logger.error({ err: error }, "Failed to serialize message");
    return 0;
  }

  let sent = 0;
  const userSet = userClients.get(userId);
  if (userSet) {
    for (const client of userSet) {
      if (client.ws.readyState === WebSocket.OPEN) {
        try {
          client.ws.send(message);
          sent += 1;
        } catch (error) {
          logger.error({ err: error }, "Failed to send to user (global)");
        }
      }
    }
  }

  if (isValkeyConfigured()) {
    valkeyPublish(`user:${userId}`, {
      event,
      data,
      timestamp: ts,
      sourceInstanceId: INSTANCE_ID,
    });
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
    logger.error({ err: error }, "Failed to serialize message");
    return;
  }

  if (room) {
    room.forEach((client) => {
      if (client !== exclude && client.ws.readyState === WebSocket.OPEN) {
        try {
          client.ws.send(message);
        } catch (error) {
          logger.error({ err: error }, "Failed to send to client");
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

// ── Transaction dedup (Valkey-only) ──────────────────────────────

/**
 * Atomic claim: SET NX ensures only one worker/request can claim a transaction.
 * Returns { claimed: true } on first call, { claimed: false } on duplicates.
 */
export async function tryClaimTransaction(
  transactionId: string,
  timestamp: number,
): Promise<{ claimed: boolean; existingTimestamp?: number }> {
  if (!isValkeyConfigured()) {
    if (!_warnedTryClaimNoValkey) {
      _warnedTryClaimNoValkey = true;
      logger.warn(
        "tryClaimTransaction: Valkey not configured — denying claim (fail-closed). DB ON CONFLICT is safety net.",
      );
    }
    return { claimed: false };
  }
  const key = `txn:${transactionId}`;
  const claimed = await valkeySetNx(key, String(timestamp), 300_000);
  if (claimed) return { claimed: true };
  const val = await valkeyGet(key);
  return { claimed: false, existingTimestamp: val ? Number(val) : undefined };
}

export async function markTransactionProcessed(
  transactionId: string,
  timestamp: number,
): Promise<void> {
  if (!isValkeyConfigured()) return;
  await valkeySet(`txn:${transactionId}`, String(timestamp), 300_000);
}

// ── Cohost layout (Valkey-only) ──────────────────────────────────

export async function getCohostLayout(
  roomId: string,
): Promise<{ coHosts: unknown[]; hostUserId: string } | null> {
  if (!isValkeyConfigured()) return null;
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

export async function setCohostLayout(
  roomId: string,
  coHosts: unknown[],
  hostUserId: string,
): Promise<void> {
  if (!isValkeyConfigured()) return;
  await valkeySet(
    `cohost:${roomId}`,
    JSON.stringify({ coHosts, hostUserId }),
    3_600_000,
  );
}

export async function deleteCohostLayout(roomId: string): Promise<void> {
  if (!isValkeyConfigured()) return;
  await valkeyDel(`cohost:${roomId}`);
}

// ── Valkey pub/sub for cross-instance WS broadcasting ────────────

export function initWsPubSub(): void {
  if (!isValkeyConfigured()) {
    logger.warn("Valkey not configured – skipping WS pub/sub init");
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
          logger.debug("ws.send failed — client likely disconnected");
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
    const userSet = userClients.get(userId);
    if (userSet) {
      for (const client of userSet) {
        if (client.ws.readyState === WebSocket.OPEN) {
          try {
            client.ws.send(message);
          } catch {
            logger.debug("ws.send failed — client likely disconnected");
          }
        }
      }
    }
  });

  logger.info({ instanceId: INSTANCE_ID }, "WS pub/sub initialized");
}

// ── Viewer count from Valkey SCARD ───────────────────────────────

async function updateViewerCount(roomId: string): Promise<void> {
  let count: number;
  if (isValkeyConfigured()) {
    count = await valkeyScard(`room:members:${roomId}`);
    if (count > 0) {
      await valkeyExpire(`room:members:${roomId}`, ROOM_MEMBER_TTL);
    }
  } else {
    const room = rooms.get(roomId);
    count = room ? room.size : 0;
  }
  broadcastToRoom(roomId, "viewer_count", { count });
  dbUpdateViewerCount(roomId, count).catch((err) => {
    logger.warn({ err, roomId, count }, "dbUpdateViewerCount failed after viewer count broadcast");
  });
}

async function checkAndBroadcastStreamEnd(
  roomId: string,
  userId: string,
): Promise<void> {
  const isHost = await isStreamHost(roomId, userId);
  if (!isHost) return;
  await removeActiveStream(roomId, userId);
  await deleteCohostLayout(roomId);
  broadcastToRoom(roomId, "stream_ended", {
    stream_key: roomId,
    host_user_id: userId,
    reason: "host_disconnected",
  });
  broadcastToFeedSubscribers("stream_ended", { stream_key: roomId });
}

// ── Build viewer list from Valkey + DB for new joiners ───────────

const MAX_VIEWER_LIST = 100;

async function buildViewerList(
  roomId: string,
): Promise<{ user_id: string; username: string; display_name: string; avatar_url: string; level: number; country: string }[]> {
  if (isValkeyConfigured()) {
    const memberIds = await valkeySmembers(`room:members:${roomId}`);
    if (memberIds.length === 0) return [];

    const capped = memberIds.slice(0, MAX_VIEWER_LIST);
    const db = getPool();
    if (db) {
      try {
        const res = await db.query(
          `SELECT user_id, username, display_name, avatar_url, level FROM profiles WHERE user_id = ANY($1::text[]) LIMIT ${MAX_VIEWER_LIST}`,
          [capped],
        );
        return (res.rows || []).map((r: any) => ({
          user_id: String(r.user_id),
          username: String(r.username || ""),
          display_name: String(r.display_name || ""),
          avatar_url: String(r.avatar_url || ""),
          level: Number(r.level) || 1,
          country: "",
        }));
      } catch {
        return capped.map((id) => ({
          user_id: id, username: "", display_name: "", avatar_url: "", level: 1, country: "",
        }));
      }
    }
    return capped.map((id) => ({
      user_id: id, username: "", display_name: "", avatar_url: "", level: 1, country: "",
    }));
  }

  const room = rooms.get(roomId);
  if (!room) return [];
  const seenUserIds = new Set<string>();
  const viewers: { user_id: string; username: string; display_name: string; avatar_url: string; level: number; country: string }[] = [];
  for (const c of room) {
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
  return viewers;
}

const MAX_WS_CONNECTIONS = Number(process.env.MAX_WS_CONNECTIONS) || 10_000;

export function attachWebSocket(server: HttpServer): WebSocketServer {
  const wss = new WebSocketServer({ server, maxPayload: 64 * 1024, perMessageDeflate: false });
  const aliveClients = new WeakSet<WebSocket>();

  logger.info({ maxConnections: MAX_WS_CONNECTIONS }, "WebSocket server attached to HTTP server");

  wss.on("connection", async (ws: WebSocket, req) => {
    if (wss.clients.size > MAX_WS_CONNECTIONS) {
      logger.warn({ current: wss.clients.size, max: MAX_WS_CONNECTIONS }, "WebSocket connection limit reached");
      ws.close(1013, "Server at capacity");
      return;
    }

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

      const userId = verifyAndExtractUserId(token);
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
          logger.debug("ws.send failed — client likely disconnected");
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

      if (!userClients.has(userId)) userClients.set(userId, new Set());
      userClients.get(userId)!.add(client);

      if (!rooms.has(roomId)) rooms.set(roomId, new Set());
      rooms.get(roomId)!.add(client);

      if (isValkeyConfigured()) {
        await valkeySadd(`room:members:${roomId}`, userId);
        await valkeyExpire(`room:members:${roomId}`, ROOM_MEMBER_TTL);
      }

      const viewers = await buildViewerList(roomId);

      let memberCount: number;
      if (isValkeyConfigured()) {
        memberCount = await valkeyScard(`room:members:${roomId}`);
      } else {
        memberCount = rooms.get(roomId)!.size;
      }

      sendToClient(client, "connected", {
        room_id: roomId,
        user_count: memberCount,
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

      const activeBattleOnJoin = await getBattleFromStore(roomId);
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
      logger.error({ err: error }, "Connection setup error");
      ws.close(1011, "Server error");
      return;
    }

    ws.on("error", (error) => {
      logger.error({ err: error }, "WebSocket error");
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

        if (!client) {
          logger.error("Message from unauthenticated client");
          return;
        }

        await handleMessage(client, event, eventData);
      } catch (error) {
        logger.error({ err: error }, "Failed to handle message");
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
        const uc = userClients.get(client.userId);
        if (uc) {
          uc.delete(client);
          if (uc.size === 0) userClients.delete(client.userId);
        }

        if (client.roomId === "__feed__") {
          removeFeedSubscriber(ws);
          clients.delete(ws);
          return;
        }

        const room = rooms.get(client.roomId);
        if (room) {
          room.delete(client);

          const userStillInRoom = Array.from(room).some(
            (c) => c.userId === client!.userId,
          );

          if (!userStillInRoom && isValkeyConfigured()) {
            await valkeySrem(`room:members:${client.roomId}`, client.userId);
          }

          broadcastToRoom(client.roomId, "user_left", {
            user_id: client.userId,
            username: client.username,
            avatar_url: client.avatarUrl,
          });

          updateViewerCount(client.roomId).catch((err) => {
            logger.warn({ err, roomId: client.roomId }, "updateViewerCount failed on client disconnect");
          });
          checkAndBroadcastStreamEnd(client.roomId, client.userId);

          if (room.size === 0) {
            rooms.delete(client.roomId);
          }
        }

        const battleRoomId = await getUserBattleRoom(client.userId);
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
        logger.error({ err }, "Error in close handler");
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
