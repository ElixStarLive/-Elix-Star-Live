/**
 * Rising Stars — admin CRUD and phase controls.
 */
import { Router, Request, Response } from "express";
import { z } from "zod";
import { requireAuthWithRoles, requireAdmin } from "../middleware/rbac";
import { validateBody } from "../middleware/validate";
import { insertNotification } from "../lib/notifications";
import { logger } from "../lib/logger";
import {
  rsCreateSeason,
  rsCreateCategory,
  rsCreateRegion,
  rsCreateChallenge,
  rsUpdateChallengeStatus,
  rsFreezeLeaderboard,
  rsDisqualifyEntry,
  rsAttachLiveRoom,
  rsSnapshotPhase,
  rsCreateBadge,
  rsAwardBadge,
  rsCreateRewardDefinition,
  rsGrantReward,
  rsAdminAudit,
  rsListAdminAudit,
  rsListSeasons,
  rsGetChallenge,
} from "../lib/risingStarsNeon";

const router = Router();
router.use(requireAuthWithRoles);
router.use(requireAdmin);

const seasonSchema = z.object({
  slug: z.string().min(2).max(80).regex(/^[a-z0-9-]+$/),
  title: z.string().min(2).max(120),
  description: z.string().max(2000).optional(),
  starts_at: z.string().min(1),
  ends_at: z.string().min(1),
  status: z.enum(["draft", "active", "closed"]).optional(),
});

router.get("/seasons", async (_req, res) => {
  try {
    const seasons = await rsListSeasons();
    return res.json({ seasons });
  } catch (err) {
    logger.error({ err }, "admin rs seasons failed");
    return res.status(500).json({ error: "SERVER_ERROR", seasons: [] });
  }
});

router.post("/seasons", validateBody(seasonSchema), async (req: Request, res: Response) => {
  const adminId = (req.authContext as NonNullable<typeof req.authContext>).userId;
  try {
    const season = await rsCreateSeason({ ...req.body, created_by: adminId });
    if (!season) return res.status(500).json({ error: "CREATE_FAILED" });
    await rsAdminAudit({
      adminUserId: adminId,
      action: "create_season",
      entityType: "season",
      entityId: season.id,
      details: { slug: season.slug },
    });
    return res.status(201).json({ season });
  } catch (err) {
    logger.error({ err }, "admin create season failed");
    return res.status(500).json({ error: "SERVER_ERROR" });
  }
});

const categorySchema = z.object({
  season_id: z.string().uuid(),
  slug: z.string().min(2).max(60).regex(/^[a-z0-9-]+$/),
  title: z.string().min(2).max(80),
  sort_order: z.number().int().optional(),
});

router.post("/categories", validateBody(categorySchema), async (req: Request, res: Response) => {
  const adminId = (req.authContext as NonNullable<typeof req.authContext>).userId;
  try {
    const category = await rsCreateCategory(req.body);
    if (!category) return res.status(500).json({ error: "CREATE_FAILED" });
    await rsAdminAudit({
      adminUserId: adminId,
      action: "create_category",
      entityType: "category",
      entityId: category.id,
    });
    return res.status(201).json({ category });
  } catch (err) {
    logger.error({ err }, "admin create category failed");
    return res.status(500).json({ error: "SERVER_ERROR" });
  }
});

const regionSchema = z.object({
  season_id: z.string().uuid(),
  slug: z.string().min(2).max(60).regex(/^[a-z0-9-]+$/),
  title: z.string().min(2).max(80),
  country_codes: z.array(z.string()).optional(),
  sort_order: z.number().int().optional(),
});

router.post("/regions", validateBody(regionSchema), async (req: Request, res: Response) => {
  const adminId = (req.authContext as NonNullable<typeof req.authContext>).userId;
  try {
    const region = await rsCreateRegion(req.body);
    if (!region) return res.status(500).json({ error: "CREATE_FAILED" });
    await rsAdminAudit({
      adminUserId: adminId,
      action: "create_region",
      entityType: "region",
      entityId: region.id,
    });
    return res.status(201).json({ region });
  } catch (err) {
    logger.error({ err }, "admin create region failed");
    return res.status(500).json({ error: "SERVER_ERROR" });
  }
});

