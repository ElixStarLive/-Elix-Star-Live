/**
 * Copyright report + appeal public API.
 */
import { Router } from "express";
import { getTokenFromRequest, verifyAuthToken } from "./auth";
import {
  createCopyrightAppeal,
  createCopyrightReport,
  publicCaseSummary,
} from "../lib/copyrightReports";
import { getPool } from "../lib/postgres";
import { logger } from "../lib/logger";

const router = Router();

router.post("/reports", async (req, res) => {
  try {
    const token = getTokenFromRequest(req);
    const user = token ? verifyAuthToken(token) : null;
    if (!user?.sub) return res.status(401).json({ error: "Unauthorized" });

    const body = req.body || {};
    const soundId = String(body.soundId || "").trim();
    if (!soundId) return res.status(400).json({ error: "soundId is required" });

    const result = await createCopyrightReport({
      soundId,
      soundUrl: body.soundUrl ? String(body.soundUrl) : undefined,
      sourceVideoId: body.sourceVideoId ? String(body.sourceVideoId) : undefined,
      reporterUserId: user.sub,
      reporterName: String(body.reporterName || ""),
      reporterEmail: String(body.reporterEmail || ""),
      rightsOwnerName: String(body.rightsOwnerName || ""),
      relationshipToRightsOwner: String(body.relationshipToRightsOwner || "OTHER"),
      description: String(body.description || ""),
      originalWorkDescription: String(body.originalWorkDescription || ""),
      originalWorkUrl: body.originalWorkUrl ? String(body.originalWorkUrl) : undefined,
      supportingEvidenceUrl: body.supportingEvidenceUrl
        ? String(body.supportingEvidenceUrl)
        : undefined,
      goodFaithConfirmation: Boolean(body.goodFaithConfirmation ?? body.goodFaithConfirmed),
      accuracyConfirmation: Boolean(body.accuracyConfirmation ?? body.accuracyConfirmed),
      electronicSignature: String(body.electronicSignature || ""),
      idempotencyKey: body.idempotencyKey ? String(body.idempotencyKey).slice(0, 120) : undefined,
      setUnderReview: body.setUnderReview === true,
    });

    return res.status(201).json({
      ok: true,
      caseReference: result.caseReference,
      id: result.id,
      message: `We received your copyright report. Your case reference is ${result.caseReference}.`,
    });
  } catch (err) {
    const status = (err as { status?: number }).status || 500;
    const message = (err as Error).message || "Failed to submit report";
    if (status >= 400 && status < 500) return res.status(status).json({ error: message });
    logger.error({ err }, "POST /api/copyright/reports failed");
    return res.status(500).json({ error: "Failed to submit copyright report" });
  }
});

router.get("/reports/:caseReference", async (req, res) => {
  try {
    const token = getTokenFromRequest(req);
    const user = token ? verifyAuthToken(token) : null;
    if (!user?.sub) return res.status(401).json({ error: "Unauthorized" });
    const summary = await publicCaseSummary(
      String(req.params.caseReference),
      user.sub,
    );
    if (!summary) return res.status(404).json({ error: "Case not found." });
    if (!summary.canViewPrivate) {
      // Authenticated but not party to the case — do not leak sound linkage.
      return res.status(403).json({ error: "Not authorized to view this case." });
    }

    // Private details only for reporter or sound uploader.
    if (summary.canViewPrivate && user?.sub) {
      const db = getPool();
      if (db) {
        const r = await db.query(
          `SELECT case_reference, sound_id, status, submitted_at, resolved_at, decision_reason,
                  description, original_work_description
           FROM copyright_reports WHERE case_reference = $1 LIMIT 1`,
          [req.params.caseReference],
        );
        const row = r.rows[0];
        if (row) {
          return res.json({
            ...summary,
            description: row.description,
            originalWorkDescription: row.original_work_description,
            decisionReason: row.decision_reason,
          });
        }
      }
    }

    return res.json(summary);
  } catch (err) {
    logger.error({ err }, "GET copyright report failed");
    return res.status(500).json({ error: "Failed to load case" });
  }
});

router.post("/reports/:caseReference/appeal", async (req, res) => {
  try {
    const token = getTokenFromRequest(req);
    const user = token ? verifyAuthToken(token) : null;
    if (!user?.sub) return res.status(401).json({ error: "Unauthorized" });
    const body = req.body || {};
    const result = await createCopyrightAppeal({
      caseReference: String(req.params.caseReference),
      appellantUserId: user.sub,
      reason: String(body.reason || ""),
      rightsExplanation: String(body.rightsExplanation || ""),
      supportingEvidenceUrl: body.supportingEvidenceUrl
        ? String(body.supportingEvidenceUrl)
        : undefined,
      accuracyConfirmation: Boolean(body.accuracyConfirmation ?? body.accuracyConfirmed),
      electronicSignature: String(body.electronicSignature || ""),
    });
    return res.status(201).json({ ok: true, appealId: result.id });
  } catch (err) {
    const status = (err as { status?: number }).status || 500;
    const message = (err as Error).message || "Failed to submit appeal";
    if (status >= 400 && status < 500) return res.status(status).json({ error: message });
    logger.error({ err }, "POST copyright appeal failed");
    return res.status(500).json({ error: "Failed to submit appeal" });
  }
});

export default router;
