/**
 * Gifts API: POST /api/gifts/send — validate, debit, and deliver gift in-room.
 * Real-time delivery is server-driven (broadcast gift_sent) so the creator sees
 * the gift even if the client WebSocket event is late or never arrives.
 */

import { Request, Response } from "express";
import { getTokenFromRequest, verifyAuthToken } from "./auth";
import { getPool, dbLoadGifts } from "../lib/postgres";
import { neonDebitGiftWithCreatorCredit, neonEnsureBalanceFromFile } from "../lib/walletNeon";
import { logger } from "../lib/logger";
import { assertGiftRestVelocityOk } from "../lib/fraud";
import { awardPaidGiftXp, sendStarterCoinGift } from "../lib/starterCoinsXp";
import { insertNotification } from "../lib/notifications";
import { getOrCreateProfile } from "./profiles";
import {
  giftIconUrlFromAnimation,
  resolveGiftMediaUrl,
} from "../lib/giftAssets";
import { deliverVerifiedGift } from "../websocket/giftDelivery";
import { isWithinGiftDeliveryWindow } from "../lib/giftDeliveryWindow";
import { resolveValidatedGiftRecipient } from "../websocket/giftRecipient";
import { getEngagementFlags } from "../lib/engagementFlags";
import { spendPromoCoinsAndRecordGift } from "../lib/engagement";

function requireAuth(req: Request, res: Response): { userId: string } | null {
  const token = getTokenFromRequest(req);
  if (!token) {
    res.status(401).json({ error: "Not authenticated." });
    return null;
  }
  const payload = verifyAuthToken(token);
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired session." });
    return null;
  }
  return { userId: payload.sub };
}

async function deliverGiftToLiveRoom(
  input: Parameters<typeof deliverVerifiedGift>[0],
): Promise<boolean> {
  try {
    const delivered = await deliverVerifiedGift(input);
    if (delivered.delivered === true) return true;
    // A confirmed duplicate means the effect is already applied, so the gift did
    // reach the room. "dedupe_unavailable" means Valkey could not tell us either
    // way, and the money is already committed — that must not read as delivered.
    if (delivered.delivered === false && delivered.reason === "duplicate") return true;
    if (delivered.delivered === false && delivered.reason === "dedupe_unavailable") {
      logger.error(
        { roomId: input.roomId, transactionId: input.transactionId },
        "handleSendGift: gift paid but delivery unconfirmed — transaction dedupe unavailable",
      );
    }
    return false;
  } catch (err) {
    logger.error({ err, roomId: input.roomId }, "handleSendGift: room delivery failed");
    return false;
  }
}

/** Display name + avatar for gift inbox rows (creator sees who sent what). */
async function giftSenderLabel(userId: string): Promise<{ name: string; avatar: string }> {
  try {
    const p = await getOrCreateProfile(userId);
    const name = String(p.displayName || p.username || "").trim() || "Someone";
    return { name, avatar: String(p.avatarUrl || "").trim() };
  } catch {
    return { name: "Someone", avatar: "" };
  }
}

function giftWatchUrl(roomId: string, senderId: string): string {
  return `/live/${encodeURIComponent(roomId)}?sender=${encodeURIComponent(senderId)}`;
}

