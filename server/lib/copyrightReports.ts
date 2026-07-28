/**
 * Copyright report + appeal workflows (immutable case records).
 */
import { randomBytes } from "crypto";
import { getPool } from "./postgres";
import { logger } from "./logger";
import { insertNotification } from "./notifications";
import { getSoundById } from "./soundReuse";
import { logModerationAction } from "./soundRights";

function newId(prefix: string): string {
  return `${prefix}_${Date.now()}_${randomBytes(4).toString("hex")}`;
}

function caseReference(): string {
  const year = new Date().getUTCFullYear();
  const token = randomBytes(4).toString("hex").toUpperCase().slice(0, 6);
  return `CR-${year}-${token}`;
}

export interface CopyrightReportInput {
  soundId: string;
  soundUrl?: string;
  sourceVideoId?: string;
  reporterUserId: string | null;
  reporterName: string;
  reporterEmail: string;
  rightsOwnerName: string;
  relationshipToRightsOwner: "SELF" | "AUTHORIZED_REPRESENTATIVE" | "OTHER" | string;
  description: string;
  originalWorkDescription: string;
  originalWorkUrl?: string;
  supportingEvidenceUrl?: string;
  goodFaithConfirmation: boolean;
  accuracyConfirmation: boolean;
  electronicSignature: string;
  idempotencyKey?: string;
  setUnderReview?: boolean;
}

export async function createCopyrightReport(input: CopyrightReportInput): Promise<{
  id: string;
  caseReference: string;
}> {
  const db = getPool();
  if (!db) throw Object.assign(new Error("Database not configured"), { status: 503 });

  if (!input.goodFaithConfirmation || !input.accuracyConfirmation) {
    throw Object.assign(new Error("Both confirmations are required."), { status: 400 });
  }
  if (!input.reporterName?.trim() || !input.reporterEmail?.trim()) {
    throw Object.assign(new Error("Reporter name and email are required."), { status: 400 });
  }
  if (!input.electronicSignature?.trim()) {
    throw Object.assign(new Error("Electronic signature is required."), { status: 400 });
  }
  if (!input.description?.trim() || !input.originalWorkDescription?.trim()) {
    throw Object.assign(new Error("Description fields are required."), { status: 400 });
  }

  const sound = await getSoundById(input.soundId);
  if (!sound) {
    throw Object.assign(new Error("Sound not found."), { status: 404 });
  }

  if (input.idempotencyKey) {
    const existing = await db.query(
      `SELECT id, case_reference FROM copyright_reports WHERE idempotency_key = $1 LIMIT 1`,
      [input.idempotencyKey],
    );
    if (existing.rows[0]) {
      return {
        id: String(existing.rows[0].id),
        caseReference: String(existing.rows[0].case_reference),
      };
    }
  }

  const id = newId("cr");
  let ref = caseReference();
  for (let i = 0; i < 5; i++) {
    const clash = await db.query(
      `SELECT 1 FROM copyright_reports WHERE case_reference = $1 LIMIT 1`,
      [ref],
    );
    if (!clash.rows.length) break;
    ref = caseReference();
  }

  await db.query(
    `INSERT INTO copyright_reports (
       id, case_reference, sound_id, source_video_id, reporter_user_id,
       reporter_name, reporter_email, rights_owner_name, relationship_to_rights_owner,
       description, original_work_description, original_work_url, supporting_evidence_url,
       good_faith_confirmed, accuracy_confirmed, electronic_signature,
       status, submitted_at, idempotency_key
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'RECEIVED',NOW(),$17
     )`,
    [
      id,
      ref,
      input.soundId,
      input.sourceVideoId || sound.source_video_id || null,
      input.reporterUserId,
      input.reporterName.trim().slice(0, 200),
      input.reporterEmail.trim().slice(0, 320),
      input.rightsOwnerName.trim().slice(0, 200),
      String(input.relationshipToRightsOwner || "OTHER").slice(0, 64),
      input.description.trim().slice(0, 8000),
      input.originalWorkDescription.trim().slice(0, 8000),
      input.originalWorkUrl?.trim().slice(0, 2000) || null,
      input.supportingEvidenceUrl?.trim().slice(0, 2000) || null,
      true,
      true,
      input.electronicSignature.trim().slice(0, 200),
      input.idempotencyKey || null,
    ],
  );

  // Do not auto-disable reuse solely because a report was filed.
  // Moderators set UNDER_REVIEW / disable reuse after triage.
  if (input.setUnderReview === true) {
    await db.query(
      `UPDATE sounds SET copyright_status = 'UNDER_REVIEW', updated_at = NOW()
       WHERE id = $1 AND copyright_status = 'ACTIVE' AND removed_at IS NULL`,
      [input.soundId],
    );
  }

  await logModerationAction({
    reportId: id,
    soundId: input.soundId,
    actorUserId: input.reporterUserId || "system",
    action: "REPORT_SUBMITTED",
    details: { caseReference: ref },
  });

  if (input.reporterUserId) {
    await insertNotification({
      userId: input.reporterUserId,
      type: "copyright_report_received",
      title: "Copyright report received",
      body: `We received your copyright report. Your case reference is ${ref}.`,
      actionUrl: `/legal/copyright-report/${ref}`,
      data: { caseReference: ref, path: `/legal/copyright-report/${ref}` },
    });
  }

  if (sound.original_uploader_id && input.setUnderReview === true) {
    await insertNotification({
      userId: sound.original_uploader_id,
      type: "copyright_reuse_under_review",
      title: "Sound under copyright review",
      body: "Reuse of your uploaded sound has been temporarily disabled while we review a copyright report.",
      actionUrl: `/music/${sound.id}`,
      data: { soundId: sound.id, path: `/music/${sound.id}` },
    });
  }

  logger.info({ caseReference: ref, soundId: input.soundId }, "copyright report created");
  return { id, caseReference: ref };
}

