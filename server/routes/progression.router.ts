import { Router, Request, Response } from "express";
import { requireAuth } from "../middleware/auth";
import {
  getProgressionSnapshot,
  listStarterCoinHistory,
  listXpHistory,
} from "../lib/starterCoinsXp";
import { logger } from "../lib/logger";

const router = Router();
router.use(requireAuth);

router.get("/me", async (req: Request, res: Response) => {
  const userId = req.auth!.sub;
  try {
    const progression = await getProgressionSnapshot(userId);
    if (!progression) {
      return res.status(503).json({ error: "DATABASE_UNAVAILABLE" });
    }
    res.setHeader("Cache-Control", "private, no-store");
    return res.json({ progression });
  } catch (err) {
    logger.error({ err, userId }, "GET progression/me failed");
    return res.status(500).json({ error: "PROGRESSION_LOAD_FAILED" });
  }
});

router.get("/users/:userId/status", async (req: Request, res: Response) => {
  const userId = String(req.params.userId || "");
  try {
    const progression = await getProgressionSnapshot(userId);
    if (!progression) {
      return res.status(503).json({ error: "DATABASE_UNAVAILABLE" });
    }
    return res.json({
      status: {
        current_level: progression.current_level,
        title: progression.title,
        badge_code: progression.badge_code,
      },
    });
  } catch (err) {
    logger.error({ err, userId }, "GET progression user status failed");
    return res.status(500).json({ error: "PROGRESSION_LOAD_FAILED" });
  }
});

router.get("/xp-history", async (req: Request, res: Response) => {
  const userId = req.auth!.sub;
  try {
    const history = await listXpHistory(userId, Number(req.query.limit) || 100);
    res.setHeader("Cache-Control", "private, no-store");
    return res.json({ history });
  } catch (err) {
    logger.error({ err, userId }, "GET progression/xp-history failed");
    return res.status(500).json({ error: "XP_HISTORY_LOAD_FAILED" });
  }
});

router.get("/starter-history", async (req: Request, res: Response) => {
  const userId = req.auth!.sub;
  try {
    const history = await listStarterCoinHistory(
      userId,
      Number(req.query.limit) || 100,
    );
    res.setHeader("Cache-Control", "private, no-store");
    return res.json({ history });
  } catch (err) {
    logger.error({ err, userId }, "GET progression/starter-history failed");
    return res.status(500).json({ error: "STARTER_HISTORY_LOAD_FAILED" });
  }
});

export default router;
