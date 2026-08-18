/**
 * WebSocket server — horizontally scalable.
 *
 * LOCAL Maps (hold actual WebSocket objects — cannot be serialized):
 *   rooms: roomId → Set<Client>   — for routing messages to LOCAL connections
 *   clients: WebSocket → Client   — for looking up client metadata from a WS object
 *
 * SHARED state (Valkey — consistent across all workers/instances):
 *   room:members:{roomId}         — SET of userIds in room (viewer count = SCARD)
 *   room:meta:{roomId}            — HASH live_likes (shared like total)
 *   room:audience:{roomId}        — HASH userId → audienceCreatorId (battle gift ownership)
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
import {
  isStreamHost,
  readLiveSessionId,
  removeActiveStream,
  resolveStreamOwnerUserId,
} from "../routes/livestream";
import {
  isLiveKitConfigured,
  isUserPublishingInRoom,
  revokeParticipantPublish,
  roomHasActivePublisher,
  type PublishRevocation,
} from "../services/livekit";
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
  valkeyTrySet,
  valkeyGet,
  valkeyTryGet,
  valkeyDel,
  valkeySadd,
  valkeySrem,
  valkeySmembers,
  valkeyTrySetNx,
  valkeyExpire,
  valkeyExistsBatch,
  valkeyHincrby,
  valkeyHget,
  valkeyHset,
  valkeyHdel,
  valkeyHgetall,
} from "../lib/valkey";
import { getPool } from "../lib/postgres";
import { createCoalescedWriter } from "../lib/coalescedWriter";
import {
  buildBattleStateForRoom,
  finalizeBattle,
  getBattleFromStore,
  getUserBattleRoom,
  removeBattleParticipant,
} from "./battle";
import {
  isBattleHost,
  participantOfUser,
  rivalParticipants,
  seatedUserIds,
} from "./battleModel";
import {
  clientReceivesCreatorGiftAudience,
  resolveJoinAudienceCreatorId,
} from "./giftAudience";
import { getGiftGoal } from "./giftGoal";
import {
  clearEngagementActiveRoom,
  getEngagementPublicState,
} from "./engagement";
import {
  clearCreatorCohostRoom,
  getCreatorLiveRoleRoom,
} from "./liveCreatorRole";
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
  /** Creator whose gift/chat audience this socket belongs to (battle: per-creator). */
  audienceCreatorId: string;
}

const INSTANCE_ID = randomUUID();
const ROOM_MEMBER_TTL = 3600;
/**
 * Room membership is a Valkey SET, but a SET alone cannot tell a live socket
 * from one that died without a close event (instance restart, killed mobile
 * app, network drop on another node). Those ghosts stayed in the set for the
 * whole live — the host saw "1 viewer" with an empty spectator list. Each
 * member therefore also holds a short-lived presence key refreshed by the WS
 * heartbeat; membership without presence is stale and is swept on read.
 */
const ROOM_PRESENCE_TTL_MS = 90_000;

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
        "wsRateCheck: Valkey not configured — denying WS event",
      );
    }
    return false;
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

