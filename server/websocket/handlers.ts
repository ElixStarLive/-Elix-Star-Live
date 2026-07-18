import { Client, broadcastToRoom, sendToClient, sendToUserGlobal } from "./index";
import { logger } from "../lib/logger";
import {
  createBattle,
  joinBattle,
  startBattleTimer,
  endBattle,
  addBattleScoreForTarget,
  broadcastBattleState,
  getBattleFromStore,
  getBattleScores,
  saveBattleToStore,
  getUserBattleRoom,
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
  grantCohostPublish,
  revokeCohostPublish,
  getCohostLayout,
} from "./index";
import { valkeyDel, valkeySet, valkeySetNx, valkeyGet } from "../lib/valkey";
import { randomUUID } from "crypto";
import {
  clearGiftGoal,
  setGiftGoal,
} from "./giftGoal";
import { dbIsBlockedEitherWay, dbGetLiveStreams, getPool } from "../lib/postgres";
import { activateBooster, getMistFogDurationMs } from "../lib/booster";
import { deliverVerifiedGift } from "./giftDelivery";

const BATTLE_USER_ROOM_TTL_MS = 600_000;

function battleAcceptedKey(roomId: string, userId: string): string {
  return `battle_accept:${roomId}:${userId}`;
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
  giftSource: "starter_coins" | "paid_coins";
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
    return {
      giftId: String(row.gift_id || ""),
      coins: Number(row.coins) || 0,
      roomId: String(row.room_id || ""),
      giftSource:
        row.gift_source === "starter_coins"
          ? "starter_coins"
          : "paid_coins",
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
          const payload = {
            text,
            message: text,
            messageId,
            user_id: client.userId,
            username: client.username,
            timestamp: new Date().toISOString(),
          };
          broadcastToRoom(client.roomId, "chat_message", payload);
          sendToClient(client, "chat_ack", { messageId, status: "delivered" });
        }
        break;

      case "heart_sent":
        if (!(await wsRateCheck(client.userId, "heart", 30, 2_000))) break;
        broadcastToRoom(client.roomId, "heart_sent", {
          user_id: client.userId,
          username: data?.username || client.username,
          avatar: data?.avatar || "",
          timestamp: new Date().toISOString(),
        });
        break;

      case "gift_sent": {
        if (!(await wsRateCheck(client.userId, "gift", 50, 5_000))) break;
        const { transactionId } = data;

        // TEST COINS (testing tool): animation-only broadcast so the creator and
        // spectators see the gift video. Never claims a transaction, never touches
        // wallets, gift goals, or battle scores.
        if (data?.giftSource === "test_coins" || data?.gift_source === "test_coins") {
          const testGiftId = typeof data?.giftId === "string" ? data.giftId : "";
          const testClientVideo =
            (typeof data?.video === "string" && data.video) ||
            (typeof data?.animation_url === "string" && data.animation_url) ||
            null;
          const { resolvePlayableGiftVideoUrl, normalizeBattleTarget, getGiftValue } =
            await import("./giftRegistry");
          const testVideo = await resolvePlayableGiftVideoUrl(testGiftId, testClientVideo);
          const testBattleTarget = normalizeBattleTarget(data?.battleTarget);
          const testPayload = {
            giftId: testGiftId,
            giftName: typeof data?.giftName === "string" ? data.giftName : "Gift",
            coins: 0,
            giftSource: "test_coins",
            // Unique id so clients receiving this event twice (room broadcast +
            // direct owner send) dedupe it and play the animation exactly once.
            transactionId: `test-${randomUUID()}`,
            battleTarget: testBattleTarget,
            user_id: client.userId,
            username: client.username,
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
          broadcastToRoom(client.roomId, "gift_sent", testPayload);
          try {
            const testOwnerId = await resolveStreamOwnerUserId(client.roomId);
            if (testOwnerId && testOwnerId !== client.userId) {
              sendToUserGlobal(testOwnerId, "gift_sent", testPayload);
            }
          } catch { /* non-fatal */ }
          // Test coins simulate battle score too (testing tool) — points show on
          // the PK bar exactly like paid gifts, but never touch wallets or goals.
          try {
            const testBattle = await getBattleFromStore(client.roomId);
            if (testBattle && testBattle.status === "ACTIVE") {
              const testPoints = getGiftValue(testGiftId);
              if (testPoints > 0) {
                await addBattleScoreForTarget(
                  client.roomId,
                  testBattleTarget || "host",
                  testPoints,
                );
              }
            }
          } catch { /* non-fatal */ }
          sendToClient(client, "gift_ack", {
            transactionId: null,
            status: "test",
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
        const delivered = await deliverVerifiedGift({
          roomId: client.roomId,
          userId: client.userId,
          username: client.username,
          avatar: typeof data?.avatar === "string" ? data.avatar : "",
          level: typeof data?.level === "number" ? data.level : 1,
          giftId: verified.giftId,
          giftName: typeof data?.giftName === "string" ? data.giftName : undefined,
          coins: verified.coins,
          giftSource: verified.giftSource,
          transactionId: String(transactionId),
          battleTarget: data?.battleTarget,
          animationUrl: clientVideo,
        });

        // If REST already claimed the txn (possibly without a playable URL),
        // still push a video-bearing gift_sent so the creator GiftOverlay can play.
        if (!delivered.delivered && delivered.reason === "duplicate") {
          try {
            const { resolvePlayableGiftVideoUrl } = await import("./giftRegistry");
            const { sendToUserGlobal, broadcastToRoom } = await import("./index");
            const { resolveStreamOwnerUserId } = await import("../routes/livestream");
            const video = await resolvePlayableGiftVideoUrl(
              verified.giftId,
              clientVideo,
            );
            if (video) {
              const retryPayload = {
                giftId: verified.giftId,
                giftName:
                  typeof data?.giftName === "string" ? data.giftName : "Gift",
                coins: verified.coins,
                giftSource: verified.giftSource,
                transactionId: String(transactionId),
                battleTarget: data?.battleTarget ?? null,
                user_id: client.userId,
                username: client.username,
                avatar: typeof data?.avatar === "string" ? data.avatar : "",
                level: typeof data?.level === "number" ? data.level : 1,
                video,
                animation_url: video,
                quantity: 1,
                streamId: client.roomId,
                stream_id: client.roomId,
                timestamp: new Date().toISOString(),
              };
              broadcastToRoom(client.roomId, "gift_sent", retryPayload);
              const ownerId = await resolveStreamOwnerUserId(client.roomId);
              if (ownerId && ownerId !== client.userId) {
                sendToUserGlobal(ownerId, "gift_sent", retryPayload);
              }
            }
          } catch (err) {
            logger.warn({ err }, "gift_sent duplicate creator video retry failed");
          }
        }

        sendToClient(client, "gift_ack", {
          transactionId,
          status: delivered.delivered ? "success" : delivered.reason,
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
        if (opponentUserId) {
          // Never trust an opponent id supplied by the host client. The target
          // must have accepted this host's invite before becoming a creator
          // participant in the battle.
          const accepted = await valkeyGet(
            battleAcceptedKey(client.roomId, opponentUserId),
          );
          if (!accepted || !opponentName) {
            sendToClient(client, "battle_error", {
              message: "Accepted creator invite required",
            });
            break;
          }
        }
        const existing = await getBattleFromStore(client.roomId);
        if (existing) {
          await valkeyDel("battle:" + client.roomId);
          await valkeyDel("ubr:" + existing.hostUserId);
          if (existing.opponentUserId) await valkeyDel("ubr:" + existing.opponentUserId);
        }
        const session = await createBattle(
          client.roomId,
          client.userId,
          data.hostName || client.displayName,
        );
        if (!session) break;
        if (opponentUserId && opponentName) {
          session.opponentUserId = opponentUserId;
          session.opponentName = opponentName;
          session.opponentRoomId = opponentRoomId || opponentUserId;
          await valkeySet(
            "ubr:" + opponentUserId,
            client.roomId,
            BATTLE_USER_ROOM_TTL_MS,
          );
          // Opponent must publish into the host LiveKit room for battle video.
          await grantCohostPublish(client.roomId, opponentUserId);
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
        if (!invited) {
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
            message: "No battle to join",
          });
        } else {
          await valkeyDel(inviteKey);
        }
        break;
      }

      case "battle_gift_score": {
        // Deprecated + insecure: battle scoring is applied server-side inside the
        // verified "gift_sent" handler (tied to a real paid transaction). This
        // standalone event carried no payment proof and is ignored to prevent
        // free battle-score injection.
        break;
      }

      case "battle_spectator_vote": {
        // Each spectator awards +5 exactly ONCE per full match (claim keyed by
        // battle id, so the next match resets it). Enforced server-side so a
        // forged loop cannot inject unlimited free battle score.
        if (!(await wsRateCheck(client.userId, "spectator_vote", 5, 60_000))) break;
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
        // Creators publish and compete; only spectators may cast the +5 vote.
        if (participantIds.includes(client.userId)) break;
        const voteClaimKey = `battle_vote:${voteBattle.id}:${client.userId}`;
        const firstVote = await valkeySetNx(voteClaimKey, "1", 600_000);
        if (!firstVote) {
          sendToClient(client, "battle_vote_ack", {
            target: null,
            points: 0,
            status: "already_voted",
          });
          break;
        }
        const voteTarget =
          data.target === "host" ? "host" : "opponent";
        await addBattleScoreForTarget(voteRoom, voteTarget as "host" | "opponent", 5);
        sendToClient(client, "battle_vote_ack", {
          target: voteTarget,
          points: 5,
          status: "ok",
        });
        break;
      }

      case "battle_end": {
        const bSession = await getBattleFromStore(client.roomId);
        if (bSession && bSession.hostUserId === client.userId) {
          await endBattle(client.roomId);
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
        const ownerId = await resolveStreamOwnerUserId(client.roomId);
        if (!ownerId || ownerId !== client.userId) break;
        const targetUserId =
          typeof data.targetUserId === "string" ? data.targetUserId.trim() : "";
        if (!targetUserId || targetUserId === client.userId) break;
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
          if (!targetPublishing) break;
        } else {
          let targetIsLiveHost = await isStreamHost(targetUserId, targetUserId);
          if (!targetIsLiveHost) {
            try {
              const liveRows = await dbGetLiveStreams();
              targetIsLiveHost = liveRows.some((r) => r.user_id === targetUserId);
            } catch { /* fall through — treated as not live */ }
          }
          if (!targetIsLiveHost) break;
        }
        const streamKey =
          typeof data.streamKey === "string" && data.streamKey.trim()
            ? data.streamKey.trim()
            : client.roomId;
        await valkeySet(
          `battle_invite:${streamKey}:${targetUserId}`,
          "1",
          10 * 60 * 1000,
        );
        sendToUserGlobal(targetUserId, "battle_invite", {
          hostUserId: client.userId,
          hostName: data.hostName || client.displayName,
          hostAvatar: data.hostAvatar || client.avatarUrl || "",
          streamKey,
        });
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
        if (!authoritativeHostUserId || authoritativeHostUserId !== hostUserId) break;
        const invitedKey = hostRoomForInvite
          ? await valkeyGet(`battle_invite:${hostRoomForInvite}:${client.userId}`)
          : null;
        if (!invitedKey) break;
        // Persist the accepted creator role before navigation. This is the
        // authority used by battle_create and by the LiveKit publish-token
        // check; a spectator never receives either grant.
        await valkeySet(
          battleAcceptedKey(hostRoomForInvite, client.userId),
          "1",
          BATTLE_USER_ROOM_TTL_MS,
        );
        await grantCohostPublish(hostRoomForInvite, client.userId);
        await valkeyDel(`battle_invite:${hostRoomForInvite}:${client.userId}`);
        // Record where the accepter is heading BEFORE their solo stream ends,
        // so stream_end can redirect their spectators into the battle room.
        if (hostStreamKeyRaw && hostStreamKeyRaw !== client.roomId) {
          await valkeySet(
            "ubr:" + client.userId,
            hostStreamKeyRaw,
            BATTLE_USER_ROOM_TTL_MS,
          );
        }
        sendToUserGlobal(authoritativeHostUserId, "battle_invite_accepted", {
          requesterUserId: client.userId,
          requesterName: data.requesterName || client.displayName,
          requesterAvatar: data.requesterAvatar || client.avatarUrl || "",
          streamKey: accepterStreamKey,
        });
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
        let targetUserId = await resolveStreamOwnerUserId(rawTarget || streamHint);
        if (
          streamHint &&
          streamHint !== rawTarget &&
          (!targetUserId || targetUserId === rawTarget || targetUserId === streamHint)
        ) {
          const fromStream = await resolveStreamOwnerUserId(streamHint);
          if (fromStream && fromStream !== streamHint) targetUserId = fromStream;
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
        if (!rawHost) break;
        const hostUserId = await resolveStreamOwnerUserId(rawHost);
        if (!hostUserId) break;
        sendToUserGlobal(hostUserId, "cohost_request", {
          requesterUserId: client.userId,
          requesterName: data.requesterName || client.displayName,
          requesterAvatar: data.requesterAvatar || client.avatarUrl || "",
        });
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
        const nextIds = new Set(
          coHosts
            .map((h) => (typeof (h as Record<string, string>).userId === "string" ? (h as Record<string, string>).userId : ""))
            .filter(Boolean),
        );
        for (const uid of previousIds) {
          if (!nextIds.has(uid)) {
            await revokeCohostPublish(roomId, uid);
          }
        }
        for (const uid of nextIds) {
          if (!previousIds.has(uid)) {
            await grantCohostPublish(roomId, uid);
          }
        }
        await setCohostLayout(roomId, coHosts, hostUserId);
        broadcastToRoom(roomId, "cohost_layout_sync", {
          coHosts,
          hostUserId,
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
          Math.min(9999, Math.floor(Number(data?.targetCount) || 1)),
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

      default:
        if (process.env.NODE_ENV !== "production")
          logger.warn({ event }, "Unknown WS event");
    }
  } catch (err) {
    logger.error({ err, event }, "Error handling WS event");
  }
}
