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
import { isStreamHost, removeActiveStream, resolveStreamOwnerUserId } from "../routes/livestream";
import { dbIsBlockedEitherWay, dbUpdateViewerCount } from "../lib/postgres";
import { logger } from "../lib/logger";
import { checkSessionState, verifyAuthToken } from "../routes/auth";
import {
  isValkeyConfigured,
  valkeyPublish,
  valkeySubscribe,
  valkeyUnsubscribe,
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
import { createCoalescedWriter } from "../lib/coalescedWriter";
import { getUserBattleRoom, endBattle, getBattleFromStore, removeBattleParticipant } from "./battle";
import { getGiftGoal } from "./giftGoal";
import {
  clearEngagementActiveRoom,
  getEngagementPublicState,
} from "./engagement";
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
  } catch (err) {
    // Fail CLOSED: if the limiter cannot be evaluated (Valkey error), deny the
    // event rather than allow unbounded gift/chat/battle spam. Production
    // requires Valkey, so this only trips during a real outage.
    logger.warn({ err: err?.message, userId, event }, "wsRateCheck: Valkey error — denying event (fail closed)");
    return false;
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
  data: unknown,
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
  data: unknown,
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
  data: unknown,
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
  data: unknown,
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
 * When Valkey is not configured, uses process-local memory so single-instance
 * deploys still broadcast verified gifts (creator gift video play).
 */
const localTxnClaims = new Map<string, number>();

export async function tryClaimTransaction(
  transactionId: string,
  timestamp: number,
): Promise<{ claimed: boolean; existingTimestamp?: number }> {
  if (!isValkeyConfigured()) {
    if (!_warnedTryClaimNoValkey) {
      _warnedTryClaimNoValkey = true;
      logger.warn(
        "tryClaimTransaction: Valkey not configured — using in-memory claim (single instance).",
      );
    }
    const existing = localTxnClaims.get(transactionId);
    if (existing != null) {
      return { claimed: false, existingTimestamp: existing };
    }
    localTxnClaims.set(transactionId, timestamp);
    if (localTxnClaims.size > 5_000) {
      const cutoff = timestamp - 300_000;
      for (const [k, ts] of localTxnClaims) {
        if (ts < cutoff) localTxnClaims.delete(k);
      }
    }
    return { claimed: true };
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
  await clearCohostPublishGrants(roomId);
}

// ── Co-host publish grants (host-authorized) ─────────────────────
// Recorded when the HOST invites or accepts a co-host, and checked before a
// publish LiveKit token is issued. This makes publishing server-authoritative
// instead of trusting a client-supplied "?cohost=1" URL flag.
const COHOST_GRANT_TTL_MS = 6 * 60 * 60 * 1000; // matches LiveKit token TTL

export async function grantCohostPublish(roomId: string, userId: string): Promise<void> {
  if (!isValkeyConfigured() || !roomId || !userId) return;
  await valkeySet(`cohost_grant:${roomId}:${userId}`, "1", COHOST_GRANT_TTL_MS);
  await valkeySadd(`cohost_grants:${roomId}`, userId);
  await valkeyExpire(`cohost_grants:${roomId}`, Math.ceil(COHOST_GRANT_TTL_MS / 1000));
}

export async function hasCohostPublishGrant(roomId: string, userId: string): Promise<boolean> {
  if (!isValkeyConfigured() || !roomId || !userId) return false;
  const v = await valkeyGet(`cohost_grant:${roomId}:${userId}`);
  return v === "1";
}

export async function revokeCohostPublish(roomId: string, userId: string): Promise<void> {
  if (!isValkeyConfigured() || !roomId || !userId) return;
  await valkeyDel(`cohost_grant:${roomId}:${userId}`);
  await valkeySrem(`cohost_grants:${roomId}`, userId);
}

export async function clearCohostPublishGrants(roomId: string): Promise<void> {
  if (!isValkeyConfigured() || !roomId) return;
  const members = await valkeySmembers(`cohost_grants:${roomId}`);
  for (const userId of members) {
    await valkeyDel(`cohost_grant:${roomId}:${userId}`);
  }
  await valkeyDel(`cohost_grants:${roomId}`);
}

// ── Battle publish grants (accepted creator opponents only) ──────
// Kept separate from co-host grants so battle participants are never promoted
// into the co-host flow and co-host cleanup cannot revoke a live battle.
const BATTLE_GRANT_TTL_MS = 10 * 60 * 1000;

export async function grantBattlePublish(roomId: string, userId: string): Promise<void> {
  if (!isValkeyConfigured() || !roomId || !userId) return;
  await valkeySet(`battle_grant:${roomId}:${userId}`, "1", BATTLE_GRANT_TTL_MS);
}

export async function hasBattlePublishGrant(roomId: string, userId: string): Promise<boolean> {
  if (!isValkeyConfigured() || !roomId || !userId) return false;
  return (await valkeyGet(`battle_grant:${roomId}:${userId}`)) === "1";
}

export async function revokeBattlePublish(roomId: string, userId: string): Promise<void> {
  if (!isValkeyConfigured() || !roomId || !userId) return;
  await valkeyDel(`battle_grant:${roomId}:${userId}`);
}

// ── Valkey pub/sub for cross-instance WS broadcasting ────────────

/** Cross-instance payload shape published by broadcastToRoom / disconnectUserSessions. */
interface WsPubSubPayload {
  event: string;
  data?: Record<string, unknown>;
  timestamp?: string;
  sourceInstanceId?: string;
}

/**
 * Forward a cross-instance room message to LOCAL clients in that room. Registered
 * per-room (only while this instance actually hosts clients in the room), so an
 * instance never receives traffic for rooms it does not serve.
 */
function forwardRoomMessage(roomId: string, payload: WsPubSubPayload): void {
  if (!payload || payload.sourceInstanceId === INSTANCE_ID) return;
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
}

/** Forward a cross-instance user message (or force-disconnect) to LOCAL sockets. */
function forwardUserMessage(userId: string, payload: WsPubSubPayload): void {
  if (!payload || payload.sourceInstanceId === INSTANCE_ID) return;
  if (payload.event === "force_disconnect") {
    forceCloseLocalUserSockets(userId, String(payload.data?.reason || "Session ended"));
    return;
  }
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
  if (!userSet) return;
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

/** Subscribe to a room's cross-instance channel when the first local client joins. */
function subscribeRoomChannel(roomId: string): void {
  if (!isValkeyConfigured()) return;
  valkeySubscribe(`room:${roomId}`, (payload) =>
    forwardRoomMessage(roomId, payload as WsPubSubPayload),
  );
}

/** Unsubscribe from a room's channel once no local clients remain. */
function unsubscribeRoomChannel(roomId: string): void {
  if (!isValkeyConfigured()) return;
  valkeyUnsubscribe(`room:${roomId}`);
}

/** Subscribe to a user's cross-instance channel when their first local socket connects. */
function subscribeUserChannel(userId: string): void {
  if (!isValkeyConfigured()) return;
  valkeySubscribe(`user:${userId}`, (payload) =>
    forwardUserMessage(userId, payload as WsPubSubPayload),
  );
}

/** Unsubscribe from a user's channel once their last local socket closes. */
function unsubscribeUserChannel(userId: string): void {
  if (!isValkeyConfigured()) return;
  valkeyUnsubscribe(`user:${userId}`);
}

export function initWsPubSub(): void {
  if (!isValkeyConfigured()) {
    logger.warn("Valkey not configured – skipping WS pub/sub init");
    return;
  }
  // Cross-instance routing is now conditional: rooms and users are subscribed on
  // demand as local clients connect (see subscribeRoomChannel / subscribeUserChannel),
  // so each instance only receives pub/sub traffic for the rooms and users it hosts.
  logger.info({ instanceId: INSTANCE_ID }, "WS pub/sub initialized (per-room/per-user subscriptions)");
}

function forceCloseLocalUserSockets(userId: string, reason: string): number {
  const userSet = userClients.get(userId);
  if (!userSet || userSet.size === 0) return 0;
  let closed = 0;
  for (const client of [...userSet]) {
    try {
      if (client.ws.readyState === WebSocket.OPEN || client.ws.readyState === WebSocket.CONNECTING) {
        client.ws.close(1008, reason.slice(0, 120));
        closed += 1;
      }
    } catch (err) {
      logger.warn({ err, userId }, "forceCloseLocalUserSockets close failed");
    }
  }
  return closed;
}

/** Close every live socket for a user on this and other instances (ban / suspend). */
export function disconnectUserSessions(userId: string, reason = "Banned"): number {
  if (!userId) return 0;
  const closed = forceCloseLocalUserSockets(userId, reason);
  if (isValkeyConfigured()) {
    valkeyPublish(`user:${userId}`, {
      event: "force_disconnect",
      data: { reason },
      timestamp: new Date().toISOString(),
      sourceInstanceId: INSTANCE_ID,
    });
  }
  return closed;
}

// ── Viewer count from Valkey SCARD ───────────────────────────────

/**
 * Persisting the viewer count on every join/leave hammers the DB on hot rooms
 * (one UPDATE per event × many concurrent viewers). The realtime count is served
 * from Valkey SCARD and broadcast immediately; the DB copy only needs to be
 * eventually-consistent for the feed/live list, so coalesce writes per room to a
 * single trailing write that carries the latest value.
 */
const VIEWER_DB_WRITE_DEBOUNCE_MS = 3000;
const viewerCountDbWriter = createCoalescedWriter<number>((roomId, count) => {
  dbUpdateViewerCount(roomId, count).catch((err) => {
    logger.warn({ err, roomId, count }, "dbUpdateViewerCount (coalesced) failed");
  });
}, VIEWER_DB_WRITE_DEBOUNCE_MS);

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
  viewerCountDbWriter.schedule(roomId, count);
}

/** Host WS blips (battle UI remount / mobile network) must not kill the live. */
const HOST_DISCONNECT_GRACE_MS = 20_000;
const hostDisconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();

function hostDisconnectKey(roomId: string, userId: string): string {
  return `${roomId}:${userId}`;
}

function cancelHostDisconnectGrace(roomId: string, userId: string): void {
  const key = hostDisconnectKey(roomId, userId);
  const t = hostDisconnectTimers.get(key);
  if (t) {
    clearTimeout(t);
    hostDisconnectTimers.delete(key);
  }
}

function scheduleHostDisconnectStreamEnd(roomId: string, userId: string): void {
  const key = hostDisconnectKey(roomId, userId);
  const existing = hostDisconnectTimers.get(key);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    hostDisconnectTimers.delete(key);
    void (async () => {
      try {
        // Host rejoined this room — keep the live up.
        const room = rooms.get(roomId);
        if (room && Array.from(room).some((c) => c.userId === userId)) {
          return;
        }
        if (isValkeyConfigured()) {
          const stillMember = await valkeySmembers(`room:members:${roomId}`);
          if (stillMember.includes(userId)) return;
        }
        const isHost = await isStreamHost(roomId, userId);
        if (!isHost) return;
        await removeActiveStream(roomId, userId);
        await deleteCohostLayout(roomId);
        // Host left for a battle room — send their spectators into the battle.
        let battleRedirect: string | null = null;
        try {
          const battleRoomId = await getUserBattleRoom(userId);
          if (battleRoomId && battleRoomId !== roomId) battleRedirect = battleRoomId;
        } catch { /* non-fatal */ }
        broadcastToRoom(roomId, "stream_ended", {
          stream_key: roomId,
          host_user_id: userId,
          reason: battleRedirect ? "host_joined_battle" : "host_disconnected",
          ...(battleRedirect ? { battle_room_id: battleRedirect } : {}),
        });
        broadcastToFeedSubscribers("stream_ended", { stream_key: roomId });
      } catch (err) {
        logger.error({ err, roomId, userId }, "host disconnect grace end failed");
      }
    })();
  }, HOST_DISCONNECT_GRACE_MS);
  hostDisconnectTimers.set(key, timer);
}

