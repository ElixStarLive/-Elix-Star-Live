import {
  Client,
  broadcastToRoom,
  sendToClient,
  sendToUserGlobal,
  incrementRoomLiveLikes,
  updateViewerCount,
  transferLiveAudienceToBattleRoom,
} from "./index";
import { logger } from "../lib/logger";
import { setCreatorCohostRoom } from "./liveCreatorRole";
import {
  addBattleScore,
  broadcastBattleState,
  buildBattleStateForRoom,
  claimBattleSeat,
  claimBattleVoteOnce,
  clearPendingBattleInvites,
  confirmBattleParticipantPresence,
  ensureBattleForHost,
  finalizeBattle,
  getBattleFromStore,
  hasBattleAcceptedGrant,
  hasBattleInvite,
  removeBattleParticipant,
  setBattleAcceptedGrant,
  setBattleInvite,
  setUserBattleRoom,
  getUserBattleRoom,
  clearBattleInvite,
  startBattleIfReady,
} from "./battle";
import {
  battleOpenSeatCount,
  isBattleExpired,
  isBattleHost,
  isBattleScorable,
  isBattleSeat,
  participantAtSeat,
  participantOfUser,
  rivalParticipants,
  seatedUserIds,
  teamOfSeat,
} from "./battleModel";
import {
  normalizeRequestedBattleSeat,
  resolveValidatedGiftRecipient,
} from "./giftRecipient";
import { creditTestCoins, debitTestCoins } from "../lib/testCoinsBalance";
import {
  broadcastToFeedSubscribers,
} from "../feedBroadcast";
import { removeActiveStream, resolveStreamOwnerUserId, isStreamHost, listActiveLiveStreams } from "../routes/livestream";
import {
  grantParticipantPublish,
  isLiveKitConfigured,
  isUserPublishingInRoom,
  revokeParticipantPublish,
  type PublishUpgrade,
} from "../services/livekit";
import {
  wsRateCheck,
  upsertCohostJoinRequest,
  deleteCohostJoinRequest,
  listCohostJoinRequests,
  grantBattlePublish,
  hasBattlePublishGrant,
  grantCohostPublish,
  revokeBattlePublish,
  releaseCohostPublish,
} from "./index";
import { mutateCohostSeats } from "./cohostSeatStore";
import {
  MAX_COHOST_SLOTS,
  removeCohostSlot,
  upsertCohostSlot,
} from "./cohostSlots";
import { randomUUID } from "crypto";
import {
  clearGiftGoal,
  setGiftGoal,
} from "./giftGoal";
import {
  claimWatchTick,
  getEngagementPublicState,
  recordEngagementAction,
  setEngagementFeatures,
  setEngagementPoll,
  startMysteryCountdown,
  voteEngagementPoll,
  type EngagementFeatures,
} from "./engagement";
import { awardLiveWatchXp } from "../lib/awardLiveWatchXp";
import { dbIsBlockedEitherWay, dbGetLiveStreams, getPool } from "../lib/postgres";
import { activateBooster, getMistFogDurationMs } from "../lib/booster";
import { isValkeyConfigured } from "../lib/valkey";
import { deliverVerifiedGift, emitGiftSentToTargetAudience } from "./giftDelivery";
import {
  isTestCoinsGiftSource,
  canAcceptTestCoinsBattleScore,
} from "./testCoinsPolicy";

const BATTLE_USER_ROOM_TTL_MS = 600_000;

/** Why the server refused to start a battle (existing client-facing wording). */
const BATTLE_START_ERROR_MESSAGES = {
  not_waiting: "Battle already running",
  no_rivals: "Opponent must accept before starting",
  incomplete_teams: "2v2 needs four creators — invite one more",
  not_ready: "Waiting for creators to connect",
  unavailable: "Realtime backend unavailable",
} as const;

/**
 * Battle is creator vs creator: an invite target — and, again, an accepter —
 * must be a real creator live right now. One check shared by invite send and
 * invite accept so eligibility cannot drift between the two.
 *
 * When LiveKit is configured this is authoritative: the creator must actually
 * be PUBLISHING in their own room, so a stale "live" record cannot pass and a
 * spectator can never qualify.
 */
async function isCreatorEligibleForBattle(
  userId: string,
  roomHint: string,
): Promise<boolean> {
  if (!userId) return false;
  const room = roomHint && roomHint.trim() ? roomHint.trim() : userId;
  if (isLiveKitConfigured()) {
    if (await isUserPublishingInRoom(room, userId)) return true;
    if (room !== userId && (await isUserPublishingInRoom(userId, userId))) {
      return true;
    }
    return false;
  }
  if (await isStreamHost(userId, userId)) return true;
  try {
    const liveRows = await dbGetLiveStreams();
    return liveRows.some((r) => r.user_id === userId);
  } catch (err) {
    logger.warn({ err, userId }, "isCreatorEligibleForBattle live lookup failed");
    return false;
  }
}

/**
 * A creator's OWN live room, from the server's live registration.
 * Used for battle seat media/audience mapping so no client can claim to be
 * broadcasting from someone else's room.
 */
async function resolveCreatorOwnStreamKey(userId: string): Promise<string> {
  if (!userId) return "";
  try {
    const rows = await dbGetLiveStreams();
    const row = rows.find((r) => r.user_id === userId);
    const key = row?.stream_key ? String(row.stream_key).trim() : "";
    if (key) return key;
  } catch (err) {
    logger.warn({ err, userId }, "resolveCreatorOwnStreamKey lookup failed");
  }
  return userId;
}

/**
 * Turn a written co-host seat into real publishing rights, or give the seat
 * back.
 *
 * A seat and a publish permission are one decision recorded in two systems: the
 * stored grant authorises the next token, and the LiveKit upgrade lets the
 * connection they are already watching from go live. If either half cannot be
 * confirmed, seating them anyway would put a tile on everyone's stage for
 * someone who may never be able to speak — a co-host in the seat table and a
 * muted spectator in the room. So the seat is withdrawn and the host is left
 * able to try again, instead of the stage carrying a promise the rest of the
 * system never made.
 *
 * A user who has not joined yet is not a failure: their join token reads the
 * stored grant, so the seat is honoured the moment they arrive.
 */
type CohostSeatGrant = {
  upgrade: PublishUpgrade;
  /** The seat table after withdrawal, or null when the seat still stands. */
  rolledBack: {
    seats: unknown[];
    featuredUserId?: string | null;
    layoutId?: string;
  } | null;
};

async function seatCohostPublish(
  roomId: string,
  hostUserId: string,
  cohostUserId: string,
): Promise<CohostSeatGrant> {
  const stored = await grantCohostPublish(roomId, cohostUserId);
  const upgrade = stored
    ? await grantParticipantPublish(roomId, cohostUserId)
    : "unconfirmed";
  if (upgrade !== "unconfirmed") return { upgrade, rolledBack: null };
  logger.error(
    { roomId, hostUserId, cohostUserId, stored },
    stored
      ? "cohost seat rolled back: LiveKit publish upgrade unconfirmed"
      : "cohost seat rolled back: publish grant was not stored",
  );
  await releaseCohostPublish(roomId, cohostUserId);
  const withdrawn = await mutateCohostSeats(roomId, hostUserId, (seats) => {
    const next = removeCohostSlot(seats, cohostUserId);
    return { slots: next.slots, changed: next.removed };
  });
  return {
    upgrade,
    rolledBack: {
      seats: withdrawn.status === "applied" ? withdrawn.seats : [],
      featuredUserId:
        withdrawn.status === "applied" ? withdrawn.featuredUserId : null,
      layoutId: withdrawn.status === "applied" ? withdrawn.layoutId : undefined,
    },
  };
}

function ensureBattleInfra(client: Client): boolean {
  if (isValkeyConfigured()) return true;
  sendToClient(client, "battle_error", {
    message: "Realtime backend unavailable",
    reason: "backend_unavailable",
  });
  return false;
}

function ensureCohostInfra(client: Client): boolean {
  if (isValkeyConfigured()) return true;
  sendToClient(client, "error", {
    message: "Cohost realtime backend unavailable",
    reason: "backend_unavailable",
  });
  return false;
}

/**
 * Authoritative Invite Creator list for a battle room — same source for every
 * seated creator. Excludes anyone already in a battle seat.
 */
async function publishBattleInviteRoster(
  roomId: string,
  toClient?: Client,
): Promise<void> {
  try {
    const battle = await getBattleFromStore(roomId);
    const seated = new Set(battle ? seatedUserIds(battle) : []);
    const ownerId = await resolveStreamOwnerUserId(roomId);
    if (ownerId) seated.add(ownerId);

    const listed = await listActiveLiveStreams();
    let dbRows: Array<{ stream_key: string; user_id: string; display_name?: string | null }> = [];
    try {
      dbRows = await dbGetLiveStreams();
    } catch (err) {
      logger.warn({ err, roomId }, "publishBattleInviteRoster: live_streams lookup failed");
    }
    const byUser = new Map<string, { stream_key: string; user_id: string; display_name?: string | null }>();
    for (const r of [...listed.streams, ...dbRows]) {
      const uid = typeof r.user_id === "string" ? r.user_id.trim() : "";
      if (!uid || seated.has(uid)) continue;
      if (!byUser.has(uid)) {
        byUser.set(uid, {
          stream_key: (r.stream_key && String(r.stream_key).trim()) || uid,
          user_id: uid,
          display_name: r.display_name,
        });
      }
    }
    const eligible = [...byUser.values()];
    const ids = eligible.map((r) => r.user_id).filter(Boolean);
    const profileById = new Map<
      string,
      { display_name?: string | null; username?: string | null; avatar_url?: string | null }
    >();
    const pool = getPool();
    if (pool && ids.length > 0) {
      try {
        const pr = await pool.query(
          `SELECT user_id, display_name, username, avatar_url
             FROM profiles
            WHERE user_id = ANY($1::text[])`,
          [ids],
        );
        for (const p of pr.rows as Array<{
          user_id?: string;
          display_name?: string | null;
          username?: string | null;
          avatar_url?: string | null;
        }>) {
          const uid = typeof p.user_id === "string" ? p.user_id.trim() : "";
          if (uid) profileById.set(uid, p);
        }
      } catch (err) {
        logger.warn({ err, roomId }, "publishBattleInviteRoster: profile enrich failed");
      }
    }
    const creators = eligible.map((r) => {
      const prof = profileById.get(r.user_id);
      const name =
        (typeof prof?.display_name === "string" && prof.display_name.trim()) ||
        (typeof prof?.username === "string" && prof.username.trim()) ||
        (r.display_name && String(r.display_name).trim()) ||
        "Creator";
      const avatar =
        typeof prof?.avatar_url === "string" && prof.avatar_url.trim()
          ? prof.avatar_url.trim()
          : "";
      return {
        id: r.user_id,
        streamKey: r.stream_key || r.user_id,
        name,
        username: name,
        avatar,
        isLive: true,
      };
    });

    const payload = { streamKey: roomId, creators };
    if (toClient) {
      sendToClient(toClient, "battle_invite_roster", payload);
    } else {
      broadcastToRoom(roomId, "battle_invite_roster", payload);
    }
  } catch (err) {
    logger.error({ err, roomId }, "publishBattleInviteRoster failed");
    const payload = { streamKey: roomId, creators: [] as unknown[], error: "roster_unavailable" };
    if (toClient) {
      sendToClient(toClient, "battle_invite_roster", payload);
    } else {
      broadcastToRoom(roomId, "battle_invite_roster", payload);
    }
  }
}

