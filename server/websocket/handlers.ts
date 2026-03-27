import { Client, broadcastToRoom, sendToClient, sendToUserGlobal } from "./index";
import {
  battles,
  userBattleRoom,
  createBattle,
  joinBattle,
  startBattleTimer,
  endBattle,
  addBattleScoreForTarget,
  broadcastBattleState,
  getBattleFromStore,
} from "./battle";
import { getGiftValue, normalizeBattleTarget } from "./giftRegistry";
import {
  broadcastToFeedSubscribers,
} from "../feedBroadcast";
import { removeActiveStream } from "../routes/livestream";
import {
  wsRateCheck,
  isTransactionDuplicate,
  markTransactionProcessed,
  setCohostLayout,
  deleteCohostLayout,
} from "./index";

export async function handleMessage(
  client: Client,
  event: string,
  data: any,
): Promise<void> {
  if (!data) data = {};

  try {
    switch (event) {
      case "chat_message":
        if (!(await wsRateCheck(client.userId, "chat", 100, 10_000))) break;
        broadcastToRoom(client.roomId, "chat_message", {
          ...data,
          user_id: client.userId,
          username: client.username,
          timestamp: new Date().toISOString(),
        });
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

        if (transactionId) {
          const txnCheck = await isTransactionDuplicate(transactionId);
          if (txnCheck.duplicate) {
            sendToClient(client, "gift_ack", {
              transactionId,
              status: "duplicate",
              timestamp: txnCheck.timestamp,
            });
            return;
          }
        }

        const now = Date.now();
        if (transactionId) {
          await markTransactionProcessed(transactionId, now);
        }

        broadcastToRoom(client.roomId, "gift_sent", {
          ...data,
          user_id: client.userId,
          username: client.username,
          timestamp: new Date().toISOString(),
        });

        if (transactionId) {
          sendToClient(client, "gift_ack", {
            transactionId,
            status: "success",
            timestamp: now,
          });
        }

        const activeBattle = await getBattleFromStore(client.roomId);
        if (activeBattle && activeBattle.status === "ACTIVE") {
          const serverGiftValue = getGiftValue(data.giftId);
          if (serverGiftValue > 0) {
            const normalizedTarget = normalizeBattleTarget(data.battleTarget);
            if (normalizedTarget) {
              await addBattleScoreForTarget(
                client.roomId,
                normalizedTarget,
                serverGiftValue,
              );
            } else {
              await addBattleScoreForTarget(client.roomId, "host", serverGiftValue);
            }
          }
        }
        break;
      }

      case "battle_create": {
        const existing = await getBattleFromStore(client.roomId);
        if (existing) {
          if (existing.timer) clearInterval(existing.timer);
          userBattleRoom.delete(existing.hostUserId);
          userBattleRoom.delete(existing.opponentUserId);
          battles.delete(client.roomId);
        }
        const session = await createBattle(
          client.roomId,
          client.userId,
          data.hostName || client.displayName,
        );
        const opponentUserId =
          typeof data.opponentUserId === "string" ? data.opponentUserId : "";
        const opponentName =
          typeof data.opponentName === "string" ? data.opponentName : "";
        const opponentRoomId =
          typeof data.opponentRoomId === "string" ? data.opponentRoomId : "";
        if (opponentUserId && opponentName) {
          session.opponentUserId = opponentUserId;
          session.opponentName = opponentName;
          session.opponentRoomId = opponentRoomId;
          if (opponentUserId)
            userBattleRoom.set(opponentUserId, client.roomId);
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
        const battleSession = await joinBattle(
          client.roomId,
          client.userId,
          data.opponentName || client.displayName,
        );
        if (!battleSession) {
          sendToClient(client, "battle_error", {
            message: "No battle to join",
          });
        }
        break;
      }

      case "battle_gift_score": {
        const bRoom = userBattleRoom.get(client.userId) || client.roomId;
        const target = normalizeBattleTarget(data.target);
        if (!target) break;
        const giftId = data.giftId;
        const serverPoints = giftId ? getGiftValue(giftId) : 0;
        if (serverPoints > 0) {
          await addBattleScoreForTarget(bRoom, target, serverPoints);
        }
        break;
      }

      case "battle_spectator_vote": {
        const voteRoom = client.roomId;
        const voteBattle = await getBattleFromStore(voteRoom);
        if (!voteBattle || voteBattle.status !== "ACTIVE") break;
        const voteTarget =
          data.target === "host" ? "host" : "opponent";
        await addBattleScoreForTarget(voteRoom, voteTarget as "host" | "opponent", 5);
        sendToClient(client, "battle_vote_ack", {
          target: voteTarget,
          points: 5,
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
            hostScore: currentBattle.hostScore,
            opponentScore: currentBattle.opponentScore,
            player3Score: currentBattle.player3Score,
            player4Score: currentBattle.player4Score,
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
        const targetUserId =
          typeof data.targetUserId === "string" ? data.targetUserId : "";
        if (!targetUserId) break;
        sendToUserGlobal(targetUserId, "battle_invite", {
          hostUserId: client.userId,
          hostName: data.hostName || client.displayName,
          hostAvatar: data.hostAvatar || client.avatarUrl || "",
          streamKey: client.roomId,
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
        sendToUserGlobal(hostUserId, "battle_invite_accepted", {
          requesterUserId: client.userId,
          requesterName: data.requesterName || client.displayName,
          requesterAvatar: data.requesterAvatar || client.avatarUrl || "",
          streamKey: client.roomId,
        });
        break;
      }

      case "stream_end": {
        await deleteCohostLayout(client.roomId);
        removeActiveStream(client.roomId, client.userId);
        broadcastToRoom(client.roomId, "stream_ended", {
          stream_key: client.roomId,
          host_user_id: client.userId,
          reason: "host_ended",
        });
        broadcastToFeedSubscribers("stream_ended", {
          stream_key: client.roomId,
        });
        break;
      }

      case "cohost_invite_send": {
        if (
          !(await wsRateCheck(client.userId, "cohost_invite_send", 200, 60_000))
        )
          break;
        const targetUserId =
          typeof data.targetUserId === "string" ? data.targetUserId : "";
        if (!targetUserId) break;
        const cohostSent = sendToUserGlobal(
          targetUserId,
          "cohost_invite",
          {
            hostUserId: client.userId,
            hostName: data.hostName || client.displayName,
            hostAvatar: data.hostAvatar || client.avatarUrl || "",
            streamKey: client.roomId,
          },
        );
        sendToClient(client, "cohost_invite_ack", {
          targetUserId,
          delivered: cohostSent,
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
        const hostUserId =
          typeof data.hostUserId === "string" ? data.hostUserId : "";
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
        const requesterUserId =
          typeof data.requesterUserId === "string"
            ? data.requesterUserId
            : "";
        if (!requesterUserId) break;
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
        const roomId =
          typeof data.roomId === "string" ? data.roomId : client.roomId;
        const rawCoHosts = Array.isArray(data.coHosts) ? data.coHosts : [];
        const hostUserId =
          typeof data.hostUserId === "string"
            ? data.hostUserId
            : client.userId;
        const seen = new Set<string>();
        const coHosts = rawCoHosts.filter((h: any) => {
          const uid = typeof h.userId === "string" ? h.userId : "";
          if (!uid || uid === hostUserId || seen.has(uid)) return false;
          seen.add(uid);
          return true;
        });
        if (roomId) {
          await setCohostLayout(roomId, coHosts, hostUserId);
          broadcastToRoom(roomId, "cohost_layout_sync", {
            coHosts,
            hostUserId,
          });
        }
        break;
      }

      case "booster_activated":
        broadcastToRoom(client.roomId, "booster_activated", {
          ...data,
          user_id: client.userId,
        });
        break;

      default:
        if (process.env.NODE_ENV !== "production")
          console.log("Unknown event:", event);
    }
  } catch (err) {
    console.error(`Error handling event '${event}':`, err);
  }
}
