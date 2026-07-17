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
} from "./battle";
import { getGiftValue, normalizeBattleTarget } from "./giftRegistry";
import {
  broadcastToFeedSubscribers,
} from "../feedBroadcast";
import { removeActiveStream, resolveStreamOwnerUserId } from "../routes/livestream";
import {
  wsRateCheck,
  tryClaimTransaction,
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
  incrementGiftGoal,
  setGiftGoal,
} from "./giftGoal";
import { dbIsBlockedEitherWay, getPool } from "../lib/postgres";

const BATTLE_USER_ROOM_TTL_MS = 600_000;

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

        // Server-authoritative: broadcast only gifts backed by a persisted paid
        // or Starter Coin transaction from this user for this room.
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

        const now = Date.now();
        const claim = await tryClaimTransaction(String(transactionId), now);
        if (!claim.claimed) {
          sendToClient(client, "gift_ack", {
            transactionId,
            status: "duplicate",
            timestamp: claim.existingTimestamp,
          });
          return;
        }

        broadcastToRoom(client.roomId, "gift_sent", {
          giftId: verified.giftId,
          coins: verified.coins,
          giftSource: verified.giftSource,
          transactionId: String(transactionId),
          battleTarget: normalizeBattleTarget(data.battleTarget) || null,
          user_id: client.userId,
          username: client.username,
          timestamp: new Date().toISOString(),
        });

        // Starter gifts are experiential only: animation/chat notification is
        // broadcast, but they never affect paid gift goals or battle scores.
        const sentGiftId = verified.giftId;
        if (sentGiftId && verified.giftSource === "paid_coins") {
          const updatedGoal = await incrementGiftGoal(client.roomId, sentGiftId, 1);
          if (updatedGoal) {
            broadcastToRoom(client.roomId, "gift_goal_sync", updatedGoal);
          }
        }

        sendToClient(client, "gift_ack", {
          transactionId,
          status: "success",
          timestamp: now,
        });

        const activeBattle = await getBattleFromStore(client.roomId);
        if (
          verified.giftSource === "paid_coins" &&
          activeBattle &&
          activeBattle.status === "ACTIVE"
        ) {
          const serverGiftValue = getGiftValue(sentGiftId);
          if (serverGiftValue > 0) {
            const normalizedTarget = normalizeBattleTarget(data.battleTarget);
            await addBattleScoreForTarget(
              client.roomId,
              normalizedTarget || "host",
              serverGiftValue,
            );
          }
        }
        break;
      }

      case "battle_create": {
        if (!(await wsRateCheck(client.userId, "battle_create", 10, 60_000))) break;
        const ownerId = await resolveStreamOwnerUserId(client.roomId);
        if (!ownerId || ownerId !== client.userId) break;
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
        const opponentUserId =
          typeof data.opponentUserId === "string" ? data.opponentUserId : "";
        const opponentName =
          typeof data.opponentName === "string" ? data.opponentName : "";
        const opponentRoomId =
          typeof data.opponentRoomId === "string" ? data.opponentRoomId : "";
        if (opponentUserId && opponentName) {
          session.opponentUserId = opponentUserId;
          session.opponentName = opponentName;
          session.opponentRoomId = opponentRoomId || opponentUserId;
          await valkeySet(
            "ubr:" + opponentUserId,
            client.roomId,
            BATTLE_USER_ROOM_TTL_MS,
          );
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
        // Client already allows one tap; enforce server-side so a forged loop
        // cannot inject unlimited free battle score (undermines paid gifts).
        if (!(await wsRateCheck(client.userId, "spectator_vote", 5, 60_000))) break;
        const voteRoom = client.roomId;
        const voteBattle = await getBattleFromStore(voteRoom);
        if (!voteBattle || voteBattle.status !== "ACTIVE") break;
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
        if (currentBattle) {
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
            opponentUserId: currentBattle.opponentUserId,
            opponentName: currentBattle.opponentName,
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
        }
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
        const accepterStreamKey =
          typeof data.streamKey === "string" && data.streamKey.trim()
            ? data.streamKey.trim()
            : client.roomId;
        sendToUserGlobal(hostUserId, "battle_invite_accepted", {
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
          broadcastToRoom(client.roomId, "stream_ended", {
            stream_key: client.roomId,
            host_user_id: client.userId,
            reason: "host_ended",
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

      case "booster_activated":
        broadcastToRoom(client.roomId, "booster_activated", {
          ...data,
          user_id: client.userId,
        });
        break;

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