async function checkAndBroadcastStreamEnd(
  roomId: string,
  userId: string,
): Promise<void> {
  const isHost = await isStreamHost(roomId, userId);
  if (!isHost) return;
  // Grace window so brief WS reconnects (e.g. starting a battle match) do not
  // end the live for every spectator.
  scheduleHostDisconnectStreamEnd(roomId, userId);
}

/** Battle participants also blip (remount/mobile network) — same grace as host. */
const BATTLE_DISCONNECT_GRACE_MS = 15_000;
const battleDisconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();

function cancelBattleDisconnectGrace(roomId: string, userId: string): void {
  const key = hostDisconnectKey(roomId, userId);
  const t = battleDisconnectTimers.get(key);
  if (t) {
    clearTimeout(t);
    battleDisconnectTimers.delete(key);
  }
}

function scheduleBattleDisconnectEnd(battleRoomId: string, userId: string): void {
  const key = hostDisconnectKey(battleRoomId, userId);
  const existing = battleDisconnectTimers.get(key);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    battleDisconnectTimers.delete(key);
    void (async () => {
      try {
        // Participant reconnected to the battle room — battle continues.
        const room = rooms.get(battleRoomId);
        if (room && Array.from(room).some((c) => c.userId === userId)) {
          return;
        }
        if (isValkeyConfigured()) {
          const members = await valkeySmembers(`room:members:${battleRoomId}`);
          if (members.includes(userId)) return;
        }
        const battle = await getBattleFromStore(battleRoomId);
        if (!battle || battle.status === "ENDED") return;
        const isHost = battle.hostUserId === userId;
        if (!isHost) return;
        logger.info(
          { battleRoomId, role: "host" },
          "Battle host gone after grace, ending battle",
        );
        if (battle.opponentUserId) {
          await revokeBattlePublish(battleRoomId, battle.opponentUserId);
        }
        if (battle.player3UserId) {
          await revokeBattlePublish(battleRoomId, battle.player3UserId);
        }
        if (battle.player4UserId) {
          await revokeBattlePublish(battleRoomId, battle.player4UserId);
        }
        await endBattle(battleRoomId);
      } catch (err) {
        logger.error({ err, battleRoomId, userId }, "battle disconnect grace end failed");
      }
    })();
  }, BATTLE_DISCONNECT_GRACE_MS);
  battleDisconnectTimers.set(key, timer);
}

