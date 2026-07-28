/**
 * Admin copyright report moderation endpoints.
 */
import { Router } from "express";
import { requireAuthWithRoles, requireAdmin } from "../middleware/rbac";
import { getPool } from "../lib/postgres";
import { logger } from "../lib/logger";
import { insertNotification } from "../lib/notifications";
import { getSoundById } from "../lib/soundReuse";
import { logModerationAction } from "../lib/soundRights";

const router = Router();
router.use(requireAuthWithRoles, requireAdmin);

router.get("/reports", async (req, res) => {
  const db = getPool();
  if (!db) return res.status(503).json({ error: "Database not configured" });
  try {
    const status = req.query.status ? String(req.query.status) : null;
    const limit = Math.min(Math.max(parseInt(String(req.query.limit || "50"), 10) || 50, 1), 200);
    const r = await db.query(
      `SELECT cr.id, cr.case_reference, cr.sound_id, cr.reporter_name, cr.reporter_email,
              cr.status, cr.priority, cr.assigned_moderator_id, cr.submitted_at, cr.resolved_at,
              s.original_uploader_id, s.title AS sound_title, p.username AS uploader_username
       FROM copyright_reports cr
       LEFT JOIN sounds s ON s.id = cr.sound_id
       LEFT JOIN profiles p ON p.user_id = s.original_uploader_id
       WHERE ($1::text IS NULL OR cr.status = $1)
       ORDER BY cr.submitted_at DESC
       LIMIT $2`,
      [status, limit],
    );
    return res.json({
      reports: r.rows.map((row) => ({
        id: row.id,
        caseReference: row.case_reference,
        soundId: row.sound_id,
        soundTitle: row.sound_title,
        originalUploaderId: row.original_uploader_id,
        originalUploader: row.uploader_username,
        reporter: row.reporter_name,
        reporterEmail: row.reporter_email,
        status: row.status,
        priority: row.priority,
        assignedModeratorId: row.assigned_moderator_id,
        submittedAt: row.submitted_at,
        resolvedAt: row.resolved_at,
      })),
    });
  } catch (err) {
    logger.error({ err }, "admin list copyright reports failed");
    return res.status(500).json({ error: "Failed to list reports" });
  }
});

