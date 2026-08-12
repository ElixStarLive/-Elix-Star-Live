import { Client, broadcastToRoom, sendToClient, sendToUserGlobal, incrementRoomLiveLikes, transferLiveAudienceToBattleRoom } from "./index";
import { logger } from "../lib/logger";
import {
  createBattle,
  joinBattle,
  claimBattleSeat,
  startBattleTimer,
  endBattle,
  removeBattleParticipant,
  addBattleScoreForTarget,
  broadcastBattleState,
  getBattleFromStore,
  getBattleScores,
  saveBattleToStore,
  getUserBattleRoom,
  battleOpenSeatCount,
  battleSeatedUserIds,
  trackPendingBattleInvite,
  untrackPendingBattleInvite,
  clearPendingBattleInvites,
} from "./battle";
import {
  broadcastToFeedSubscribers,
} from "../feedBroadcast";
import { removeActiveStream, resolveStreamOwnerUserId, isStreamHost } from "../routes/livestream";
import { isLiveKitConfigured, isUserPublishingInRoom } from "../services/livekit";
import {
  wsRateCheck,
  setCohostLayout,
  deleteCohostLayout,
  grantBattlePublish,
  hasBattlePublishGrant,
  grantCohostPublish,
  revokeBattlePublish,
  revokeCohostPublish,
  getCohostLayout,
} from "./index";
import { valkeyDel, valkeySet, valkeySetNx, valkeyGet } from "../lib/valkey";
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
import { deliverVerifiedGift, emitGiftSentToTargetAudience } from "./giftDelivery";
import {
  isTestCoinsGiftSource,
  canAcceptTestCoinsBattleScore,
} from "./testCoinsPolicy";

const BATTLE_USER_ROOM_TTL_MS = 600_000;

