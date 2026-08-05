/**
 * Fraud signals affecting views, rewards, and money paths.
 * Decisions are persisted with reason codes for audit.
 */
import { createHash } from "crypto";
import { getPool } from "../postgres";
import { logger } from "../logger";

export type FraudReasonCode =
  | "self_view"
  | "logged_out"
  | "watch_time"
  | "bot_ua"
  | "rate_view_farm"
  | "duplicate_device_burst"
  | "invalid_session"
  | "replayed_receipt"
  | "duplicate_webhook"
  | "duplicate_gift"
  | "duplicate_subscription"
  | "duplicate_reward"
  | "duplicate_withdrawal"
  | "purchased_engagement_suspected"
  | "multi_account_device"
  | "account_not_good_standing"
  | "community_guidelines"
  | "unresolved_fraud";

export async function ensureFraudTables(): Promise<void> {
  const pool = getPool();
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS elix_fraud_decisions (
      id BIGSERIAL PRIMARY KEY,
      subject_type TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      user_id TEXT,
      reason_code TEXT NOT NULL,
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_fraud_decisions_subject
      ON elix_fraud_decisions (subject_type, subject_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_fraud_decisions_user
      ON elix_fraud_decisions (user_id, created_at DESC);
  `);
}

export async function recordFraudDecision(input: {
  subjectType: string;
  subjectId: string;
  userId?: string | null;
  reasonCode: FraudReasonCode;
  details?: Record<string, unknown>;
}): Promise<void> {
  const pool = getPool();
  if (!pool) return;
  try {
    await ensureFraudTables();
    await pool.query(
      `INSERT INTO elix_fraud_decisions (subject_type, subject_id, user_id, reason_code, details)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [
        input.subjectType,
        input.subjectId,
        input.userId ?? null,
        input.reasonCode,
        JSON.stringify(input.details ?? {}),
      ],
    );
  } catch (err) {
    logger.warn({ err }, "recordFraudDecision failed");
  }
}

const BOT_UA =
  /bot|crawler|spider|curl|wget|python-requests|scrapy|headless|phantom|selenium/i;

export function isBotUserAgent(ua: string | undefined | null): boolean {
  if (!ua || !String(ua).trim()) return false;
  return BOT_UA.test(String(ua));
}

/** View-farm heuristic: too many distinct videos qualified by one user in a short window. */
export async function isViewFarmBurst(viewerUserId: string, windowSeconds = 60, maxVideos = 40): Promise<boolean> {
  const pool = getPool();
  if (!pool || !viewerUserId) return false;
  try {
    const r = await pool.query(
      `SELECT COUNT(DISTINCT video_id)::int AS c
         FROM elix_qualified_video_views
        WHERE viewer_user_id = $1
          AND first_qualified_at >= NOW() - ($2::text || ' seconds')::interval`,
      [viewerUserId, String(windowSeconds)],
    );
    return Math.floor(Number(r.rows[0]?.c) || 0) >= maxVideos;
  } catch {
    return false;
  }
}

export async function hasUnresolvedFraudFlag(userId: string): Promise<boolean> {
  const pool = getPool();
  if (!pool || !userId) return false;
  try {
    await ensureFraudTables();
    const r = await pool.query(
      `SELECT 1 FROM elix_fraud_decisions
        WHERE user_id = $1
          AND reason_code IN ('unresolved_fraud', 'purchased_engagement_suspected', 'multi_account_device', 'community_guidelines')
          AND created_at >= NOW() - interval '90 days'
        LIMIT 1`,
      [userId],
    );
    return (r.rowCount ?? 0) > 0;
  } catch {
    return false;
  }
}

export async function isAccountInGoodStanding(userId: string): Promise<boolean> {
  const pool = getPool();
  if (!pool || !userId) return false;
  try {
    const r = await pool.query(
      `SELECT is_banned, is_suspended FROM profiles WHERE user_id = $1 LIMIT 1`,
      [userId],
    );
    if (!r.rowCount) return true;
    if (r.rows[0].is_banned === true || r.rows[0].is_suspended === true) return false;
    if (await hasUnresolvedFraudFlag(userId)) return false;
    return true;
  } catch {
    try {
      const r2 = await pool.query(
        `SELECT banned, suspended FROM profiles WHERE user_id = $1 LIMIT 1`,
        [userId],
      );
      if (!r2.rowCount) return true;
      return !(r2.rows[0].banned || r2.rows[0].suspended);
    } catch {
      return true;
    }
  }
}

export function deviceFingerprint(input: {
  userId?: string;
  ipHash?: string;
  userAgent?: string;
}): string {
  const raw = `${input.userId || ""}|${input.ipHash || ""}|${input.userAgent || ""}`;
  return createHash("sha256").update(raw).digest("hex").slice(0, 32);
}

export async function evaluateViewFraud(input: {
  videoId: string;
  viewerUserId: string;
  creatorUserId: string;
  watchSeconds: number;
  minWatchSeconds: number;
  userAgent?: string | null;
  ipHash?: string | null;
}): Promise<{ reject: boolean; reason: FraudReasonCode | null }> {
  if (!input.viewerUserId || input.viewerUserId === "anonymous") {
    return { reject: true, reason: "logged_out" };
  }
  if (input.viewerUserId === input.creatorUserId) {
    await recordFraudDecision({
      subjectType: "view",
      subjectId: `${input.videoId}:${input.viewerUserId}`,
      userId: input.viewerUserId,
      reasonCode: "self_view",
    });
    return { reject: true, reason: "self_view" };
  }
  if (input.watchSeconds < input.minWatchSeconds) {
    return { reject: true, reason: "watch_time" };
  }
  if (isBotUserAgent(input.userAgent)) {
    await recordFraudDecision({
      subjectType: "view",
      subjectId: `${input.videoId}:${input.viewerUserId}`,
      userId: input.viewerUserId,
      reasonCode: "bot_ua",
      details: { ua: String(input.userAgent || "").slice(0, 200) },
    });
    return { reject: true, reason: "bot_ua" };
  }
  if (await isViewFarmBurst(input.viewerUserId)) {
    await recordFraudDecision({
      subjectType: "view",
      subjectId: `${input.videoId}:${input.viewerUserId}`,
      userId: input.viewerUserId,
      reasonCode: "rate_view_farm",
    });
    return { reject: true, reason: "rate_view_farm" };
  }
  if (!(await isAccountInGoodStanding(input.viewerUserId))) {
    await recordFraudDecision({
      subjectType: "view",
      subjectId: `${input.videoId}:${input.viewerUserId}`,
      userId: input.viewerUserId,
      reasonCode: "account_not_good_standing",
    });
    return { reject: true, reason: "account_not_good_standing" };
  }
  return { reject: false, reason: null };
}
