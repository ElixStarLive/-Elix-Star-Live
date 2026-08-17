/**
 * Authoritative in-room gift delivery.
 *
 * After a gift is paid (REST), delivery must not depend on the client re-sending
 * a WebSocket event. This module claims the transaction once, routes gift_sent
 * (WITH a playable video URL) to the target creator's audience only, updates
 * gift goals, and applies battle scores separately (team aggregation, not gift
 * broadcast).
 */

import {
  broadcastToRoom,
  broadcastToCreatorAudience,
  tryClaimTransaction,
  releaseTransactionClaim,
  sendToUserGlobal,
} from "./index";
import {
  getGiftValue,
  getGiftIconUrl,
  battleTargetToFanSide,
  normalizeBattleTarget,
  resolvePlayableGiftVideoUrl,
} from "./giftRegistry";
import {
  isActiveBattleSession,
  resolveGiftTargetCreatorId,
  seatedBattleCreatorIds,
} from "./giftAudience";
import { incrementGiftGoal } from "./giftGoal";
import { addBattleScoreForTarget, getBattleFromStore } from "./battle";
import { resolveBoosterCatch } from "../lib/booster";
import { getPool } from "../lib/postgres";
import { logger } from "../lib/logger";
import { resolveStreamOwnerUserId } from "../routes/livestream";
import { addMvpPoints, bumpAchievement, bumpMission, fanEnergyGiftMultiplier } from "../lib/engagement";
import { recordCreatorGiftProgress } from "../lib/engagementPhase15";

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
  giftSource: "starter_coins" | "paid_coins" | "promotional_coins";
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

async function applyActiveBattleGiftScore(opts: {
  roomId: string;
  userId: string;
  username: string;
  giftId: string;
  transactionId: string;
  giftSource: DeliverGiftInput["giftSource"];
  coins: number;
  target: "host" | "opponent" | "player3" | "player4";
}): Promise<Record<string, unknown> | null> {
  if (opts.giftSource !== "paid_coins" && opts.giftSource !== "promotional_coins") {
    return null;
  }
  const activeBattle = await getBattleFromStore(opts.roomId);
  if (!activeBattle || activeBattle.status !== "ACTIVE") return null;

  // ECONOMY SPLIT (locked):
  // giftEconomicValue  → Diamonds / financial ledger (credited in REST with coinCost)
  // giftBattleScore    → battle winner points only (may include Fan Energy ×1.2)
  // Battle Energy must NEVER increase creator earnings.

  const giftEconomicValue =
    opts.giftSource === "paid_coins"
      ? getGiftValue(opts.giftId)
      : Math.max(0, Math.floor(Number(opts.coins) || getGiftValue(opts.giftId) || 0));
  if (giftEconomicValue <= 0) return null;

  let fanMult = 1;
  try {
    fanMult = await fanEnergyGiftMultiplier(
      opts.roomId,
      battleTargetToFanSide(opts.target),
    );
  } catch (err) {
    logger.warn({ err, roomId: opts.roomId }, "deliverVerifiedGift: fan multiplier failed; using 1x");
  }

  let finalPoints = giftEconomicValue;
  let boosterCaught: Record<string, unknown> | null = null;
  if (opts.giftSource === "paid_coins") {
    try {
      const catchResult = await resolveBoosterCatch(
        opts.roomId,
        opts.userId,
        opts.transactionId,
        opts.giftId,
        giftEconomicValue,
      );
      finalPoints = catchResult.finalPoints;
      if (catchResult.caught) {
        boosterCaught = {
          user_id: opts.userId,
          username: opts.username,
          multiplier: catchResult.multiplier,
          base_points: giftEconomicValue,
          final_points: 0,
          gift_economic_value: giftEconomicValue,
          gift_battle_score: 0,
          gift_id: opts.giftId,
          battleTarget: opts.target,
          transaction_id: opts.transactionId,
          timestamp: new Date().toISOString(),
        };
      }
    } catch (err) {
      logger.warn({ err, roomId: opts.roomId }, "deliverVerifiedGift: booster catch failed; using base score");
    }
  }

  const giftBattleScore = Math.max(1, Math.round(finalPoints * fanMult));
  await addBattleScoreForTarget(opts.roomId, opts.target, giftBattleScore);
  if (boosterCaught) {
    boosterCaught.final_points = giftBattleScore;
    boosterCaught.gift_battle_score = giftBattleScore;
  }
  return boosterCaught;
}

