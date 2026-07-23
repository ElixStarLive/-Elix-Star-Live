/**
 * Admin moderation API — reports status, platform bans (profiles.banned_until).
 */
import { Router, Request, Response } from "express";
import { getPool, deleteVideoFromDb } from "../lib/postgres";
import { deleteVideoFromCache } from "../lib/videoStore";
import { insertNotification } from "../lib/notifications";
import { logger } from "../lib/logger";
import { requireAuthWithRoles, requireAdmin } from "../middleware/rbac";
import { disconnectUserSessions } from "../websocket/index";
import { invalidateUserSessionCache } from "./auth";
import { z } from "zod";
import { validateBody } from "../middleware/validate";

const patchReportSchema = z.object({
  status: z.enum(["pending", "reviewed", "dismissed", "actioned"]),
  admin_note: z.string().max(2000).optional(),
  // Optional structured moderation outcome. When "removed", the reported
  // content is actually taken down; when "warned", the owner is notified.
  action: z.enum(["removed", "warned", "no_action"]).optional(),
});

/**
 * Enforce a moderation outcome against the reported target. Best-effort and
 * defensive: unknown target types are logged and skipped rather than throwing.
 */
async function enforceReportAction(
  db: NonNullable<ReturnType<typeof getPool>>,
  action: "removed" | "warned" | "no_action",
  targetType: string,
  targetId: string,
  adminId: string,
): Promise<void> {
  if (!targetId || action === "no_action") return;
  const type = String(targetType || "").toLowerCase();

  if (action === "removed") {
    if (type === "video" || type === "post" || type === "clip") {
      deleteVideoFromCache(targetId);
      await deleteVideoFromDb(targetId);
    } else if (type === "comment") {
      await db
        .query(`DELETE FROM comments WHERE id = $1`, [targetId])
        .catch((e) => logger.warn({ err: e, targetId }, "moderation comment delete failed"));
    } else if (type === "stream" || type === "live") {
      await db
        .query(
          `UPDATE live_streams SET is_live = FALSE, ended_at = COALESCE(ended_at, NOW()) WHERE stream_key = $1 OR id::text = $1`,
          [targetId],
        )
        .catch((e) => logger.warn({ err: e, targetId }, "moderation stream end failed"));
    } else {
      logger.warn({ type, targetId }, "moderation remove: unsupported target type (no-op)");
    }
    logger.warn({ type, targetId, by: adminId }, "moderation content removed");
    return;
  }

  if (action === "warned") {
    // Resolve the owning user to notify.
    let ownerId = "";
    if (type === "user" || type === "profile") ownerId = targetId;
    else if (type === "video" || type === "post" || type === "clip") {
      const r = await db
        .query(`SELECT user_id FROM videos WHERE id = $1 LIMIT 1`, [targetId])
        .catch(() => ({ rows: [] as { user_id: string }[] }));
      ownerId = r.rows[0]?.user_id ? String(r.rows[0].user_id) : "";
    } else if (type === "comment") {
      const r = await db
        .query(`SELECT user_id FROM comments WHERE id = $1 LIMIT 1`, [targetId])
        .catch(() => ({ rows: [] as { user_id: string }[] }));
      ownerId = r.rows[0]?.user_id ? String(r.rows[0].user_id) : "";
    }
    if (ownerId) {
      await insertNotification({
        userId: ownerId,
        type: "moderation_warning",
        title: "Content warning",
        body: "Your content was reviewed by moderators and may violate our community guidelines. Repeated violations can lead to a ban.",
        data: { target_type: type, target_id: targetId },
      }).catch((e) => logger.warn({ err: e, ownerId }, "moderation warning notify failed"));
    }
  }
}

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

/**
 * GET /api/admin/users — admin user list for moderation. Unlike the public
 * profile list, this includes banned users and exposes ban status + email so
 * the admin can see and lift bans reliably (fixes unban not persisting after
 * reload). Admin-only via router middleware above.
 */
router.get("/users", async (req: Request, res: Response) => {
  res.setHeader("Cache-Control", "private, no-store");
  const db = getPool();
  if (!db) return res.status(503).json({ error: "DATABASE_UNAVAILABLE", users: [] });
  const q = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase() : "";
  try {
    const params: string[] = [];
    let where = "";
    if (q) {
      params.push(`%${q}%`);
      where = `WHERE LOWER(p.username) LIKE $1 OR LOWER(u.email) LIKE $1`;
    }
    const r = await db.query(
      `SELECT p.user_id, p.username, p.avatar_url, p.created_at, p.banned_until, u.email
         FROM profiles p
         LEFT JOIN elix_auth_users u ON u.id = p.user_id
         ${where}
         ORDER BY p.created_at DESC NULLS LAST
         LIMIT 500`,
      params,
    );
    const now = Date.now();
    const users = r.rows.map((row: Record<string, unknown>) => ({
      id: String(row.user_id),
      username: row.username ? String(row.username) : "",
      email: row.email ? String(row.email) : "",
      avatar_url: row.avatar_url ? String(row.avatar_url) : null,
      created_at: row.created_at ?? "",
      is_banned: row.banned_until
        ? new Date(String(row.banned_until)).getTime() > now
        : false,
    }));
    return res.json({ users });
  } catch (e) {
    logger.error({ err: e }, "admin list users failed");
    return res.status(500).json({ error: "DATABASE_ERROR", users: [] });
  }
});

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
      `SELECT id,
              user_id,
              product_id AS package_id,
              provider,
              provider_transaction_id AS transaction_id,
              NULL::integer AS price_minor,
              NULL::text AS currency,
              kind AS status,
              created_at
         FROM elix_wallet_ledger
        WHERE kind = 'iap_purchase'
        ORDER BY created_at DESC
        LIMIT 200`,
    );
    return res.json({ data: r.rows, source: "iap" });
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === "42P01") return res.json({ data: [], source: "iap" });
    logger.error({ err: e }, "admin GET /purchases failed");
    return res.status(500).json({ error: "DATABASE_ERROR", data: [] });
  }
});

router.get("/iap-purchases", async (req: Request, res: Response) => {
  res.setHeader("Cache-Control", "private, no-store");
  const db = getPool();
  if (!db) return res.status(503).json({ error: "DATABASE_UNAVAILABLE", data: [] });
  try {
    const r = await db.query(
      `SELECT id,
              user_id,
              product_id AS package_id,
              provider,
              provider_transaction_id AS transaction_id,
              NULL::integer AS price_minor,
              NULL::text AS currency,
              kind AS status,
              created_at
         FROM elix_wallet_ledger
        WHERE kind = 'iap_purchase'
        ORDER BY created_at DESC
        LIMIT 200`,
    );
    return res.json({ data: r.rows, source: "iap" });
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === "42P01") return res.json({ data: [], source: "iap" });
    logger.error({ err: e }, "admin GET /iap-purchases failed");
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
  const { status, admin_note, action } = req.body as z.infer<typeof patchReportSchema>;
  const adminId = (req.authContext as NonNullable<typeof req.authContext>).userId;
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
    const report = r.rows[0] as { target_type?: string; target_id?: string };
    if (action) {
      await enforceReportAction(
        db,
        action,
        String(report.target_type ?? ""),
        String(report.target_id ?? ""),
        adminId,
      );
    }
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
    disconnectUserSessions(userId, "Banned");
    await invalidateUserSessionCache(userId);
    logger.warn({ userId, bannedUntil, reason, by: (req.authContext as NonNullable<typeof req.authContext>).userId }, "admin ban applied");
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
    logger.info({ userId, by: (req.authContext as NonNullable<typeof req.authContext>).userId }, "admin ban lifted");
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
