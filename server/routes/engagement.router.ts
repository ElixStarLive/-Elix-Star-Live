import { Router, Request, Response } from "express";
import { requireAuth } from "../middleware/auth";
import { logger } from "../lib/logger";
import {
  getHubSummary,
  listMissionsForUser,
  claimMission,
  listAchievementsForUser,
  getDailyLoginState,
  claimDailyLogin,
  getPromoBalance,
  getEnergyBalance,
  getMvpLeaderboard,
  earnBattleEnergy,
  spendBattleEnergy,
  getFanEnergy,
  fanTierForLevel,
  bumpMission,
  bumpAchievement,
} from "../lib/engagement";
import { getProgressionSnapshot } from "../lib/starterCoinsXp";
import { getPool } from "../lib/postgres";
import { getEngagementFlags } from "../lib/engagementFlags";

const router = Router();
router.use(requireAuth);

router.get("/flags", (_req: Request, res: Response) => {
  res.setHeader("Cache-Control", "private, no-store");
  return res.json({ flags: getEngagementFlags() });
});

router.get("/hub", async (req: Request, res: Response) => {
  const userId = (req.auth as NonNullable<typeof req.auth>).sub;
  if (!getEngagementFlags().engagementHubEnabled) {
    return res.status(404).json({ error: "ENGAGEMENT_HUB_DISABLED" });
  }
  try {
    const hub = await getHubSummary(userId);
    res.setHeader("Cache-Control", "private, no-store");
    return res.json({ hub, flags: getEngagementFlags() });
  } catch (err) {
    logger.error({ err, userId }, "GET engagement/hub failed");
    return res.status(500).json({ error: "HUB_LOAD_FAILED" });
  }
});

router.get("/wallet", async (req: Request, res: Response) => {
  const userId = (req.auth as NonNullable<typeof req.auth>).sub;
  try {
    const db = getPool();
    let purchasedCoins = 0;
    if (db) {
      const w = await db.query(
        `SELECT coin_balance::bigint AS b FROM elix_wallet_balances WHERE user_id = $1`,
        [userId],
      );
      purchasedCoins = Math.max(0, Number(w.rows[0]?.b ?? 0));
    }
    const [promotionalCoins, battleEnergy, progression] = await Promise.all([
      getPromoBalance(userId),
      getEnergyBalance(userId),
      getProgressionSnapshot(userId),
    ]);
    const starterCoins = Number(progression?.starter_coin_balance ?? 0);
    const level = Number(progression?.current_level ?? 0);
    // Server never returns a single merged "coin balance" as the source of truth.
    // totalGiftSpendable is a display helper only; spend priority is server-side.
    const totalGiftSpendable =
      purchasedCoins +
      starterCoins +
      (getEngagementFlags().promoGiftSpendEnabled ? promotionalCoins : 0);
    res.setHeader("Cache-Control", "private, no-store");
    return res.json({
      wallet: {
        purchasedCoins,
        starterCoins,
        promotionalCoins,
        totalGiftSpendable,
        battleEnergy,
        totalXp: Number(progression?.total_xp ?? 0),
        fanLevel: level,
        fanTier: fanTierForLevel(level),
        // Legacy snake_case aliases for existing clients
        purchased_coins: purchasedCoins,
        starter_coins: starterCoins,
        promotional_coins: promotionalCoins,
        battle_energy: battleEnergy,
        total_xp: Number(progression?.total_xp ?? 0),
        fan_level: level,
        fan_tier: fanTierForLevel(level),
      },
      flags: getEngagementFlags(),
    });
  } catch (err) {
    logger.error({ err, userId }, "GET engagement/wallet failed");
    return res.status(500).json({ error: "WALLET_LOAD_FAILED" });
  }
});

router.get("/missions", async (req: Request, res: Response) => {
  const userId = (req.auth as NonNullable<typeof req.auth>).sub;
  try {
    const missions = await listMissionsForUser(userId);
    res.setHeader("Cache-Control", "private, no-store");
    return res.json({ missions });
  } catch (err) {
    logger.error({ err, userId }, "GET engagement/missions failed");
    return res.status(500).json({ error: "MISSIONS_LOAD_FAILED" });
  }
});

router.post("/missions/:missionId/claim", async (req: Request, res: Response) => {
  const userId = (req.auth as NonNullable<typeof req.auth>).sub;
  const missionId = String(req.params.missionId || "");
  try {
    const result = await claimMission(userId, missionId);
    if (!result.ok) {
      return res.status(400).json({ error: result.error || "CLAIM_FAILED" });
    }
    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err, userId, missionId }, "POST mission claim failed");
    return res.status(500).json({ error: "CLAIM_FAILED" });
  }
});

router.get("/fan-level", async (req: Request, res: Response) => {
  const userId = (req.auth as NonNullable<typeof req.auth>).sub;
  try {
    const progression = await getProgressionSnapshot(userId);
    const level = Number(progression?.current_level ?? 0);
    res.setHeader("Cache-Control", "private, no-store");
    return res.json({
      fan_level: {
        level,
        tier: fanTierForLevel(level),
        total_xp: Number(progression?.total_xp ?? 0),
        title: progression?.title || fanTierForLevel(level),
        badge_code: progression?.badge_code || null,
        next_level_total_xp: progression?.next_level_total_xp ?? null,
        xp_to_next_level: progression?.xp_to_next_level ?? null,
      },
    });
  } catch (err) {
    logger.error({ err, userId }, "GET engagement/fan-level failed");
    return res.status(500).json({ error: "FAN_LEVEL_LOAD_FAILED" });
  }
});