/**
 * One gift visual event → one target creator + that creator's spectators.
 * Battle score stays on broadcastToRoom (addBattleScoreForTarget). Solo live
 * still uses the full room because that room is already one creator's audience.
 */
export async function emitGiftSentToTargetAudience(opts: {
  roomId: string;
  payload: Record<string, unknown>;
  battleTarget?: unknown;
  cohostTargetUserId?: string | null;
  boosterCaught?: Record<string, unknown> | null;
}): Promise<string | null> {
  const roomId = String(opts.roomId || "").trim();
  if (!roomId) return null;

  let streamOwnerUserId: string | null = null;
  try {
    streamOwnerUserId = (await resolveStreamOwnerUserId(roomId)) || null;
  } catch {
    streamOwnerUserId = null;
  }

  const battle = await getBattleFromStore(roomId);
  const targetCreatorId = resolveGiftTargetCreatorId({
    battle,
    battleTarget: normalizeBattleTarget(opts.battleTarget),
    cohostTargetUserId: opts.cohostTargetUserId,
    streamOwnerUserId,
  });

  const payload = {
    ...opts.payload,
    ...(targetCreatorId
      ? {
          targetCreatorId,
          target_creator_id: targetCreatorId,
        }
      : {}),
  };

  const battleActive = isActiveBattleSession(battle);
  if (battleActive && targetCreatorId) {
    broadcastToCreatorAudience(roomId, targetCreatorId, "gift_sent", payload);
    for (const seatedId of seatedBattleCreatorIds(battle)) {
      if (seatedId && seatedId !== targetCreatorId) {
        broadcastToCreatorAudience(roomId, seatedId, "gift_sent", payload);
      }
    }
    if (opts.boosterCaught) {
      broadcastToCreatorAudience(
        roomId,
        targetCreatorId,
        "booster_caught",
        opts.boosterCaught,
      );
    }
  } else if (!battleActive) {
    broadcastToRoom(roomId, "gift_sent", payload);
    if (opts.boosterCaught) {
      broadcastToRoom(roomId, "booster_caught", opts.boosterCaught);
    }
  }

  // Creator must always receive gift_sent on their own sockets. Room/audience
  // broadcast can miss them (audience stamp, instance split). Client txn gate
  // drops a duplicate if they also got the room event.
  if (targetCreatorId) {
    sendToUserGlobal(targetCreatorId, "gift_sent", payload);
  }

  return targetCreatorId;
}

