/**
 * Authoritative in-room gift delivery.
 *
 * After a gift is paid (REST), delivery must not depend on the client re-sending
 * a WebSocket event. This module claims the transaction once, broadcasts
 * gift_sent (WITH a playable video URL) to the live room so the creator plays
 * the gift animation, updates gift goals, and applies battle scores.
 */

import { broadcastToRoom, tryClaimTransaction, sendToUserGlobal } from "./index";
import {
  getGiftValue,
  getGiftIconUrl,
  normalizeBattleTarget,
  resolvePlayableGiftVideoUrl,
} from "./giftRegistry";
import { incrementGiftGoal } from "./giftGoal";
import { addBattleScoreForTarget, getBattleFromStore } from "./battle";
import { resolveBoosterCatch } from "../lib/booster";
import { getPool } from "../lib/postgres";
import { logger } from "../lib/logger";
import { resolveStreamOwnerUserId } from "../routes/livestream";

export type DeliverGiftInput = {
  roomId: string;
  userId: string;
  username?: string;
  avatar?: string;
  level?: number;
  giftId: string;
  giftName?: string;
  /** Display name of the creator receiving the gift (for the gift banner). */
  creatorName?: string;
  coins: number;
  giftSource: "starter_coins" | "paid_coins";
  transactionId: string;
  battleTarget?: unknown;
  /** When set, gift was aimed at a live co-host tile (not the stream host). */
  cohostTargetUserId?: string | null;
  /** Prefer this animation URL (from REST gift row / client) when playable. */
  animationUrl?: string | null;
};

export type DeliverGiftResult =
  | { delivered: true }
  | { delivered: false; reason: "duplicate" | "invalid" };

async function resolveSenderProfile(
  userId: string,
): Promise<{ username: string; avatar: string; level: number }> {
  const fallback = { username: "User", avatar: "", level: 1 };
  const db = getPool();
  if (!db || !userId) return fallback;
  try {
    const r = await db.query(
      `SELECT username, display_name, avatar_url, level
         FROM profiles
        WHERE user_id = $1
        LIMIT 1`,
      [userId],
    );
    const row = r.rows[0] as
      | {
          username?: string;
          display_name?: string;
          avatar_url?: string;
          level?: number;
        }
      | undefined;
    if (!row) return fallback;
    const username =
      (typeof row.display_name === "string" && row.display_name.trim()) ||
      (typeof row.username === "string" && row.username.trim()) ||
      "User";
    return {
      username,
      avatar: typeof row.avatar_url === "string" ? row.avatar_url : "",
      level: Number(row.level) || 1,
    };
  } catch {
    return fallback;
  }
}

/**
 * Claim + broadcast + battle/goal side effects. Idempotent per transactionId.
 */
