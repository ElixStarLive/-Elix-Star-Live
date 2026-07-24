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
import {
  giftIconUrlFromAnimation,
  resolveGiftMediaUrl,
} from "../lib/giftAssets";
import { deliverVerifiedGift } from "../websocket/giftDelivery";
import {
  getCohostLayout,
  hasCohostPublishGrant,
} from "../websocket/index";
import { getEngagementFlags } from "../lib/engagementFlags";
import { spendPromoCoins, getPromoBalance } from "../lib/engagement";

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
    if (!fraud.ok) {
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

    // Optional: gift a live co-host tile instead of the stream host.
    // Validated via publish grant and/or the host's synced cohost layout.
    let recipientId = creatorId;
    let resolvedCohostTarget: string | null = null;
    const requestedCohost =
      typeof cohostTargetRaw === "string" ? cohostTargetRaw.trim() : "";
    if (requestedCohost && requestedCohost !== creatorId) {
      const granted = await hasCohostPublishGrant(roomId, requestedCohost);
      let inLayout = false;
      if (!granted) {
        const layout = await getCohostLayout(roomId);
        const coHosts = layout?.coHosts;
        inLayout =
          Array.isArray(coHosts) &&
          coHosts.some((h) => {
            const row = h as { userId?: unknown; status?: unknown };
            const uid = typeof row.userId === "string" ? row.userId : "";
            const status = typeof row.status === "string" ? row.status : "";
            return (
              uid === requestedCohost &&
              (status === "live" ||
                status === "accepted" ||
                status === "" ||
                status == null)
            );
          });
      }
      if (!granted && !inLayout) {
        return res.status(400).json({ error: "INVALID_COHOST_TARGET" });
      }
      recipientId = requestedCohost;
      resolvedCohostTarget = requestedCohost;
    }

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
      if (!starterResult.ok) {
        return res.status(400).json({
          error: starterResult.error,
          starter_coin_balance: starterResult.starter_balance,
        });
      }

      if (!starterResult.already_processed) {
        await insertNotification({
          userId: recipientId,
          type: "starter_gift_received",
          title: "You received a Starter Coin gift",
          body: `A supporter sent ${gift.name}. Starter gifts have no monetary value and create no earnings.`,
          actionUrl: `/live/${encodeURIComponent(roomId)}`,
          data: {
            path: `/live/${roomId}`,
            gift_id: giftId,
            gift_source: "starter_coins",
            ...(resolvedCohostTarget
              ? { cohost_target_user_id: resolvedCohostTarget }
              : {}),
          },
        });
      }

      if (!starterResult.already_processed) {
        try {
          await deliverVerifiedGift({
            roomId,
            userId: auth.userId,
            giftId,
            giftName: gift.name,
            coins: coinCost,
            giftSource: "starter_coins",
            transactionId: clientTransactionId,
            battleTarget: battleTargetRaw,
            cohostTargetUserId: resolvedCohostTarget,
            animationUrl:
              resolveGiftMediaUrl(gift.animation_url) ||
              resolveGiftMediaUrl(clientAnimationUrl),
          });
        } catch (err) {
          logger.warn({ err, roomId }, "handleSendGift: starter gift room delivery failed");
        }
      }

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
        message: "Starter gift sent. No creator earnings were created.",
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

      // Idempotent retry: same client_transaction_id must not double-debit promo.
      const priorTx = await pool.query(
        `SELECT gift_id, coins, gift_source
           FROM elix_gift_transactions
          WHERE client_transaction_id = $1
          LIMIT 1`,
        [clientTransactionId],
      );
      if (priorTx.rows[0]) {
        const row = priorTx.rows[0] as {
          gift_id?: string;
          coins?: number;
          gift_source?: string;
        };
        if (
          row.gift_source !== "promotional_coins" ||
          String(row.gift_id) !== giftId ||
          Number(row.coins) !== coinCost
        ) {
          return res.status(409).json({ error: "transaction_conflict" });
        }
        const balance = await getPromoBalance(auth.userId);
        return res.status(200).json({
          ok: true,
          room_id: roomId,
          gift_id: giftId,
          gift_source: "promotional_coins",
          transaction_id: clientTransactionId,
          new_promotional_balance: balance,
          creator_earnings: 0,
          diamonds: 0,
          wallet_update: false,
          already_processed: true,
          message:
            "Promotional gift already processed. Zero Diamonds / creator earnings.",
        });
      }

      const spent = await spendPromoCoins(
        auth.userId,
        coinCost,
        "promo_gift",
        clientTransactionId,
      );
      if (!spent.ok) {
        return res.status(400).json({
          error: spent.error || "INSUFFICIENT_PROMO",
          promotional_coins: spent.balance,
        });
      }

      // Persist gift tx so WS gift_sent can verify (same contract as paid/starter).
      await pool.query(
        `INSERT INTO elix_gift_transactions
           (user_id, room_id, gift_id, coins, client_transaction_id, gift_source, created_at)
         VALUES ($1, $2, $3, $4, $5, 'promotional_coins', NOW())
         ON CONFLICT (client_transaction_id) DO NOTHING`,
        [auth.userId, roomId, giftId, coinCost, clientTransactionId],
      );

      if (recipientId && recipientId !== auth.userId) {
        try {
          await insertNotification({
            userId: recipientId,
            type: "promo_gift_received",
            title: "You received a promotional gift",
            body: `Someone sent ${gift.name} with Promotional Coins (no earnings).`,
            actionUrl: `/live/${encodeURIComponent(roomId)}`,
            data: {
              path: `/live/${roomId}`,
              gift_id: giftId,
              gift_source: "promotional_coins",
              ...(resolvedCohostTarget
                ? { cohost_target_user_id: resolvedCohostTarget }
                : {}),
            },
          });
        } catch (err) {
          logger.warn({ err, recipientId }, "handleSendGift: promo gift push skipped");
        }
      }

      try {
        await deliverVerifiedGift({
          roomId,
          userId: auth.userId,
          giftId,
          giftName: gift.name,
          coins: coinCost,
          giftSource: "promotional_coins",
          transactionId: clientTransactionId,
          battleTarget: battleTargetRaw,
          cohostTargetUserId: resolvedCohostTarget,
          animationUrl:
            resolveGiftMediaUrl(gift.animation_url) ||
            resolveGiftMediaUrl(clientAnimationUrl),
        });
      } catch (err) {
        logger.warn({ err, roomId }, "handleSendGift: promo gift room delivery failed");
      }

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
        message:
          "Promotional gift sent. Zero Diamonds / creator earnings were created.",
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
      if (!debited.ok) {
        return res.status(400).json({
          error: debited.error,
          new_balance: debited.newBalance,
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
          await insertNotification({
            userId: recipientId,
            type: "paid_gift_received",
            title: "You received a gift",
            body: `Someone sent ${gift.name} (${coinCost} coins).`,
            actionUrl: `/live/${encodeURIComponent(roomId)}`,
            data: {
              path: `/live/${roomId}`,
              gift_id: giftId,
              gift_source: "paid_coins",
              ...(resolvedCohostTarget
                ? { cohost_target_user_id: resolvedCohostTarget }
                : {}),
            },
          });
        } catch (err) {
          logger.warn({ err, recipientId }, "handleSendGift: paid gift push skipped");
        }
      }

      // Deliver to the live room from the server (creator sees animation/chat).
      // Idempotent with the client WS gift_sent path via transaction claim.
      if (!debited.alreadyProcessed) {
        try {
          await deliverVerifiedGift({
            roomId,
            userId: auth.userId,
            giftId,
            giftName: gift.name,
            coins: coinCost,
            giftSource: "paid_coins",
            transactionId: clientTransactionId,
            battleTarget: battleTargetRaw,
            cohostTargetUserId: resolvedCohostTarget,
            animationUrl:
              resolveGiftMediaUrl(gift.animation_url) ||
              resolveGiftMediaUrl(clientAnimationUrl),
          });
        } catch (err) {
          logger.warn({ err, roomId }, "handleSendGift: paid gift room delivery failed");
        }
      }

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
        message: "Gift sent and delivered to the live room.",
      });
    }

    await pool.query(
      `INSERT INTO elix_gift_transactions (user_id, room_id, gift_id, coins, client_transaction_id, created_at)
       VALUES ($1, $2, $3, 0, $4, NOW())
       ON CONFLICT (client_transaction_id) DO NOTHING`,
      [auth.userId, roomId, giftId, clientTransactionId],
    );

    return res.status(200).json({
      ok: true,
      room_id: roomId,
      gift_id: giftId,
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
      return res.status(200).json({
        tracks: [],
        configured: true,
        source: "epidemic_sound",
        error: "MUSIC_PROVIDER_ERROR",
      });
    }
  }

  const pool = getPool();
  if (!pool) {
    return res.status(200).json({ tracks: [], configured: false, source: null });
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
      return res.status(200).json({ tracks: [], configured: false, source: null });
    }
    logger.error({ err }, "handleGetSounds failed");
    return res.status(500).json({ tracks: [], error: "Failed to load sounds" });
  }
}