/** After a seat frees or fills, sync Invite Creator panels for everyone in-room. */
async function afterBattleSeatChange(roomId: string): Promise<void> {
  const battle = await getBattleFromStore(roomId);
  if (battle && battle.status !== "ENDED" && battleOpenSeatCount(battle) === 0) {
    const expired = await clearPendingBattleInvites(roomId);
    for (const targetUserId of expired) {
      sendToUserGlobal(targetUserId, "battle_invite_expired", {
        streamKey: roomId,
        reason: "battle_full",
      });
    }
  }
  await publishBattleInviteRoster(roomId);
}

/**
 * Verify that a WS gift event corresponds to a real, paid gift transaction
 * recorded by the REST /api/gifts/send endpoint for THIS user. Returns the
 * authoritative gift_id/coins from the database, or null if unverified.
 * This makes gift broadcasts, gift goals, and battle scoring impossible to
 * forge from the client (no free gifts / free battle points).
 */
async function verifyGiftTransaction(
  transactionId: unknown,
  userId: string,
  roomId: string,
): Promise<{
  giftId: string;
  coins: number;
  roomId: string;
  giftSource: "starter_coins" | "paid_coins" | "promotional_coins";
} | null> {
  if (typeof transactionId !== "string" || !transactionId.trim()) return null;
  if (!roomId) return null;
  const pool = getPool();
  if (!pool) return null;
  try {
    const r = await pool.query(
      `SELECT gift_id, coins, room_id, gift_source
         FROM elix_gift_transactions
        WHERE client_transaction_id = $1
          AND user_id = $2
          AND room_id = $3
          AND created_at > NOW() - INTERVAL '2 minutes'
        LIMIT 1`,
      [transactionId.trim(), userId, roomId],
    );
    const row = r.rows[0] as
      | {
          gift_id?: string;
          coins?: number;
          room_id?: string;
          gift_source?: string;
        }
      | undefined;
    if (!row) return null;
    const source =
      row.gift_source === "starter_coins"
        ? "starter_coins"
        : row.gift_source === "promotional_coins"
          ? "promotional_coins"
          : "paid_coins";
    return {
      giftId: String(row.gift_id || ""),
      coins: Number(row.coins) || 0,
      roomId: String(row.room_id || ""),
      giftSource: source,
    };
  } catch (err) {
    logger.warn({ err, userId }, "verifyGiftTransaction failed");
    return null;
  }
}

