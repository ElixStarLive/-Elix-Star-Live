/**
 * Creator Rewards period open/close — snapshots rules permanently on open.
 */
import { randomUUID } from "crypto";
import { getPool } from "../postgres";
import { logger } from "../logger";
import { loadMonetisationConfig, ruleSnapshotFromConfig } from "./config";
import {
  calculateCreatorRewardPence,
  evaluateCreatorRewardsEligibility,
} from "./creatorRewardsMath";
import { postLedgerEntry } from "./ledger";

export async function openCreatorRewardPeriod(input?: {
  startsAt?: Date;
  endsAt?: Date;
}): Promise<string | null> {
  const pool = getPool();
  if (!pool) return null;
  const cfg = await loadMonetisationConfig(true);
  if (!cfg.rewardsEnabled) {
    logger.warn("openCreatorRewardPeriod skipped — rewards disabled");
    return null;
  }
  const startsAt = input?.startsAt ?? new Date();
  const endsAt =
    input?.endsAt ??
    new Date(startsAt.getTime() + 30 * 24 * 60 * 60 * 1000);
  const id = `crp_${startsAt.toISOString().slice(0, 7)}_${randomUUID().slice(0, 8)}`;
  const snapshot = ruleSnapshotFromConfig(cfg, {
    period_id: id,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
  });
  try {
    await pool.query(
      `INSERT INTO elix_creator_reward_periods
         (id, starts_at, ends_at, status, rules_snapshot, monthly_budget_pence)
       VALUES ($1, $2, $3, 'open', $4::jsonb, $5)`,
      [id, startsAt, endsAt, JSON.stringify(snapshot), cfg.rewardsMonthlyBudgetPence],
    );
    return id;
  } catch (err) {
    logger.error({ err }, "openCreatorRewardPeriod failed");
    return null;
  }
}

/**
 * Close an open period: aggregate qualified views, evaluate eligibility, post ledger
 * for approved rewards. Duplicate creator/period blocked by unique constraint.
 */
