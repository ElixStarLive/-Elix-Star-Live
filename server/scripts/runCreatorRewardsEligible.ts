import "../config.ts";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { initPostgres, getPool } from "../lib/postgres.ts";
import {
  openCreatorRewardPeriod,
  closeCreatorRewardPeriod,
} from "../lib/monetisation/creatorRewardsJob.ts";
import { runWalletLedgerReconciliation } from "../lib/monetisation/reconcile.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

async function main() {
  await initPostgres();
  const pool = getPool()!;
  const creatorId = `reward_ok_${randomUUID()}`;
  const starts = new Date(Date.now() - 3 * 86400000);
  const ends = new Date(Date.now() - 2 * 86400000);
  const vid = `vid_${randomUUID()}`;

  await pool.query(
    `INSERT INTO videos (id, user_id, url, privacy, created_at)
     VALUES ($1,$2,'https://cdn.example/t.mp4','public',NOW()) ON CONFLICT DO NOTHING`,
    [vid, creatorId],
  );
  await pool.query(
    `INSERT INTO profiles (user_id, country_code, birth_date)
     VALUES ($1,'GB','1990-01-01')
     ON CONFLICT (user_id) DO UPDATE SET country_code='GB'`,
    [creatorId],
  ).catch(async () => {
    await pool.query(
      `INSERT INTO profiles (user_id, country) VALUES ($1,'GB') ON CONFLICT DO NOTHING`,
      [creatorId],
    ).catch(() => {});
  });

  // Spread follower created_at over 60 days so 24h growth check stays under 500
  await pool.query(
    `INSERT INTO follows (follower_id, following_id, created_at)
     SELECT 'rf3_' || g::text || '_' || $1,
            $2,
            NOW() - ((g % 60) || ' days')::interval - ((g % 20) || ' hours')::interval
       FROM generate_series(1, 8000) g
     ON CONFLICT DO NOTHING`,
    [creatorId.slice(0, 8), creatorId],
  );

  // Prev-30d window before period start
  const prevAt = new Date(starts.getTime() - 5 * 86400000);
  for (let i = 0; i < 60; i++) {
    await pool.query(
      `INSERT INTO elix_qualified_video_views
         (video_id, viewer_user_id, creator_user_id, watch_seconds, first_qualified_at)
       VALUES ($1,$2,$3,30,$4) ON CONFLICT DO NOTHING`,
      [vid, `pv_${i}_${randomUUID().slice(0, 6)}`, creatorId, prevAt],
    );
  }
  // Period window views (above test milestone 100)
  const viewAt = new Date(starts.getTime() + 3600000);
  for (let i = 0; i < 150; i++) {
    await pool.query(
      `INSERT INTO elix_qualified_video_views
         (video_id, viewer_user_id, creator_user_id, watch_seconds, first_qualified_at)
       VALUES ($1,$2,$3,30,$4) ON CONFLICT DO NOTHING`,
      [vid, `cv_${i}_${randomUUID().slice(0, 6)}`, creatorId, viewAt],
    );
  }

  const pid = await openCreatorRewardPeriod({ startsAt: starts, endsAt: ends });
  if (!pid) throw new Error("period_open_failed");
  await pool.query(
    `UPDATE elix_creator_reward_periods SET
       starts_at = $2,
       ends_at = $3,
       status = 'open',
       rules_snapshot = jsonb_set(
         jsonb_set(
           jsonb_set(rules_snapshot, '{rewards_min_followers}', '8000'::jsonb),
           '{rewards_min_prev_30d_qualified_views}', '50'::jsonb
         ),
         '{milestones}',
         '[{"minQualifiedViews":100,"rewardPence":500}]'::jsonb
       )
     WHERE id = $1`,
    [pid, starts, ends],
  );

  // Ensure auto-approve for credit path
  await pool.query(
    `UPDATE elix_monetisation_config SET rewards_auto_approve = TRUE WHERE id = 'default'`,
  ).catch(() => {});

  const closed = await closeCreatorRewardPeriod(pid);
  const results = await pool.query(
    `SELECT id, status, qualified_views, reward_pence, ledger_id, eligible, ineligible_reason
       FROM elix_creator_reward_results WHERE reward_period_id=$1`,
    [pid],
  );
  const reconcile = await runWalletLedgerReconciliation();
  const out = {
    finishedAt: new Date().toISOString(),
    creatorId,
    periodId: pid,
    closed,
    sample: results.rows[0] || null,
    reconcile: {
      ok: (reconcile as { ok?: boolean }).ok === true,
      mismatchCount: ((reconcile as { mismatches?: unknown[] }).mismatches || []).length,
    },
  };
  const file = path.join(
    root,
    "docs/evidence",
    `creator-rewards-eligible-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
  );
  fs.writeFileSync(file, JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ ...out, evidenceFile: file }, null, 2));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