/** POST /api/gifts/send — send gift (server validates; broadcast still via WS in live room) */
export async function handleSendGift(req: Request, res: Response) {
  const auth = requireAuth(req, res);
  if (!auth) return;

  try {
    const {
      room_id,
      gift_id,
      transaction_id,
      streamKey,
      giftId: giftIdAlt,
      gift_source,
      battleTarget,
      battle_target,
      cohostTargetUserId,
      cohost_target_user_id,
      video: clientVideoRaw,
      animation_url: clientAnimationUrlRaw,
    } = req.body ?? {};
    const roomId = typeof room_id === "string" ? room_id.trim() : (typeof streamKey === "string" ? streamKey.trim() : "");
    const giftId = typeof gift_id === "string" ? gift_id.trim() : (typeof giftIdAlt === "string" ? giftIdAlt.trim() : "");
    const isPromoGift =
      gift_source === "promotional_coins" ||
      gift_source === "promo_coins" ||
      gift_source === "promotional";

    // TEST COINS are WS battle-score / animation only — never REST money settlement.
    if (gift_source === "test_coins") {
      return res.status(400).json({
        error: "Test coins cannot be settled as money. Use live battle gift flow only.",
        origin: "test_coins",
        financialValueGbp: 0,
      });
    }

    const battleTargetRaw = battleTarget ?? battle_target;
    const cohostTargetRaw = cohostTargetUserId ?? cohost_target_user_id;
    const clientAnimationUrl =
      (typeof clientVideoRaw === "string" && clientVideoRaw.trim()) ||
      (typeof clientAnimationUrlRaw === "string" && clientAnimationUrlRaw.trim()) ||
      null;

    if (!roomId || !giftId) {
      return res.status(400).json({ error: "room_id and gift_id are required." });
    }

    const pool = getPool();
    if (!pool) return res.status(503).json({ error: "Database not configured" });

    const fraud = await assertGiftRestVelocityOk(auth.userId);
    if (fraud.ok === false) {
      return res.status(429).json({ error: fraud.code });
    }

    const gift = (await dbLoadGifts()).find((row) => row.gift_id === giftId);
    if (!gift) {
      return res.status(400).json({ error: "INVALID_GIFT_ID" });
    }
    const coinCost = gift.coin_cost;
    const clientTransactionId =
      typeof transaction_id === "string" && transaction_id.trim()
        ? transaction_id.trim().slice(0, 128)
        : "";
    if (!clientTransactionId) {
      return res.status(400).json({ error: "transaction_id is required." });
    }

    const hostRes = await pool.query(
      `SELECT user_id
         FROM live_streams
        WHERE stream_key = $1
          AND is_live = TRUE
          AND ended_at IS NULL
        LIMIT 1`,
      [roomId],
    );
    if (!hostRes.rows[0]?.user_id) {
      return res.status(409).json({ error: "STREAM_NOT_LIVE" });
    }
    const creatorId = String(hostRes.rows[0].user_id);

    // WHO is being supported — one validated answer for money, battle score,
    // animation routing and creator progress. During a battle the validated
    // battle seat decides, so paid creator revenue follows the creator the
    // viewer actually gifted, not the room host.
    const resolved = await resolveValidatedGiftRecipient({
      roomId,
      streamOwnerUserId: creatorId,
      requestedBattleTarget: battleTargetRaw,
      requestedCohostTargetUserId: cohostTargetRaw,
    });
    if (resolved.ok === false) {
      return res.status(400).json({ error: resolved.error });
    }
    const giftRecipient = resolved.recipient;
    const recipientId = giftRecipient.creatorId;
    const resolvedCohostTarget =
      giftRecipient.origin === "cohost" ? giftRecipient.creatorId : null;

    if (gift_source === "starter_coins") {
      const starterResult = await sendStarterCoinGift({
        userId: auth.userId,
        recipientUserId: recipientId,
        giftId,
        giftType: gift.gift_type,
        roomId,
        coins: coinCost,
        clientTransactionId,
      });
      if (starterResult.ok === false) {
        return res.status(400).json({
          error: starterResult.error,
          starter_coin_balance: starterResult.starter_balance,
        });
      }

      if (!starterResult.already_processed) {
        const sender = await giftSenderLabel(auth.userId);
        await insertNotification({
          userId: recipientId,
          type: "starter_gift_received",
          title: `${sender.name} sent you a gift`,
          body: `${gift.name} · Starter Coin gift (no earnings)`,
          actionUrl: giftWatchUrl(roomId, auth.userId),
          data: {
            path: `/live/${roomId}`,
            gift_id: giftId,
            gift_name: gift.name,
            gift_source: "starter_coins",
            actor_id: auth.userId,
            sender_name: sender.name,
            avatar_url: sender.avatar,
            ...(resolvedCohostTarget
              ? { cohost_target_user_id: resolvedCohostTarget }
              : {}),
          },
        });
      }

      const roomDelivered = await deliverGiftToLiveRoom({
        roomId,
        userId: auth.userId,
        giftId,
        giftName: gift.name,
        coins: coinCost,
        giftSource: "starter_coins",
        transactionId: clientTransactionId,
        recipient: giftRecipient,
        animationUrl:
          resolveGiftMediaUrl(gift.animation_url) ||
          resolveGiftMediaUrl(clientAnimationUrl),
      });

      return res.status(200).json({
        ok: true,
        room_id: roomId,
        gift_id: giftId,
        gift_source: "starter_coins",
        transaction_id: clientTransactionId,
        new_starter_balance: starterResult.new_starter_balance,
        xp_gained: starterResult.xp_gained,
        total_xp: starterResult.total_xp,
        new_level: starterResult.new_level,
        leveled_up: starterResult.leveled_up,
        creator_earnings: 0,
        wallet_update: false,
        room_delivered: roomDelivered,
        message: roomDelivered
          ? "Starter gift sent. No creator earnings were created."
          : "Starter gift recorded. Live room delivery did not complete.",
      });
    }

    // Promotional Coin gifts: ledger debit, LIVE animation/MVP/battle points,
    // ZERO Diamonds / creator earnings (never neonCreditCreatorEarning).
    if (isPromoGift) {
      const flags = getEngagementFlags();
      if (!flags.promoGiftSpendEnabled || !flags.promotionalCoinsEnabled) {
        return res.status(403).json({
          error: "PROMO_GIFT_SPEND_DISABLED",
          message: "Promotional Coin gifts are currently disabled.",
        });
      }
      if (coinCost <= 0) {
        return res.status(400).json({ error: "INVALID_GIFT_COST" });
      }

      // Idempotent + atomic: debit promo + insert gift tx in one DB transaction.
      const spent = await spendPromoCoinsAndRecordGift({
        userId: auth.userId,
        amount: coinCost,
        roomId,
        giftId,
        clientTransactionId,
      });
      if (!spent.ok) {
        if (spent.error === "transaction_conflict") {
          return res.status(409).json({ error: "transaction_conflict" });
        }
        return res.status(400).json({
          error: spent.error || "INSUFFICIENT_PROMO",
          promotional_coins: spent.balance,
        });
      }
      if (spent.already) {
        return res.status(200).json({
          ok: true,
          room_id: roomId,
          gift_id: giftId,
          gift_source: "promotional_coins",
          transaction_id: clientTransactionId,
          new_promotional_balance: spent.balance,
          creator_earnings: 0,
          diamonds: 0,
          wallet_update: false,
          already_processed: true,
          message:
            "Promotional gift already processed. Zero Diamonds / creator earnings.",
        });
      }

      if (recipientId && recipientId !== auth.userId) {
        try {
          const sender = await giftSenderLabel(auth.userId);
          await insertNotification({
            userId: recipientId,
            type: "promo_gift_received",
            title: `${sender.name} sent you a gift`,
            body: `${gift.name} · Promotional Coins (no earnings)`,
            actionUrl: giftWatchUrl(roomId, auth.userId),
            data: {
              path: `/live/${roomId}`,
              gift_id: giftId,
              gift_name: gift.name,
              gift_source: "promotional_coins",
              actor_id: auth.userId,
              sender_name: sender.name,
              avatar_url: sender.avatar,
              ...(resolvedCohostTarget
                ? { cohost_target_user_id: resolvedCohostTarget }
                : {}),
            },
          });
        } catch (err) {
          logger.warn({ err, recipientId }, "handleSendGift: promo gift push skipped");
        }
      }

      const roomDelivered = await deliverGiftToLiveRoom({
        roomId,
        userId: auth.userId,
        giftId,
        giftName: gift.name,
        coins: coinCost,
        giftSource: "promotional_coins",
        transactionId: clientTransactionId,
        recipient: giftRecipient,
        animationUrl:
          resolveGiftMediaUrl(gift.animation_url) ||
          resolveGiftMediaUrl(clientAnimationUrl),
      });

      return res.status(200).json({
        ok: true,
        room_id: roomId,
        gift_id: giftId,
        gift_source: "promotional_coins",
        transaction_id: clientTransactionId,
        new_promotional_balance: spent.balance,
        creator_earnings: 0,
        diamonds: 0,
        wallet_update: false,
        room_delivered: roomDelivered,
        message: roomDelivered
          ? "Promotional gift sent. Zero Diamonds / creator earnings were created."
          : "Promotional gift recorded. Live room delivery did not complete.",
      });
    }

    if (coinCost > 0) {
      await neonEnsureBalanceFromFile(auth.userId);
      // Debit the sender AND credit the recipient creator's earnings in a
      // SINGLE atomic transaction. Recipient is the stream host or a validated
      // live co-host; co-host gifts use the same 60/40 split. Idempotent per
      // transaction, so the WS delivery path cannot double-apply either side.
      // CRITICAL: coins = giftEconomicValue only. Battle Energy multipliers
      // must never be passed here — Diamonds stay tied to purchased coin cost.
      const debited = await neonDebitGiftWithCreatorCredit({
        userId: auth.userId,
        giftId,
        roomId,
        coins: coinCost,
        clientTransactionId,
        creatorId: recipientId,
      });
      if (debited.ok === false) {
        // A database failure is ours and is retryable; the other two are verdicts
        // about this request. Reporting a DB outage as a bad request would tell
        // the sender their gift was rejected when nothing was decided.
        return res.status(debited.error === "database_error" ? 503 : 400).json({
          error: debited.error,
          new_balance: debited.newBalance,
        });
      }

      // This transaction was already settled by an earlier request, and its
      // effects — battle score, gift goal, engagement, the creator's push —
      // belong to that request. They are kept once-only by the delivery claim,
      // which expires; beyond the delivery window there is nothing left to stop
      // a replay from scoring the battle again without paying, so a settlement
      // that old is never delivered a second time.
      if (
        debited.alreadyProcessed &&
        !isWithinGiftDeliveryWindow(debited.settledAt)
      ) {
        logger.warn(
          {
            userId: auth.userId,
            roomId,
            giftId,
            transactionId: clientTransactionId,
            settledAt: debited.settledAt.toISOString(),
          },
          "handleSendGift: replay of an already-settled gift — not delivered again",
        );
        return res.status(200).json({
          ok: true,
          room_id: roomId,
          gift_id: giftId,
          gift_source: "paid_coins",
          transaction_id: clientTransactionId,
          new_balance: debited.newBalance,
          already_settled: true,
          room_delivered: false,
          message: "This gift was already sent with this transaction id.",
        });
      }

      const paidGiftXp =
        recipientId !== auth.userId
          ? await awardPaidGiftXp({
              userId: auth.userId,
              giftType: gift.gift_type,
              coins: coinCost,
              clientTransactionId,
            })
          : null;

      if (recipientId && recipientId !== auth.userId) {
        try {
          const sender = await giftSenderLabel(auth.userId);
          await insertNotification({
            userId: recipientId,
            type: "paid_gift_received",
            title: `${sender.name} sent you a gift`,
            body: `${gift.name} (${coinCost} coins)`,
            actionUrl: giftWatchUrl(roomId, auth.userId),
            data: {
              path: `/live/${roomId}`,
              gift_id: giftId,
              gift_name: gift.name,
              gift_source: "paid_coins",
              actor_id: auth.userId,
              sender_name: sender.name,
              avatar_url: sender.avatar,
              coins: String(coinCost),
              ...(resolvedCohostTarget
                ? { cohost_target_user_id: resolvedCohostTarget }
                : {}),
            },
          });
        } catch (err) {
          logger.warn({ err, recipientId }, "handleSendGift: paid gift push skipped");
        }
      }

      const roomDelivered = await deliverGiftToLiveRoom({
        roomId,
        userId: auth.userId,
        giftId,
        giftName: gift.name,
        coins: coinCost,
        giftSource: "paid_coins",
        transactionId: clientTransactionId,
        recipient: giftRecipient,
        animationUrl:
          resolveGiftMediaUrl(gift.animation_url) ||
          resolveGiftMediaUrl(clientAnimationUrl),
      });

      return res.status(200).json({
        ok: true,
        room_id: roomId,
        gift_id: giftId,
        gift_source: "paid_coins",
        transaction_id: clientTransactionId,
        new_balance: debited.newBalance,
        xp_gained: paidGiftXp?.xp_gained ?? 0,
        total_xp: paidGiftXp?.total_xp,
        new_level: paidGiftXp?.new_level,
        leveled_up: paidGiftXp?.leveled_up ?? false,
        room_delivered: roomDelivered,
        message: roomDelivered
          ? "Gift sent and delivered to the live room."
          : "Gift paid. Live room delivery did not complete.",
      });
    }

    await pool.query(
      `INSERT INTO elix_gift_transactions (user_id, room_id, gift_id, coins, client_transaction_id, gift_source, created_at)
       VALUES ($1, $2, $3, 0, $4, 'promotional_coins', NOW())
       ON CONFLICT (client_transaction_id) DO NOTHING`,
      [auth.userId, roomId, giftId, clientTransactionId],
    );

    return res.status(200).json({
      ok: true,
      room_id: roomId,
      gift_id: giftId,
      gift_source: "promotional_coins",
      transaction_id: clientTransactionId,
      message: "Gift sent. Delivery in room is via WebSocket.",
    });
  } catch (err) {
    logger.error({ err }, "handleSendGift failed");
    return res.status(500).json({ error: "GIFT_SEND_ERROR" });
  }
}