/** True when userId already receives room broadcasts for this live (local socket or Valkey member set). */
export async function isUserInRoomAudience(
  roomId: string,
  userId: string,
): Promise<boolean> {
  if (!roomId || !userId) return false;
  const room = rooms.get(roomId);
  if (
    room &&
    Array.from(room).some(
      (c) => c.userId === userId && c.ws.readyState === WebSocket.OPEN,
    )
  ) {
    return true;
  }
  if (isValkeyConfigured()) {
    try {
      const members = await valkeySmembers(`room:members:${roomId}`);
      return members.includes(userId);
    } catch {
      return false;
    }
  }
  return false;
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

/**
 * Gift / gift-chat visuals for ONE creator audience in a battle room.
 * Sends to the target creator and spectators stamped to that creator only.
 * Battle score events must keep using broadcastToRoom — teammates share score,
 * not gifts.
 */
export function broadcastToCreatorAudience(
  roomId: string,
  targetCreatorId: string,
  event: string,
  data: unknown,
): void {
  const target = String(targetCreatorId || "").trim();
  if (!roomId || !target) return;

  const room = rooms.get(roomId);
  const ts = new Date().toISOString();
  let message: string;
  try {
    message = JSON.stringify({ event, data, timestamp: ts });
  } catch (error) {
    logger.error({ err: error }, "Failed to serialize creator-audience message");
    return;
  }

  if (room) {
    room.forEach((client) => {
      if (
        client.ws.readyState === WebSocket.OPEN &&
        clientReceivesCreatorGiftAudience(client, target)
      ) {
        try {
          client.ws.send(message);
        } catch (error) {
          logger.error({ err: error }, "Failed to send to creator audience");
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
      targetCreatorId: target,
    });
  }
}

const AUDIENCE_KEY_PREFIX = "room:audience:";
const AUDIENCE_TTL_SEC = 600;

function audienceKey(roomId: string): string {
  return AUDIENCE_KEY_PREFIX + roomId;
}

/** Stamp spectators of a creator onto the battle room before they are redirected. */
export async function transferLiveAudienceToBattleRoom(
  fromRoomId: string,
  creatorUserId: string,
  battleRoomId: string,
): Promise<void> {
  const from = String(fromRoomId || "").trim();
  const creator = String(creatorUserId || "").trim();
  const battle = String(battleRoomId || "").trim();
  if (!from || !creator || !battle || from === battle) return;

  const members = await listRoomMemberUserIds(from);
  const spectators = members.filter((id) => id && id !== creator);
  if (spectators.length === 0) return;

  if (isValkeyConfigured()) {
    const key = audienceKey(battle);
    for (const userId of spectators) {
      await valkeyHset(key, userId, creator);
    }
    await valkeyExpire(key, AUDIENCE_TTL_SEC);
  }

  const battleRoom = rooms.get(battle);
  if (battleRoom) {
    for (const client of battleRoom) {
      if (spectators.includes(client.userId)) {
        client.audienceCreatorId = creator;
      }
    }
  }
}

async function persistAudienceOwner(
  roomId: string,
  userId: string,
  creatorId: string,
): Promise<void> {
  if (!isValkeyConfigured() || !roomId || !userId || !creatorId) return;
  const key = audienceKey(roomId);
  await valkeyHset(key, userId, creatorId);
  await valkeyExpire(key, AUDIENCE_TTL_SEC);
}

async function readStampedAudienceOwner(
  roomId: string,
  userId: string,
): Promise<string | null> {
  if (!isValkeyConfigured() || !roomId || !userId) return null;
  const stamped = await valkeyHget(audienceKey(roomId), userId);
  return stamped && stamped.trim() ? stamped.trim() : null;
}

// ── Transaction dedup (Valkey-only) ──────────────────────────────

/**
 * Atomic claim: SET NX ensures only one worker/request can claim a transaction.
 *
 * Three outcomes, deliberately distinct. "duplicate" means someone already holds
 * the claim, so the effect has been (or is being) applied and reporting success is
 * honest. "unavailable" means Valkey could not answer, so nothing is known: the
 * caller must not report the gift as delivered, because the money is already
 * committed by then.
 */
export async function tryClaimTransaction(
  transactionId: string,
  timestamp: number,
): Promise<{
  status: "claimed" | "duplicate" | "unavailable";
  existingTimestamp?: number;
}> {
  if (!isValkeyConfigured()) {
    if (!_warnedTryClaimNoValkey) {
      _warnedTryClaimNoValkey = true;
      logger.warn(
        "tryClaimTransaction: Valkey not configured — dedupe unavailable.",
      );
    }
    return { status: "unavailable" };
  }
  const key = `txn:${transactionId}`;
  const outcome = await valkeyTrySetNx(key, String(timestamp), 300_000);
  if (outcome === "set") return { status: "claimed" };
  if (outcome === "unavailable") {
    logger.error(
      { transactionId },
      "tryClaimTransaction: Valkey unreachable — cannot claim or confirm duplicate",
    );
    return { status: "unavailable" };
  }
  const val = await valkeyGet(key);
  return { status: "duplicate", existingTimestamp: val ? Number(val) : undefined };
}

export async function releaseTransactionClaim(transactionId: string): Promise<void> {
  const id = String(transactionId || "").trim();
  if (!id) return;
  if (!isValkeyConfigured()) return;
  await valkeyDel(`txn:${id}`);
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
): Promise<{
  coHosts: unknown[];
  hostUserId: string;
  layoutId?: string;
  featuredUserId?: string | null;
} | null> {
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

/**
 * Read the seat table for a caller that is about to rewrite it.
 *
 * `getCohostLayout` answers `null` both for "this room has no seats" and for
 * "Valkey did not answer", which is safe for a reader but not for a writer: a
 * failed read taken as an empty stage would let the next write erase every
 * occupied seat.
 */
export async function tryGetCohostLayout(roomId: string): Promise<
  | {
      status: "ok";
      layout: {
        coHosts: unknown[];
        hostUserId: string;
        layoutId?: string;
        featuredUserId?: string | null;
      } | null;
    }
  | { status: "unavailable" }
> {
  if (!isValkeyConfigured()) return { status: "unavailable" };
  const read = await valkeyTryGet(`cohost:${roomId}`);
  if (read.status === "unavailable") return { status: "unavailable" };
  if (!read.value) return { status: "ok", layout: null };
  try {
    return { status: "ok", layout: JSON.parse(read.value) };
  } catch {
    // Unparseable value: the room has no usable seat table, which is a real
    // (empty) state rather than an outage.
    return { status: "ok", layout: null };
  }
}

export async function setCohostLayout(
  roomId: string,
  coHosts: unknown[],
  hostUserId: string,
  layoutId?: string | null,
  featuredUserId?: string | null,
): Promise<"ok" | "unavailable"> {
  if (!isValkeyConfigured()) return "unavailable";
  return valkeyTrySet(
    `cohost:${roomId}`,
    JSON.stringify({
      coHosts,
      hostUserId,
      ...(typeof layoutId === 'string' && layoutId.trim()
        ? { layoutId: layoutId.trim() }
        : {}),
      ...(typeof featuredUserId === 'string' && featuredUserId.trim()
        ? { featuredUserId: featuredUserId.trim() }
        : { featuredUserId: null }),
    }),
    // Seats must outlive quiet periods: the table has to stay valid for as long
    // as the publish grants it authorises, or a long live would lose its stage.
    COHOST_GRANT_TTL_MS,
  );
}

export async function deleteCohostLayout(roomId: string): Promise<void> {
  if (!isValkeyConfigured()) return;
  await valkeyDel(`cohost:${roomId}`);
  await valkeyDel(`cohost:req:${roomId}`);
  await clearCohostPublishGrants(roomId);
}

export type CohostJoinRequest = {
  requesterUserId: string;
  requesterName: string;
  requesterAvatar: string;
  createdAt: number;
};

export async function upsertCohostJoinRequest(
  roomId: string,
  requesterUserId: string,
  requesterName: string,
  requesterAvatar: string,
): Promise<void> {
  if (!roomId || !requesterUserId) return;
  if (!isValkeyConfigured()) return;
  const now = Date.now();
  const key = `cohost:req:${roomId}`;
  await valkeyHset(
    key,
    requesterUserId,
    JSON.stringify({
      requesterUserId,
      requesterName,
      requesterAvatar,
      createdAt: now,
    } satisfies CohostJoinRequest),
  );
  await valkeyExpire(key, 6 * 60 * 60);
}

export async function deleteCohostJoinRequest(
  roomId: string,
  requesterUserId: string,
): Promise<void> {
  if (!roomId || !requesterUserId) return;
  if (!isValkeyConfigured()) return;
  await valkeyHdel(`cohost:req:${roomId}`, requesterUserId);
}

export async function listCohostJoinRequests(roomId: string): Promise<CohostJoinRequest[]> {
  if (!roomId) return [];
  if (!isValkeyConfigured()) return [];
  const rows = await valkeyHgetall(`cohost:req:${roomId}`);
  const requests: CohostJoinRequest[] = [];
  for (const raw of Object.values(rows)) {
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as Partial<CohostJoinRequest>;
      const requesterUserId = String(parsed.requesterUserId || "").trim();
      if (!requesterUserId) continue;
      requests.push({
        requesterUserId,
        requesterName: String(parsed.requesterName || "User"),
        requesterAvatar: String(parsed.requesterAvatar || ""),
        createdAt: Number(parsed.createdAt) || 0,
      });
    } catch {
      // ignore malformed rows
    }
  }
  requests.sort((a, b) => a.createdAt - b.createdAt);
  return requests;
}

// ── Room live likes (shared total for creator + all spectators) ───
// One authoritative counter per room so every client shows the same number.
const LIVE_LIKES_TTL_SEC = 6 * 3600;

export async function getRoomLiveLikes(roomId: string): Promise<number> {
  if (!roomId) return 0;
  if (!isValkeyConfigured()) return 0;
  if (isValkeyConfigured()) {
    const raw = await valkeyHget(`room:meta:${roomId}`, "live_likes");
    if (raw != null) {
      const n = Number(raw);
      if (Number.isFinite(n) && n >= 0) {
        return Math.floor(n);
      }
    }
  }
  return 0;
}

export async function incrementRoomLiveLikes(roomId: string): Promise<number> {
  if (!roomId) return 0;
  if (!isValkeyConfigured()) return 0;
  if (isValkeyConfigured()) {
    const next = await valkeyHincrby(`room:meta:${roomId}`, "live_likes", 1);
    if (next > 0) {
      void valkeyExpire(`room:meta:${roomId}`, LIVE_LIKES_TTL_SEC);
      return next;
    }
  }
  return 0;
}

// ── Co-host publish grants (host-authorized) ─────────────────────
// Recorded when a seat is ACCEPTED (host accepts a request, or an invited user
// accepts), and checked before a publish LiveKit token is issued. This makes
// publishing server-authoritative instead of trusting a client-supplied
// "?cohost=1" URL flag. An invite on its own is an offer and grants nothing.
const COHOST_GRANT_TTL_MS = 6 * 60 * 60 * 1000; // matches LiveKit token TTL

export async function grantCohostPublish(roomId: string, userId: string): Promise<void> {
  if (!roomId || !userId) return;
  if (!isValkeyConfigured()) return;
  await valkeySet(`cohost_grant:${roomId}:${userId}`, "1", COHOST_GRANT_TTL_MS);
  await valkeySadd(`cohost_grants:${roomId}`, userId);
  await valkeyExpire(`cohost_grants:${roomId}`, Math.ceil(COHOST_GRANT_TTL_MS / 1000));
}

export async function hasCohostPublishGrant(roomId: string, userId: string): Promise<boolean> {
  if (!roomId || !userId) return false;
  if (!isValkeyConfigured()) return false;
  const v = await valkeyGet(`cohost_grant:${roomId}:${userId}`);
  return v === "1";
}

export async function revokeCohostPublish(roomId: string, userId: string): Promise<void> {
  if (!roomId || !userId) return;
  if (!isValkeyConfigured()) return;
  await valkeyDel(`cohost_grant:${roomId}:${userId}`);
  await valkeySrem(`cohost_grants:${roomId}`, userId);
  await clearCreatorCohostRoom(userId, roomId);
}

/**
 * Free one co-host seat's publishing rights: the stored grant (which authorizes
 * the next token) and the permission on the connection they are publishing from
 * right now. Both halves belong together — dropping only the grant leaves a
 * removed co-host on air until their own client stands down.
 *
 * Returns whether the media side is proven silenced. The seat is released either
 * way, because leaving it occupied would be worse, but an unconfirmed revocation
 * is logged as such rather than counted as a completed removal. The server stays
 * authoritative regardless: the grant is gone, so no later token can publish.
 */
export async function releaseCohostPublish(
  roomId: string,
  userId: string,
): Promise<PublishRevocation> {
  await revokeCohostPublish(roomId, userId);
  const media = await revokeParticipantPublish(roomId, userId);
  if (media === "unconfirmed") {
    logger.error(
      { roomId, userId },
      "cohost seat released but LiveKit publish revocation unconfirmed",
    );
  }
  return media;
}

export async function clearCohostPublishGrants(roomId: string): Promise<void> {
  if (!roomId) return;
  if (!isValkeyConfigured()) return;
  const members = await valkeySmembers(`cohost_grants:${roomId}`);
  for (const userId of members) {
    await revokeCohostPublish(roomId, userId);
  }
  await valkeyDel(`cohost_grants:${roomId}`);
}

// ── Battle publish grants (accepted creator opponents only) ──────
// Kept separate from co-host grants so battle participants are never promoted
// into the co-host flow and co-host cleanup cannot revoke a live battle.
const BATTLE_GRANT_TTL_MS = 10 * 60 * 1000;

export async function grantBattlePublish(roomId: string, userId: string): Promise<void> {
  if (!roomId || !userId) {
    throw new Error("battle_grant_invalid");
  }
  if (!isValkeyConfigured()) {
    throw new Error("battle_grant_unavailable");
  }
  await valkeySet(`battle_grant:${roomId}:${userId}`, "1", BATTLE_GRANT_TTL_MS);
  const ok = await hasBattlePublishGrant(roomId, userId);
  if (!ok) {
    throw new Error("battle_grant_write_failed");
  }
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
  /** When set, only the target creator + that creator's stamped spectators receive the event. */
  targetCreatorId?: string;
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
    if (client.ws.readyState !== WebSocket.OPEN) return;
    const targetCreatorId =
      typeof payload.targetCreatorId === "string" ? payload.targetCreatorId.trim() : "";
    if (
      targetCreatorId &&
      !clientReceivesCreatorGiftAudience(client, targetCreatorId)
    ) {
      return;
    }
    try {
      client.ws.send(message);
    } catch {
      logger.debug("ws.send failed — client likely disconnected");
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
        // Notify the client before closing so it can clear local session state.
        try {
          client.ws.send(
            JSON.stringify({
              event: "force_disconnect",
              data: { reason },
              timestamp: new Date().toISOString(),
            }),
          );
        } catch {
          /* ignore — close below */
        }
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

// ── Viewer count (spectators only — authoritative) ─────────────────

/**
 * Persisting the viewer count on every join/leave hammers the DB on hot rooms
 * (one UPDATE per event × many concurrent viewers). The realtime count is served
 * from Valkey room membership minus host/co-host/battle publishers, broadcast
 * immediately; the DB copy only needs to be eventually-consistent for the feed/
 * live list, so coalesce writes per room to a single trailing write that carries
 * the latest value.
 */
const VIEWER_DB_WRITE_DEBOUNCE_MS = 3000;
const viewerCountDbWriter = createCoalescedWriter<number>((roomId, count) => {
  dbUpdateViewerCount(roomId, count).catch((err) => {
    logger.warn({ err, roomId, count }, "dbUpdateViewerCount (coalesced) failed");
  });
}, VIEWER_DB_WRITE_DEBOUNCE_MS);

function roomPresenceKey(roomId: string, userId: string): string {
  return `room:presence:${roomId}:${userId}`;
}

/** Record/refresh this user's live presence in the room (join + heartbeat). */
async function markRoomPresence(roomId: string, userId: string): Promise<void> {
  if (!isValkeyConfigured() || !roomId || !userId) return;
  await valkeySadd(`room:members:${roomId}`, userId);
  await valkeyExpire(`room:members:${roomId}`, ROOM_MEMBER_TTL);
  await valkeySet(roomPresenceKey(roomId, userId), "1", ROOM_PRESENCE_TTL_MS);
}

/**
 * Unique WS member ids in this live room (Valkey SET), pruned to members that
 * still hold a presence key or a socket on this instance. Single source for the
 * spectator count and the spectator list, so the number always matches the list.
 */
async function listRoomMemberUserIds(roomId: string): Promise<string[]> {
  if (!isValkeyConfigured()) return [];
  const ids = await valkeySmembers(`room:members:${roomId}`);
  if (ids.length === 0) return [];
  await valkeyExpire(`room:members:${roomId}`, ROOM_MEMBER_TTL);

  const localUserIds = new Set<string>();
  for (const c of rooms.get(roomId) || []) {
    if (c.ws.readyState === WebSocket.OPEN) localUserIds.add(c.userId);
  }

  const present = await valkeyExistsBatch(
    ids.map((id) => roomPresenceKey(roomId, id)),
  );
  const live: string[] = [];
  const stale: string[] = [];
  ids.forEach((id, i) => {
    if (present[i] || localUserIds.has(id)) live.push(id);
    else stale.push(id);
  });
  if (stale.length > 0) {
    await valkeySrem(`room:members:${roomId}`, ...stale);
  }
  return live;
}

/**
 * User ids that must never appear as spectators (host / co-host publishers /
 * battle creators). Shared by the count and the invite list so they stay aligned.
 */
async function spectatorExcludeUserIds(roomId: string): Promise<Set<string>> {
  const exclude = new Set<string>();
  // Room keys are the host stream id (auth userId). Always exclude that id so a
  // failed owner lookup can never leave the host counted as a spectator.
  if (roomId) exclude.add(roomId);
  try {
    const ownerId = await resolveStreamOwnerUserId(roomId);
    if (ownerId) exclude.add(ownerId);
  } catch {
    /* non-fatal */
  }

  if (isValkeyConfigured()) {
    try {
      const cohosts = await valkeySmembers(`cohost_grants:${roomId}`);
      for (const id of cohosts) exclude.add(id);
    } catch {
      /* non-fatal */
    }
  }

  try {
    const layout = await getCohostLayout(roomId);
    if (layout?.hostUserId) exclude.add(layout.hostUserId);
    if (Array.isArray(layout?.coHosts)) {
      for (const h of layout.coHosts) {
        const uid =
          typeof (h as { userId?: string }).userId === "string"
            ? (h as { userId: string }).userId
            : typeof (h as { id?: string }).id === "string"
              ? (h as { id: string }).id
              : "";
        if (uid) exclude.add(uid);
      }
    }
  } catch {
    /* non-fatal */
  }

  try {
    const battle = await getBattleFromStore(roomId);
    if (battle && battle.status !== "ENDED") {
      for (const uid of seatedUserIds(battle)) exclude.add(uid);
    }
  } catch {
    /* non-fatal */
  }

  return exclude;
}

/** Host, co-host publishers, and battle creators are not counted as spectators. */
async function computeSpectatorViewerCount(roomId: string): Promise<number> {
  const memberIds = await listRoomMemberUserIds(roomId);
  if (memberIds.length === 0) return 0;

  const exclude = await spectatorExcludeUserIds(roomId);
  let count = 0;
  for (const id of memberIds) {
    if (!exclude.has(id)) count += 1;
  }
  return Math.max(0, count);
}

export async function updateViewerCount(roomId: string): Promise<void> {
  const count = await computeSpectatorViewerCount(roomId);
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
  // Which live this grace period belongs to, read now rather than when the timer
  // fires. A creator who drops off and starts again inside the window is running
  // a new live in the same room id, and this timer must not end that one.
  const sessionAtDisconnect = readLiveSessionId(roomId).catch(() => "");
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
        // Do not end For You live presence while media is still up in LiveKit.
        // WS can blip during route/device transitions while the creator keeps
        // publishing tracks; ending here would remove a real live card.
        if (isLiveKitConfigured()) {
          if (await isUserPublishingInRoom(roomId, userId)) return;
          if (await roomHasActivePublisher(roomId)) return;
        }
        const isHost = await isStreamHost(roomId, userId);
        if (!isHost) return;
        const roleRoom = await getCreatorLiveRoleRoom(userId);
        if (roleRoom && roleRoom !== roomId) {
          const battleRoom = await getUserBattleRoom(userId);
          if (battleRoom === roleRoom) {
            await transferLiveAudienceToBattleRoom(roomId, userId, roleRoom);
          }
          logger.info(
            { roomId, userId, roleRoom },
            "Host moved to another live creator role; active stream registration retained",
          );
          return;
        }
        if (!(await removeActiveStream(roomId, userId, await sessionAtDisconnect))) {
          return;
        }
        broadcastToRoom(roomId, "stream_ended", {
          stream_key: roomId,
          host_user_id: userId,
          reason: "host_disconnected",
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
        if (!isBattleHost(battle, userId)) return;
        logger.info(
          { battleRoomId, role: "host" },
          "Battle host gone after grace, ending battle",
        );
        // Finalization freezes the scores, stores the result and revokes the
        // battle publish grants exactly once.
        await finalizeBattle(battleRoomId, "host_disconnect");
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
        if (isBattleHost(battle, userId)) return;
        if (!participantOfUser(battle, userId)) return;

        // Rival creators still seated besides the one who dropped.
        const remainingRivals = rivalParticipants(battle).filter(
          (p) => p.userId !== userId,
        );

        await revokeBattlePublish(battleRoomId, userId);

        if (remainingRivals.length === 0) {
          logger.info(
            { battleRoomId, userId },
            "Battle opponent gone after grace, resolving battle from current scores",
          );
          await finalizeBattle(battleRoomId, "participant_disconnect");
        } else {
          logger.info(
            { battleRoomId, userId },
            "Battle creator gone after grace, removing from match (others continue)",
          );
          await removeBattleParticipant(battleRoomId, userId);
          // Seat freed — clients refresh Invite Creator from authoritative roster.
          broadcastToRoom(battleRoomId, "battle_invite_roster_invalidate", {
            streamKey: battleRoomId,
            freedUserId: userId,
          });
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
    const memberIds = await listRoomMemberUserIds(roomId);
    if (memberIds.length === 0) return [];
    const exclude = await spectatorExcludeUserIds(roomId);
    const spectatorIds = memberIds.filter((id) => !exclude.has(id));
    if (spectatorIds.length === 0) return [];

    const capped = spectatorIds.slice(0, MAX_VIEWER_LIST);
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
  const exclude = await spectatorExcludeUserIds(roomId);
  const seenUserIds = new Set<string>();
  const viewers: {
    user_id: string;
    username: string;
    display_name: string;
    avatar_url: string;
    level: number;
    country: string;
    audienceCreatorId: string;
  }[] = [];
  for (const c of room) {
    if (seenUserIds.has(c.userId) || exclude.has(c.userId)) continue;
    seenUserIds.add(c.userId);
    viewers.push({
      user_id: c.userId,
      username: c.username,
      display_name: c.displayName,
      avatar_url: c.avatarUrl,
      level: c.level,
      country: c.country,
      audienceCreatorId: c.audienceCreatorId || "",
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
            await valkeyDel(roomPresenceKey(client.roomId, client.userId));
            // Do NOT revokeCohostPublish here — brief WS reconnects (cohost
            // publish token upgrade, mobile blips) must keep the grant. Grants
            // are revoked only when the host removes the seat via layout sync
            // or when the live ends (deleteCohostLayout).
          }

          // Only announce leave when this user has no other open socket in the room
          // (prevents false -1 on clients during brief WS reconnect / second tab).
          if (!userStillInRoom) {
            broadcastToRoom(client.roomId, "user_left", {
              user_id: client.userId,
              username: client.username,
              avatar_url: client.avatarUrl,
            });
          }

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
              const isHost = isBattleHost(battle, client.userId);
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
      const queryAudienceCreatorId = url.searchParams.get("audienceCreatorId");

      if (!roomId && url.pathname.startsWith("/live/")) {
        roomId = url.pathname.split("/")[2];
      }

      if (!roomId || !token) {
        ws.close(1008, "Missing room or token");
        return;
      }
      if (!isValkeyConfigured()) {
        ws.close(1013, "Realtime backend unavailable");
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
        if (session?.state === "unavailable") {
          // Temporary backend/state outage: use 1013 so client reconnect logic
          // can retry instead of treating this as a permanent policy/auth failure.
          ws.close(1013, "Session validation unavailable");
          return;
        }
        const reason = session?.state === "banned" ? "Banned" : "Session revoked";
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
          audienceCreatorId: "",
        };
        clients.set(ws, client);
        // Register on the user channel so global events (call_invite, force_disconnect,
        // owner-targeted chat/gifts) reach users who are only on the feed socket.
        if (!userClients.has(userId)) {
          userClients.set(userId, new Set());
          subscribeUserChannel(userId);
        }
        (userClients.get(userId) as Set<Client>).add(client);
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
        audienceCreatorId: hostUserId || userId,
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

      await markRoomPresence(roomId, userId);

      try {
        const battleOnJoin = await getBattleFromStore(roomId);
        const stamped = await readStampedAudienceOwner(roomId, userId);
        client.audienceCreatorId = resolveJoinAudienceCreatorId({
          userId,
          queryAudienceCreatorId,
          stampedAudienceCreatorId: stamped,
          streamOwnerUserId: hostUserId,
          battle: battleOnJoin,
        });
        await persistAudienceOwner(roomId, userId, client.audienceCreatorId);
      } catch (err) {
        logger.warn({ err, roomId, userId }, "ws: audience owner resolve failed");
      }

      // Host/battle participant reconnected within grace — keep live + battle up.
      cancelHostDisconnectGrace(roomId, userId);
      cancelBattleDisconnectGrace(roomId, userId);

      const viewers = await buildViewerList(roomId);

      const spectatorCount = await computeSpectatorViewerCount(roomId);

      sendToClient(client, "connected", {
        room_id: roomId,
        user_count: spectatorCount,
        viewer_count: spectatorCount,
        count: spectatorCount,
      });

      sendToClient(client, "room_state", {
        viewers,
        live_likes: await getRoomLiveLikes(roomId),
      });

      const lastCohost = await getCohostLayout(roomId);
      if (lastCohost) {
        sendToClient(client, "cohost_layout_sync", {
          coHosts: lastCohost.coHosts,
          hostUserId: lastCohost.hostUserId,
          featuredUserId:
            typeof lastCohost.featuredUserId === "string" && lastCohost.featuredUserId.trim()
              ? lastCohost.featuredUserId.trim()
              : null,
          ...(typeof lastCohost.layoutId === "string" && lastCohost.layoutId
            ? { layoutId: lastCohost.layoutId }
            : {}),
        });
      }
      try {
        if (await isStreamHost(roomId, userId)) {
          const queued = await listCohostJoinRequests(roomId);
          for (const req of queued) {
            sendToClient(client, "cohost_request", {
              requesterUserId: req.requesterUserId,
              requesterName: req.requesterName,
              requesterAvatar: req.requesterAvatar,
            });
          }
        }
      } catch (queueErr) {
        logger.warn({ err: queueErr, roomId, userId }, "ws: cohost request queue replay failed");
      }

      const userAlreadyPresent = Array.from(rooms.get(roomId) || []).some(
        (c) =>
          c.userId === client.userId &&
          c.ws !== client.ws &&
          c.ws.readyState === WebSocket.OPEN,
      );
      if (!userAlreadyPresent) {
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
            audienceCreatorId: client.audienceCreatorId || "",
          },
          client,
        );
      }

      await updateViewerCount(roomId);

      // Reconnect / late join: the SAME state builder as battle_get_state and
      // battle_state_sync, reading the same live score hash. A reconnecting
      // client cannot receive a stale score copy or start its own timer.
      const battleStateOnJoin = await buildBattleStateForRoom(roomId);
      if (battleStateOnJoin && battleStateOnJoin.status !== "ENDED") {
        sendToClient(client, "battle_state_sync", battleStateOnJoin);
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
        const raw = data.toString();
        // Legacy/plain keepalive from older clients: bare "ping" text.
        if (raw === "ping" || raw === '"ping"') {
          try {
            ws.send(JSON.stringify({ event: "pong", data: { t: Date.now() }, timestamp: new Date().toISOString() }));
          } catch {
            /* ignore send failures on closing sockets */
          }
          return;
        }
        let parsed;
        try {
          parsed = JSON.parse(raw);
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
      // Keep this socket's room presence alive so the spectator sweep only
      // drops members whose connection is really gone.
      const c = clients.get(ws);
      if (c && c.roomId && c.roomId !== "__feed__") {
        markRoomPresence(c.roomId, c.userId).catch((err) => {
          logger.warn({ err, roomId: c.roomId }, "room presence refresh failed");
        });
      }
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
