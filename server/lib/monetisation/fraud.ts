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
  | "suspicious_follower_growth"
  | "viewing_velocity"
  | "country_ineligible"
  | "age_ineligible"
  | "private_account"
  | "manual_review_hold"
  | "account_not_good_standing"
  | "community_guidelines"
  | "unresolved_fraud";

export type FraudReviewStatus =
  | "open"
  | "under_review"
  | "cleared"
  | "confirmed_fraud"
  | "appealed";

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
  if (await isViewingVelocitySuspicious(input.viewerUserId)) {
    await recordFraudDecision({
      subjectType: "view",
      subjectId: `${input.videoId}:${input.viewerUserId}`,
      userId: input.viewerUserId,
      reasonCode: "viewing_velocity",
    });
    return { reject: true, reason: "viewing_velocity" };
  }
  if (input.ipHash || input.userAgent) {
    const multi = await isMultiAccountDeviceBurst({
      ipHash: input.ipHash,
      userAgent: input.userAgent,
      viewerUserId: input.viewerUserId,
    });
    if (multi) {
      await recordFraudDecision({
        subjectType: "view",
        subjectId: `${input.videoId}:${input.viewerUserId}`,
        userId: input.viewerUserId,
        reasonCode: "multi_account_device",
        details: { ipHash: input.ipHash, ua: String(input.userAgent || "").slice(0, 120) },
      });
      await openFraudReview({
        userId: input.viewerUserId,
        subjectType: "view",
        subjectId: `${input.videoId}:${input.viewerUserId}`,
        reasonCodes: ["multi_account_device", "duplicate_device_burst"],
      });
      return { reject: true, reason: "multi_account_device" };
    }
  }
  if (await hasManualReviewHold(input.viewerUserId)) {
    await recordFraudDecision({
      subjectType: "view",
      subjectId: `${input.videoId}:${input.viewerUserId}`,
      userId: input.viewerUserId,
      reasonCode: "manual_review_hold",
    });
    return { reject: true, reason: "manual_review_hold" };
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

/** Too many qualified views in a short window (same or any video). */
export async function isViewingVelocitySuspicious(
  viewerUserId: string,
  windowSeconds = 30,
  maxViews = 20,
): Promise<boolean> {
  const pool = getPool();
  if (!pool || !viewerUserId) return false;
  try {
    const r = await pool.query(
      `SELECT COUNT(*)::int AS c
         FROM elix_qualified_video_views
        WHERE viewer_user_id = $1
          AND last_seen_at >= NOW() - ($2::text || ' seconds')::interval`,
      [viewerUserId, String(windowSeconds)],
    );
    return Math.floor(Number(r.rows[0]?.c) || 0) >= maxViews;
  } catch {
    return false;
  }
}

/** Coordinated device: many distinct users from same IP+UA fingerprint recently. */
export async function isMultiAccountDeviceBurst(input: {
  ipHash?: string | null;
  userAgent?: string | null;
  viewerUserId: string;
  windowHours?: number;
  maxUsers?: number;
}): Promise<boolean> {
  const pool = getPool();
  if (!pool || !input.ipHash) return false;
  const fp = deviceFingerprint({
    ipHash: input.ipHash || undefined,
    userAgent: input.userAgent || undefined,
  });
  try {
    await pool.query(
      `INSERT INTO elix_fraud_decisions (subject_type, subject_id, user_id, reason_code, details)
       VALUES ('device_seen', $1, $2, 'duplicate_device_burst', $3::jsonb)`,
      [
        fp,
        input.viewerUserId,
        JSON.stringify({ ipHash: input.ipHash, ua: String(input.userAgent || "").slice(0, 120) }),
      ],
    );
    const r = await pool.query(
      `SELECT COUNT(DISTINCT user_id)::int AS c
         FROM elix_fraud_decisions
        WHERE subject_type = 'device_seen'
          AND subject_id = $1
          AND created_at >= NOW() - ($2::text || ' hours')::interval`,
      [fp, String(input.windowHours ?? 24)],
    );
    return Math.floor(Number(r.rows[0]?.c) || 0) >= (input.maxUsers ?? 8);
  } catch {
    return false;
  }
}

export async function isSuspiciousFollowerGrowth(
  userId: string,
  windowHours = 24,
  maxNewFollowers = 500,
): Promise<boolean> {
  const pool = getPool();
  if (!pool || !userId) return false;
  try {
    const r = await pool.query(
      `SELECT COUNT(*)::int AS c FROM follows
        WHERE following_id = $1
          AND created_at >= NOW() - ($2::text || ' hours')::interval`,
      [userId, String(windowHours)],
    ).catch(() =>
      pool.query(
        `SELECT COUNT(*)::int AS c FROM elix_follows
          WHERE followed_id = $1
            AND created_at >= NOW() - ($2::text || ' hours')::interval`,
        [userId, String(windowHours)],
      ),
    );
    const c = Math.floor(Number(r.rows[0]?.c) || 0);
    if (c >= maxNewFollowers) {
      await recordFraudDecision({
        subjectType: "followers",
        subjectId: userId,
        userId,
        reasonCode: "suspicious_follower_growth",
        details: { new_followers: c, windowHours },
      });
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function evaluateCreatorEligibilityFlags(userId: string): Promise<{
  countryEligible: boolean;
  ageEligible: boolean;
  publicAccountOk: boolean;
  goodStanding: boolean;
  unresolvedFraud: boolean;
  suspiciousFollowers: boolean;
  manualReviewHold: boolean;
}> {
  const pool = getPool();
  const defaults = {
    countryEligible: true,
    ageEligible: true,
    publicAccountOk: true,
    goodStanding: true,
    unresolvedFraud: false,
    suspiciousFollowers: false,
    manualReviewHold: false,
  };
  if (!pool || !userId) return defaults;
  try {
    const r = await pool.query(
      `SELECT country, country_code, birth_date, date_of_birth, is_private, private_account,
              is_banned, is_suspended, fraud_review_status
         FROM profiles WHERE user_id = $1 LIMIT 1`,
      [userId],
    ).catch(() => ({ rowCount: 0, rows: [] as Record<string, unknown>[] }));
    const row = r.rows[0] || {};
    const country = String(row.country_code || row.country || "").toUpperCase();
    // Configurable allow-list stored in monetisation config later; default GB/IE/US/CA/AU/NZ/EU common set
    const allowed = new Set(
      String(process.env.CREATOR_REWARDS_COUNTRIES || "GB,IE,US,CA,AU,NZ,DE,FR,ES,IT,NL")
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean),
    );
    const countryEligible = !country || allowed.has(country);

    let ageEligible = true;
    const dobRaw = row.birth_date || row.date_of_birth;
    if (dobRaw) {
      const dob = new Date(String(dobRaw));
      if (!Number.isNaN(dob.getTime())) {
        const ageYears = (Date.now() - dob.getTime()) / (365.25 * 24 * 3600 * 1000);
        ageEligible = ageYears >= 18;
      }
    }

    const publicAccountOk = !(row.is_private === true || row.private_account === true);
    const goodStanding = !(row.is_banned === true || row.is_suspended === true);
    const unresolvedFraud = await hasUnresolvedFraudFlag(userId);
    const suspiciousFollowers = await isSuspiciousFollowerGrowth(userId);
    const manualReviewHold = await hasManualReviewHold(userId);

    if (!countryEligible) {
      await recordFraudDecision({
        subjectType: "eligibility",
        subjectId: userId,
        userId,
        reasonCode: "country_ineligible",
        details: { country },
      });
    }
    if (!ageEligible) {
      await recordFraudDecision({
        subjectType: "eligibility",
        subjectId: userId,
        userId,
        reasonCode: "age_ineligible",
      });
    }

    return {
      countryEligible,
      ageEligible,
      publicAccountOk,
      goodStanding: goodStanding && !unresolvedFraud,
      unresolvedFraud,
      suspiciousFollowers,
      manualReviewHold,
    };
  } catch {
    return defaults;
  }
}

export async function openFraudReview(input: {
  userId: string;
  subjectType: string;
  subjectId: string;
  reasonCodes: FraudReasonCode[];
}): Promise<void> {
  const pool = getPool();
  if (!pool) return;
  try {
    await pool.query(
      `INSERT INTO elix_fraud_reviews (user_id, subject_type, subject_id, reason_codes, status)
       VALUES ($1, $2, $3, $4, 'open')`,
      [input.userId, input.subjectType, input.subjectId, input.reasonCodes],
    );
  } catch (err) {
    logger.warn({ err }, "openFraudReview failed");
  }
}

export async function hasManualReviewHold(userId: string): Promise<boolean> {
  const pool = getPool();
  if (!pool || !userId) return false;
  try {
    const r = await pool.query(
      `SELECT 1 FROM elix_fraud_reviews
        WHERE user_id = $1 AND status IN ('open', 'under_review')
        LIMIT 1`,
      [userId],
    );
    return (r.rowCount ?? 0) > 0;
  } catch {
    return false;
  }
}

export async function setFraudReviewOutcome(input: {
  reviewId: number;
  status: FraudReviewStatus;
  reviewerUserId: string;
  outcomeNote?: string;
}): Promise<{ ok: boolean }> {
  const pool = getPool();
  if (!pool) return { ok: false };
  try {
    await pool.query(
      `UPDATE elix_fraud_reviews SET
         status = $2,
         reviewer_user_id = $3,
         outcome_note = $4,
         updated_at = NOW()
       WHERE id = $1`,
      [input.reviewId, input.status, input.reviewerUserId, input.outcomeNote ?? null],
    );
    if (input.status === "confirmed_fraud") {
      const row = await pool.query(`SELECT user_id FROM elix_fraud_reviews WHERE id = $1`, [
        input.reviewId,
      ]);
      const uid = row.rows[0]?.user_id;
      if (uid) {
        await recordFraudDecision({
          subjectType: "fraud_review",
          subjectId: String(input.reviewId),
          userId: String(uid),
          reasonCode: "unresolved_fraud",
          details: { outcome: input.status, note: input.outcomeNote },
        });
      }
    }
    return { ok: true };
  } catch (err) {
    logger.warn({ err }, "setFraudReviewOutcome failed");
    return { ok: false };
  }
}