export async function closeCreatorRewardPeriod(periodId: string): Promise<{
  processed: number;
  rewarded: number;
}> {
  const pool = getPool();
  if (!pool) return { processed: 0, rewarded: 0 };
  const client = await pool.connect();
  let processed = 0;
  let rewarded = 0;
  try {
    await client.query("BEGIN");
    const periodR = await client.query(
      `SELECT * FROM elix_creator_reward_periods WHERE id = $1 FOR UPDATE`,
      [periodId],
    );
    if (!periodR.rowCount) {
      await client.query("ROLLBACK");
      return { processed: 0, rewarded: 0 };
    }
    const period = periodR.rows[0];
    if (period.status !== "open") {
      await client.query("ROLLBACK");
      return { processed: 0, rewarded: 0 };
    }
    const rules =
      typeof period.rules_snapshot === "object" && period.rules_snapshot
        ? period.rules_snapshot
        : {};
    const milestones = Array.isArray(rules.milestones)
      ? rules.milestones.map((m: { minQualifiedViews?: number; rewardPence?: number }) => ({
          minQualifiedViews: Math.floor(Number(m.minQualifiedViews) || 0),
          rewardPence: Math.floor(Number(m.rewardPence) || 0),
        }))
      : undefined;
    const maxReward = Math.floor(Number(rules.rewards_max_pence) || 100_000);
    const cfg = await loadMonetisationConfig();
    const effectiveMinFollowers =
      Math.floor(Number((rules as { rewards_min_followers?: number }).rewards_min_followers) || 0) ||
      cfg.rewardsMinFollowers;
    const effectiveMinPrev =
      Math.floor(
        Number((rules as { rewards_min_prev_30d_qualified_views?: number }).rewards_min_prev_30d_qualified_views) ||
          0,
      ) || cfg.rewardsMinPrev30dQualifiedViews;

    const creators = await client.query(
      `SELECT creator_user_id, COUNT(*)::bigint AS qv
         FROM elix_qualified_video_views
        WHERE first_qualified_at >= $1 AND first_qualified_at < $2
        GROUP BY creator_user_id`,
      [period.starts_at, period.ends_at],
    );

    const budgetCap = Math.floor(Number(period.monthly_budget_pence) || 0);
    let budgetUsed = 0;

    for (const row of creators.rows) {
      const creatorId = String(row.creator_user_id);
      const qv = Math.floor(Number(row.qv) || 0);
      processed += 1;

      // Followers
      let followers = 0;
      try {
        const f = await client.query(
          `SELECT COUNT(*)::int AS c FROM follows WHERE following_id = $1`,
          [creatorId],
        );
        followers = Math.floor(Number(f.rows[0]?.c) || 0);
      } catch {
        try {
          const f2 = await client.query(
            `SELECT COUNT(*)::int AS c FROM elix_follows WHERE following_id = $1`,
            [creatorId],
          );
          followers = Math.floor(Number(f2.rows[0]?.c) || 0);
        } catch {
          followers = 0;
        }
      }

      // Previous 30 days before period start
      const prevR = await client.query(
        `SELECT COUNT(*)::bigint AS c
           FROM elix_qualified_video_views
          WHERE creator_user_id = $1
            AND first_qualified_at >= ($2::timestamptz - interval '30 days')
            AND first_qualified_at < $2`,
        [creatorId, period.starts_at],
      );
      const prev30 = Math.floor(Number(prevR.rows[0]?.c) || 0);

      const eligibility = evaluateCreatorRewardsEligibility({
        followers,
        prev30dQualifiedViews: prev30,
        accountInGoodStanding: true,
        countryEligible: true,
        ageEligible: true,
        publicAccountOk: true,
        originalContentOk: true,
        noSeriousViolations: true,
        noUnresolvedFraud: true,
        noManipulatedEngagement: true,
        noPurchasedViewsOrFollowers: true,
        minFollowers: effectiveMinFollowers,
        minPrev30dQualifiedViews: effectiveMinPrev,
      });

      const calc = calculateCreatorRewardPence(qv, milestones, maxReward);
      let rewardPence = eligibility.eligible ? calc.rewardPence : 0;
      let ineligibleReason = eligibility.reason;

      if (budgetCap > 0 && rewardPence > 0 && budgetUsed + rewardPence > budgetCap) {
        // Do not silently reduce — skip obligation creation for this creator
        rewardPence = 0;
        ineligibleReason = "monthly_budget_exhausted";
      }

      const resultId = `crr_${periodId}_${creatorId}`.slice(0, 120);
      const autoApprove = cfg.rewardsAutoApprove === true;
      const status =
        rewardPence > 0 ? (autoApprove ? "approved" : "pending_review") : "ineligible";

      const ins = await client.query(
        `INSERT INTO elix_creator_reward_results (
           id, reward_period_id, creator_user_id, qualified_views, followers_at_close,
           eligible, ineligible_reason, milestone_views, reward_pence, status
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (creator_user_id, reward_period_id) DO NOTHING
         RETURNING id`,
        [
          resultId,
          periodId,
          creatorId,
          qv,
          followers,
          eligibility.eligible && rewardPence > 0,
          ineligibleReason,
          calc.milestoneViews,
          rewardPence,
          status,
        ],
      );
      if (!ins.rowCount) continue;

      if (status === "approved" && rewardPence > 0) {
        const ledger = await postLedgerEntry(client, {
          idempotencyKey: `creator_reward:${periodId}:${creatorId}`,
          revenueSource: "CREATOR_REWARD",
          creatorUserId: creatorId,
          rewardPeriodId: periodId,
          grossPence: rewardPence,
          netRevenuePence: rewardPence,
          creatorPct: 100,
          creatorAmountPence: rewardPence,
          platformPct: 0,
          platformAmountPence: 0,
          status: "pending",
          ruleSnapshot: {
            ...rules,
            qualified_views: qv,
            milestone_views: calc.milestoneViews,
          },
        });
        await client.query(
          `UPDATE elix_creator_reward_results SET ledger_id = $2, updated_at = NOW() WHERE id = $1`,
          [resultId, ledger.id],
        );
        budgetUsed += rewardPence;
        rewarded += 1;
      }
    }

    await client.query(
      `UPDATE elix_creator_reward_periods
          SET status = 'closed', closed_at = NOW()
        WHERE id = $1`,
      [periodId],
    );
    await client.query("COMMIT");
    return { processed, rewarded };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (rb) {
      logger.error({ err: rb }, "closeCreatorRewardPeriod ROLLBACK failed");
    }
    logger.error({ err, periodId }, "closeCreatorRewardPeriod failed");
    return { processed, rewarded };
  } finally {
    client.release();
  }
}
