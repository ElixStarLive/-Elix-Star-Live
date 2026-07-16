/**
 * Admin moderation API — reports status, platform bans (profiles.banned_until).
 */
import { Router, Request, Response } from "express";
import { getPool } from "../lib/postgres";
import { logger } from "../lib/logger";
import { requireAuthWithRoles, requireAdmin } from "../middleware/rbac";
import { z } from "zod";
import { validateBody } from "../middleware/validate";

const patchReportSchema = z.object({
  status: z.enum(["pending", "reviewed", "dismissed", "actioned"]),
  admin_note: z.string().max(2000).optional(),
});

const banSchema = z.object({
  until: z.string().optional(),
  reason: z.string().max(500).optional(),
});

const patchGiftCatalogSchema = z.object({
  coin_cost: z.number().int().positive().max(10_000_000).optional(),
  is_active: z.boolean().optional(),
});

const router = Router();

router.use(requireAuthWithRoles);
router.use(requireAdmin);

router.get("/reports", async (req: Request, res: Response) => {
  res.setHeader("Cache-Control", "private, no-store");
  const db = getPool();
  if (!db) return res.status(503).json({ error: "DATABASE_UNAVAILABLE", data: [] });
  const statusFilter = req.query.status as string | undefined;
  try {
    await db.query(`ALTER TABLE elix_reports ADD COLUMN IF NOT EXISTS admin_note TEXT`).catch(() => {});
    let query = `SELECT r.id,
                        r.reporter_user_id AS reporter_id,
                        r.target_type,
                        r.target_id,
                        r.reason,
                        r.details,
                        r.status,
                        r.admin_note,
                        r.created_at,
                        p.username AS reporter_username
                 FROM elix_reports r
                 LEFT JOIN profiles p ON p.user_id = r.reporter_user_id`;
    const params: string[] = [];
    if (statusFilter) {
      query += ` WHERE r.status = $1`;
      params.push(statusFilter);
    }
    query += ` ORDER BY r.created_at DESC LIMIT 200`;
    const r = await db.query(query, params);
    const rows = r.rows.map((row: Record<string, unknown>) => ({
      ...row,
      reporter: row.reporter_username ? { username: String(row.reporter_username) } : undefined,
    }));
    return res.json(rows);
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === "42P01") return res.json([]);
    logger.error({ err: e }, "admin GET /reports failed");
    return res.status(500).json({ error: "DATABASE_ERROR", data: [] });
  }
});

router.get("/purchases", async (req: Request, res: Response) => {
  res.setHeader("Cache-Control", "private, no-store");
  const db = getPool();
  if (!db) return res.status(503).json({ error: "DATABASE_UNAVAILABLE", data: [] });
  try {
    const r = await db.query(
      `SELECT id, user_id, package_id, provider, transaction_id, price_minor, currency, status, created_at
       FROM iap_purchases ORDER BY created_at DESC LIMIT 200`,
    );
    return res.json(r.rows);
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === "42P01") return res.json([]);
    logger.error({ err: e }, "admin GET /purchases failed");
    return res.status(500).json({ error: "DATABASE_ERROR", data: [] });
  }
});

router.get("/stats/dau", async (req: Request, res: Response) => {
  res.setHeader("Cache-Control", "private, max-age=60");
  const db = getPool();
  if (!db) return res.status(503).json({ dau: 0 });
  try {
    const r = await db.query(
      `SELECT COUNT(DISTINCT user_id) AS dau FROM elix_auth_sessions WHERE created_at > NOW() - INTERVAL '24 hours'`,
    );
    const dau = Number(r.rows[0]?.dau ?? 0);
    return res.json({ dau });
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === "42P01") return res.json({ dau: 0 });
    logger.error({ err: e }, "admin stats/dau failed");
    return res.status(500).json({ dau: 0 });
  }
});

router.get("/moderation/logs", async (req: Request, res: Response) => {
  res.setHeader("Cache-Control", "private, no-store");
  const db = getPool();
  if (!db) return res.status(503).json({ error: "DATABASE_UNAVAILABLE" });
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));
  try {
    const r = await db.query(
      `SELECT id, stream_key, user_id, kind, category, severity, action_taken, details, created_at
       FROM live_moderation_log ORDER BY created_at DESC LIMIT $1`,
      [limit],
    );
    return res.json({ logs: r.rows });
  } catch (e) {
    logger.error({ err: e }, "admin moderation logs failed");
    return res.status(500).json({ error: "DATABASE_ERROR" });
  }
});

