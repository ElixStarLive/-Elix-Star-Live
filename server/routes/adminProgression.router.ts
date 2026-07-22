import { Router, Request, Response } from "express";
import { z } from "zod";
import { requireAuthWithRoles, requireAdmin } from "../middleware/rbac";
import { validateBody } from "../middleware/validate";
import {
  adminAdjustStarterCoins,
  adminAdjustXp,
  getProgressionSnapshot,
  listLevelRequirements,
  listStarterCoinHistory,
  listXpConfig,
  listXpHistory,
  updateXpConfig,
  upsertLevelRequirement,
} from "../lib/starterCoinsXp";
import {
  listMissionsAdmin,
  updateMissionAdmin,
  createMissionAdmin,
  archiveMissionAdmin,
  getMissionStatsAdmin,
  listDailyRewardConfigAdmin,
  updateDailyRewardConfigAdmin,
  getBattleEnergyCaps,
  updateBattleEnergyCapsAdmin,
  updateFeatureFlagsAdmin,
  listFeatureFlagsAdminDetail,
  upsertMissionAdminMeta,
  getDailyRewardPolicyAdmin,
  updateDailyRewardPolicyAdmin,
  listAdminAuditHistory,
} from "../lib/engagementAdmin";
import { logger } from "../lib/logger";

const router = Router();
router.use(requireAuthWithRoles);
router.use(requireAdmin);

router.get("/config", async (_req, res) => {
  try {
    return res.json({ config: await listXpConfig() });
  } catch (err) {
    logger.error({ err }, "admin progression config load failed");
    return res.status(500).json({ error: "CONFIG_LOAD_FAILED" });
  }
});

const xpConfigSchema = z.object({
  source: z.string().min(1).max(100),
  xp_amount: z.number().int().min(0).max(1_000_000),
  enabled: z.boolean(),
});

router.patch(
  "/config",
  validateBody(xpConfigSchema),
  async (req: Request, res: Response) => {
    try {
      const config = await updateXpConfig({
        source: req.body.source,
        xpAmount: req.body.xp_amount,
        enabled: req.body.enabled,
        adminUserId: (req.authContext as NonNullable<typeof req.authContext>).userId,
      });
      if (!config) return res.status(404).json({ error: "SOURCE_NOT_FOUND" });
      return res.json({ config });
    } catch (err) {
      logger.error({ err }, "admin progression config update failed");
      return res.status(500).json({ error: "CONFIG_UPDATE_FAILED" });
    }
  },
);

router.get("/levels", async (_req, res) => {
  try {
    return res.json({ levels: await listLevelRequirements() });
  } catch (err) {
    logger.error({ err }, "admin progression levels load failed");
    return res.status(500).json({ error: "LEVELS_LOAD_FAILED" });
  }
});

const levelSchema = z.object({
  level: z.number().int().min(1).max(1000),
  total_xp_required: z.number().int().positive().max(9_000_000_000),
  title: z.string().max(100).optional().nullable(),
  badge_code: z.string().max(100).optional().nullable(),
  cosmetic_payload: z.record(z.unknown()).optional(),
});

router.put(
  "/levels",
  validateBody(levelSchema),
  async (req: Request, res: Response) => {
    try {
      const level = await upsertLevelRequirement({
        level: req.body.level,
        totalXpRequired: req.body.total_xp_required,
        title: req.body.title,
        badgeCode: req.body.badge_code,
        cosmeticPayload: req.body.cosmetic_payload,
        adminUserId: (req.authContext as NonNullable<typeof req.authContext>).userId,
      });
      if (!level) return res.status(500).json({ error: "LEVEL_UPDATE_FAILED" });
      return res.json({ level });
    } catch (err) {
      if (
        err instanceof Error &&
        err.message === "LEVEL_XP_ORDER_INVALID"
      ) {
        return res.status(400).json({
          error:
            "Level XP must be greater than the previous level and lower than the next level.",
        });
      }
      logger.error({ err }, "admin progression level update failed");
      return res.status(500).json({ error: "LEVEL_UPDATE_FAILED" });
    }
  },
);

router.get("/users/:userId", async (req, res) => {
  const userId = String(req.params.userId);
  try {
    const [progression, xp_history, starter_history] = await Promise.all([
      getProgressionSnapshot(userId),
      listXpHistory(userId, 200),
      listStarterCoinHistory(userId, 200),
    ]);
    if (!progression) {
      return res.status(503).json({ error: "DATABASE_UNAVAILABLE" });
    }
    return res.json({ progression, xp_history, starter_history });
  } catch (err) {
    logger.error({ err, userId }, "admin progression user audit failed");
    return res.status(500).json({ error: "USER_AUDIT_FAILED" });
  }
});