export async function deliverVerifiedGift(
  input: DeliverGiftInput,
): Promise<DeliverGiftResult> {
  const roomId = String(input.roomId || "").trim();
  const userId = String(input.userId || "").trim();
  const giftId = String(input.giftId || "").trim();
  const transactionId = String(input.transactionId || "").trim();
  if (!roomId || !userId || !giftId || !transactionId) {
    return { delivered: false, reason: "invalid" };
  }

  const now = Date.now();
  const claim = await tryClaimTransaction(transactionId, now);
  if (!claim.claimed) {
    return { delivered: false, reason: "duplicate" };
  }

  const profile = await resolveSenderProfile(userId);
  const username =
    (typeof input.username === "string" && input.username.trim()) ||
    profile.username;
  const avatar =
    (typeof input.avatar === "string" && input.avatar) || profile.avatar;
  const level =
    typeof input.level === "number" && Number.isFinite(input.level)
      ? input.level
      : profile.level;

  // Creator gift video play REQUIRES a real mp4/webm URL in the payload.
  // Resolve from REST gift row first, then cache/DB — never broadcast null when
  // a playable URL exists for this gift.
  const video = await resolvePlayableGiftVideoUrl(giftId, input.animationUrl);
  const giftIcon = getGiftIconUrl(giftId) || video?.replace(/\.(mp4|webm|mov)(\?|$)/i, ".png$2") || "🎁";
  const giftName =
    (typeof input.giftName === "string" && input.giftName.trim()) || "Gift";
  const normalizedTarget = normalizeBattleTarget(input.battleTarget);
  const cohostTargetUserId =
    typeof input.cohostTargetUserId === "string" && input.cohostTargetUserId.trim()
      ? input.cohostTargetUserId.trim()
      : null;

  if (!video) {
    logger.warn(
      { giftId, roomId, transactionId },
      "deliverVerifiedGift: no playable gift video URL — creator may not see animation",
    );
  }

  const payload = {
    giftId,
    giftName,
    coins: Number(input.coins) || 0,
    giftSource: input.giftSource,
    transactionId,
    battleTarget: normalizedTarget,
    ...(cohostTargetUserId
      ? {
          cohostTargetUserId,
          cohost_target_user_id: cohostTargetUserId,
        }
      : {}),
    user_id: userId,
    username,
    creator_name:
      typeof input.creatorName === "string" && input.creatorName.trim()
        ? input.creatorName.trim()
        : undefined,
    avatar,
    level,
    video,
    animation_url: video,
    gift_icon: giftIcon,
    quantity: 1,
    streamId: roomId,
    stream_id: roomId,
    timestamp: new Date().toISOString(),
  };

  broadcastToRoom(roomId, "gift_sent", payload);

  // Also push to the stream owner globally so the creator still sees the gift
  // if their WS room id ever drifts from the spectator room id.
  try {
    const ownerId = await resolveStreamOwnerUserId(roomId);
    if (ownerId && ownerId !== userId) {
      sendToUserGlobal(ownerId, "gift_sent", payload);
    }
  } catch (err) {
    logger.warn({ err, roomId }, "deliverVerifiedGift: owner notify skipped");
  }

  // Co-host recipient may be on a different client path — push globally too.
  if (cohostTargetUserId && cohostTargetUserId !== userId) {
    try {
      sendToUserGlobal(cohostTargetUserId, "gift_sent", payload);
    } catch (err) {
      logger.warn({ err, roomId, cohostTargetUserId }, "deliverVerifiedGift: cohost notify skipped");
    }
  }

  if (input.giftSource === "paid_coins") {
    // Money path only: gift goals + battle scores from paid coins.
    // Test coins apply match points in the WS gift_sent handler instead.
    // Starter coins never count as money here.
    try {
      const updatedGoal = await incrementGiftGoal(roomId, giftId, 1);
      if (updatedGoal) {
        broadcastToRoom(roomId, "gift_goal_sync", updatedGoal);
      }
    } catch (err) {
      logger.warn({ err, roomId, giftId }, "deliverVerifiedGift: gift goal failed");
    }

    try {
      const activeBattle = await getBattleFromStore(roomId);
      if (activeBattle && activeBattle.status === "ACTIVE") {
        const serverGiftValue = getGiftValue(giftId);
        if (serverGiftValue > 0) {
          const target = normalizedTarget || "host";
          const catchResult = await resolveBoosterCatch(
            roomId,
            userId,
            transactionId,
            giftId,
            serverGiftValue,
          );
          await addBattleScoreForTarget(roomId, target, catchResult.finalPoints);
          if (catchResult.caught) {
            broadcastToRoom(roomId, "booster_caught", {
              user_id: userId,
              username,
              multiplier: catchResult.multiplier,
              base_points: serverGiftValue,
              final_points: catchResult.finalPoints,
              gift_id: giftId,
              battleTarget: target,
              transaction_id: transactionId,
              timestamp: new Date().toISOString(),
            });
          }
        }
      }
    } catch (err) {
      logger.warn({ err, roomId, giftId }, "deliverVerifiedGift: battle score failed");
    }
  }

  return { delivered: true };
}