async function resolveSenderProfile(
  userId: string,
): Promise<{ username: string; avatar: string; level: number } | null> {
  const db = getPool();
  if (!db || !userId) return null;
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
    if (!row) return null;
    const username =
      (typeof row.display_name === "string" && row.display_name.trim()) ||
      (typeof row.username === "string" && row.username.trim()) ||
      "";
    return {
      username,
      avatar: typeof row.avatar_url === "string" ? row.avatar_url : "",
      level: Number(row.level) || 1,
    };
  } catch (err) {
    logger.warn({ err, userId }, "resolveSenderProfile failed");
    return null;
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
  if (!profile) {
    logger.warn({ roomId, userId, transactionId }, "deliverVerifiedGift: sender profile missing");
  }
  const username =
    (typeof input.username === "string" && input.username.trim()) ||
    profile?.username ||
    userId;
  const avatar =
    (typeof input.avatar === "string" && input.avatar) || profile?.avatar || "";
  const level =
    typeof input.level === "number" && Number.isFinite(input.level)
      ? input.level
      : profile?.level || 1;

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

  // Battle score is part of ACTIVE-battle delivery. Apply it before gift_sent
  // so a scored gift is never shown without the score write. If the write
  // fails, release the claim so REST can retry delivery without double-pay.
  let boosterCaught: Record<string, unknown> | null = null;
  try {
    boosterCaught = await applyActiveBattleGiftScore({
      roomId,
      userId,
      username,
      giftId,
      transactionId,
      giftSource: input.giftSource,
      coins: Number(input.coins) || 0,
      target: normalizedTarget || "host",
    });
  } catch (err) {
    await releaseTransactionClaim(transactionId);
    throw err;
  }

  const targetCreatorId = await emitGiftSentToTargetAudience({
    roomId,
    payload,
    battleTarget: normalizedTarget,
    cohostTargetUserId,
    boosterCaught,
  });

  if (targetCreatorId && targetCreatorId !== userId) {
    try {
      await recordCreatorGiftProgress(userId, targetCreatorId, 1);
    } catch (err) {
      logger.warn({ err, roomId }, "deliverVerifiedGift: creator card gift progress skipped");
    }
  }

  if (input.giftSource === "paid_coins") {
    // Money path only: gift goals from paid coins. Battle score is applied
    // before gift_sent above. Test coins apply match points in the WS handler.
    try {
      const updatedGoal = await incrementGiftGoal(roomId, giftId, 1);
      if (updatedGoal) {
        broadcastToRoom(roomId, "gift_goal_sync", updatedGoal);
      }
    } catch (err) {
      logger.warn({ err, roomId, giftId }, "deliverVerifiedGift: gift goal failed");
    }

    // Engagement Phase 1: MVP aggregates + gift metrics (separate from Battle Energy).
    // Uses economic gift value for Economic Support Score — not battle-boosted points.
    try {
      const { canWriteEngagementWallets } = await import("../lib/engagementFlags");
      if (canWriteEngagementWallets()) {
        const giftEconomicValue = Math.max(
          0,
          Math.floor(Number(input.coins) || getGiftValue(giftId) || 0),
        );
        if (giftEconomicValue > 0) {
          let hostUserId: string | undefined;
          try {
            hostUserId = (await resolveStreamOwnerUserId(roomId)) || undefined;
          } catch {
            hostUserId = undefined;
          }
          await addMvpPoints(userId, giftEconomicValue, {
            roomId,
            hostUserId,
            source: "paid_gift",
          });
        }
        await bumpMission(userId, "gifts_sent", 1);
        await bumpAchievement(userId, "gifts_sent", 1);
      }
    } catch (err) {
      logger.warn({ err, roomId, giftId }, "deliverVerifiedGift: engagement mvp failed");
    }
  }

  if (input.giftSource === "promotional_coins") {
    // Promo path: visual + MVP/engagement. Battle points already applied above.
    // NEVER gift goals money path. NEVER Diamonds / creator earnings.
    try {
      const { canWriteEngagementWallets } = await import("../lib/engagementFlags");
      if (canWriteEngagementWallets()) {
        const pts = Math.max(
          0,
          Math.floor(Number(input.coins) || getGiftValue(giftId) || 0),
        );
        if (pts > 0) {
          let hostUserId: string | undefined;
          try {
            hostUserId = (await resolveStreamOwnerUserId(roomId)) || undefined;
          } catch {
            hostUserId = undefined;
          }
          await addMvpPoints(userId, pts, {
            roomId,
            hostUserId,
            source: "promo_gift",
          });
        }
        await bumpMission(userId, "gifts_sent", 1);
        await bumpAchievement(userId, "gifts_sent", 1);
      }
    } catch (err) {
      logger.warn({ err, roomId, giftId }, "deliverVerifiedGift: promo engagement failed");
    }
  }

  return { delivered: true };
}