const challengeSchema = z.object({
  season_id: z.string().uuid(),
  category_id: z.string().uuid(),
  region_id: z.string().uuid().optional().nullable(),
  week_index: z.number().int().min(1).optional(),
  title: z.string().min(2).max(120),
  description: z.string().max(2000).optional(),
  sound_track_id: z.string().min(1).max(200),
  sound_meta: z.record(z.unknown()).optional(),
  opens_at: z.string().min(1),
  closes_at: z.string().min(1),
  exclusive_until: z.string().optional().nullable(),
  status: z
    .enum(["scheduled", "open", "voting", "qualified", "final", "closed"])
    .optional(),
});

router.post("/challenges", validateBody(challengeSchema), async (req: Request, res: Response) => {
  const adminId = (req.authContext as NonNullable<typeof req.authContext>).userId;
  try {
    const challenge = await rsCreateChallenge(req.body);
    if (!challenge) return res.status(500).json({ error: "CREATE_FAILED" });
    await rsAdminAudit({
      adminUserId: adminId,
      action: "create_challenge",
      entityType: "challenge",
      entityId: challenge.id,
      details: { sound_track_id: challenge.sound_track_id },
    });
    return res.status(201).json({ challenge });
  } catch (err) {
    logger.error({ err }, "admin create challenge failed");
    return res.status(500).json({ error: "SERVER_ERROR" });
  }
});

const statusSchema = z.object({
  status: z.enum(["scheduled", "open", "voting", "qualified", "final", "closed"]),
});

router.patch(
  "/challenges/:id/status",
  validateBody(statusSchema),
  async (req: Request, res: Response) => {
    const adminId = (req.authContext as NonNullable<typeof req.authContext>).userId;
    try {
      const challenge = await rsUpdateChallengeStatus(
        String(req.params.id),
        req.body.status,
      );
      if (!challenge) return res.status(404).json({ error: "NOT_FOUND" });
      await rsAdminAudit({
        adminUserId: adminId,
        action: "set_challenge_status",
        entityType: "challenge",
        entityId: challenge.id,
        details: { status: challenge.status },
      });
      return res.json({ challenge });
    } catch (err) {
      logger.error({ err }, "admin challenge status failed");
      return res.status(500).json({ error: "SERVER_ERROR" });
    }
  },
);

const freezeSchema = z.object({ frozen: z.boolean() });

router.post(
  "/challenges/:id/freeze",
  validateBody(freezeSchema),
  async (req: Request, res: Response) => {
    const adminId = (req.authContext as NonNullable<typeof req.authContext>).userId;
    try {
      const challenge = await rsFreezeLeaderboard(
        String(req.params.id),
        req.body.frozen,
      );
      if (!challenge) return res.status(404).json({ error: "NOT_FOUND" });
      await rsAdminAudit({
        adminUserId: adminId,
        action: "freeze_leaderboard",
        entityType: "challenge",
        entityId: challenge.id,
        details: { frozen: challenge.leaderboard_frozen },
      });
      return res.json({ challenge });
    } catch (err) {
      logger.error({ err }, "admin freeze failed");
      return res.status(500).json({ error: "SERVER_ERROR" });
    }
  },
);

router.post("/entries/:id/disqualify", async (req: Request, res: Response) => {
  const adminId = (req.authContext as NonNullable<typeof req.authContext>).userId;
  try {
    const entry = await rsDisqualifyEntry(String(req.params.id));
    if (!entry) return res.status(404).json({ error: "NOT_FOUND" });
    await rsAdminAudit({
      adminUserId: adminId,
      action: "disqualify_entry",
      entityType: "entry",
      entityId: entry.id,
    });
    await insertNotification({
      userId: entry.creator_user_id,
      type: "rising_stars_dq",
      title: "Rising Stars entry disqualified",
      body: "An admin removed your entry from the competition.",
      actionUrl: `/rising-stars/challenge/${entry.challenge_id}`,
      data: { path: `/rising-stars/challenge/${entry.challenge_id}` },
    });
    return res.json({ entry });
  } catch (err) {
    logger.error({ err }, "admin dq failed");
    return res.status(500).json({ error: "SERVER_ERROR" });
  }
});

