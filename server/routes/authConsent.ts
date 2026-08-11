/**
 * Auth consent — server source of truth for terms/privacy/age acceptance.
 * NEW CONTRACT: POST /api/auth/consent
 * Schema required via migration `20260810180100_user_consents.sql`.
 */
import { Request, Response } from "express";
import { getPool } from "../lib/postgres";
import { logger } from "../lib/logger";
import { getTokenFromRequest, verifyAuthToken } from "./auth";

function isSchemaMissing(err: unknown): boolean {
  return (err as { code?: string })?.code === "42P01";
}

/** POST /api/auth/consent — authenticated */
export async function handlePostConsent(req: Request, res: Response): Promise<void> {
  const token = getTokenFromRequest(req);
  if (!token) {
    res.status(401).json({ error: "Not authenticated." });
    return;
  }
  const payload = verifyAuthToken(token);
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired session." });
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const consentType =
    typeof body.consent_type === "string" && body.consent_type.trim()
      ? body.consent_type.trim()
      : "terms_privacy_and_age_13_plus";
  const version =
    typeof body.version === "string" && body.version.trim()
      ? body.version.trim()
      : "2026-07-21";
  const ageConfirmed =
    body.age_confirmed_13_plus === true ||
    body.age_confirmed_13_plus === "true" ||
    body.age_confirmed_13_plus === 1;
  if (!ageConfirmed) {
    res.status(400).json({ error: "age_confirmed_13_plus is required" });
    return;
  }

  const meta =
    body.meta && typeof body.meta === "object" && !Array.isArray(body.meta)
      ? (body.meta as Record<string, unknown>)
      : {};

  const db = getPool();
  if (!db) {
    res.status(503).json({ error: "DATABASE_UNAVAILABLE" });
    return;
  }

  try {
    await db.query(
      `INSERT INTO user_consents (user_id, consent_type, version, age_confirmed_13_plus, accepted_at, meta)
       VALUES ($1, $2, $3, TRUE, NOW(), $4::jsonb)
       ON CONFLICT (user_id, consent_type, version) DO UPDATE SET
         age_confirmed_13_plus = EXCLUDED.age_confirmed_13_plus,
         accepted_at = EXCLUDED.accepted_at,
         meta = EXCLUDED.meta`,
      [payload.sub, consentType, version, JSON.stringify(meta)],
    );
    res.status(200).json({
      ok: true,
      consent: {
        user_id: payload.sub,
        consent_type: consentType,
        version,
        age_confirmed_13_plus: true,
      },
    });
  } catch (err) {
    if (isSchemaMissing(err)) {
      logger.error({ err, userId: payload.sub }, "handlePostConsent missing table");
      res.status(503).json({ error: "SCHEMA_UNAVAILABLE" });
      return;
    }
    logger.error({ err, userId: payload.sub }, "handlePostConsent failed");
    res.status(500).json({ error: "CONSENT_SAVE_FAILED" });
  }
}
