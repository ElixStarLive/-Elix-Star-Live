/**
 * Fraud signals affecting views, rewards, and money paths.
 * Decisions are persisted with reason codes for audit.
 */
import { createHash } from "crypto";
import { getPool } from "../postgres";
import { logger } from "../logger";

type FraudReasonCode =
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

type FraudReviewStatus =
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

/**
 * View-farm heuristic: too many distinct videos qualified by one user in a short window.
 *
 * A database failure is not an answer. Every detector in this file used to
 * swallow one and report "no fraud found", so an outage turned the whole
 * qualified-view and creator-rewards gate into a pass. The error is raised so
 * the caller declines to credit the view instead of crediting an unchecked one.
 */
export async function isViewFarmBurst(viewerUserId: string, windowSeconds = 60, maxVideos = 40): Promise<boolean> {
  const pool = getPool();
  if (!pool || !viewerUserId) return false;
  const r = await pool.query(
    `SELECT COUNT(DISTINCT video_id)::int AS c
       FROM elix_qualified_video_views
      WHERE viewer_user_id = $1
        AND first_qualified_at >= NOW() - ($2::text || ' seconds')::interval`,
    [viewerUserId, String(windowSeconds)],
  );
  return Math.floor(Number(r.rows[0]?.c) || 0) >= maxVideos;
}

export async function hasUnresolvedFraudFlag(userId: string): Promise<boolean> {
  const pool = getPool();
  if (!pool || !userId) return false;
  const r = await pool.query(
    `SELECT 1 FROM elix_fraud_decisions
      WHERE user_id = $1
        AND reason_code IN ('unresolved_fraud', 'purchased_engagement_suspected', 'multi_account_device', 'community_guidelines')
        AND created_at >= NOW() - interval '90 days'
      LIMIT 1`,
    [userId],
  );
  return (r.rowCount ?? 0) > 0;
}

/**
 * Whether this account may earn.
 *
 * Ban state lives in `profiles.banned_until` — the same column profile listing
 * filters on. This asked for `is_banned` / `is_suspended` and then, when that
 * failed, for `banned` / `suspended`; no migration has ever created any of those
 * four columns, so both queries always failed and the handler returned `true`.
 * Every banned account read as being in good standing, which is what gates
 * qualified views and creator rewards.
 *
 * The ban is compared in SQL because `banned_until` is a database timestamp and
 * this process's clock is not the database's.
 */
export async function isAccountInGoodStanding(userId: string): Promise<boolean> {
  const pool = getPool();
  if (!pool || !userId) return false;
  const r = await pool.query<{ banned: boolean }>(
    `SELECT (banned_until IS NOT NULL AND banned_until > NOW()) AS banned
       FROM profiles WHERE user_id = $1 LIMIT 1`,
    [userId],
  );
  if (!r.rowCount) return true;
  if (r.rows[0].banned === true) return false;
  return !(await hasUnresolvedFraudFlag(userId));
}

function deviceFingerprint(input: {
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
  const r = await pool.query(
    `SELECT COUNT(*)::int AS c
       FROM elix_qualified_video_views
      WHERE viewer_user_id = $1
        AND last_seen_at >= NOW() - ($2::text || ' seconds')::interval`,
    [viewerUserId, String(windowSeconds)],
  );
  return Math.floor(Number(r.rows[0]?.c) || 0) >= maxViews;
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
}

export async function isSuspiciousFollowerGrowth(
  userId: string,
  windowHours = 24,
  maxNewFollowers = 500,
): Promise<boolean> {
  const pool = getPool();
  if (!pool || !userId) return false;
  // `follows` is the only follow table in the schema — there is no
  // `elix_follows` for this to fall back to.
  const r = await pool.query(
    `SELECT COUNT(*)::int AS c FROM follows
      WHERE following_id = $1
        AND created_at >= NOW() - ($2::text || ' hours')::interval`,
    [userId, String(windowHours)],
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
  // Eligibility is a judgement about a specific account made from database
  // state. Without a database, or without an account to judge, there is no
  // judgement — and answering "eligible on every count" would have paid an
  // unchecked creator. The caller runs inside a database transaction, so this
  // refusal aborts that run and the next one re-decides.
  if (!pool) {
    throw new Error("evaluateCreatorEligibilityFlags: database not configured");
  }
  if (!userId) {
    throw new Error("evaluateCreatorEligibilityFlags: userId is required");
  }

  // Only the columns this schema has. This used to ask for country, birth date,
  // privacy and ban flags that no migration creates, and swallow the resulting
  // error into an empty row — so every creator came back eligible on every
  // count, banned ones included, and a database outage read the same way. The
  // ban is judged in SQL because `banned_until` is on the database's clock.
  const r = await pool.query<{ banned: boolean }>(
    `SELECT (banned_until IS NOT NULL AND banned_until > NOW()) AS banned
       FROM profiles WHERE user_id = $1 LIMIT 1`,
    [userId],
  );
  const banned = r.rows[0]?.banned === true;
  const unresolvedFraud = await hasUnresolvedFraudFlag(userId);
  const suspiciousFollowers = await isSuspiciousFollowerGrowth(userId);
  const manualReviewHold = await hasManualReviewHold(userId);

  return {
    // The product records no country, date of birth or private-account flag
    // anywhere, so these three rules have nothing to judge. They are open here
    // deliberately and visibly rather than as the by-product of a failed query.
    countryEligible: true,
    ageEligible: true,
    publicAccountOk: true,
    goodStanding: !banned && !unresolvedFraud,
    unresolvedFraud,
    suspiciousFollowers,
    manualReviewHold,
  };
}

async function openFraudReview(input: {
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
  const r = await pool.query(
    `SELECT 1 FROM elix_fraud_reviews
      WHERE user_id = $1 AND status IN ('open', 'under_review')
      LIMIT 1`,
    [userId],
  );
  return (r.rowCount ?? 0) > 0;
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