const liveSchema = z.object({
  phase: z.enum(["qualifier", "final"]),
  roomId: z.string().min(1).max(200),
});

router.post(
  "/challenges/:id/live",
  validateBody(liveSchema),
  async (req: Request, res: Response) => {
    const adminId = (req.authContext as NonNullable<typeof req.authContext>).userId;
    try {
      const challenge = await rsAttachLiveRoom(
        String(req.params.id),
        req.body.phase,
        req.body.roomId,
      );
      if (!challenge) return res.status(404).json({ error: "NOT_FOUND" });
      await rsAdminAudit({
        adminUserId: adminId,
        action: "attach_live",
        entityType: "challenge",
        entityId: challenge.id,
        details: { phase: req.body.phase, roomId: req.body.roomId },
      });
      return res.json({ challenge });
    } catch (err) {
      logger.error({ err }, "admin attach live failed");
      return res.status(500).json({ error: "SERVER_ERROR" });
    }
  },
);

const snapshotSchema = z.object({
  phase: z.enum(["qualifier", "final"]),
  advanceTopN: z.number().int().min(0).max(100).optional(),
});

router.post(
  "/challenges/:id/snapshot",
  validateBody(snapshotSchema),
  async (req: Request, res: Response) => {
    const adminId = (req.authContext as NonNullable<typeof req.authContext>).userId;
    try {
      const result = await rsSnapshotPhase({
        challengeId: String(req.params.id),
        phase: req.body.phase,
        advanceTopN: req.body.advanceTopN,
      });
      if (!result.ok) return res.status(500).json({ error: result.code });
      await rsAdminAudit({
        adminUserId: adminId,
        action: "snapshot_phase",
        entityType: "challenge",
        entityId: String(req.params.id),
        details: req.body,
      });
      const challenge = await rsGetChallenge(String(req.params.id));
      return res.json({ ok: true, results: result.results, challenge });
    } catch (err) {
      logger.error({ err }, "admin snapshot failed");
      return res.status(500).json({ error: "SERVER_ERROR" });
    }
  },
);

const badgeSchema = z.object({
  season_id: z.string().uuid(),
  code: z.string().min(2).max(60),
  title: z.string().min(2).max(120),
  image_url: z.string().url().optional(),
  kind: z.enum([
    "participation",
    "top10",
    "finalist",
    "winner",
    "region",
    "team",
    "season",
  ]),
});

router.post("/badges", validateBody(badgeSchema), async (req: Request, res: Response) => {
  const adminId = (req.authContext as NonNullable<typeof req.authContext>).userId;
  try {
    const badge = await rsCreateBadge(req.body);
    if (!badge) return res.status(500).json({ error: "CREATE_FAILED" });
    await rsAdminAudit({
      adminUserId: adminId,
      action: "create_badge",
      entityType: "badge",
      entityId: String(badge.id),
    });
    return res.status(201).json({ badge });
  } catch (err) {
    logger.error({ err }, "admin create badge failed");
    return res.status(500).json({ error: "SERVER_ERROR" });
  }
});

const awardSchema = z.object({
  userId: z.string().min(1),
  badgeId: z.string().uuid(),
  challengeId: z.string().uuid().optional().nullable(),
});