export async function createCopyrightAppeal(opts: {
  caseReference: string;
  appellantUserId: string;
  reason: string;
  rightsExplanation: string;
  supportingEvidenceUrl?: string;
  accuracyConfirmation: boolean;
  electronicSignature: string;
}): Promise<{ id: string }> {
  const db = getPool();
  if (!db) throw Object.assign(new Error("Database not configured"), { status: 503 });
  if (!opts.accuracyConfirmation) {
    throw Object.assign(new Error("Accuracy confirmation is required."), { status: 400 });
  }
  if (!opts.reason?.trim() || !opts.rightsExplanation?.trim() || !opts.electronicSignature?.trim()) {
    throw Object.assign(new Error("Required appeal fields are missing."), { status: 400 });
  }

  const reportR = await db.query(
    `SELECT * FROM copyright_reports WHERE case_reference = $1 LIMIT 1`,
    [opts.caseReference],
  );
  const report = reportR.rows[0] as
    | { id: string; sound_id: string; status: string }
    | undefined;
  if (!report) throw Object.assign(new Error("Case not found."), { status: 404 });

  const sound = await getSoundById(report.sound_id);
  if (!sound || sound.original_uploader_id !== opts.appellantUserId) {
    throw Object.assign(new Error("Only the original uploader may appeal this decision."), {
      status: 403,
    });
  }

  const eligible = ["ACTION_REQUIRED", "RESOLVED"].includes(String(report.status).toUpperCase())
    || Boolean(sound.removed_at)
    || String(sound.copyright_status).toUpperCase() === "REMOVED";
  if (!eligible && String(report.status).toUpperCase() === "RECEIVED") {
    throw Object.assign(new Error("This case is not yet eligible for appeal."), { status: 409 });
  }

  const id = newId("ca");
  await db.query(
    `INSERT INTO copyright_appeals (
       id, case_reference, report_id, appellant_user_id, reason, rights_explanation,
       supporting_evidence_url, accuracy_confirmed, electronic_signature, status, submitted_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE,$8,'RECEIVED',NOW())`,
    [
      id,
      opts.caseReference,
      report.id,
      opts.appellantUserId,
      opts.reason.trim().slice(0, 8000),
      opts.rightsExplanation.trim().slice(0, 8000),
      opts.supportingEvidenceUrl?.trim().slice(0, 2000) || null,
      opts.electronicSignature.trim().slice(0, 200),
    ],
  );

  await logModerationAction({
    reportId: report.id,
    soundId: report.sound_id,
    actorUserId: opts.appellantUserId,
    action: "APPEAL_SUBMITTED",
    details: { appealId: id },
  });

  await insertNotification({
    userId: opts.appellantUserId,
    type: "copyright_appeal_submitted",
    title: "Copyright appeal submitted",
    body: `We received your appeal for case ${opts.caseReference}.`,
    actionUrl: `/legal/copyright-appeal/${opts.caseReference}`,
    data: { caseReference: opts.caseReference },
  });

  return { id };
}

export async function publicCaseSummary(caseReference: string, requesterId: string | null) {
  const db = getPool();
  if (!db) return null;
  const r = await db.query(
    `SELECT id, case_reference, sound_id, status, submitted_at, resolved_at, reporter_user_id
     FROM copyright_reports WHERE case_reference = $1 LIMIT 1`,
    [caseReference],
  );
  const row = r.rows[0] as
    | {
        id: string;
        case_reference: string;
        sound_id: string;
        status: string;
        submitted_at: Date;
        resolved_at: Date | null;
        reporter_user_id: string | null;
      }
    | undefined;
  if (!row) return null;

  const isOwner =
    requesterId &&
    (row.reporter_user_id === requesterId ||
      (await getSoundById(row.sound_id))?.original_uploader_id === requesterId);

  // Public lookup: never expose private reporter fields.
  return {
    caseReference: row.case_reference,
    status: row.status,
    soundId: row.sound_id,
    submittedAt: row.submitted_at,
    resolvedAt: row.resolved_at,
    canViewPrivate: Boolean(isOwner),
  };
}