function battleAcceptedKey(roomId: string, userId: string): string {
  return `battle_accept:${roomId}:${userId}`;
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
    const seated = new Set(battle ? battleSeatedUserIds(battle) : []);
    const ownerId = await resolveStreamOwnerUserId(roomId);
    if (ownerId) seated.add(ownerId);

    const rows = await dbGetLiveStreams();
    const eligible = rows.filter((r) => {
      const uid = typeof r.user_id === "string" ? r.user_id.trim() : "";
      if (!uid || seated.has(uid)) return false;
      return true;
    });
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

        // TEST COINS = BATTLE GAME SCORE ONLY (£0 money).
        // Animation + battle VS points. NEVER wallet / earnings / 60-40 / Stripe /
        // payout / paidCoinLots / IAP settlement / gift-goal paid progression.
        if (isTestCoinsGiftSource(data)) {
          if (!canAcceptTestCoinsBattleScore()) {
            sendToClient(client, "gift_ack", {
              transactionId: null,
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
          const { resolvePlayableGiftVideoUrl, normalizeBattleTarget, getGiftValue } =
            await import("./giftRegistry");
          const testVideo = await resolvePlayableGiftVideoUrl(testGiftId, testClientVideo);
          const testBattleTarget = normalizeBattleTarget(data?.battleTarget);
          const testPoints = Math.max(0, getGiftValue(testGiftId) || 0);
          const testCohostTarget =
            (typeof data?.cohostTargetUserId === "string" && data.cohostTargetUserId.trim()) ||
            (typeof data?.cohost_target_user_id === "string" &&
              data.cohost_target_user_id.trim()) ||
            null;
          const testPayload = {
            giftId: testGiftId,
            giftName: typeof data?.giftName === "string" ? data.giftName : "Gift",
            // Catalog points for MVP/UI only — giftSource marks this as not money.
            coins: testPoints,
            giftSource: "test_coins",
            // Not a money txn. Unique id for client animation dedupe only.
            transactionId: `test-${randomUUID()}`,
            battleTarget: testBattleTarget,
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
            battleTarget: testBattleTarget,
            cohostTargetUserId: testCohostTarget,
          });
          try {
            const testBattle = await getBattleFromStore(client.roomId);
            if (testBattle && testBattle.status === "ACTIVE" && testPoints > 0) {
              await addBattleScoreForTarget(
                client.roomId,
                testBattleTarget || "host",
                testPoints,
              );
            }
          } catch { /* non-fatal */ }
          sendToClient(client, "gift_ack", {
            transactionId: null,
            status: "test",
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
            status: "unverified",
          });
          return;
        }

        const clientVideo =
          (typeof data?.video === "string" && data.video) ||
          (typeof data?.animation_url === "string" && data.animation_url) ||
          null;
        const cohostFromWs =
          (typeof data?.cohostTargetUserId === "string" && data.cohostTargetUserId.trim()) ||
          (typeof data?.cohost_target_user_id === "string" &&
            data.cohost_target_user_id.trim()) ||
          null;
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
          battleTarget: data?.battleTarget,
          cohostTargetUserId: cohostFromWs,
          animationUrl: clientVideo,
        });

        // If REST already claimed the txn (possibly without a playable URL),
        // still push a gift_sent with giftId (+ video when available) so the
        // creator GiftOverlay can play for paid and starter gifts.
        if (delivered.delivered === false && delivered.reason === "duplicate") {
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
              battleTarget: data?.battleTarget ?? null,
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
              battleTarget: data?.battleTarget,
              cohostTargetUserId: cohostFromWs,
            });
          } catch (err) {
            logger.warn({ err }, "gift_sent duplicate creator video retry failed");
          }
        }

        sendToClient(client, "gift_ack", {
          transactionId,
          status: delivered.delivered === true ? "success" : delivered.reason,
          timestamp: Date.now(),
        });
        break;
      }

      case "battle_create": {
        if (!(await wsRateCheck(client.userId, "battle_create", 10, 60_000))) break;
        const ownerId = await resolveStreamOwnerUserId(client.roomId);
        if (!ownerId || ownerId !== client.userId) break;
        const opponentUserId =
          typeof data.opponentUserId === "string" ? data.opponentUserId.trim() : "";
        const opponentName =
          typeof data.opponentName === "string" ? data.opponentName.trim() : "";
        const opponentRoomId =
          typeof data.opponentRoomId === "string" ? data.opponentRoomId.trim() : "";
        const player3UserId =
          typeof data.player3UserId === "string" ? data.player3UserId.trim() : "";
        const player3Name =
          typeof data.player3Name === "string" ? data.player3Name.trim() : "";
        const player4UserId =
          typeof data.player4UserId === "string" ? data.player4UserId.trim() : "";
        const player4Name =
          typeof data.player4Name === "string" ? data.player4Name.trim() : "";

        // Every creator seat must have accepted a real invite. Never trust
        // client-supplied ids alone — host, opponent, P3, and P4 all play.
        const seats: { userId: string; name: string }[] = [];
        if (opponentUserId) {
          seats.push({ userId: opponentUserId, name: opponentName });
        }
        if (player3UserId) {
          seats.push({ userId: player3UserId, name: player3Name });
        }
        if (player4UserId) {
          seats.push({ userId: player4UserId, name: player4Name });
        }
        let seatsOk = true;
        for (const seat of seats) {
          if (!seat.name) {
            seatsOk = false;
            break;
          }
          const accepted = await valkeyGet(
            battleAcceptedKey(client.roomId, seat.userId),
          );
          if (!accepted) {
            seatsOk = false;
            break;
          }
        }
        if (seats.length > 0 && !seatsOk) {
          sendToClient(client, "battle_error", {
            message: "Accepted creator invite required",
          });
          break;
        }

        const existing = await getBattleFromStore(client.roomId);
        if (existing) {
          if (existing.opponentUserId) {
            await revokeBattlePublish(client.roomId, existing.opponentUserId);
          }
          if (existing.player3UserId) {
            await revokeBattlePublish(client.roomId, existing.player3UserId);
          }
          if (existing.player4UserId) {
            await revokeBattlePublish(client.roomId, existing.player4UserId);
          }
          await valkeyDel("battle:" + client.roomId);
          await valkeyDel("ubr:" + existing.hostUserId);
          if (existing.opponentUserId) await valkeyDel("ubr:" + existing.opponentUserId);
          if (existing.player3UserId) await valkeyDel("ubr:" + existing.player3UserId);
          if (existing.player4UserId) await valkeyDel("ubr:" + existing.player4UserId);
        }
        const session = await createBattle(
          client.roomId,
          client.userId,
          data.hostName || client.displayName,
        );
        if (!session) break;
        if (seats.length > 0) {
          if (opponentUserId && opponentName) {
            session.opponentUserId = opponentUserId;
            session.opponentName = opponentName;
            session.opponentRoomId = opponentRoomId || opponentUserId;
            await valkeySet(
              "ubr:" + opponentUserId,
              client.roomId,
              BATTLE_USER_ROOM_TTL_MS,
            );
            await grantBattlePublish(client.roomId, opponentUserId);
          }
          if (player3UserId && player3Name) {
            session.player3UserId = player3UserId;
            session.player3Name = player3Name;
            await valkeySet(
              "ubr:" + player3UserId,
              client.roomId,
              BATTLE_USER_ROOM_TTL_MS,
            );
            await grantBattlePublish(client.roomId, player3UserId);
          }
          if (player4UserId && player4Name) {
            session.player4UserId = player4UserId;
            session.player4Name = player4Name;
            await valkeySet(
              "ubr:" + player4UserId,
              client.roomId,
              BATTLE_USER_ROOM_TTL_MS,
            );
            await grantBattlePublish(client.roomId, player4UserId);
          }
          await saveBattleToStore(client.roomId, session);
          await startBattleTimer(client.roomId);
        } else {
          sendToClient(client, "battle_created", {
            battleId: session.id,
            status: session.status,
          });
          broadcastBattleState(client.roomId, session);
        }
        break;
      }

      case "battle_join": {
        if (!(await wsRateCheck(client.userId, "battle_join", 20, 60_000))) break;
        const inviteKey = `battle_invite:${client.roomId}:${client.userId}`;
        const invited = await valkeyGet(inviteKey);
        const acceptedGrant = await valkeyGet(
          battleAcceptedKey(client.roomId, client.userId),
        );
        // Accept already deletes the invite key and claims a seat; battle_join
        // on room connect must honor the accepted grant so the joiner is not
        // rejected with "Battle invite required".
        if (!invited && !acceptedGrant) {
          sendToClient(client, "battle_error", {
            message: "Battle invite required",
          });
          break;
        }
        const battleSession = await joinBattle(
          client.roomId,
          client.userId,
          data.opponentName || client.displayName,
        );
        if (!battleSession) {
          sendToClient(client, "battle_error", {
            message: invited || acceptedGrant ? "Battle is full" : "No battle to join",
          });
        } else if (invited) {
          await valkeyDel(inviteKey);
          await untrackPendingBattleInvite(client.roomId, client.userId);
        }
        break;
      }

      case "battle_spectator_vote": {
        // GAMEPLAY ONLY: +5 Battle points once per unique viewer per battle.
        // Same viewer cannot add another +5 by tapping again. £0 revenue.
        // Rate-limited; creators in the match cannot self-score via taps.
        if (!(await wsRateCheck(client.userId, "spectator_vote", 120, 60_000))) break;
        const voteRoom = client.roomId;
        const voteBattle = await getBattleFromStore(voteRoom);
        if (!voteBattle || voteBattle.status !== "ACTIVE") break;
        const participantIds = [
          voteBattle.hostUserId,
          voteBattle.opponentUserId,
          voteBattle.player3UserId,
          voteBattle.player4UserId,
        ].filter(
          (participantId): participantId is string =>
            typeof participantId === "string" && participantId.length > 0,
        );
        if (participantIds.includes(client.userId)) break;
        const voteTarget =
          data.target === "host"
            ? "host"
            : data.target === "opponent"
              ? "opponent"
              : data.target === "player3"
                ? "player3"
                : data.target === "player4"
                  ? "player4"
                  : null;
        if (!voteTarget) break;
        // One award per (battle, viewer). TTL covers the battle window.
        const onceKey = `battle_vote_once:${voteBattle.id}:${client.userId}`;
        const firstTap = await valkeySetNx(onceKey, voteTarget, 600_000);
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
        await addBattleScoreForTarget(voteRoom, voteTarget, 5);
        sendToClient(client, "battle_vote_ack", {
          target: voteTarget,
          points: 5,
          status: "ok",
          origin: "battle_tap",
          financialValueGbp: 0,
        });
        break;
      }

      case "battle_end": {
        const bSession = await getBattleFromStore(client.roomId);
        if (!bSession || bSession.status === "ENDED") break;
        if (bSession.hostUserId === client.userId) {
          if (bSession.opponentUserId) {
            await revokeBattlePublish(client.roomId, bSession.opponentUserId);
          }
          if (bSession.player3UserId) {
            await revokeBattlePublish(client.roomId, bSession.player3UserId);
          }
          if (bSession.player4UserId) {
            await revokeBattlePublish(client.roomId, bSession.player4UserId);
          }
          await clearPendingBattleInvites(client.roomId);
          await endBattle(client.roomId);
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
              battleOpenSeatCount(after) === 3
            ) {
              // No rival creators left mid-ACTIVE — resolve from current scores.
              await endBattle(client.roomId);
            } else {
              await afterBattleSeatChange(client.roomId);
            }
          }
        }
        break;
      }

      case "battle_remove_participant": {
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
        const isBattleHost = remSession.hostUserId === client.userId;
        const isSelf = targetUserId === client.userId;
        if (!isBattleHost && !isSelf) break;
        if (targetUserId === remSession.hostUserId) break;

        const wasSeated =
          remSession.opponentUserId === targetUserId ||
          remSession.player3UserId === targetUserId ||
          remSession.player4UserId === targetUserId;
        if (!wasSeated) break;

        await revokeBattlePublish(client.roomId, targetUserId);
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
          battleOpenSeatCount(after) === 3
        ) {
          await endBattle(client.roomId);
        } else {
          await afterBattleSeatChange(client.roomId);
        }
        break;
      }

      case "battle_get_state": {
        const currentBattle = await getBattleFromStore(client.roomId);
        if (!currentBattle) {
          // Creator is in normal live — force spectators out of battle layout.
          sendToClient(client, "battle_state_sync", { status: "ENDED" });
          break;
        }
        if (currentBattle.endsAt > 0) {
          currentBattle.timeLeft = Math.max(
            0,
            Math.round((currentBattle.endsAt - Date.now()) / 1000),
          );
        }
        if (currentBattle.status === "ACTIVE" && currentBattle.timeLeft <= 0) {
          await endBattle(client.roomId);
          break;
        }
        const scores = currentBattle.status === "ACTIVE"
          ? await getBattleScores(client.roomId)
          : currentBattle;
        sendToClient(client, "battle_state_sync", {
          id: currentBattle.id,
          status: currentBattle.status,
          hostUserId: currentBattle.hostUserId,
          hostName: currentBattle.hostName,
          hostRoomId: currentBattle.hostRoomId,
          opponentUserId: currentBattle.opponentUserId,
          opponentName: currentBattle.opponentName,
          opponentRoomId: currentBattle.opponentRoomId,
          player3UserId: currentBattle.player3UserId,
          player3Name: currentBattle.player3Name,
          player4UserId: currentBattle.player4UserId,
          player4Name: currentBattle.player4Name,
          hostScore: scores.hostScore,
          opponentScore: scores.opponentScore,
          player3Score: scores.player3Score,
          player4Score: scores.player4Score,
          timeLeft: currentBattle.timeLeft,
          endsAt: currentBattle.endsAt,
          winner: currentBattle.winner,
        });
        break;
      }

      case "battle_invite_send": {
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

        const liveBattle = await getBattleFromStore(client.roomId);
        if (liveBattle && liveBattle.status !== "ENDED") {
          if (battleSeatedUserIds(liveBattle).includes(targetUserId)) {
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
        if (isLiveKitConfigured()) {
          // Authoritative check: the target must be actively PUBLISHING
          // (camera on) in their own room. Stale Valkey/DB "live" records
          // cannot pass this — spectators never publish.
          const targetPublishing =
            (await isUserPublishingInRoom(targetRoomRaw, targetUserId)) ||
            (targetRoomRaw !== targetUserId &&
              (await isUserPublishingInRoom(targetUserId, targetUserId)));
          if (!targetPublishing) {
            sendToClient(client, "battle_invite_ack", {
              targetUserId,
              delivered: false,
              reason: "not_live",
            });
            break;
          }
        } else {
          let targetIsLiveHost = await isStreamHost(targetUserId, targetUserId);
          if (!targetIsLiveHost) {
            try {
              const liveRows = await dbGetLiveStreams();
              targetIsLiveHost = liveRows.some((r) => r.user_id === targetUserId);
            } catch { /* fall through — treated as not live */ }
          }
          if (!targetIsLiveHost) {
            sendToClient(client, "battle_invite_ack", {
              targetUserId,
              delivered: false,
              reason: "not_live",
            });
            break;
          }
        }
        // Always the battle room (host room) so accept joins the match, not a co-host live.
        const streamKey = client.roomId;
        await valkeySet(
          `battle_invite:${streamKey}:${targetUserId}`,
          "1",
          10 * 60 * 1000,
        );
        await trackPendingBattleInvite(streamKey, targetUserId);
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
        const hostStreamKey =
          typeof data.hostStreamKey === "string" ? data.hostStreamKey.trim() : "";
        if (!hostStreamKey) break;
        await valkeyDel(`battle_invite:${hostStreamKey}:${client.userId}`);
        await untrackPendingBattleInvite(hostStreamKey, client.userId);
        broadcastToRoom(hostStreamKey, "battle_invite_declined", {
          userId: client.userId,
        });
        await publishBattleInviteRoster(hostStreamKey);
        break;
      }

      case "battle_invite_accept": {
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
          ? await valkeyGet(`battle_invite:${hostRoomForInvite}:${client.userId}`)
          : null;
        if (!invitedKey) {
          sendToClient(client, "battle_error", {
            message: "Battle invite is no longer valid",
          });
          break;
        }

        const existingBattle = hostRoomForInvite
          ? await getBattleFromStore(hostRoomForInvite)
          : null;

        // Mid-battle / waiting session: claim a real seat atomically BEFORE
        // granting publish. Prevents a 5th creator and fake successful joins.
        if (existingBattle && existingBattle.status !== "ENDED") {
          const claimed = await claimBattleSeat(
            hostRoomForInvite,
            client.userId,
            data.requesterName || client.displayName,
          );
          if (!claimed) {
            await valkeyDel(`battle_invite:${hostRoomForInvite}:${client.userId}`);
            await untrackPendingBattleInvite(hostRoomForInvite, client.userId);
            sendToClient(client, "battle_error", {
              message: "Battle is full",
              reason: "battle_full",
            });
            break;
          }
        }

        // Persist the accepted creator role before navigation. This is the
        // authority used by battle_create and by the LiveKit publish-token
        // check; a spectator never receives either grant.
        await valkeySet(
          battleAcceptedKey(hostRoomForInvite, client.userId),
          "1",
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
        await valkeyDel(`battle_invite:${hostRoomForInvite}:${client.userId}`);
        await untrackPendingBattleInvite(hostRoomForInvite, client.userId);
        // Handshake with the accepter: the grant now exists, so their client
        // may navigate into the battle knowing the publish token will be
        // issued. Removes the accept -> navigate -> token race entirely.
        sendToClient(client, "battle_accept_ack", {
          hostUserId: authoritativeHostUserId,
          hostStreamKey: hostRoomForInvite,
        });
        // Record where the accepter is heading BEFORE their solo stream ends,
        // so stream_end can redirect their spectators into the battle room.
        if (hostStreamKeyRaw && hostStreamKeyRaw !== client.roomId) {
          await valkeySet(
            "ubr:" + client.userId,
            hostStreamKeyRaw,
            BATTLE_USER_ROOM_TTL_MS,
          );
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
        if (!(await wsRateCheck(client.userId, "battle_invite_roster_get", 60, 60_000))) {
          break;
        }
        const ownerId = await resolveStreamOwnerUserId(client.roomId);
        if (!ownerId) break;
        const isOwner = ownerId === client.userId;
        const isBattleCreator =
          !isOwner && (await hasBattlePublishGrant(client.roomId, client.userId));
        if (!isOwner && !isBattleCreator) break;
        await publishBattleInviteRoster(client.roomId, client);
        break;
      }

      case "stream_end": {
        const removed = await removeActiveStream(client.roomId, client.userId);
        if (removed) {
          await deleteCohostLayout(client.roomId);
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
        const streamKey =
          typeof data.streamKey === "string" && data.streamKey.trim()
            ? data.streamKey.trim()
            : client.roomId;
        // Only the host of this room may authorize co-host publishing.
        if (streamKey && streamKey === client.roomId) {
          await grantCohostPublish(streamKey, targetUserId);
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
        sendToClient(client, "cohost_invite_ack", {
          targetUserId,
          delivered: cohostSent > 0,
        });
        break;
      }

      case "cohost_invite_accept": {
        if (
          !(await wsRateCheck(client.userId, "cohost_invite_accept", 200, 60_000))
        )
          break;
        const hostUserId =
          typeof data.hostUserId === "string" ? data.hostUserId : "";
        if (!hostUserId) break;
        sendToUserGlobal(hostUserId, "cohost_invite_accepted", {
          cohostUserId: client.userId,
          cohostName: data.cohostName || client.displayName,
          cohostAvatar: data.cohostAvatar || client.avatarUrl || "",
          streamKey: data.streamKey || client.roomId,
        });
        break;
      }

      case "cohost_request_send": {
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
        // Host accepted this viewer's co-host request → grant publish for the room.
        if (client.roomId) await grantCohostPublish(client.roomId, requesterUserId);
        sendToUserGlobal(requesterUserId, "cohost_request_accepted", {
          hostUserId: client.userId,
          hostName: data.hostName || client.displayName,
          hostAvatar: data.hostAvatar || client.avatarUrl || "",
          streamKey: client.roomId,
        });
        break;
      }

      case "cohost_request_decline": {
        if (
          !(await wsRateCheck(
            client.userId,
            "cohost_request_decline",
            200,
            60_000,
          ))
        )
          break;
        const requesterUserId =
          typeof data.requesterUserId === "string"
            ? data.requesterUserId
            : "";
        if (!requesterUserId) break;
        sendToUserGlobal(requesterUserId, "cohost_request_declined", {
          hostUserId: client.userId,
          hostName: data.hostName || client.displayName,
        });
        break;
      }

      case "cohost_layout_sync": {
        const roomId = client.roomId;
        if (!roomId) break;
        const ownerId = await resolveStreamOwnerUserId(roomId);
        if (!ownerId || ownerId !== client.userId) break;
        const rawCoHosts = Array.isArray(data.coHosts) ? data.coHosts : [];
        const hostUserId = client.userId;
        const seen = new Set<string>();
        const coHosts = rawCoHosts.filter((h) => {
          const uid = typeof h.userId === "string" ? h.userId : "";
          if (!uid || uid === hostUserId || seen.has(uid)) return false;
          seen.add(uid);
          return true;
        });
        const previous = await getCohostLayout(roomId);
        const previousIds = new Set<string>(
          Array.isArray(previous?.coHosts)
            ? (previous as NonNullable<typeof previous>).coHosts
                .map((h) => (typeof (h as Record<string, string>).userId === "string" ? (h as Record<string, string>).userId : ""))
                .filter(Boolean)
            : [],
        );
        const nextIds = new Set<string>(
          coHosts
            .map((h) => (typeof (h as Record<string, string>).userId === "string" ? (h as Record<string, string>).userId : ""))
            .filter((uid): uid is string => Boolean(uid)),
        );
        for (const uid of previousIds) {
          if (!nextIds.has(uid)) {
            await revokeCohostPublish(roomId, uid);
          }
        }
        // Keep publish grants aligned with the authoritative seat list (re-grant
        // every sync so a prior WS-leave revoke cannot leave a seated cohost stuck).
        for (const uid of nextIds) {
          await grantCohostPublish(roomId, uid);
        }
        await setCohostLayout(
          roomId,
          coHosts,
          hostUserId,
          typeof data.layoutId === "string" ? data.layoutId : null,
          typeof data.featuredUserId === "string" && data.featuredUserId.trim()
            ? data.featuredUserId.trim()
            : null,
        );
        const featuredUserId =
          typeof data.featuredUserId === "string" && data.featuredUserId.trim()
            ? data.featuredUserId.trim()
            : null;
        const layoutId =
          typeof data.layoutId === "string" && data.layoutId.trim()
            ? data.layoutId.trim()
            : undefined;
        broadcastToRoom(roomId, "cohost_layout_sync", {
          coHosts,
          hostUserId,
          featuredUserId,
          ...(layoutId ? { layoutId } : {}),
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
        const supportedSide = data?.target === "opponent" ? "opponent" : "host";
        const supportedUserId =
          supportedSide === "opponent"
            ? mistBattle.opponentUserId
            : mistBattle.hostUserId;
        if (!supportedUserId) break;
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
        if (mistBattle.hostRoomId) mistRooms.add(mistBattle.hostRoomId);
        if (mistBattle.opponentRoomId) mistRooms.add(mistBattle.opponentRoomId);
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