router.get("/reports/:id", async (req, res) => {
  const db = getPool();
  if (!db) return res.status(503).json({ error: "Database not configured" });
  try {
    const r = await db.query(`SELECT * FROM copyright_reports WHERE id = $1 OR case_reference = $1 LIMIT 1`, [
      req.params.id,
    ]);
    const report = r.rows[0];
    if (!report) return res.status(404).json({ error: "Report not found" });

    const sound = await getSoundById(String(report.sound_id));
    const rights = await db.query(
      `SELECT id, user_id, confirmation_version, confirmed_at, platform
       FROM sound_rights_confirmations WHERE sound_id = $1 ORDER BY confirmed_at DESC LIMIT 20`,
      [report.sound_id],
    );
    const reuse = await db.query(
      `SELECT id, user_id, video_id, created_at FROM sound_reuse_events
       WHERE sound_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [report.sound_id],
    );
    const related = await db.query(
      `SELECT id, case_reference, status, submitted_at FROM copyright_reports
       WHERE sound_id = $1 AND id <> $2 ORDER BY submitted_at DESC LIMIT 20`,
      [report.sound_id, report.id],
    );
    const actions = await db.query(
      `SELECT id, actor_user_id, action, details, created_at FROM copyright_moderation_actions
       WHERE report_id = $1 OR sound_id = $2 ORDER BY created_at DESC LIMIT 100`,
      [report.id, report.sound_id],
    );
    const appeals = await db.query(
      `SELECT id, status, reason, submitted_at, resolved_at, reviewed_by
       FROM copyright_appeals WHERE report_id = $1 ORDER BY submitted_at DESC`,
      [report.id],
    );

    return res.json({
      report,
      sound,
      rightsConfirmations: rights.rows,
      reuseHistory: reuse.rows,
      relatedReports: related.rows,
      moderationHistory: actions.rows,
      appeals: appeals.rows,
    });
  } catch (err) {
    logger.error({ err }, "admin get copyright report failed");
    return res.status(500).json({ error: "Failed to load report" });
  }
});

async function loadReport(id: string) {
  const db = getPool();
  if (!db) return null;
  const r = await db.query(
    `SELECT * FROM copyright_reports WHERE id = $1 OR case_reference = $1 LIMIT 1`,
    [id],
  );
  return r.rows[0] || null;
}

router.patch("/reports/:id/assign", async (req, res) => {
  const db = getPool();
  if (!db) return res.status(503).json({ error: "Database not configured" });
  const report = await loadReport(req.params.id);
  if (!report) return res.status(404).json({ error: "Report not found" });
  const moderatorId = String(req.body?.moderatorId || req.authContext!.userId);
  await db.query(
    `UPDATE copyright_reports SET assigned_moderator_id = $2, status = CASE WHEN status = 'RECEIVED' THEN 'UNDER_REVIEW' ELSE status END, reviewed_at = COALESCE(reviewed_at, NOW())
     WHERE id = $1`,
    [report.id, moderatorId],
  );
  await logModerationAction({
    reportId: report.id,
    soundId: report.sound_id,
    actorUserId: req.authContext!.userId,
    action: "ASSIGN_REVIEWER",
    details: { moderatorId },
  });
  return res.json({ ok: true });
});

router.patch("/reports/:id/status", async (req, res) => {
  const db = getPool();
  if (!db) return res.status(503).json({ error: "Database not configured" });
  const report = await loadReport(req.params.id);
  if (!report) return res.status(404).json({ error: "Report not found" });
  const status = String(req.body?.status || "").toUpperCase();
  const allowed = [
    "RECEIVED",
    "UNDER_REVIEW",
    "ACTION_REQUIRED",
    "REJECTED",
    "RESOLVED",
    "WITHDRAWN",
  ];
  if (!allowed.includes(status)) return res.status(400).json({ error: "Invalid status" });
  await db.query(
    `UPDATE copyright_reports SET status = $2, reviewed_at = NOW(),
       decision_reason = COALESCE($3, decision_reason),
       resolved_at = CASE WHEN $2 IN ('REJECTED','RESOLVED','WITHDRAWN') THEN NOW() ELSE resolved_at END,
       internal_notes = CASE WHEN $4::text IS NULL THEN internal_notes ELSE COALESCE(internal_notes,'') || E'\\n' || $4 END
     WHERE id = $1`,
    [
      report.id,
      status,
      req.body?.decisionReason ? String(req.body.decisionReason).slice(0, 4000) : null,
      req.body?.note ? String(req.body.note).slice(0, 4000) : null,
    ],
  );
  await logModerationAction({
    reportId: report.id,
    soundId: report.sound_id,
    actorUserId: req.authContext!.userId,
    action: "STATUS_CHANGE",
    details: { status },
  });

  if (status === "REJECTED" && report.reporter_user_id) {
    await insertNotification({
      userId: String(report.reporter_user_id),
      type: "copyright_report_rejected",
      title: "Copyright report update",
      body: "We reviewed your copyright report and could not verify the claimed infringement based on the information provided.",
      actionUrl: `/legal/copyright-report/${report.case_reference}`,
    });
  }

  return res.json({ ok: true });
});

router.post("/reports/:id/disable-reuse", async (req, res) => {
  const db = getPool();
  if (!db) return res.status(503).json({ error: "Database not configured" });
  const report = await loadReport(req.params.id);
  if (!report) return res.status(404).json({ error: "Report not found" });
  await db.query(
    `UPDATE sounds SET
       allow_reuse = FALSE,
       copyright_status = 'REUSE_DISABLED',
       reuse_disabled_at = NOW(),
       reuse_disabled_reason = $2,
       updated_at = NOW()
     WHERE id = $1`,
    [report.sound_id, String(req.body?.reason || "DISABLED_BY_MODERATOR")],
  );
  await logModerationAction({
    reportId: report.id,
    soundId: report.sound_id,
    actorUserId: req.authContext!.userId,
    action: "DISABLE_REUSE",
  });
  const sound = await getSoundById(String(report.sound_id));
  if (sound?.original_uploader_id) {
    await insertNotification({
      userId: sound.original_uploader_id,
      type: "copyright_reuse_disabled",
      title: "Sound reuse disabled",
      body: "Reuse of your uploaded sound has been temporarily disabled while we review a copyright report.",
      actionUrl: `/music/${sound.id}`,
    });
  }
  return res.json({ ok: true });
});

router.post("/reports/:id/remove-sound", async (req, res) => {
  const db = getPool();
  if (!db) return res.status(503).json({ error: "Database not configured" });
  const report = await loadReport(req.params.id);
  if (!report) return res.status(404).json({ error: "Report not found" });
  const reason = String(req.body?.reason || "REMOVED_COPYRIGHT");
  await db.query(
    `UPDATE sounds SET
       allow_reuse = FALSE,
       copyright_status = 'REMOVED',
       removed_at = NOW(),
       removed_reason = $2,
       audio_url = '',
       updated_at = NOW()
     WHERE id = $1`,
    [report.sound_id, reason],
  );
  await db.query(
    `UPDATE copyright_reports SET status = 'RESOLVED', resolved_at = NOW(), decision_reason = $2 WHERE id = $1`,
    [report.id, reason],
  );
  await logModerationAction({
    reportId: report.id,
    soundId: report.sound_id,
    actorUserId: req.authContext!.userId,
    action: "REMOVE_SOUND",
    details: { reason },
  });

  const sound = await getSoundById(String(report.sound_id));
  if (sound?.original_uploader_id) {
    await db.query(
      `UPDATE profiles SET valid_copyright_findings = COALESCE(valid_copyright_findings,0) + 1,
         copyright_warnings = COALESCE(copyright_warnings,0) + 1,
         updated_at = NOW()
       WHERE user_id = $1`,
      [sound.original_uploader_id],
    );
    await insertNotification({
      userId: sound.original_uploader_id,
      type: "copyright_sound_removed",
      title: "Sound removed",
      body: "Your uploaded sound has been removed following a copyright review. You may submit an appeal if you believe this decision is incorrect.",
      actionUrl: `/legal/copyright-appeal/${report.case_reference}`,
    });
  }
  return res.json({ ok: true });
});

router.post("/reports/:id/restore-sound", async (req, res) => {
  const db = getPool();
  if (!db) return res.status(503).json({ error: "Database not configured" });
  const report = await loadReport(req.params.id);
  if (!report) return res.status(404).json({ error: "Report not found" });
  await db.query(
    `UPDATE sounds SET
       copyright_status = 'ACTIVE',
       removed_at = NULL,
       removed_reason = NULL,
       updated_at = NOW()
     WHERE id = $1`,
    [report.sound_id],
  );
  // Do not auto-re-enable reuse — owner must reconfirm.
  await db.query(
    `UPDATE sounds SET allow_reuse = FALSE, rights_confirmed = FALSE WHERE id = $1`,
    [report.sound_id],
  );
  await logModerationAction({
    reportId: report.id,
    soundId: report.sound_id,
    actorUserId: req.authContext!.userId,
    action: "RESTORE_SOUND",
  });
  const sound = await getSoundById(String(report.sound_id));
  if (sound?.original_uploader_id) {
    await insertNotification({
      userId: sound.original_uploader_id,
      type: "copyright_sound_restored",
      title: "Sound restored",
      body: "Your sound has been restored and is available according to its current reuse settings.",
      actionUrl: `/music/${sound.id}`,
    });
  }
  return res.json({ ok: true });
});

router.post("/reports/:id/request-information", async (req, res) => {
  const report = await loadReport(req.params.id);
  if (!report) return res.status(404).json({ error: "Report not found" });
  const db = getPool();
  if (!db) return res.status(503).json({ error: "Database not configured" });
  await db.query(
    `UPDATE copyright_reports SET status = 'ACTION_REQUIRED', reviewed_at = NOW(),
       internal_notes = COALESCE(internal_notes,'') || E'\\n' || $2 WHERE id = $1`,
    [report.id, `INFO_REQUEST: ${String(req.body?.message || "").slice(0, 2000)}`],
  );
  await logModerationAction({
    reportId: report.id,
    soundId: report.sound_id,
    actorUserId: req.authContext!.userId,
    action: "REQUEST_INFORMATION",
    details: { message: String(req.body?.message || "").slice(0, 500) },
  });
  if (report.reporter_user_id) {
    await insertNotification({
      userId: String(report.reporter_user_id),
      type: "copyright_info_requested",
      title: "More information needed",
      body: `We need more information for copyright case ${report.case_reference}.`,
      actionUrl: `/legal/copyright-report/${report.case_reference}`,
    });
  }
  return res.json({ ok: true });
});

router.post("/reports/:id/escalate", async (req, res) => {
  const report = await loadReport(req.params.id);
  if (!report) return res.status(404).json({ error: "Report not found" });
  const db = getPool();
  if (!db) return res.status(503).json({ error: "Database not configured" });
  await db.query(
    `UPDATE copyright_reports SET priority = 'HIGH', status = 'ACTION_REQUIRED',
       internal_notes = COALESCE(internal_notes,'') || E'\\nESCALATED_TO_LEGAL' WHERE id = $1`,
    [report.id],
  );
  await logModerationAction({
    reportId: report.id,
    soundId: report.sound_id,
    actorUserId: req.authContext!.userId,
    action: "ESCALATE_TO_LEGAL",
  });
  return res.json({ ok: true });
});

router.post("/reports/:id/resolve", async (req, res) => {
  const report = await loadReport(req.params.id);
  if (!report) return res.status(404).json({ error: "Report not found" });
  const db = getPool();
  if (!db) return res.status(503).json({ error: "Database not configured" });
  const decision = String(req.body?.decisionReason || req.body?.reason || "RESOLVED").slice(0, 4000);
  await db.query(
    `UPDATE copyright_reports SET status = 'RESOLVED', resolved_at = NOW(), decision_reason = $2 WHERE id = $1`,
    [report.id, decision],
  );
  await logModerationAction({
    reportId: report.id,
    soundId: report.sound_id,
    actorUserId: req.authContext!.userId,
    action: "CLOSE_CASE",
    details: { decision },
  });
  return res.json({ ok: true });
});

router.post("/reports/:id/warn-uploader", async (req, res) => {
  const report = await loadReport(req.params.id);
  if (!report) return res.status(404).json({ error: "Report not found" });
  const sound = await getSoundById(String(report.sound_id));
  if (!sound?.original_uploader_id) return res.status(404).json({ error: "Uploader not found" });
  const db = getPool();
  if (!db) return res.status(503).json({ error: "Database not configured" });
  await db.query(
    `UPDATE profiles SET copyright_warnings = COALESCE(copyright_warnings,0) + 1, updated_at = NOW() WHERE user_id = $1`,
    [sound.original_uploader_id],
  );
  await insertNotification({
    userId: sound.original_uploader_id,
    type: "moderation_warning",
    title: "Copyright warning",
    body: String(req.body?.message || "A copyright warning has been issued regarding your uploaded sound."),
    actionUrl: `/music/${sound.id}`,
  });
  await logModerationAction({
    reportId: report.id,
    soundId: report.sound_id,
    actorUserId: req.authContext!.userId,
    action: "WARN_UPLOADER",
  });
  return res.json({ ok: true });
});

router.post("/reports/:id/restrict-uploader", async (req, res) => {
  const report = await loadReport(req.params.id);
  if (!report) return res.status(404).json({ error: "Report not found" });
  const sound = await getSoundById(String(report.sound_id));
  if (!sound?.original_uploader_id) return res.status(404).json({ error: "Uploader not found" });
  const db = getPool();
  if (!db) return res.status(503).json({ error: "Database not configured" });
  const days = Math.min(Math.max(parseInt(String(req.body?.days || "7"), 10) || 7, 1), 90);
  const until = new Date(Date.now() + days * 86400000);
  await db.query(
    `UPDATE profiles SET
       temporary_copyright_restrictions = COALESCE(temporary_copyright_restrictions,0) + 1,
       copyright_reuse_suspended_until = $2,
       copyright_account_reviews = COALESCE(copyright_account_reviews,0) + 1,
       updated_at = NOW()
     WHERE user_id = $1`,
    [sound.original_uploader_id, until.toISOString()],
  );
  await logModerationAction({
    reportId: report.id,
    soundId: report.sound_id,
    actorUserId: req.authContext!.userId,
    action: "RESTRICT_UPLOADER",
    details: { until: until.toISOString() },
  });
  return res.json({ ok: true, until: until.toISOString() });
});

export default router;