router.post("/badges/award", validateBody(awardSchema), async (req: Request, res: Response) => {
  const adminId = (req.authContext as NonNullable<typeof req.authContext>).userId;
  try {
    const result = await rsAwardBadge({
      userId: req.body.userId,
      badgeId: req.body.badgeId,
      challengeId: req.body.challengeId,
      awardedBy: adminId,
    });
    if (!result.ok) return res.status(500).json({ error: result.code });
    await rsAdminAudit({
      adminUserId: adminId,
      action: "award_badge",
      entityType: "badge",
      entityId: req.body.badgeId,
      details: { userId: req.body.userId, created: result.created },
    });
    if (result.created) {
      await insertNotification({
        userId: req.body.userId,
        type: "rising_stars_badge",
        title: "You earned a Rising Stars badge",
        body: "Open Rising Stars to see your new badge.",
        actionUrl: "/rising-stars",
        data: { path: "/rising-stars" },
      });
    }
    return res.json({ ok: true, created: result.created });
  } catch (err) {
    logger.error({ err }, "admin award badge failed");
    return res.status(500).json({ error: "SERVER_ERROR" });
  }
});

const rewardDefSchema = z.object({
  season_id: z.string().uuid(),
  place_from: z.number().int().min(1),
  place_to: z.number().int().min(1),
  category_id: z.string().uuid().optional().nullable(),
  region_id: z.string().uuid().optional().nullable(),
  reward_kind: z.enum([
    "badge",
    "cosmetic",
    "featured",
    "cash_off_platform",
    "creator_credit_manual",
    "none",
  ]),
  payload: z.record(z.unknown()).optional(),
});

router.post(
  "/rewards/definitions",
  validateBody(rewardDefSchema),
  async (req: Request, res: Response) => {
    const adminId = (req.authContext as NonNullable<typeof req.authContext>).userId;
    try {
      if (req.body.place_to < req.body.place_from) {
        return res.status(400).json({ error: "place_to must be >= place_from" });
      }
      const reward = await rsCreateRewardDefinition(req.body);
      if (!reward) return res.status(500).json({ error: "CREATE_FAILED" });
      await rsAdminAudit({
        adminUserId: adminId,
        action: "create_reward_definition",
        entityType: "reward_definition",
        entityId: String(reward.id),
      });
      return res.status(201).json({ reward });
    } catch (err) {
      logger.error({ err }, "admin create reward def failed");
      return res.status(500).json({ error: "SERVER_ERROR" });
    }
  },
);

const grantSchema = z.object({
  definitionId: z.string().uuid(),
  userId: z.string().min(1),
  challengeId: z.string().uuid().optional().nullable(),
  status: z.enum(["pending", "granted", "rejected"]).optional(),
  notes: z.string().max(2000).optional(),
});

router.post("/rewards/grants", validateBody(grantSchema), async (req: Request, res: Response) => {
  const adminId = (req.authContext as NonNullable<typeof req.authContext>).userId;
  try {
    const grant = await rsGrantReward({
      definitionId: req.body.definitionId,
      userId: req.body.userId,
      challengeId: req.body.challengeId,
      grantedBy: adminId,
      notes: req.body.notes,
      status: req.body.status || "pending",
    });
    if (!grant) return res.status(500).json({ error: "GRANT_FAILED" });
    await rsAdminAudit({
      adminUserId: adminId,
      action: "grant_reward",
      entityType: "reward_grant",
      entityId: String(grant.id),
      details: { status: grant.status, userId: req.body.userId },
    });
    if (String(grant.status) === "granted") {
      await insertNotification({
        userId: req.body.userId,
        type: "rising_stars_reward",
        title: "Rising Stars prize update",
        body: "An admin fulfilled your competition prize.",
        actionUrl: "/rising-stars",
        data: { path: "/rising-stars" },
      });
    }
    return res.json({ grant });
  } catch (err) {
    logger.error({ err }, "admin grant reward failed");
    return res.status(500).json({ error: "SERVER_ERROR" });
  }
});

router.get("/audit", async (req: Request, res: Response) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 100;
    const audit = await rsListAdminAudit(limit);
    return res.json({ audit });
  } catch (err) {
    logger.error({ err }, "admin rs audit failed");
    return res.status(500).json({ error: "SERVER_ERROR", audit: [] });
  }
});

export default router;
