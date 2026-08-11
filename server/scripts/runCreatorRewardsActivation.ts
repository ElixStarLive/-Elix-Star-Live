/**
 * Creator Rewards production Neon proof: eligibility gates + period close.
 */
import "../config.ts";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import { initPostgres, getPool } from "../lib/postgres.ts";
import { openCreatorRewardPeriod, closeCreatorRewardPeriod } from "../lib/monetisation/creatorRewardsJob.ts";
import { loadMonetisationConfig } from "../lib/monetisation/config.ts";
import { runWalletLedgerReconciliation } from "../lib/monetisation/reconcile.ts";
import { requireValue } from "./_env.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");

async function main() {
  await initPostgres();
  const pool = requireValue(getPool(), "postgres pool");
  const cfg = await loadMonetisationConfig(true);
  const creatorId = `reward_act_${randomUUID()}`;
  const minFollowers = cfg.rewardsMinFollowers || 8000;

  // Seed followers (batch)
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (let i = 0; i < minFollowers; i++) {
      const follower = `f_${creatorId.slice(0, 8)}_${i}`;
      await client.query(
        `INSERT INTO follows (follower_id, following_id, created_at)
         VALUES ($1,$2,NOW()) ON CONFLICT DO NOTHING`,
        [follower, creatorId],
      ).catch(async () => {
        await client.query(
          `INSERT INTO follows (follower_id, following_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
          [follower, creatorId],
        );
      });
      if (i > 0 && i % 500 === 0) await client.query("COMMIT"); // keep txn size sane
      if (i > 0 && i % 500 === 0) await client.query("BEGIN");
    }
    await client.query("COMMIT");
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* */
    }
    throw e;
  } finally {
    client.release();
  }

  // Qualified views in window
  const videoId = `vid_rw_${randomUUID()}`;
  await pool.query(
    `INSERT INTO videos (id, user_id, url, privacy, created_at)
     VALUES ($1,$2,'https://cdn.example/r.mp4','public',NOW()) ON CONFLICT DO NOTHING`,
    [videoId, creatorId],
  );
  for (let i = 0; i < 100; i++) {
    await pool.query(
      `INSERT INTO elix_qualified_video_views (video_id, viewer_user_id, creator_user_id, watch_seconds, first_qualified_at)
       VALUES ($1,$2,$3,30,NOW()) ON CONFLICT DO NOTHING`,
      [videoId, `v_${i}_${randomUUID().slice(0, 8)}`, creatorId],
    );
  }

  const startsAt = new Date(Date.now() - 2 * 86400000);
  const endsAt = new Date(Date.now() - 3600000);
  const periodId = await openCreatorRewardPeriod({ startsAt, endsAt });
  // Force ends_at in past so close is meaningful — open already set endsAt
  if (periodId) {
    await pool.query(
      `UPDATE elix_creator_reward_periods SET starts_at=$2, ends_at=$3 WHERE id=$1`,
      [periodId, startsAt, endsAt],
    );
  }
  const closed = periodId ? await closeCreatorRewardPeriod(periodId) : { processed: 0, rewarded: 0 };
  const result = periodId
    ? await pool.query(
        `SELECT id, status, qualified_views, reward_pence, ledger_id FROM elix_creator_reward_results
          WHERE reward_period_id=$1 AND creator_user_id=$2`,
        [periodId, creatorId],
      )
    : { rows: [] };

  const reconcile = await runWalletLedgerReconciliation();
  const out = {
    finishedAt: new Date().toISOString(),
    rewardsEnabled: cfg.rewardsEnabled,
    minFollowers,
    periodId,
    closed,
    result: result.rows[0] || null,
    reconcile: {
      ok: (reconcile as { ok?: boolean }).ok === true,
      mismatchCount: ((reconcile as { mismatches?: unknown[] }).mismatches || []).length,
    },
  };
  const file = path.join(
    root,
    "docs/evidence",
    `creator-rewards-activation-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
  );
  fs.writeFileSync(file, JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ ...out, evidenceFile: file }, null, 2));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