export async function handleMessage(
  client: Client,
  event: string,
  data,
): Promise<void> {
  if (!data) data = {};

  try {
    switch (event) {
      case "chat_message":
        if (!(await wsRateCheck(client.userId, "chat", 100, 10_000))) break;
        {
          const hostUserId = await resolveStreamOwnerUserId(client.roomId);
          if (
            hostUserId &&
            hostUserId !== client.userId &&
            (await dbIsBlockedEitherWay(client.userId, hostUserId))
          ) {
            break;
          }
          const messageId = typeof data?.messageId === "string" && data.messageId ? data.messageId : randomUUID();
          const rawText =
            typeof data?.text === "string"
              ? data.text
              : typeof data?.message === "string"
                ? data.message
                : "";
          const text = String(rawText).slice(0, 500);
          const avatar =
            (typeof client.avatarUrl === "string" && client.avatarUrl.trim()) ||
            (typeof data?.avatar === "string" && data.avatar.trim()) ||
            (typeof data?.avatar_url === "string" && data.avatar_url.trim()) ||
            "";
          const level =
            Number.isFinite(Number(data?.level)) && Number(data.level) >= 0
              ? Math.floor(Number(data.level))
              : Number.isFinite(Number(client.level)) && Number(client.level) >= 0
                ? Math.floor(Number(client.level))
                : 1;
          const payload = {
            text,
            message: text,
            messageId,
            user_id: client.userId,
            username: client.username || client.displayName || "User",
            avatar,
            avatar_url: avatar,
            level,
            timestamp: new Date().toISOString(),
          };
          broadcastToRoom(client.roomId, "chat_message", payload);
          // Also push to the stream owner globally so the creator still sees
          // spectator chat if their WS room id ever drifts from the spectator
          // room id (same safety net gifts already use). Client dedupes by
          // messageId so an in-room owner never sees the line twice.
          if (hostUserId && hostUserId !== client.userId) {
            sendToUserGlobal(hostUserId, "chat_message", payload);
          }
          sendToClient(client, "chat_ack", { messageId, status: "delivered" });
          void recordEngagementAction({
            roomId: client.roomId,
            userId: client.userId,
            username: client.username,
            avatarUrl: client.avatarUrl || "",
            type: "comment",
          }).then(async (r) => {
            if (r.stageUnlocked) {
              broadcastToRoom(client.roomId, "engagement_stage_unlock", {
                stage: r.communityStage,
              });
            }
            const pub = await getEngagementPublicState(client.roomId, null);
            broadcastToRoom(client.roomId, "engagement_sync", pub);
          });
        }
        break;

      case "heart_sent":
        if (!(await wsRateCheck(client.userId, "heart", 30, 2_000))) break;
        {
          const liveLikes = await incrementRoomLiveLikes(client.roomId);
          broadcastToRoom(client.roomId, "heart_sent", {
            user_id: client.userId,
            username: data?.username || client.username,
            avatar: data?.avatar || "",
            live_likes: liveLikes,
            timestamp: new Date().toISOString(),
          });
        }
        void recordEngagementAction({
          roomId: client.roomId,
          userId: client.userId,
          username: client.username,
          avatarUrl: client.avatarUrl || "",
          type: "like",
        }).then(async (r) => {
          if (r.stageUnlocked) {
            broadcastToRoom(client.roomId, "engagement_stage_unlock", {
              stage: r.communityStage,
            });
          }
          const pub = await getEngagementPublicState(client.roomId, null);
          broadcastToRoom(client.roomId, "engagement_sync", pub);
        });
        break;

      case "gift_sent": {
        if (!(await wsRateCheck(client.userId, "gift", 50, 5_000))) break;
        const { transactionId } = data;
        // Client correlation id: the sender waits for THIS gift's verdict before
        // playing anything, so an ack can never be applied to another gift.
        const giftRequestId =
          typeof data?.requestId === "string" ? data.requestId : null;

        // TEST COINS = BATTLE GAME SCORE ONLY (£0 money).
        // Animation + battle VS points. NEVER wallet / earnings / 60-40 / Stripe /
        // payout / paidCoinLots / IAP settlement / gift-goal paid progression.
        if (isTestCoinsGiftSource(data)) {
          if (!canAcceptTestCoinsBattleScore()) {
            sendToClient(client, "gift_ack", {
              transactionId: null,
              requestId: giftRequestId,
              status: "test_coins_blocked",
              timestamp: Date.now(),
            });
            break;
          }
          const testGiftId = typeof data?.giftId === "string" ? data.giftId : "";
          const testClientVideo =
            (typeof data?.video === "string" && data.video) ||
            (typeof data?.animation_url === "string" && data.animation_url) ||
            null;
          const { resolvePlayableGiftVideoUrl, getGiftValue } =
            await import("./giftRegistry");
          // Cost and points come from the server catalog, never from the client.
          const testPoints = Math.max(0, getGiftValue(testGiftId) || 0);
          if (!testGiftId || testPoints <= 0) {
            sendToClient(client, "gift_ack", {
              transactionId: null,
              requestId: giftRequestId,
              status: "invalid_gift",
              origin: "test_coins",
              financialValueGbp: 0,
              timestamp: Date.now(),
            });
            break;
          }
          // The SERVER owns the test balance. Debit atomically BEFORE any
          // animation or battle point, so a client cannot spend coins it does
          // not have by claiming giftSource=test_coins. Still £0 — this path
          // never touches the wallet, creator earnings, or any money API.
          const testDebit = await debitTestCoins(client.userId, testPoints);
          if (testDebit.ok === false) {
            sendToClient(client, "gift_ack", {
              transactionId: null,
              requestId: giftRequestId,
              status:
                testDebit.reason === "unavailable"
                  ? "test_coins_unavailable"
                  : "insufficient_test_coins",
              testCoinsBalance: testDebit.balance,
              origin: "test_coins",
              financialValueGbp: 0,
              timestamp: Date.now(),
            });
            break;
          }
          const testStreamOwner =
            (await resolveStreamOwnerUserId(client.roomId)) || "";
          const resolvedTest = await resolveValidatedGiftRecipient({
            roomId: client.roomId,
            streamOwnerUserId: testStreamOwner,
            requestedBattleTarget: data?.battleTarget,
            requestedCohostTargetUserId:
              data?.cohostTargetUserId ?? data?.cohost_target_user_id,
          });
          if (resolvedTest.ok === false) {
            // Nothing was shown or scored — give the test coins back.
            const restored = await creditTestCoins(client.userId, testPoints);
            sendToClient(client, "gift_ack", {
              transactionId: null,
              requestId: giftRequestId,
              status: resolvedTest.error,
              testCoinsBalance: restored,
              origin: "test_coins",
              financialValueGbp: 0,
              timestamp: Date.now(),
            });
            break;
          }
          const testRecipient = resolvedTest.recipient;
          const testVideo = await resolvePlayableGiftVideoUrl(testGiftId, testClientVideo);
          const testCohostTarget =
            testRecipient.origin === "cohost" ? testRecipient.creatorId : null;
          const testPayload = {
            giftId: testGiftId,
            giftName: typeof data?.giftName === "string" ? data.giftName : "Gift",
            // Catalog points for MVP/UI only — giftSource marks this as not money.
            coins: testPoints,
            giftSource: "test_coins",
            // Not a money txn. Unique id for client animation dedupe only.
            transactionId: `test-${randomUUID()}`,
            battleTarget: testRecipient.battleSeat,
            ...(testCohostTarget
              ? {
                  cohostTargetUserId: testCohostTarget,
                  cohost_target_user_id: testCohostTarget,
                }
              : {}),
            user_id: client.userId,
            username: client.displayName || client.username,
            creator_name:
              typeof data?.creator_name === "string" && data.creator_name.trim()
                ? data.creator_name.trim()
                : undefined,
            avatar: typeof data?.avatar === "string" ? data.avatar : "",
            level: typeof data?.level === "number" ? data.level : 1,
            video: testVideo,
            animation_url: testVideo,
            gift_icon: typeof data?.gift_icon === "string" ? data.gift_icon : "",
            quantity: 1,
            streamId: client.roomId,
            stream_id: client.roomId,
            timestamp: new Date().toISOString(),
          };
          await emitGiftSentToTargetAudience({
            roomId: client.roomId,
            payload: testPayload,
            recipient: testRecipient,
          });
          let testBattlePoints = 0;
          if (testRecipient.battleSeat) {
            const testScore = await addBattleScore({
              roomId: client.roomId,
              seat: testRecipient.battleSeat,
              points: testPoints,
              source: "test_gift",
            });
            if (testScore.ok) testBattlePoints = testScore.points;
          }
          sendToClient(client, "gift_ack", {
            transactionId: null,
            requestId: giftRequestId,
            status: "test",
            testCoinsBalance: testDebit.newBalance,
            battlePoints: testBattlePoints,
            financialValueGbp: 0,
            origin: "test_coins",
            timestamp: Date.now(),
          });
          break;
        }

        // Server-authoritative: only gifts backed by a persisted paid/starter
        // transaction for this user+room are delivered. Delivery itself is shared
        // with REST /api/gifts/send so the creator still sees the gift even if
        // this WS event is late, missing, or fails after the coins were debited.
        const verified = await verifyGiftTransaction(
          transactionId,
          client.userId,
          client.roomId,
        );
        if (!verified) {
          sendToClient(client, "gift_ack", {
            transactionId: transactionId ?? null,
            requestId: giftRequestId,
            status: "unverified",
          });
          return;
        }

        const clientVideo =
          (typeof data?.video === "string" && data.video) ||
          (typeof data?.animation_url === "string" && data.animation_url) ||
          null;
        // Same validated resolver as REST: one creator owns this gift for
        // money, battle score, animation routing and creator progress.
        const giftStreamOwner =
          (await resolveStreamOwnerUserId(client.roomId)) || "";
        const resolvedGift = await resolveValidatedGiftRecipient({
          roomId: client.roomId,
          streamOwnerUserId: giftStreamOwner,
          requestedBattleTarget: data?.battleTarget,
          requestedCohostTargetUserId:
            data?.cohostTargetUserId ?? data?.cohost_target_user_id,
        });
        if (resolvedGift.ok === false) {
          sendToClient(client, "gift_ack", {
            transactionId: transactionId ?? null,
            requestId: giftRequestId,
            status: resolvedGift.error,
            timestamp: Date.now(),
          });
          break;
        }
        const giftRecipient = resolvedGift.recipient;
        const cohostFromWs =
          giftRecipient.origin === "cohost" ? giftRecipient.creatorId : null;
        const delivered = await deliverVerifiedGift({
          roomId: client.roomId,
          userId: client.userId,
          username: client.username,
          avatar: typeof data?.avatar === "string" ? data.avatar : "",
          level: typeof data?.level === "number" ? data.level : 1,
          giftId: verified.giftId,
          giftName: typeof data?.giftName === "string" ? data.giftName : undefined,
          creatorName:
            typeof data?.creator_name === "string" ? data.creator_name : undefined,
          coins: verified.coins,
          giftSource: verified.giftSource,
          transactionId: String(transactionId),
          recipient: giftRecipient,
          animationUrl: clientVideo,
        });

        // If REST already claimed the txn (possibly without a playable URL),
        // still push a gift_sent with giftId (+ video when available) so the
        // creator GiftOverlay can play for paid and starter gifts.
        if (
          delivered.delivered === false &&
          (delivered.reason === "duplicate" ||
            delivered.reason === "dedupe_unavailable")
        ) {
          try {
            const { resolvePlayableGiftVideoUrl } = await import("./giftRegistry");
            const video = await resolvePlayableGiftVideoUrl(
              verified.giftId,
              clientVideo,
            );
            const retryPayload = {
              giftId: verified.giftId,
              giftName:
                typeof data?.giftName === "string" ? data.giftName : "Gift",
              coins: verified.coins,
              giftSource: verified.giftSource,
              transactionId: String(transactionId),
              battleTarget: giftRecipient.battleSeat,
              ...(cohostFromWs
                ? {
                    cohostTargetUserId: cohostFromWs,
                    cohost_target_user_id: cohostFromWs,
                  }
                : {}),
              user_id: client.userId,
              username: client.displayName || client.username,
              creator_name:
                typeof data?.creator_name === "string" && data.creator_name.trim()
                  ? data.creator_name.trim()
                  : undefined,
              avatar: typeof data?.avatar === "string" ? data.avatar : "",
              level: typeof data?.level === "number" ? data.level : 1,
              video,
              animation_url: video,
              quantity: 1,
              streamId: client.roomId,
              stream_id: client.roomId,
              timestamp: new Date().toISOString(),
            };
            await emitGiftSentToTargetAudience({
              roomId: client.roomId,
              payload: retryPayload,
              recipient: giftRecipient,
            });
          } catch (err) {
            logger.warn({ err }, "gift_sent duplicate creator video retry failed");
          }
        }

        sendToClient(client, "gift_ack", {
          transactionId,
          requestId: giftRequestId,
          status: delivered.delivered === true ? "success" : delivered.reason,
          timestamp: Date.now(),
        });
        break;
      }

      case "battle_create": {
        if (!ensureBattleInfra(client)) break;
        if (!(await wsRateCheck(client.userId, "battle_create", 10, 60_000))) break;
        const ownerId = await resolveStreamOwnerUserId(client.roomId);
        if (!ownerId || ownerId !== client.userId) break;
        // Enter battle mode. Seats are filled by real invite accepts, so this is
        // idempotent: re-entering the battle chrome can never reset scores, the
        // clock, or the session of a running match. A finished battle is
        // replaced by a fresh session (rematch) with the same seats.
        const session = await ensureBattleForHost({
          roomId: client.roomId,
          hostUserId: client.userId,
          hostName: data.hostName || client.displayName,
        });
        if (!session) {
          sendToClient(client, "battle_error", {
            message: "Battle is unavailable",
            reason: "unavailable",
          });
          break;
        }
        const presentSession =
          (await confirmBattleParticipantPresence(client.roomId, client.userId)) ??
          session;
        sendToClient(client, "battle_created", {
          battleId: presentSession.id,
          status: presentSession.status,
        });

        // Same message also carries the host's "start the match" intent. The
        // server decides: seats come from real accepts, and the clock starts
        // only when a complete side is confirmed present. Entering battle mode
        // with no rival yet simply stays WAITING — that is not an error.
        const started = await startBattleIfReady(client.roomId, presentSession);
        if (
          started.ok === false &&
          started.reason !== "no_rivals" &&
          started.reason !== "not_waiting"
        ) {
          sendToClient(client, "battle_error", {
            message: BATTLE_START_ERROR_MESSAGES[started.reason],
            reason: started.reason,
            ...(started.notReady.length ? { notReady: started.notReady } : {}),
          });
        }
        if (started.ok === false) await broadcastBattleState(client.roomId);
        await updateViewerCount(client.roomId);
        break;
      }

      case "battle_join": {
        if (!ensureBattleInfra(client)) break;
        if (!(await wsRateCheck(client.userId, "battle_join", 20, 60_000))) break;
        const invited = await hasBattleInvite(client.roomId, client.userId);
        const acceptedGrant = await hasBattleAcceptedGrant(client.roomId, client.userId);
        // Accept already deletes the invite key and claims a seat; battle_join
        // on room connect must honor the accepted grant so the joiner is not
        // rejected with "Battle invite required".
        if (!invited && !acceptedGrant) {
          sendToClient(client, "battle_error", {
            message: "Battle invite required",
          });
          break;
        }
        // Seat claim + presence only. One creator connecting never starts the
        // clock. The creator's own room comes from the server's live
        // registration, never from the client payload.
        const battleSession = await claimBattleSeat(
          client.roomId,
          client.userId,
          client.displayName || client.username,
          await resolveCreatorOwnStreamKey(client.userId),
        );
        if (!battleSession) {
          sendToClient(client, "battle_error", {
            message: invited || acceptedGrant ? "Battle is full" : "No battle to join",
          });
          break;
        }
        if (invited) {
          await clearBattleInvite(client.roomId, client.userId);
        }
        await confirmBattleParticipantPresence(client.roomId, client.userId);
        await updateViewerCount(client.roomId);
        break;
      }

      case "battle_spectator_vote": {
        if (!ensureBattleInfra(client)) break;
        // GAMEPLAY ONLY: +5 Battle points once per unique viewer per battle.
        // Same viewer cannot add another +5 by tapping again. £0 revenue.
        // Rate-limited; creators in the match cannot self-score via taps.
        if (!(await wsRateCheck(client.userId, "spectator_vote", 120, 60_000))) break;
        const voteRoom = client.roomId;
        const voteBattle = await getBattleFromStore(voteRoom);
        if (!voteBattle || !isBattleScorable(voteBattle)) break;
        // Seated creators cannot tap points onto themselves or a teammate.
        if (participantOfUser(voteBattle, client.userId)) break;
        if (!isBattleSeat(data.target)) break;
        const voteTarget = data.target;
        // One award per (battle, viewer). TTL covers the battle window, so a
        // reconnect or a repeated request cannot multiply the same +5.
        const firstTap = await claimBattleVoteOnce(
          voteBattle.id,
          client.userId,
          voteTarget,
        );
        if (!firstTap) {
          sendToClient(client, "battle_vote_ack", {
            target: voteTarget,
            points: 0,
            status: "already_awarded",
            origin: "battle_tap",
            financialValueGbp: 0,
          });
          break;
        }
        const tapScore = await addBattleScore({
          roomId: voteRoom,
          seat: voteTarget,
          points: 5,
          source: "tap",
        });
        sendToClient(client, "battle_vote_ack", {
          target: voteTarget,
          points: tapScore.ok === true ? tapScore.points : 0,
          status: tapScore.ok === true ? "ok" : tapScore.reason,
          origin: "battle_tap",
          financialValueGbp: 0,
        });
        break;
      }

      case "battle_end": {
        if (!ensureBattleInfra(client)) break;
        if (!(await wsRateCheck(client.userId, "battle_end", 30, 60_000))) break;
        const bSession = await getBattleFromStore(client.roomId);
        if (!bSession) break;
        if (isBattleHost(bSession, client.userId)) {
          // Finalization owns freezing scores, the winner, the permanent record,
          // the broadcast and revoking battle publish rights — exactly once.
          await clearPendingBattleInvites(client.roomId);
          await finalizeBattle(client.roomId, "host_end");
        } else {
          // Non-host leave: drop only this creator — never end the whole battle.
          await revokeBattlePublish(client.roomId, client.userId);
          const removed = await removeBattleParticipant(client.roomId, client.userId);
          if (removed) {
            sendToUserGlobal(client.userId, "battle_participant_removed", {
              streamKey: client.roomId,
              userId: client.userId,
              reason: "left",
            });
            const after = await getBattleFromStore(client.roomId);
            if (
              after &&
              after.status === "ACTIVE" &&
              rivalParticipants(after).length === 0
            ) {
              // No rival creators left mid-ACTIVE — resolve from current scores.
              await finalizeBattle(client.roomId, "no_rivals");
            } else {
              await afterBattleSeatChange(client.roomId);
            }
          }
        }
        break;
      }

      case "battle_remove_participant": {
        if (!ensureBattleInfra(client)) break;
        // Host kick OR self-leave for one seat only. Must never call endBattle
        // for the whole room unless this was the last rival in an ACTIVE match.
        if (!(await wsRateCheck(client.userId, "battle_remove_participant", 40, 60_000))) {
          break;
        }
        const targetUserId =
          typeof data.targetUserId === "string" ? data.targetUserId.trim() : "";
        if (!targetUserId) break;
        const remSession = await getBattleFromStore(client.roomId);
        if (!remSession || remSession.status === "ENDED") break;
        const isRoomBattleHost = isBattleHost(remSession, client.userId);
        const isSelf = targetUserId === client.userId;
        if (!isRoomBattleHost && !isSelf) break;
        const targetSeat = participantOfUser(remSession, targetUserId);
        // Only a seated rival can be removed — never the host seat.
        if (!targetSeat || targetSeat.seat === "host") break;

        await revokeBattlePublish(client.roomId, targetUserId);
        await revokeParticipantPublish(client.roomId, targetUserId);
        const removed = await removeBattleParticipant(client.roomId, targetUserId);
        if (!removed) break;

        sendToUserGlobal(targetUserId, "battle_participant_removed", {
          streamKey: client.roomId,
          userId: targetUserId,
          reason: isSelf ? "left" : "removed",
        });

        const after = await getBattleFromStore(client.roomId);
        if (
          after &&
          after.status === "ACTIVE" &&
          rivalParticipants(after).length === 0
        ) {
          await finalizeBattle(client.roomId, "no_rivals");
        } else {
          await afterBattleSeatChange(client.roomId);
        }
        break;
      }

      case "battle_get_state": {
        if (!ensureBattleInfra(client)) break;
        if (!(await wsRateCheck(client.userId, "battle_get_state", 60, 60_000))) {
          break;
        }
        const currentBattle = await getBattleFromStore(client.roomId);
        if (!currentBattle) {
          // Creator is in normal live — force spectators out of battle layout.
          sendToClient(client, "battle_state_sync", { status: "ENDED" });
          break;
        }
        // An expired battle is closed by the one authoritative finalizer (which
        // is idempotent) before the state is answered — a read never invents a
        // second ending.
        if (isBattleExpired(currentBattle)) {
          await finalizeBattle(client.roomId, "timer");
        }
        // Same builder + same live score source as battle_state_sync and the
        // join/reconnect push, so a reconnect can never see a stale score.
        const battleState = await buildBattleStateForRoom(client.roomId);
        // A battle whose scores cannot be read is not a battle that ended.
        // Answering ENDED here would close the battle layout on everyone
        // watching a match still being fought, so this read goes unanswered and
        // the client keeps what it has until a tick or a retry describes it.
        if (battleState.unreadable) break;
        sendToClient(
          client,
          "battle_state_sync",
          battleState.state ?? { status: "ENDED" },
        );
        break;
      }

      case "battle_invite_send": {
        if (!ensureBattleInfra(client)) break;
        if (!(await wsRateCheck(client.userId, "battle_invite_send", 100, 60_000)))
          break;
        // Battle room = the host's room. The room owner OR any accepted battle
        // creator already in that room may invite more live creators into the match.
        // Co-host is a separate flow and must never use this path.
        const ownerId = await resolveStreamOwnerUserId(client.roomId);
        if (!ownerId) break;
        const isOwner = ownerId === client.userId;
        const isBattleCreator =
          !isOwner && (await hasBattlePublishGrant(client.roomId, client.userId));
        if (!isOwner && !isBattleCreator) break;
        const targetUserId =
          typeof data.targetUserId === "string" ? data.targetUserId.trim() : "";
        if (!targetUserId || targetUserId === client.userId) break;

        // Blocked either way → no invite, no notification.
        if (await dbIsBlockedEitherWay(client.userId, targetUserId)) {
          sendToClient(client, "battle_invite_ack", {
            targetUserId,
            delivered: false,
            reason: "blocked",
          });
          break;
        }
        // One battle per creator: neither the target nor the inviter may be
        // committed to a different battle room.
        const inviterBattleRoom = await getUserBattleRoom(client.userId);
        if (inviterBattleRoom && inviterBattleRoom !== client.roomId) {
          sendToClient(client, "battle_invite_ack", {
            targetUserId,
            delivered: false,
            reason: "inviter_in_other_battle",
          });
          break;
        }
        const targetBattleRoom = await getUserBattleRoom(targetUserId);
        if (targetBattleRoom && targetBattleRoom !== client.roomId) {
          sendToClient(client, "battle_invite_ack", {
            targetUserId,
            delivered: false,
            reason: "already_in_battle",
          });
          break;
        }

        const liveBattle = await getBattleFromStore(client.roomId);
        if (liveBattle && liveBattle.status !== "ENDED") {
          if (seatedUserIds(liveBattle).includes(targetUserId)) {
            sendToClient(client, "battle_invite_ack", {
              targetUserId,
              delivered: false,
              reason: "already_seated",
            });
            break;
          }
          if (battleOpenSeatCount(liveBattle) <= 0) {
            sendToClient(client, "battle_invite_ack", {
              targetUserId,
              delivered: false,
              reason: "battle_full",
            });
            break;
          }
        }

        // Battle is creator vs creator: the target must be LIVE as a host
        // right now. A spectator can never receive a battle invite.
        const targetRoomRaw =
          typeof data.targetStreamKey === "string" && data.targetStreamKey.trim()
            ? data.targetStreamKey.trim()
            : targetUserId;
        if (!(await isCreatorEligibleForBattle(targetUserId, targetRoomRaw))) {
          sendToClient(client, "battle_invite_ack", {
            targetUserId,
            delivered: false,
            reason: "not_live",
          });
          break;
        }
        // Always the battle room (host room) so accept joins the match, not a co-host live.
        const streamKey = client.roomId;
        await setBattleInvite(streamKey, targetUserId, 10 * 60 * 1000);
        const invitePayload = {
          // Accept must authorize against the room owner — never the opponent inviter.
          hostUserId: ownerId,
          hostName: data.hostName || client.displayName,
          hostAvatar: data.hostAvatar || client.avatarUrl || "",
          streamKey,
        };
        let delivered = sendToUserGlobal(targetUserId, "battle_invite", invitePayload);
        if (delivered === 0 && targetRoomRaw !== targetUserId) {
          delivered = sendToUserGlobal(targetRoomRaw, "battle_invite", invitePayload);
        }
        sendToClient(client, "battle_invite_ack", {
          targetUserId,
          delivered: delivered > 0,
        });
        break;
      }

      case "battle_invite_decline": {
        if (!ensureBattleInfra(client)) break;
        if (
          !(await wsRateCheck(client.userId, "battle_invite_decline", 60, 60_000))
        ) {
          break;
        }
        const hostStreamKey =
          typeof data.hostStreamKey === "string" ? data.hostStreamKey.trim() : "";
        if (!hostStreamKey) break;
        // Declining is only meaningful for an invite that exists. The room comes
        // from the payload, so without this any client could name any live and
        // have the server announce a decline from them to that whole room, and
        // make it rebuild its invite roster on demand.
        if (!(await hasBattleInvite(hostStreamKey, client.userId))) break;
        await clearBattleInvite(hostStreamKey, client.userId);
        broadcastToRoom(hostStreamKey, "battle_invite_declined", {
          userId: client.userId,
        });
        await publishBattleInviteRoster(hostStreamKey);
        break;
      }

      case "battle_invite_accept": {
        if (!ensureBattleInfra(client)) break;
        if (
          !(await wsRateCheck(client.userId, "battle_invite_accept", 100, 60_000))
        )
          break;
        const hostUserId =
          typeof data.hostUserId === "string" ? data.hostUserId : "";
        if (!hostUserId) break;
        // The accepting creator's current WS room is authoritative. Do not let
        // client payloads substitute a spectator/user id as the creator room.
        const accepterStreamKey = client.roomId;
        // Battle is creator vs creator. Acceptance is only valid if a REAL
        // battle invite was issued to this user for the host's room. This makes
        // it impossible for a spectator (never invited) to join as a battle
        // participant by forging an accept — they can only ever watch.
        const hostStreamKeyRaw =
          typeof data.hostStreamKey === "string" && data.hostStreamKey.trim()
            ? data.hostStreamKey.trim()
            : "";
        const hostRoomForInvite = hostStreamKeyRaw || (await resolveStreamOwnerUserId(hostUserId));
        const authoritativeHostUserId = hostRoomForInvite
          ? await resolveStreamOwnerUserId(hostRoomForInvite)
          : "";
        if (!authoritativeHostUserId || authoritativeHostUserId !== hostUserId) {
          sendToClient(client, "battle_error", {
            message: "Battle invite is no longer valid",
          });
          break;
        }
        const invitedKey = hostRoomForInvite
          ? await hasBattleInvite(hostRoomForInvite, client.userId)
          : false;
        if (!invitedKey) {
          sendToClient(client, "battle_error", {
            message: "Battle invite is no longer valid",
          });
          break;
        }

        // Eligibility is REVALIDATED here — state can change between invite and
        // accept, so the earlier invite is never treated as proof.
        if (await dbIsBlockedEitherWay(client.userId, authoritativeHostUserId)) {
          await clearBattleInvite(hostRoomForInvite, client.userId);
          sendToClient(client, "battle_error", {
            message: "Battle invite is no longer valid",
            reason: "blocked",
          });
          break;
        }
        const accepterBattleRoom = await getUserBattleRoom(client.userId);
        if (accepterBattleRoom && accepterBattleRoom !== hostRoomForInvite) {
          sendToClient(client, "battle_error", {
            message: "You are already in another battle",
            reason: "already_in_battle",
          });
          break;
        }
        if (!(await isCreatorEligibleForBattle(client.userId, accepterStreamKey))) {
          sendToClient(client, "battle_error", {
            message: "Go live before joining a battle",
            reason: "not_live",
          });
          break;
        }
        // A battle needs two live creators, so the inviter has to still be live
        // as well. An invite outlives the live that sent it: without this, a host
        // who has already ended can be accepted into, which seats the accepter in
        // a match with nobody on the other side and grants them publish rights in
        // a room that no longer has a stream.
        if (
          !(await isCreatorEligibleForBattle(
            authoritativeHostUserId,
            hostRoomForInvite,
          ))
        ) {
          await clearBattleInvite(hostRoomForInvite, client.userId);
          sendToClient(client, "battle_error", {
            message: "Battle invite is no longer valid",
            reason: "host_not_live",
          });
          break;
        }

        const existingBattle = hostRoomForInvite
          ? await getBattleFromStore(hostRoomForInvite)
          : null;

        // There has to be a match to join. The host enters battle mode — which
        // creates the session — before any invite can be sent, so no session or a
        // finished one means the battle this invite belonged to is over. Carrying
        // on would grant publish rights in another creator's live to someone
        // holding no seat in anything.
        if (!existingBattle || existingBattle.status === "ENDED") {
          await clearBattleInvite(hostRoomForInvite, client.userId);
          sendToClient(client, "battle_error", {
            message: "Battle invite is no longer valid",
            reason: "battle_over",
          });
          break;
        }

        // Claim a real seat atomically BEFORE granting publish. Prevents a 5th
        // creator and fake successful joins. The seat records the accepter's own
        // room from their socket — the client never supplies which room a battle
        // creator broadcasts from.
        const claimed = await claimBattleSeat(
          hostRoomForInvite,
          client.userId,
          client.displayName || client.username,
          accepterStreamKey,
        );
        if (!claimed) {
          await clearBattleInvite(hostRoomForInvite, client.userId);
          sendToClient(client, "battle_error", {
            message: "Battle is full",
            reason: "battle_full",
          });
          break;
        }

        // Persist the accepted creator role before navigation. This is the
        // authority used by battle_create and by the LiveKit publish-token
        // check; a spectator never receives either grant.
        await setBattleAcceptedGrant(
          hostRoomForInvite,
          client.userId,
          BATTLE_USER_ROOM_TTL_MS,
        );
        try {
          await grantBattlePublish(hostRoomForInvite, client.userId);
        } catch (err) {
          logger.error({ err, roomId: hostRoomForInvite }, "battle_invite_accept: publish grant failed");
          sendToClient(client, "battle_error", {
            message: "Battle join is unavailable",
            reason: "grant_failed",
          });
          break;
        }
        await clearBattleInvite(hostRoomForInvite, client.userId);
        // Handshake with the accepter: the grant now exists, so their client
        // may navigate into the battle knowing the publish token will be
        // issued. Removes the accept -> navigate -> token race entirely.
        sendToClient(client, "battle_accept_ack", {
          hostUserId: authoritativeHostUserId,
          hostStreamKey: hostRoomForInvite,
        });
        // Record the battle room as this creator's live role room. It keeps
        // their own live registration alive across the navigation and lets the
        // WS role-transition path move their spectators' audience ownership
        // into the battle room.
        if (hostStreamKeyRaw && hostStreamKeyRaw !== client.roomId) {
          await setUserBattleRoom(client.userId, hostStreamKeyRaw, BATTLE_USER_ROOM_TTL_MS);
        }
        // Notify every creator already in the battle room (host + opponents)
        // so all of them show Joined — not only the room owner.
        broadcastToRoom(hostRoomForInvite, "battle_invite_accepted", {
          requesterUserId: client.userId,
          requesterName: data.requesterName || client.displayName,
          requesterAvatar: data.requesterAvatar || client.avatarUrl || "",
          streamKey: accepterStreamKey,
        });
        await afterBattleSeatChange(hostRoomForInvite);
        break;
      }

      case "battle_invite_roster_get": {
        if (!ensureBattleInfra(client)) break;
        const rosterDeny = (error: string) => {
          sendToClient(client, "battle_invite_roster", {
            streamKey: client.roomId,
            creators: [] as unknown[],
            error,
          });
        };
        if (!(await wsRateCheck(client.userId, "battle_invite_roster_get", 60, 60_000))) {
          rosterDeny("rate_limited");
          break;
        }
        const ownerId = await resolveStreamOwnerUserId(client.roomId);
        if (!ownerId) {
          rosterDeny("no_room");
          break;
        }
        const isOwner = ownerId === client.userId;
        const isBattleCreator =
          !isOwner && (await hasBattlePublishGrant(client.roomId, client.userId));
        if (!isOwner && !isBattleCreator) {
          rosterDeny("forbidden");
          break;
        }
        await publishBattleInviteRoster(client.roomId, client);
        break;
      }

      case "stream_end": {
        const removed = await removeActiveStream(client.roomId, client.userId);
        if (removed) {
          // Host is moving into a battle room (accepted an invite): their
          // spectators must transition into the battle, not get kicked to feed.
          let battleRedirect: string | null = null;
          try {
            const battleRoomId = await getUserBattleRoom(client.userId);
            if (battleRoomId && battleRoomId !== client.roomId) {
              battleRedirect = battleRoomId;
            }
          } catch { /* non-fatal */ }
          if (battleRedirect) {
            await transferLiveAudienceToBattleRoom(
              client.roomId,
              client.userId,
              battleRedirect,
            );
          }
          broadcastToRoom(client.roomId, "stream_ended", {
            stream_key: client.roomId,
            host_user_id: client.userId,
            reason: battleRedirect ? "host_joined_battle" : "host_ended",
            ...(battleRedirect ? { battle_room_id: battleRedirect } : {}),
          });
          broadcastToFeedSubscribers("stream_ended", {
            stream_key: client.roomId,
          });
        }
        break;
      }

      case "cohost_invite_send": {
        if (!ensureCohostInfra(client)) break;
        if (
          !(await wsRateCheck(client.userId, "cohost_invite_send", 200, 60_000))
        )
          break;
        const ownerId = await resolveStreamOwnerUserId(client.roomId);
        if (!ownerId || ownerId !== client.userId) break;
        const rawTarget =
          typeof data.targetUserId === "string" ? data.targetUserId.trim() : "";
        const streamHint =
          typeof data.targetStreamKey === "string"
            ? data.targetStreamKey.trim()
            : "";
        if (!rawTarget && !streamHint) break;
        // Prefer explicit user id (spectator / creator). Only resolve stream-key
        // ownership when we do not already have a target user id.
        let targetUserId = rawTarget;
        if (!targetUserId && streamHint) {
          targetUserId = await resolveStreamOwnerUserId(streamHint);
        } else if (
          streamHint &&
          streamHint !== rawTarget
        ) {
          const fromStream = await resolveStreamOwnerUserId(streamHint);
          // If invitee was addressed only by stream key alias, keep resolved owner.
          if (!rawTarget && fromStream) targetUserId = fromStream;
        }
        if (!targetUserId || targetUserId === client.userId) break;
        // No publish grant here: an invite is an offer, and the token endpoint
        // treats a grant as authority to publish. Granting on send let an invited
        // user publish into this room before accepting — and keep that right if
        // they never answered. The grant is issued on accept instead.
        const seated = await mutateCohostSeats(
          client.roomId,
          client.userId,
          (seats) => {
            const existing = seats.find((s) => s.userId === targetUserId);
            // Already on stage: writing "invited" over a live seat would drop a
            // publishing co-host off the stage while their publish stays granted.
            if (existing && existing.status !== "invited") return null;
            return upsertCohostSlot(
              seats,
              {
                userId: targetUserId,
                name:
                  (typeof data.targetName === "string" && data.targetName.trim()) ||
                  "Co-host",
                avatar:
                  (typeof data.targetAvatar === "string" && data.targetAvatar) || "",
                status: "invited",
              },
              MAX_COHOST_SLOTS,
            );
          },
        );
        if (seated.status === "rejected") {
          sendToClient(client, "cohost_invite_ack", {
            targetUserId,
            delivered: false,
            reason: "cohost_already_seated",
          });
          break;
        }
        if (seated.status === "full") {
          sendToClient(client, "cohost_invite_ack", {
            targetUserId,
            delivered: false,
            reason: "cohost_full",
            max: MAX_COHOST_SLOTS,
          });
          break;
        }
        // Contended or unavailable: the invite was not recorded, so do not tell
        // the host it was delivered — the invitee could not accept it anyway.
        if (seated.status !== "applied" && seated.status !== "unchanged") {
          sendToClient(client, "cohost_invite_ack", {
            targetUserId,
            delivered: false,
            reason: "cohost_state_unavailable",
          });
          break;
        }
        if (seated.status === "applied") {
          broadcastToRoom(client.roomId, "cohost_layout_sync", {
            coHosts: seated.seats,
            hostUserId: client.userId,
            featuredUserId: seated.featuredUserId,
            ...(seated.layoutId ? { layoutId: seated.layoutId } : {}),
          });
        }
        const invitePayload = {
          hostUserId: client.userId,
          hostName: data.hostName || client.displayName,
          hostAvatar: data.hostAvatar || client.avatarUrl || "",
          streamKey: client.roomId,
        };
        // Deliver to target user id; also try rawTarget if resolve differed.
        let cohostSent = sendToUserGlobal(targetUserId, "cohost_invite", invitePayload);
        if (cohostSent === 0 && rawTarget && rawTarget !== targetUserId) {
          cohostSent = sendToUserGlobal(rawTarget, "cohost_invite", invitePayload);
        }
        if (cohostSent === 0) {
          // The seat is reserved before delivery is attempted, so an invite that
          // reached nobody would hold one of the eight slots for the rest of the
          // live — for someone who was never even asked. Give it back.
          const rolledBack = await mutateCohostSeats(
            client.roomId,
            client.userId,
            (seats) => {
              const seat = seats.find((s) => s.userId === targetUserId);
              // Only the unanswered offer is rolled back: a co-host already on
              // stage keeps their seat if the host re-invites them and it fails.
              if (!seat || seat.status !== "invited") return null;
              const next = removeCohostSlot(seats, targetUserId);
              return { slots: next.slots, changed: next.removed };
            },
          );
          if (rolledBack.status === "applied") {
            broadcastToRoom(client.roomId, "cohost_layout_sync", {
              coHosts: rolledBack.seats,
              hostUserId: client.userId,
              featuredUserId: rolledBack.featuredUserId,
              ...(rolledBack.layoutId ? { layoutId: rolledBack.layoutId } : {}),
            });
          }
        }
        sendToClient(client, "cohost_invite_ack", {
          targetUserId,
          delivered: cohostSent > 0,
        });
        break;
      }

      case "cohost_invite_accept": {
        if (!ensureCohostInfra(client)) break;
        if (
          !(await wsRateCheck(client.userId, "cohost_invite_accept", 200, 60_000))
        )
          break;
        const hostUserId =
          typeof data.hostUserId === "string" ? data.hostUserId : "";
        if (!hostUserId) break;
        const hostStreamKey =
          typeof data.streamKey === "string" ? data.streamKey.trim() : "";
        // Accepting is a claim, not proof of anything. Unlike the host-gated
        // co-host cases, the actor here is the invitee, so the invite the host
        // actually issued is the only authorization — and it has to be verified
        // before any publish grant. Without it this case took the room from the
        // payload and seated the sender as a publisher in any live they named.
        if (!hostStreamKey) break;
        // Eligibility is REVALIDATED here — the invite is not proof the offer is
        // still good. An invite banner survives the thing it points at: the host
        // can end the live, or either side can block the other, while the offer
        // sits on screen waiting to be tapped. Both are checked against live
        // state rather than against the invite.
        if (!(await isStreamHost(hostStreamKey, hostUserId))) break;
        if (await dbIsBlockedEitherWay(client.userId, hostUserId)) break;
        // The invite is resolved and the seat is taken in one locked step, so a
        // seat the host has just cancelled cannot be accepted through a snapshot
        // read a moment earlier.
        const seated = await mutateCohostSeats(
          hostStreamKey,
          hostUserId,
          (seats, layout) => {
            // hostUserId on the layout is written by cohost_invite_send only
            // after that caller was verified as this room's owner, so it is
            // server-proven. A claim that does not match it is not an invite.
            if (!layout || layout.hostUserId !== hostUserId) return null;
            const invitedSeat = seats.find((seat) => seat.userId === client.userId);
            // No seat means this user was never invited to this room. "accepted"
            // and "live" are allowed so a repeated accept stays idempotent.
            if (
              !invitedSeat ||
              (invitedSeat.status !== "invited" &&
                invitedSeat.status !== "accepted" &&
                invitedSeat.status !== "live")
            ) {
              return null;
            }
            return upsertCohostSlot(
              seats,
              {
                userId: client.userId,
                name:
                  (typeof data.cohostName === "string" && data.cohostName.trim()) ||
                  client.displayName ||
                  "Co-host",
                avatar:
                  (typeof data.cohostAvatar === "string" && data.cohostAvatar) ||
                  client.avatarUrl ||
                  "",
                status: "live",
              },
              MAX_COHOST_SLOTS,
            );
          },
        );
        // Only a confirmed seat authorizes publishing. Anything else — no invite,
        // lock contention, Valkey down — leaves the user a spectator instead of
        // handing out a grant for a seat that was never recorded.
        if (seated.status !== "applied" && seated.status !== "unchanged") break;
        await setCreatorCohostRoom(client.userId, hostStreamKey);
        await deleteCohostJoinRequest(hostStreamKey, client.userId);
        // Acceptance — never the invite — is the moment publishing is authorized:
        // for the next token, and on the connection they are already watching
        // from. If they have not joined yet, the token they fetch on join carries
        // the grant, so there is no reconnect either way. The seat is written
        // first: an accepted seat is itself publish authority, so this order can
        // never leave a grant without a seat behind it.
        const granted = await seatCohostPublish(
          hostStreamKey,
          hostUserId,
          client.userId,
        );
        if (granted.rolledBack) {
          // The seat is gone again, so the stage must not keep showing it.
          broadcastToRoom(hostStreamKey, "cohost_layout_sync", {
            coHosts: granted.rolledBack.seats,
            hostUserId,
            featuredUserId: granted.rolledBack.featuredUserId,
            ...(granted.rolledBack.layoutId
              ? { layoutId: granted.rolledBack.layoutId }
              : {}),
          });
          break;
        }
        if (seated.status === "applied") {
          broadcastToRoom(hostStreamKey, "cohost_layout_sync", {
            coHosts: seated.seats,
            hostUserId,
            featuredUserId: seated.featuredUserId,
            ...(seated.layoutId ? { layoutId: seated.layoutId } : {}),
          });
        }
        sendToUserGlobal(hostUserId, "cohost_invite_accepted", {
          cohostUserId: client.userId,
          cohostName: data.cohostName || client.displayName,
          cohostAvatar: data.cohostAvatar || client.avatarUrl || "",
          streamKey: data.streamKey || client.roomId,
        });
        break;
      }

      // Saying no gives the seat back. Without this the seat stayed "invited"
      // for the rest of the live: it held one of the eight slots, showed on the
      // stage, blocked the host from inviting that user again, and kept them out
      // of the spectator list — all for someone who had already declined.
      case "cohost_invite_decline": {
        if (!ensureCohostInfra(client)) break;
        if (
          !(await wsRateCheck(client.userId, "cohost_invite_decline", 200, 60_000))
        )
          break;
        const hostStreamKey =
          typeof data.streamKey === "string" && data.streamKey.trim()
            ? data.streamKey.trim()
            : client.roomId;
        if (!hostStreamKey) break;
        // The room's owner is resolved here, never taken from the payload: the
        // decliner is not the host, so they cannot be trusted to name one.
        const ownerId = await resolveStreamOwnerUserId(hostStreamKey);
        if (!ownerId || ownerId === client.userId) break;
        const declined = await mutateCohostSeats(
          hostStreamKey,
          ownerId,
          (seats, layout) => {
            if (!layout || layout.hostUserId !== ownerId) return null;
            const seat = seats.find((s) => s.userId === client.userId);
            // Only an unanswered invite is declinable. A co-host who is already
            // on stage stands down through cohost_seat_leave, so a late decline
            // can never take a seated participant off the stage.
            if (!seat || seat.status !== "invited") return null;
            const next = removeCohostSlot(seats, client.userId);
            return { slots: next.slots, changed: next.removed };
          },
        );
        if (declined.status !== "applied") break;
        // The host's seat table is the state update: their panel drops the
        // invited row from this broadcast, and the freed slot is reusable.
        broadcastToRoom(hostStreamKey, "cohost_layout_sync", {
          coHosts: declined.seats,
          hostUserId: ownerId,
          featuredUserId: declined.featuredUserId,
          ...(declined.layoutId ? { layoutId: declined.layoutId } : {}),
        });
        break;
      }

      case "cohost_request_send": {
        if (!ensureCohostInfra(client)) break;
        if (
          !(await wsRateCheck(client.userId, "cohost_request_send", 100, 60_000))
        )
          break;
        const rawHost =
          typeof data.hostUserId === "string" ? data.hostUserId.trim() : "";
        if (!rawHost && !client.roomId) break;
        // Spectator ask → creator: resolve host from payload or current room.
        let hostUserId = rawHost
          ? await resolveStreamOwnerUserId(rawHost)
          : "";
        if (!hostUserId && client.roomId) {
          hostUserId = await resolveStreamOwnerUserId(client.roomId);
        }
        if (!hostUserId) break;
        if (hostUserId === client.userId) break;
        const requestPayload = {
          requesterUserId: client.userId,
          requesterName: data.requesterName || client.displayName,
          requesterAvatar: data.requesterAvatar || client.avatarUrl || "",
        };
        const requestRoomId = client.roomId || rawHost;
        if (requestRoomId) {
          await upsertCohostJoinRequest(
            requestRoomId,
            requestPayload.requesterUserId,
            String(requestPayload.requesterName || "User"),
            String(requestPayload.requesterAvatar || ""),
          );
        }
        let sent = sendToUserGlobal(hostUserId, "cohost_request", requestPayload);
        // Fallback: host may still be keyed by the raw stream/room id.
        if (sent === 0 && rawHost && rawHost !== hostUserId) {
          sent = sendToUserGlobal(rawHost, "cohost_request", requestPayload);
        }
        if (sent === 0 && client.roomId && client.roomId !== hostUserId) {
          sendToUserGlobal(client.roomId, "cohost_request", requestPayload);
        }
        break;
      }

      case "cohost_request_accept": {
        if (!ensureCohostInfra(client)) break;
        if (
          !(await wsRateCheck(
            client.userId,
            "cohost_request_accept",
            200,
            60_000,
          ))
        )
          break;
        const ownerId = await resolveStreamOwnerUserId(client.roomId);
        if (!ownerId || ownerId !== client.userId) break;
        const requesterUserId =
          typeof data.requesterUserId === "string"
            ? data.requesterUserId.trim()
            : "";
        if (!requesterUserId || requesterUserId === client.userId) break;
        // Revalidated at the moment of seating, not when the request arrived: a
        // block placed while the request sat in the queue has to stop it.
        if (await dbIsBlockedEitherWay(client.userId, requesterUserId)) {
          await deleteCohostJoinRequest(client.roomId, requesterUserId);
          break;
        }
        // Seat first, under the room lock: two accepts for the last free seat can
        // no longer both pass the capacity check and both be granted publish.
        const seated = await mutateCohostSeats(
          client.roomId,
          client.userId,
          (seats) =>
            upsertCohostSlot(
              seats,
              {
                userId: requesterUserId,
                name:
                  (typeof data.requesterName === "string" && data.requesterName.trim()) ||
                  "Co-host",
                avatar:
                  (typeof data.requesterAvatar === "string" && data.requesterAvatar) ||
                  "",
                status: "accepted",
              },
              MAX_COHOST_SLOTS,
            ),
        );
        if (seated.status === "full") {
          sendToUserGlobal(requesterUserId, "cohost_request_declined", {
            hostUserId: client.userId,
            hostName: data.hostName || client.displayName,
            reason: "cohost_full",
            max: MAX_COHOST_SLOTS,
          });
          break;
        }
        // The seat is the authority for publishing, so an unconfirmed write must
        // not grant anything: the request stays queued and the host can retry.
        if (seated.status !== "applied" && seated.status !== "unchanged") {
          sendToUserGlobal(requesterUserId, "cohost_request_declined", {
            hostUserId: client.userId,
            hostName: data.hostName || client.displayName,
            reason: "cohost_state_unavailable",
          });
          break;
        }
        await deleteCohostJoinRequest(client.roomId, requesterUserId);
        // Host accepted this viewer's co-host request → grant publish for the room.
        // They are already connected as a spectator, so raise their permission on
        // that same LiveKit connection instead of making them reconnect.
        const granted = await seatCohostPublish(
          client.roomId,
          client.userId,
          requesterUserId,
        );
        if (granted.rolledBack) {
          broadcastToRoom(client.roomId, "cohost_layout_sync", {
            coHosts: granted.rolledBack.seats,
            hostUserId: client.userId,
            featuredUserId: granted.rolledBack.featuredUserId,
            ...(granted.rolledBack.layoutId
              ? { layoutId: granted.rolledBack.layoutId }
              : {}),
          });
          sendToUserGlobal(requesterUserId, "cohost_request_declined", {
            hostUserId: client.userId,
            hostName: data.hostName || client.displayName,
            reason: "cohost_state_unavailable",
          });
          break;
        }
        await setCreatorCohostRoom(requesterUserId, client.roomId);
        if (seated.status === "applied") {
          broadcastToRoom(client.roomId, "cohost_layout_sync", {
            coHosts: seated.seats,
            hostUserId: client.userId,
            featuredUserId: seated.featuredUserId,
            ...(seated.layoutId ? { layoutId: seated.layoutId } : {}),
          });
        }
        sendToUserGlobal(requesterUserId, "cohost_request_accepted", {
          hostUserId: client.userId,
          hostName: data.hostName || client.displayName,
          hostAvatar: data.hostAvatar || client.avatarUrl || "",
          streamKey: client.roomId,
        });
        const queued = await listCohostJoinRequests(client.roomId);
        const next = queued.find((r) => r.requesterUserId !== requesterUserId);
        if (next) {
          sendToUserGlobal(client.userId, "cohost_request", {
            requesterUserId: next.requesterUserId,
            requesterName: next.requesterName,
            requesterAvatar: next.requesterAvatar,
          });
        }
        break;
      }

      case "cohost_request_decline": {
        if (!ensureCohostInfra(client)) break;
        if (
          !(await wsRateCheck(
            client.userId,
            "cohost_request_decline",
            200,
            60_000,
          ))
        )
          break;
        // Declining is the host answering their own queue. Unguarded, any
        // spectator could drop another viewer's pending request and send them a
        // decline stamped with the sender's id — the queue is host state, so the
        // sender has to be proven to own this room like every other host case.
        const ownerId = await resolveStreamOwnerUserId(client.roomId);
        if (!ownerId || ownerId !== client.userId) break;
        const requesterUserId =
          typeof data.requesterUserId === "string"
            ? data.requesterUserId
            : "";
        if (!requesterUserId) break;
        await deleteCohostJoinRequest(client.roomId, requesterUserId);
        sendToUserGlobal(requesterUserId, "cohost_request_declined", {
          hostUserId: client.userId,
          hostName: data.hostName || client.displayName,
        });
        // Push next queued request to host immediately (if any).
        const queued = await listCohostJoinRequests(client.roomId);
        const next = queued.find((r) => r.requesterUserId !== requesterUserId);
        if (next) {
          sendToUserGlobal(client.userId, "cohost_request", {
            requesterUserId: next.requesterUserId,
            requesterName: next.requesterName,
            requesterAvatar: next.requesterAvatar,
          });
        }
        break;
      }

      // Presentation only. Seat membership is owned by the server and changes
      // solely through the per-user seat intents (invite / request accept /
      // cohost_seat_release / cohost_seats_clear), so a host-side render can
      // never replace the seat table or revoke another participant's publish.
      case "cohost_layout_sync": {
        if (!ensureCohostInfra(client)) break;
        const roomId = client.roomId;
        if (!roomId) break;
        const ownerId = await resolveStreamOwnerUserId(roomId);
        if (!ownerId || ownerId !== client.userId) break;
        const hostUserId = client.userId;
        const featuredUserId =
          typeof data.featuredUserId === "string" && data.featuredUserId.trim()
            ? data.featuredUserId.trim()
            : null;
        const layoutId =
          typeof data.layoutId === "string" && data.layoutId.trim()
            ? data.layoutId.trim()
            : undefined;
        // Seats are read back from server state and written straight through, so
        // a render arriving while someone joins cannot drop the new seat.
        const synced = await mutateCohostSeats(roomId, hostUserId, (seats) => ({
          slots: seats,
          changed: false,
          layoutId: layoutId ?? null,
          featuredUserId,
        }));
        if (synced.status !== "applied" && synced.status !== "unchanged") break;
        broadcastToRoom(roomId, "cohost_layout_sync", {
          coHosts: synced.seats,
          hostUserId,
          featuredUserId: synced.featuredUserId,
          ...(synced.layoutId ? { layoutId: synced.layoutId } : {}),
        });
        break;
      }

      // Host frees exactly one seat (remove co-host, cancel invite, decline a
      // seated request). Only that participant loses publish; every other seat,
      // the spectator roster and the request queue are untouched.
      case "cohost_seat_release": {
        if (!ensureCohostInfra(client)) break;
        const roomId = client.roomId;
        if (!roomId) break;
        const ownerId = await resolveStreamOwnerUserId(roomId);
        if (!ownerId || ownerId !== client.userId) break;
        const targetUserId =
          typeof data.targetUserId === "string" ? data.targetUserId.trim() : "";
        if (!targetUserId || targetUserId === client.userId) break;
        const released = await mutateCohostSeats(
          roomId,
          client.userId,
          (seats, layout) => {
            const next = removeCohostSlot(seats, targetUserId);
            return {
              slots: next.slots,
              changed: next.removed,
              // A removed co-host cannot stay the featured pane.
              featuredUserId:
                layout?.featuredUserId && layout.featuredUserId !== targetUserId
                  ? layout.featuredUserId
                  : null,
            };
          },
        );
        // Publishing is only stood down for a seat that is really gone; a
        // contended or failed write leaves the co-host exactly as they were.
        if (released.status !== "applied" && released.status !== "unchanged") break;
        await releaseCohostPublish(roomId, targetUserId);
        await deleteCohostJoinRequest(roomId, targetUserId);
        sendToUserGlobal(targetUserId, "cohost_seat_released", {
          roomId,
          hostUserId: client.userId,
        });
        broadcastToRoom(roomId, "cohost_layout_sync", {
          coHosts: released.seats,
          hostUserId: client.userId,
          featuredUserId: released.featuredUserId,
          ...(released.layoutId ? { layoutId: released.layoutId } : {}),
        });
        break;
      }

      // Seated co-host leaves their own seat and remains a spectator. Host live,
      // other seats, spectator roster and the request queue stay intact.
      case "cohost_seat_leave": {
        if (!ensureCohostInfra(client)) break;
        const roomId = client.roomId;
        if (!roomId) break;
        const ownerId = await resolveStreamOwnerUserId(roomId);
        if (!ownerId) break;
        if (ownerId === client.userId) break;
        const targetUserId = client.userId;
        const released = await mutateCohostSeats(roomId, ownerId, (seats, layout) => {
          // Nothing to leave: not seated (any more) in this room.
          if (!seats.some((seat) => seat.userId === targetUserId)) return null;
          const next = removeCohostSlot(seats, targetUserId);
          return {
            slots: next.slots,
            changed: next.removed,
            featuredUserId:
              layout?.featuredUserId && layout.featuredUserId !== targetUserId
                ? layout.featuredUserId
                : null,
          };
        });
        if (released.status !== "applied" && released.status !== "unchanged") break;
        await releaseCohostPublish(roomId, targetUserId);
        await deleteCohostJoinRequest(roomId, targetUserId);
        sendToUserGlobal(targetUserId, "cohost_seat_released", {
          roomId,
          hostUserId: ownerId,
        });
        broadcastToRoom(roomId, "cohost_layout_sync", {
          coHosts: released.seats,
          hostUserId: ownerId,
          featuredUserId: released.featuredUserId,
          ...(released.layoutId ? { layoutId: released.layoutId } : {}),
        });
        break;
      }

      // Host's explicit "End co-host": every seat is released and each seated
      // participant loses publish individually. Spectators stay connected.
      case "cohost_seats_clear": {
        if (!ensureCohostInfra(client)) break;
        const roomId = client.roomId;
        if (!roomId) break;
        const ownerId = await resolveStreamOwnerUserId(roomId);
        if (!ownerId || ownerId !== client.userId) break;
        // Clear the table first, then stand down exactly the seats it held: a
        // co-host who joins while this runs is either in the snapshot that was
        // cleared or arrives after it, never silently left publishing.
        const cleared = await mutateCohostSeats(roomId, client.userId, () => ({
          slots: [],
          changed: true,
          layoutId: "solo_big",
          featuredUserId: null,
        }));
        if (cleared.status !== "applied" && cleared.status !== "unchanged") break;
        for (const seat of cleared.previousSeats) {
          await releaseCohostPublish(roomId, seat.userId);
          await deleteCohostJoinRequest(roomId, seat.userId);
          sendToUserGlobal(seat.userId, "cohost_seat_released", {
            roomId,
            hostUserId: client.userId,
          });
        }
        broadcastToRoom(roomId, "cohost_layout_sync", {
          coHosts: [],
          hostUserId: client.userId,
          featuredUserId: null,
          layoutId: "solo_big",
        });
        break;
      }

      case "booster_activated": {
        if (!(await wsRateCheck(client.userId, "booster", 20, 60_000))) break;
        // Server-authoritative activation: the multiplier is validated (x3/x5,
        // must be enabled) and the active window is stored server-side with a
        // config-driven duration. Only then is the activation broadcast so the
        // catch mechanic (in gift_sent) is grounded in real server state.
        const activated = await activateBooster(
          client.roomId,
          client.userId,
          Number(data?.multiplier),
        );
        if (!activated) break;
        broadcastToRoom(client.roomId, "booster_activated", {
          user_id: client.userId,
          username: client.username,
          multiplier: activated.multiplier,
          duration_ms: activated.durationMs,
          expires_at: activated.expiresAt,
        });
        break;
      }

      case "mist_activated": {
        if (!(await wsRateCheck(client.userId, "booster", 20, 60_000))) break;
        // Mist Fog: a spectator sends it during a battle to fog the battle score
        // for everyone EXCEPT the creator they support. Purely visual (no points),
        // but server-authoritative: the supported creator id and the timed window
        // are resolved here from the real battle session, then broadcast to BOTH
        // battle rooms so the opposing side is covered too. Clients cannot choose
        // who the "supported creator" is — that comes from the session.
        const mistBattle = await getBattleFromStore(client.roomId);
        if (!mistBattle || mistBattle.status !== "ACTIVE") break;
        // The supported creator comes from the real seat table, so all four 2×2
        // seats are addressable and no client can name an empty seat.
        const mistSeat = normalizeRequestedBattleSeat(data?.target) ?? "host";
        const mistParticipant = participantAtSeat(mistBattle, mistSeat);
        if (!mistParticipant) break;
        const supportedSide =
          teamOfSeat(mistSeat) === "teamB" ? "opponent" : "host";
        const supportedUserId = mistParticipant.userId;
        const mistDurationMs = await getMistFogDurationMs();
        const mistExpiresAt = Date.now() + mistDurationMs;
        const mistPayload = {
          user_id: client.userId,
          username: client.username,
          supported_side: supportedSide,
          supported_user_id: supportedUserId,
          duration_ms: mistDurationMs,
          expires_at: mistExpiresAt,
        };
        const mistRooms = new Set<string>([client.roomId]);
        for (const p of mistBattle.participants) {
          if (p.roomId) mistRooms.add(p.roomId);
        }
        for (const r of mistRooms) broadcastToRoom(r, "mist_activated", mistPayload);
        break;
      }

      case "gift_goal_set": {
        if (!(await wsRateCheck(client.userId, "gift_goal", 10, 60_000))) break;
        const ownerId = await resolveStreamOwnerUserId(client.roomId);
        if (ownerId && ownerId !== client.userId) break;
        const giftId = typeof data?.giftId === "string" ? data.giftId.trim() : "";
        if (!giftId) break;
        const targetCount = Math.max(
          1,
          Math.min(20_000, Math.floor(Number(data?.targetCount) || 1)),
        );
        const goal = {
          giftId,
          giftName: typeof data?.giftName === "string" ? data.giftName : "Gift",
          giftIcon: typeof data?.giftIcon === "string" ? data.giftIcon : "",
          targetCount,
          currentCount: Math.max(
            0,
            Math.min(targetCount, Math.floor(Number(data?.currentCount) || 0)),
          ),
        };
        await setGiftGoal(client.roomId, goal);
        broadcastToRoom(client.roomId, "gift_goal_sync", goal);
        break;
      }

      case "gift_goal_clear": {
        if (!(await wsRateCheck(client.userId, "gift_goal", 10, 60_000))) break;
        const ownerId = await resolveStreamOwnerUserId(client.roomId);
        if (ownerId && ownerId !== client.userId) break;
        await clearGiftGoal(client.roomId);
        broadcastToRoom(client.roomId, "gift_goal_sync", null);
        break;
      }

      case "engagement_get_state": {
        if (!(await wsRateCheck(client.userId, "engagement", 30, 10_000))) break;
        const state = await getEngagementPublicState(client.roomId, client.userId);
        sendToClient(client, "engagement_sync", state);
        break;
      }

      case "engagement_watch_tick": {
        if (!(await wsRateCheck(client.userId, "engagement_tick", 8, 60_000))) break;
        const tick = await claimWatchTick({
          roomId: client.roomId,
          userId: client.userId,
          username: client.username,
          avatarUrl: client.avatarUrl || "",
        });
        if (tick.ok && tick.xpAwarded > 0) {
          const minuteIndex = Math.floor((tick.state.me?.watchSeconds || 0) / 60);
          await awardLiveWatchXp({
            userId: client.userId,
            roomId: client.roomId,
            minuteIndex,
            xpAmount: tick.xpAwarded,
            sourceSuffix: tick.milestonesReached.length
              ? `m${tick.milestonesReached.join("-")}`
              : "tick",
          });
        }
        if (tick.milestonesReached.length > 0) {
          broadcastToRoom(client.roomId, "engagement_milestone", {
            userId: client.userId,
            username: client.username,
            milestones: tick.milestonesReached,
            title: tick.state.me?.title || "",
            badge: tick.state.me?.badge || "",
          });
        }
        if (tick.stageUnlocked) {
          broadcastToRoom(client.roomId, "engagement_stage_unlock", {
            stage: tick.communityStage,
          });
        }
        const roomPublic = await getEngagementPublicState(client.roomId, null);
        broadcastToRoom(client.roomId, "engagement_sync", roomPublic);
        sendToClient(client, "engagement_sync", tick.state);
        break;
      }

      case "engagement_mystery_start": {
        if (!(await wsRateCheck(client.userId, "engagement_host", 20, 60_000))) break;
        const ownerId = await resolveStreamOwnerUserId(client.roomId);
        if (ownerId && ownerId !== client.userId) break;
        const minsRaw = Math.floor(Number(data?.durationMin) || 5);
        const durationMin = (minsRaw === 10 || minsRaw === 15 ? minsRaw : 5) as 5 | 10 | 15;
        const kind = data?.kind === "trivia" ? "trivia" : "poll";
        const state = await startMysteryCountdown(client.roomId, durationMin, kind);
        broadcastToRoom(client.roomId, "engagement_sync", state);
        break;
      }

      case "engagement_poll_set": {
        if (!(await wsRateCheck(client.userId, "engagement_host", 20, 60_000))) break;
        const ownerId = await resolveStreamOwnerUserId(client.roomId);
        if (ownerId && ownerId !== client.userId) break;
        const question = typeof data?.question === "string" ? data.question : "";
        const options = Array.isArray(data?.options)
          ? data.options.map((o: unknown) => String(o))
          : [];
        const kind = data?.kind === "trivia" ? "trivia" : "poll";
        const state = await setEngagementPoll(client.roomId, question, options, kind);
        broadcastToRoom(client.roomId, "engagement_sync", state);
        break;
      }

      case "engagement_poll_end": {
        if (!(await wsRateCheck(client.userId, "engagement_host", 20, 60_000))) break;
        {
          const ownerId = await resolveStreamOwnerUserId(client.roomId);
          if (ownerId && ownerId !== client.userId) break;
          const { endEngagementPoll } = await import("./engagement");
          const state = await endEngagementPoll(client.roomId);
          broadcastToRoom(client.roomId, "engagement_sync", state);
        }
        break;
      }

      case "engagement_poll_vote": {
        if (!(await wsRateCheck(client.userId, "engagement_vote", 10, 60_000))) break;
        const optionIndex = Math.floor(Number(data?.optionIndex));
        const vote = await voteEngagementPoll({
          roomId: client.roomId,
          userId: client.userId,
          username: client.username,
          avatarUrl: client.avatarUrl || "",
          optionIndex,
        });
        if (vote.stageUnlocked) {
          broadcastToRoom(client.roomId, "engagement_stage_unlock", {
            stage: vote.communityStage,
          });
        }
        broadcastToRoom(client.roomId, "engagement_sync", vote.state);
        break;
      }

      case "engagement_features_set": {
        if (!(await wsRateCheck(client.userId, "engagement_host", 20, 60_000))) break;
        const ownerId = await resolveStreamOwnerUserId(client.roomId);
        if (ownerId && ownerId !== client.userId) break;
        const patch = (data?.features && typeof data.features === "object"
          ? data.features
          : data) as Partial<EngagementFeatures>;
        const state = await setEngagementFeatures(client.roomId, patch || {});
        broadcastToRoom(client.roomId, "engagement_sync", state);
        break;
      }

      // ── 1:1 video call signaling (relay only; media is LiveKit call_* rooms) ──
      case "call_invite": {
        if (!(await wsRateCheck(client.userId, "call_signal", 30, 60_000))) break;
        const calleeId = typeof data?.calleeId === "string" ? data.calleeId.trim() : "";
        const callId = typeof data?.callId === "string" ? data.callId.trim() : "";
        if (!calleeId || !callId || calleeId === client.userId) break;
        if (await dbIsBlockedEitherWay(client.userId, calleeId)) {
          sendToClient(client, "call_rejected", { callId, reason: "blocked" });
          break;
        }
        sendToUserGlobal(calleeId, "call_invite", {
          callId,
          callerId: client.userId,
          callerUsername:
            typeof data?.callerUsername === "string"
              ? data.callerUsername
              : client.username || client.displayName || "User",
          callerAvatar:
            typeof data?.callerAvatar === "string" ? data.callerAvatar : client.avatarUrl || "",
          calleeId,
        });
        break;
      }

      case "call_accepted": {
        if (!(await wsRateCheck(client.userId, "call_signal", 30, 60_000))) break;
        const callerId = typeof data?.callerId === "string" ? data.callerId.trim() : "";
        const callId = typeof data?.callId === "string" ? data.callId.trim() : "";
        if (!callerId || !callId) break;
        if (await dbIsBlockedEitherWay(client.userId, callerId)) break;
        sendToUserGlobal(callerId, "call_accepted", {
          callId,
          calleeId: client.userId,
          callerId,
          calleeUsername:
            typeof data?.calleeUsername === "string"
              ? data.calleeUsername
              : client.username || client.displayName || "User",
          calleeAvatar:
            typeof data?.calleeAvatar === "string" ? data.calleeAvatar : client.avatarUrl || "",
        });
        break;
      }

      case "call_rejected": {
        if (!(await wsRateCheck(client.userId, "call_signal", 30, 60_000))) break;
        const callerId = typeof data?.callerId === "string" ? data.callerId.trim() : "";
        const callId = typeof data?.callId === "string" ? data.callId.trim() : "";
        if (!callerId || !callId) break;
        sendToUserGlobal(callerId, "call_rejected", {
          callId,
          calleeId: client.userId,
          callerId,
        });
        break;
      }

      case "call_ended": {
        if (!(await wsRateCheck(client.userId, "call_signal", 30, 60_000))) break;
        const remoteId = typeof data?.remoteId === "string" ? data.remoteId.trim() : "";
        const callId = typeof data?.callId === "string" ? data.callId.trim() : "";
        if (!callId) break;
        if (remoteId && remoteId !== client.userId) {
          sendToUserGlobal(remoteId, "call_ended", {
            callId,
            userId: client.userId,
            remoteId,
          });
        }
        break;
      }

      case "ping": {
        // Application-level keepalive (clients also rely on WS protocol ping/pong).
        sendToClient(client, "pong", { t: Date.now() });
        break;
      }

      case "stream_start": {
        // Live discovery registration + `stream_started` broadcast are owned by
        // POST /api/live/start. Acknowledge so host clients don't silently drop
        // on an unknown event (previously unhandled).
        sendToClient(client, "stream_start_ack", {
          ok: true,
          stream_key: client.roomId,
        });
        break;
      }

      default:
        if (process.env.NODE_ENV !== "production")
          logger.warn({ event }, "Unknown WS event");
    }
  } catch (err) {
    logger.error({ err, event }, "Error handling WS event");
  }
}