const adjustmentSchema = z.object({
  user_id: z.string().min(1).max(200),
  amount_delta: z
    .number()
    .int()
    .min(-9_000_000_000)
    .max(9_000_000_000)
    .refine((value) => value !== 0, "Adjustment cannot be zero"),
  reason: z.string().min(3).max(1000),
  idempotency_key: z.string().min(8).max(200),
});

router.post(
  "/xp-adjustments",
  validateBody(adjustmentSchema),
  async (req: Request, res: Response) => {
    try {
      const progression = await adminAdjustXp({
        userId: req.body.user_id,
        xpDelta: req.body.amount_delta,
        reason: req.body.reason,
        adminUserId: (req.authContext as NonNullable<typeof req.authContext>).userId,
        idempotencyKey: `admin-xp:${req.body.idempotency_key}`,
      });
      if (!progression) {
        return res.status(500).json({ error: "XP_ADJUSTMENT_FAILED" });
      }
      return res.json({ progression });
    } catch (err) {
      logger.error({ err }, "admin XP adjustment failed");
      return res.status(500).json({ error: "XP_ADJUSTMENT_FAILED" });
    }
  },
);

router.post(
  "/starter-adjustments",
  validateBody(adjustmentSchema),
  async (req: Request, res: Response) => {
    try {
      const progression = await adminAdjustStarterCoins({
        userId: req.body.user_id,
        amountDelta: req.body.amount_delta,
        reason: req.body.reason,
        adminUserId: (req.authContext as NonNullable<typeof req.authContext>).userId,
        idempotencyKey: `admin-starter:${req.body.idempotency_key}`,
      });
      if (!progression) {
        return res.status(500).json({ error: "STARTER_ADJUSTMENT_FAILED" });
      }
      return res.json({ progression });
    } catch (err) {
      logger.error({ err }, "admin Starter Coin adjustment failed");
      return res.status(500).json({ error: "STARTER_ADJUSTMENT_FAILED" });
    }
  },
);

// ── Engagement admin (missions, daily rewards, energy caps, flags) ──

router.get("/missions", async (_req, res) => {
  try {
    return res.json({ missions: await listMissionsAdmin() });
  } catch (err) {
    logger.error({ err }, "admin missions list failed");
    return res.status(500).json({ error: "MISSIONS_LOAD_FAILED" });
  }
});

const missionCreateSchema = z.object({
  id: z.string().min(2).max(80),
  scope: z.enum(["daily", "weekly", "creator", "special"]),
  title: z.string().min(1).max(200),
  description: z.string().max(1000).nullable().optional(),
  goal_count: z.number().int().min(1).max(1_000_000),
  reward_xp: z.number().int().min(0).max(1_000_000),
  reward_promo_coins: z.number().int().min(0).max(1_000_000),
  reward_energy: z.number().int().min(0).max(1_000_000),
  metric_key: z.string().min(1).max(80),
  sort_order: z.number().int().min(0).max(10_000).optional(),
});

router.post(
  "/missions",
  validateBody(missionCreateSchema),
  async (req: Request, res: Response) => {
    try {
      const mission = await createMissionAdmin({
        ...req.body,
        adminUserId: (req.authContext as NonNullable<typeof req.authContext>)
          .userId,
      });
      if (!mission) return res.status(409).json({ error: "MISSION_EXISTS_OR_INVALID" });
      return res.status(201).json({ mission });
    } catch (err) {
      logger.error({ err }, "admin mission create failed");
      return res.status(500).json({ error: "MISSION_CREATE_FAILED" });
    }
  },
);

router.post("/missions/:id/archive", async (req: Request, res: Response) => {
  try {
    const result = await archiveMissionAdmin({
      id: String(req.params.id),
      adminUserId: (req.authContext as NonNullable<typeof req.authContext>)
        .userId,
    });
    if (!result) return res.status(404).json({ error: "MISSION_NOT_FOUND" });
    return res.json(result);
  } catch (err) {
    logger.error({ err }, "admin mission archive failed");
    return res.status(500).json({ error: "MISSION_ARCHIVE_FAILED" });
  }
});

router.get("/missions/:id/stats", async (req: Request, res: Response) => {
  try {
    const stats = await getMissionStatsAdmin(String(req.params.id));
    return res.json({ stats });
  } catch (err) {
    logger.error({ err }, "admin mission stats failed");
    return res.status(500).json({ error: "MISSION_STATS_FAILED" });
  }
});

const missionPatchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).nullable().optional(),
  goal_count: z.number().int().min(1).max(1_000_000).optional(),
  reward_xp: z.number().int().min(0).max(1_000_000).optional(),
  reward_promo_coins: z.number().int().min(0).max(1_000_000).optional(),
  reward_energy: z.number().int().min(0).max(1_000_000).optional(),
  enabled: z.boolean().optional(),
  sort_order: z.number().int().min(0).max(10_000).optional(),
  audience: z
    .enum([
      "all_authenticated",
      "creators_only",
      "viewers_only",
      "new_users",
    ])
    .optional(),
  starts_at: z.string().max(40).nullable().optional(),
  ends_at: z.string().max(40).nullable().optional(),
});

router.patch(
  "/missions/:id",
  validateBody(missionPatchSchema),
  async (req: Request, res: Response) => {
    try {
      const adminUserId = (req.authContext as NonNullable<typeof req.authContext>)
        .userId;
      const { audience, starts_at, ends_at, ...missionPatch } = req.body;
      const mission = await updateMissionAdmin({
        id: String(req.params.id),
        ...missionPatch,
        adminUserId,
      });
      if (!mission) return res.status(404).json({ error: "MISSION_NOT_FOUND" });
      let meta = null;
      if (
        audience !== undefined ||
        starts_at !== undefined ||
        ends_at !== undefined
      ) {
        meta = await upsertMissionAdminMeta(
          String(req.params.id),
          { audience, starts_at, ends_at },
          adminUserId,
        );
      }
      return res.json({ mission: { ...mission, ...(meta || {}) } });
    } catch (err) {
      logger.error({ err }, "admin mission update failed");
      return res.status(500).json({ error: "MISSION_UPDATE_FAILED" });
    }
  },
);

router.get("/daily-rewards", async (_req, res) => {
  try {
    return res.json({
      rewards: await listDailyRewardConfigAdmin(),
      policy: await getDailyRewardPolicyAdmin(),
    });
  } catch (err) {
    logger.error({ err }, "admin daily rewards list failed");
    return res.status(500).json({ error: "DAILY_REWARDS_LOAD_FAILED" });
  }
});

const dailyRewardSchema = z.object({
  streak_day: z.number().int().min(1).max(7),
  reward_xp: z.number().int().min(0).max(1_000_000),
  reward_promo_coins: z.number().int().min(0).max(1_000_000),
  reward_label: z.string().max(200).nullable().optional(),
  cosmetic_ref: z.string().max(200).nullable().optional(),
});

router.put(
  "/daily-rewards",
  validateBody(dailyRewardSchema),
  async (req: Request, res: Response) => {
    try {
      const reward = await updateDailyRewardConfigAdmin({
        streakDay: req.body.streak_day,
        reward_xp: req.body.reward_xp,
        reward_promo_coins: req.body.reward_promo_coins,
        reward_label: req.body.reward_label ?? req.body.cosmetic_ref ?? null,
        adminUserId: (req.authContext as NonNullable<typeof req.authContext>)
          .userId,
      });
      if (!reward) return res.status(400).json({ error: "INVALID_STREAK_DAY" });
      return res.json({ reward });
    } catch (err) {
      logger.error({ err }, "admin daily reward update failed");
      return res.status(500).json({ error: "DAILY_REWARD_UPDATE_FAILED" });
    }
  },
);

const dailyPolicySchema = z.object({
  streak_reset_policy: z.enum(["miss_one_day", "never"]).optional(),
  effective_start: z.string().max(40).nullable().optional(),
  effective_end: z.string().max(40).nullable().optional(),
  active: z.boolean().optional(),
});

router.put(
  "/daily-rewards/policy",
  validateBody(dailyPolicySchema),
  async (req: Request, res: Response) => {
    try {
      const policy = await updateDailyRewardPolicyAdmin(
        req.body,
        (req.authContext as NonNullable<typeof req.authContext>).userId,
      );
      return res.json({ policy });
    } catch (err) {
      logger.error({ err }, "admin daily reward policy update failed");
      return res.status(500).json({ error: "DAILY_POLICY_UPDATE_FAILED" });
    }
  },
);

router.get("/battle-energy-caps", async (_req, res) => {
  try {
    return res.json({ caps: await getBattleEnergyCaps() });
  } catch (err) {
    logger.error({ err }, "admin energy caps load failed");
    return res.status(500).json({ error: "ENERGY_CAPS_LOAD_FAILED" });
  }
});