/**
 * A NON-host battle creator (opponent / player3 / player4) dropping their socket
 * must not leave the remaining creator stuck staring at a frozen pane until the
 * full battle timer expires. Give the same reconnect grace as the host, then
 * resolve safely:
 *   - 2-player battle → the opponent is the only rival, so end the battle now and
 *     let endBattle() compute the winner from the current scores.
 *   - multi-creator battle → drop just this creator (removeBattleParticipant) and
 *     keep the match running for everyone else.
 * Reuses battleDisconnectTimers keyed by roomId:userId, so a reconnect within the
 * grace cancels it via cancelBattleDisconnectGrace (same as the host path).
 */
function scheduleBattleParticipantDisconnectEnd(battleRoomId: string, userId: string): void {
  const key = hostDisconnectKey(battleRoomId, userId);
  const existing = battleDisconnectTimers.get(key);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    battleDisconnectTimers.delete(key);
    void (async () => {
      try {
        // Creator reconnected to the battle room within grace — nothing to do.
        const room = rooms.get(battleRoomId);
        if (room && Array.from(room).some((c) => c.userId === userId)) return;
        if (isValkeyConfigured()) {
          const members = await valkeySmembers(`room:members:${battleRoomId}`);
          if (members.includes(userId)) return;
        }
        const battle = await getBattleFromStore(battleRoomId);
        if (!battle || battle.status === "ENDED") return;
        // Host disconnect is handled by scheduleBattleDisconnectEnd, not here.
        if (battle.hostUserId === userId) return;
        const isParticipant =
          battle.opponentUserId === userId ||
          battle.player3UserId === userId ||
          battle.player4UserId === userId;
        if (!isParticipant) return;

        // Rival-side creators still connected besides the one who dropped.
        const remainingRivals = [
          battle.opponentUserId,
          battle.player3UserId,
          battle.player4UserId,
        ].filter((id) => id && id !== userId);

        await revokeBattlePublish(battleRoomId, userId);

        if (remainingRivals.length === 0) {
          logger.info(
            { battleRoomId, userId },
            "Battle opponent gone after grace, resolving battle from current scores",
          );
          await endBattle(battleRoomId);
        } else {
          logger.info(
            { battleRoomId, userId },
            "Battle creator gone after grace, removing from match (others continue)",
          );
          await removeBattleParticipant(battleRoomId, userId);
        }
      } catch (err) {
        logger.error(
          { err, battleRoomId, userId },
          "battle participant disconnect grace end failed",
        );
      }
    })();
  }, BATTLE_DISCONNECT_GRACE_MS);
  battleDisconnectTimers.set(key, timer);
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
        return (res.rows || []).map((r: Record<string, unknown>) => ({
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

    // Register error + close handlers up front so EVERY connection path cleans
    // up its maps — including the feed branch and the setup-catch below, which
    // both return before the rest of setup completes. The handlers guard on
    // `client` and use per-step existence checks, so they are safe for partial
    // or early-terminated connections. Without this, feed subscribers and
    // failed-setup sockets leak entries in clients/feedSubscribers/rooms/Valkey.
    ws.on("error", (error) => {
      logger.error({ err: error }, "WebSocket error");
    });

    ws.on("close", async () => {
      if (!client) return;

      try {
        const uc = userClients.get(client.userId);
        if (uc) {
          uc.delete(client);
          if (uc.size === 0) {
            userClients.delete(client.userId);
            unsubscribeUserChannel(client.userId);
          }
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
            (c) => c.userId === (client as NonNullable<typeof client>).userId,
          );

          if (!userStillInRoom && isValkeyConfigured()) {
            await valkeySrem(`room:members:${client.roomId}`, client.userId);
            // Leaving the room removes any co-host publish entitlement.
            await revokeCohostPublish(client.roomId, client.userId);
          }

          broadcastToRoom(client.roomId, "user_left", {
            user_id: client.userId,
            username: client.username,
            avatar_url: client.avatarUrl,
          });

          if (!userStillInRoom) {
            clearEngagementActiveRoom(client.userId, client.roomId).catch(() => undefined);
          }

          updateViewerCount(client.roomId).catch((err) => {
            logger.warn({ err, roomId: client.roomId }, "updateViewerCount failed on client disconnect");
          });
          checkAndBroadcastStreamEnd(client.roomId, client.userId).catch((err) => {
            logger.error({ err, roomId: client.roomId, userId: client.userId }, "checkAndBroadcastStreamEnd unhandled rejection");
          });

          if (room.size === 0) {
            rooms.delete(client.roomId);
            unsubscribeRoomChannel(client.roomId);
            viewerCountDbWriter.flush(client.roomId);
          }
        }

        // Only end battle when leaving the battle room itself. Ending on leave
        // from the opponent's previous solo room races invite-accept reconnect
        // and kills battles for host + spectators. A WS blip must not end the
        // battle instantly either — give the participant a grace to reconnect.
        const battleRoomId = await getUserBattleRoom(client.userId);
        if (battleRoomId && client.roomId === battleRoomId) {
          const stillConnectedToBattleRoom = (() => {
            const battleRoom = rooms.get(battleRoomId);
            if (!battleRoom) return false;
            return Array.from(battleRoom).some(
              (c) => c.userId === (client as NonNullable<typeof client>).userId,
            );
          })();
          if (!stillConnectedToBattleRoom) {
            const battle = await getBattleFromStore(battleRoomId);
            if (battle && battle.status !== "ENDED") {
              const isHost = battle.hostUserId === client.userId;
              // Host disconnect ends the whole battle after grace. A non-host
              // creator dropping is resolved separately: after the same grace we
              // either end a 2-player battle or drop just that creator from a
              // multi-creator match, so the remaining creator is never stuck
              // until the timer expires.
              if (isHost) {
                scheduleBattleDisconnectEnd(battleRoomId, client.userId);
              } else {
                scheduleBattleParticipantDisconnectEnd(battleRoomId, client.userId);
              }
            }
          }
        }

        clients.delete(ws);
      } catch (err) {
        logger.error({ err }, "Error in close handler");
      }
    });

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

      // Match HTTP sessionGuard: reject revoked sessions and banned users.
      const session = await checkSessionState(token);
      if (!session || session.state !== "ok") {
        const reason =
          session?.state === "banned"
            ? "Banned"
            : session?.state === "unavailable"
              ? "Session validation unavailable"
              : "Session revoked";
        ws.close(1008, reason);
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

      // Enforce blocks against the live host at join time.
      const hostUserId = await resolveStreamOwnerUserId(roomId);
      if (
        hostUserId &&
        hostUserId !== userId &&
        (await dbIsBlockedEitherWay(userId, hostUserId))
      ) {
        ws.close(1008, "Blocked");
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

      // Populate the real identity from the profile so join/leave events show
      // the actual username (and name/avatar/level) instead of the "Anonymous"
      // placeholder the client was created with.
      try {
        const identityDb = getPool();
        if (identityDb) {
          const prof = await identityDb.query(
            `SELECT username, display_name, avatar_url, level
               FROM profiles WHERE user_id = $1 LIMIT 1`,
            [userId],
          );
          const p = prof.rows[0];
          if (p) {
            if (typeof p.username === "string" && p.username.trim()) {
              client.username = p.username.trim();
            }
            if (typeof p.display_name === "string" && p.display_name.trim()) {
              client.displayName = p.display_name.trim();
            }
            if (typeof p.avatar_url === "string") {
              client.avatarUrl = p.avatar_url;
            }
            if (typeof p.level === "number" && Number.isFinite(p.level)) {
              client.level = p.level;
            } else {
              const parsedLevel = Number(p.level);
              if (Number.isFinite(parsedLevel) && parsedLevel >= 0) {
                client.level = Math.floor(parsedLevel);
              }
            }
          }
        }
      } catch (err) {
        logger.warn({ err, userId }, "ws: failed to load joiner profile identity");
      }

      if (!userClients.has(userId)) {
        userClients.set(userId, new Set());
        subscribeUserChannel(userId);
      }
      (userClients.get(userId) as Set<Client>).add(client);

      if (!rooms.has(roomId)) {
        rooms.set(roomId, new Set());
        subscribeRoomChannel(roomId);
      }
      (rooms.get(roomId) as Set<Client>).add(client);

      if (isValkeyConfigured()) {
        await valkeySadd(`room:members:${roomId}`, userId);
        await valkeyExpire(`room:members:${roomId}`, ROOM_MEMBER_TTL);
      }

      // Host/battle participant reconnected within grace — keep live + battle up.
      cancelHostDisconnectGrace(roomId, userId);
      cancelBattleDisconnectGrace(roomId, userId);

      const viewers = await buildViewerList(roomId);

      let memberCount: number;
      if (isValkeyConfigured()) {
        memberCount = await valkeyScard(`room:members:${roomId}`);
      } else {
        memberCount = (rooms.get(roomId) as Set<Client>).size;
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
          hostRoomId: activeBattleOnJoin.hostRoomId,
          opponentUserId: activeBattleOnJoin.opponentUserId,
          opponentName: activeBattleOnJoin.opponentName,
          opponentRoomId: activeBattleOnJoin.opponentRoomId,
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

      const liveGiftGoal = await getGiftGoal(roomId);
      if (liveGiftGoal) {
        sendToClient(client, "gift_goal_sync", liveGiftGoal);
      }

      try {
        const engage = await getEngagementPublicState(roomId, client.userId);
        sendToClient(client, "engagement_sync", engage);
      } catch (engageErr) {
        logger.warn({ err: engageErr, roomId }, "engagement_sync on join failed");
      }
    } catch (error) {
      logger.error({ err: error }, "Connection setup error");
      ws.close(1011, "Server error");
      return;
    }

    ws.on("message", async (data) => {
      aliveClients.add(ws);
      try {
        let parsed;
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