router.patch("/reports/:id", validateBody(patchReportSchema), async (req: Request, res: Response) => {
  res.setHeader("Cache-Control", "private, no-store");
  const db = getPool();
  if (!db) return res.status(503).json({ error: "DATABASE_UNAVAILABLE" });
  const id = req.params.id;
  const { status, admin_note } = req.body as z.infer<typeof patchReportSchema>;
  const adminId = req.authContext!.userId;
  try {
    await db.query(
      `ALTER TABLE elix_reports ADD COLUMN IF NOT EXISTS admin_note TEXT`,
    ).catch(() => {});
    await db.query(
      `ALTER TABLE elix_reports ADD COLUMN IF NOT EXISTS reviewed_by TEXT`,
    ).catch(() => {});
    await db.query(
      `ALTER TABLE elix_reports ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ`,
    ).catch(() => {});
    const r = await db.query(
      `UPDATE elix_reports SET status = $1, admin_note = COALESCE($2, admin_note), reviewed_by = $3, reviewed_at = NOW() WHERE id = $4 RETURNING *`,
      [status, admin_note ?? null, adminId, id],
    );
    if (r.rowCount === 0) return res.status(404).json({ error: "Report not found" });
    return res.json({ report: r.rows[0] });
  } catch (e) {
    logger.error({ err: e }, "admin patch report failed");
    return res.status(500).json({ error: "DATABASE_ERROR" });
  }
});

router.post("/users/:userId/ban", validateBody(banSchema), async (req: Request, res: Response) => {
  res.setHeader("Cache-Control", "private, no-store");
  const db = getPool();
  if (!db) return res.status(503).json({ error: "DATABASE_UNAVAILABLE" });
  const { userId } = req.params;
  const { until, reason } = req.body as z.infer<typeof banSchema>;
  let bannedUntil: Date;
  if (until) {
    const d = new Date(until);
    if (Number.isNaN(d.getTime())) {
      return res.status(400).json({ error: "Invalid until date" });
    }
    bannedUntil = d;
  } else {
    bannedUntil = new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000);
  }
  try {
    await db.query(`UPDATE profiles SET banned_until = $1, updated_at = NOW() WHERE user_id = $2`, [
      bannedUntil.toISOString(),
      userId,
    ]);
    logger.warn({ userId, bannedUntil, reason, by: req.authContext!.userId }, "admin ban applied");
    return res.json({ ok: true, userId, banned_until: bannedUntil.toISOString() });
  } catch (e) {
    logger.error({ err: e }, "admin ban failed");
    return res.status(500).json({ error: "DATABASE_ERROR" });
  }
});

router.delete("/users/:userId/ban", async (req: Request, res: Response) => {
  res.setHeader("Cache-Control", "private, no-store");
  const db = getPool();
  if (!db) return res.status(503).json({ error: "DATABASE_UNAVAILABLE" });
  const { userId } = req.params;
  try {
    await db.query(`UPDATE profiles SET banned_until = NULL, updated_at = NOW() WHERE user_id = $1`, [userId]);
    logger.info({ userId, by: req.authContext!.userId }, "admin ban lifted");
    return res.json({ ok: true, userId });
  } catch (e) {
    logger.error({ err: e }, "admin unban failed");
    return res.status(500).json({ error: "DATABASE_ERROR" });
  }
});

router.patch(
  "/gifts/catalog/:giftId",
  validateBody(patchGiftCatalogSchema),
  async (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "private, no-store");
    const db = getPool();
    if (!db) return res.status(503).json({ error: "DATABASE_UNAVAILABLE" });
    const giftId = typeof req.params.giftId === "string" ? req.params.giftId.trim() : "";
    if (!giftId) return res.status(400).json({ error: "giftId is required" });
    const { coin_cost, is_active } = req.body as z.infer<typeof patchGiftCatalogSchema>;
    if (coin_cost === undefined && is_active === undefined) {
      return res.status(400).json({ error: "No fields to update" });
    }
    try {
      const sets: string[] = [];
      const params: Array<string | number | boolean> = [];
      if (coin_cost !== undefined) {
        params.push(coin_cost);
        sets.push(`coin_cost = $${params.length}`);
      }
      if (is_active !== undefined) {
        params.push(is_active);
        sets.push(`is_active = $${params.length}`);
      }
      params.push(giftId);
      const r = await db.query(
        `UPDATE elix_gifts SET ${sets.join(", ")} WHERE gift_id = $${params.length} RETURNING gift_id, name, coin_cost, gift_type, is_active`,
        params,
      );
      if (r.rowCount === 0) return res.status(404).json({ error: "Gift not found" });
      return res.json({ gift: r.rows[0] });
    } catch (e) {
      logger.error({ err: e, giftId }, "admin patch gift catalog failed");
      return res.status(500).json({ error: "DATABASE_ERROR" });
    }
  },
);

export default router;