const energyCapsSchema = z.object({
  watch_amount: z.number().int().min(0).max(10_000).optional(),
  comment_amount: z.number().int().min(0).max(10_000).optional(),
  share_amount: z.number().int().min(0).max(10_000).optional(),
  watch_cap: z.number().int().min(0).max(1_000_000).optional(),
  comment_cap: z.number().int().min(0).max(1_000_000).optional(),
  share_cap: z.number().int().min(0).max(1_000_000).optional(),
  storage_cap: z.number().int().min(0).max(10_000_000).optional(),
  session_cap: z.number().int().min(0).max(1_000_000).optional(),
  daily_cap: z.number().int().min(0).max(10_000_000).optional(),
  minimum_boost: z.number().int().min(1).max(100).optional(),
  allowed_boost_values: z.array(z.number().int().min(1).max(100)).max(20).optional(),
  fan_energy_threshold: z.number().int().min(1).max(100_000_000).optional(),
  score_multiplier: z.number().min(1).max(5).optional(),
  boost_duration_sec: z.number().int().min(1).max(120).optional(),
  enabled: z.boolean().optional(),
});

router.put(
  "/battle-energy-caps",
  validateBody(energyCapsSchema),
  async (req: Request, res: Response) => {
    try {
      const caps = await updateBattleEnergyCapsAdmin(
        req.body,
        (req.authContext as NonNullable<typeof req.authContext>).userId,
      );
      return res.json({ caps });
    } catch (err) {
      logger.error({ err }, "admin energy caps update failed");
      return res.status(500).json({ error: "ENERGY_CAPS_UPDATE_FAILED" });
    }
  },
);

router.get("/feature-flags", async (_req, res) => {
  try {
    const detail = await listFeatureFlagsAdminDetail();
    return res.json(detail);
  } catch (err) {
    logger.error({ err }, "admin feature flags load failed");
    return res.status(500).json({ error: "FLAGS_LOAD_FAILED" });
  }
});

const flagsSchema = z
  .object({
    engagementHubEnabled: z.boolean().optional(),
    promotionalCoinsEnabled: z.boolean().optional(),
    battleEnergyEnabled: z.boolean().optional(),
    dailyLoginEnabled: z.boolean().optional(),
    missionRewardsEnabled: z.boolean().optional(),
    promoGiftSpendEnabled: z.boolean().optional(),
    treasureHuntEnabled: z.boolean().optional(),
    stickerCollectionEnabled: z.boolean().optional(),
    creatorCollectionsEnabled: z.boolean().optional(),
    engagementNeonApproved: z.boolean().optional(),
    liveQuestsEnabled: z.boolean().optional(),
    petEvolutionEnabled: z.boolean().optional(),
    worldEventsEnabled: z.boolean().optional(),
    guildsEnabled: z.boolean().optional(),
    appleSignInEnabled: z.boolean().optional(),
    reason: z.string().max(500).optional(),
    confirm: z.boolean().optional(),
  })
  .refine(
    (v) =>
      Object.keys(v).filter((k) => k !== "confirm" && k !== "reason").length >
      0,
    "At least one flag required",
  );

router.patch(
  "/feature-flags",
  validateBody(flagsSchema),
  async (req: Request, res: Response) => {
    try {
      const highImpact =
        typeof req.body.engagementNeonApproved === "boolean" ||
        typeof req.body.promotionalCoinsEnabled === "boolean" ||
        typeof req.body.promoGiftSpendEnabled === "boolean" ||
        typeof req.body.battleEnergyEnabled === "boolean";
      if (highImpact && req.body.confirm !== true) {
        return res.status(400).json({
          error: "CONFIRM_REQUIRED",
          message:
            "High-impact flag changes require confirm: true in the request body.",
        });
      }
      const { confirm: _c, ...patch } = req.body;
      const flags = await updateFeatureFlagsAdmin(
        patch,
        (req.authContext as NonNullable<typeof req.authContext>).userId,
      );
      const detail = await listFeatureFlagsAdminDetail();
      return res.json({ flags, rows: detail.rows });
    } catch (err) {
      logger.error({ err }, "admin feature flags update failed");
      return res.status(500).json({ error: "FLAGS_UPDATE_FAILED" });
    }
  },
);

router.get("/audit-history", async (req: Request, res: Response) => {
  try {
    const limit = Number(req.query.limit || 50);
    return res.json({ entries: await listAdminAuditHistory(limit) });
  } catch (err) {
    logger.error({ err }, "admin audit history failed");
    return res.status(500).json({ error: "AUDIT_LOAD_FAILED" });
  }
});

export default router;