/** GET /api/gifts/catalog — return active gifts from DB */
export async function handleGetGiftCatalog(_req: Request, res: Response) {
  try {
    const rows = await dbLoadGifts();
    const gifts = rows.map((g) => {
      const animation_url = resolveGiftMediaUrl(g.animation_url);
      const icon_url = giftIconUrlFromAnimation(animation_url);
      return {
        ...g,
        animation_url,
        icon_url,
      };
    });
    res.setHeader("Cache-Control", "public, s-maxage=300, max-age=60");
    return res.status(200).json({ gifts });
  } catch (err) {
    logger.error({ err }, "handleGetGiftCatalog failed");
    return res.status(500).json({ error: "DATABASE_ERROR" });
  }
}

/** GET /api/sounds — licensed tracks for upload picker (Epidemic Sound or Neon fallback) */
export async function handleGetSounds(_req: Request, res: Response) {
  const { isEpidemicSoundConfigured, buildEpidemicSoundTracksForClient } = await import("./music");

  if (isEpidemicSoundConfigured()) {
    try {
      const tracks = await buildEpidemicSoundTracksForClient(60);
      res.setHeader("Cache-Control", "public, s-maxage=300, max-age=60");
      return res.status(200).json({
        tracks,
        configured: true,
        source: "epidemic_sound",
      });
    } catch (err) {
      logger.error({ err }, "handleGetSounds epidemic failed");
      return res.status(502).json({
        tracks: null,
        configured: true,
        source: "epidemic_sound",
        error: "MUSIC_PROVIDER_ERROR",
      });
    }
  }

  const pool = getPool();
  if (!pool) {
    return res.status(503).json({ tracks: null, configured: false, source: null, error: "DATABASE_UNAVAILABLE" });
  }
  try {
    const r = await pool.query(
      `SELECT id, title, artist, audio_url, cover_url, duration, use_count
       FROM sounds
       WHERE is_active = true
       ORDER BY use_count DESC, created_at DESC
       LIMIT 200`
    );
    const tracks = r.rows.map((row: {
      id: string | number;
      title: string;
      artist: string;
      audio_url: string;
      duration: number | string | null;
    }) => ({
      id: String(row.id),
      title: row.title,
      artist: row.artist,
      duration: typeof row.duration === "number"
        ? `${Math.floor(row.duration / 60)}:${String(row.duration % 60).padStart(2, "0")}`
        : String(row.duration || "0:30"),
      url: row.audio_url,
      license: "Licensed",
      source: "Catalog",
      provider: "local" as const,
      clipStartSeconds: 0,
      clipEndSeconds: 30,
    }));
    res.setHeader("Cache-Control", "public, s-maxage=300, max-age=60");
    return res.status(200).json({ tracks, configured: true, source: "database" });
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "42P01") {
      return res.status(503).json({
        tracks: null,
        configured: false,
        source: null,
        error: "SCHEMA_UNAVAILABLE",
      });
    }
    logger.error({ err }, "handleGetSounds failed");
    return res.status(500).json({ tracks: null, error: "Failed to load sounds" });
  }
}
