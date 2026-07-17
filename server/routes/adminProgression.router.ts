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
        adminUserId: req.authContext!.userId,
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
        adminUserId: req.authContext!.userId,
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
        adminUserId: req.authContext!.userId,
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
        adminUserId: req.authContext!.userId,
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

export default router;