router.get("/achievements", async (req: Request, res: Response) => {
  const userId = (req.auth as NonNullable<typeof req.auth>).sub;
  try {
    const achievements = await listAchievementsForUser(userId);
    res.setHeader("Cache-Control", "private, no-store");
    return res.json({ achievements });
  } catch (err) {
    logger.error({ err, userId }, "GET engagement/achievements failed");
    return res.status(500).json({ error: "ACHIEVEMENTS_LOAD_FAILED" });
  }
});

router.get("/daily-login", async (req: Request, res: Response) => {
  const userId = (req.auth as NonNullable<typeof req.auth>).sub;
  try {
    const daily = await getDailyLoginState(userId);
    res.setHeader("Cache-Control", "private, no-store");
    return res.json({ daily });
  } catch (err) {
    logger.error({ err, userId }, "GET engagement/daily-login failed");
    return res.status(500).json({ error: "DAILY_LOGIN_LOAD_FAILED" });
  }
});

router.post("/daily-login/claim", async (req: Request, res: Response) => {
  const userId = (req.auth as NonNullable<typeof req.auth>).sub;
  try {
    const result = await claimDailyLogin(userId);
    if (!result.ok) {
      return res.status(400).json({ error: result.error || "CLAIM_FAILED" });
    }
    return res.json(result);
  } catch (err) {
    logger.error({ err, userId }, "POST daily-login claim failed");
    return res.status(500).json({ error: "CLAIM_FAILED" });
  }
});

router.get("/mvp", async (req: Request, res: Response) => {
  const userId = (req.auth as NonNullable<typeof req.auth>).sub;
  try {
    const periodRaw = String(req.query.period || "today");
    const period =
      periodRaw === "week" || periodRaw === "all" ? periodRaw : "today";
    const board = await getMvpLeaderboard(period, Number(req.query.limit) || 50);
    res.setHeader("Cache-Control", "private, no-store");
    return res.json({ period, leaderboard: board, viewer_id: userId });
  } catch (err) {
    logger.error({ err, userId }, "GET engagement/mvp failed");
    return res.status(500).json({ error: "MVP_LOAD_FAILED" });
  }
});

router.post("/battle-energy/earn", async (req: Request, res: Response) => {
  const userId = (req.auth as NonNullable<typeof req.auth>).sub;
  if (!getEngagementFlags().battleEnergyEnabled) {
    return res.json({ granted: 0, balance: 0, disabled: true });
  }
  try {
    const source = String(req.body?.source || "");
    if (source !== "watch" && source !== "comment" && source !== "share") {
      return res.status(400).json({ error: "INVALID_SOURCE" });
    }
    const roomId = req.body?.roomId ? String(req.body.roomId) : undefined;
    const result = await earnBattleEnergy(userId, source, roomId);
    return res.json(result);
  } catch (err) {
    logger.error({ err, userId }, "POST battle-energy/earn failed");
    return res.status(500).json({ error: "EARN_FAILED" });
  }
});

router.post("/battle-energy/boost", async (req: Request, res: Response) => {
  const userId = (req.auth as NonNullable<typeof req.auth>).sub;
  if (!getEngagementFlags().battleEnergyEnabled) {
    return res.status(403).json({ error: "BATTLE_ENERGY_DISABLED" });
  }
  try {
    const roomId = String(req.body?.roomId || "");
    const side = String(req.body?.side || "");
    // Phase 1: minimum 100 Energy per boost.
    const amount = Math.max(
      100,
      Math.min(5000, Math.floor(Number(req.body?.amount) || 100)),
    );
    if (!roomId || (side !== "host" && side !== "opponent")) {
      return res.status(400).json({ error: "INVALID_BOOST" });
    }
    const result = await spendBattleEnergy(
      userId,
      amount,
      "boost_creator",
      roomId,
      side,
    );
    if (!result.ok) {
      return res.status(400).json({
        error: result.error || "INSUFFICIENT_ENERGY",
        success: false,
        remainingEnergy: result.balance,
      });
    }
    return res.json({
      success: true,
      energySpent: result.energySpent,
      remainingEnergy: result.balance,
      battleFanEnergy: result.fanEnergy,
      boostActivated: result.boostActivated,
      boostMultiplier: result.boostMultiplier,
      boostEndsAt: result.boostEndsAt,
    });
  } catch (err) {
    logger.error({ err, userId }, "POST battle-energy/boost failed");
    return res.status(500).json({ error: "BOOST_FAILED" });
  }
});

router.post("/progress", async (req: Request, res: Response) => {
  const userId = (req.auth as NonNullable<typeof req.auth>).sub;
  if (!getEngagementFlags().engagementNeonApproved) {
    return res.json({ ok: true, skipped: true });
  }
  try {
    const metric = String(req.body?.metric || "");
    const allowed = new Set([
      "battles_joined",
      "lives_watched",
      "unique_creators",
      "watch_minutes",
    ]);
    if (!allowed.has(metric)) {
      return res.status(400).json({ error: "INVALID_METRIC" });
    }
    const delta = Math.max(1, Math.min(10, Math.floor(Number(req.body?.delta) || 1)));
    await bumpMission(userId, metric, delta);
    await bumpAchievement(userId, metric, delta);
    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err, userId }, "POST engagement/progress failed");
    return res.status(500).json({ error: "PROGRESS_FAILED" });
  }
});

router.get("/battle-energy/fan", async (req: Request, res: Response) => {
  try {
    const roomId = String(req.query.roomId || "");
    if (!roomId) return res.status(400).json({ error: "ROOM_REQUIRED" });
    const fan = await getFanEnergy(roomId);
    return res.json({ roomId, fan });
  } catch (err) {
    logger.error({ err }, "GET battle-energy/fan failed");
    return res.status(500).json({ error: "FAN_ENERGY_LOAD_FAILED" });
  }
});

export default router;
