import "../config.ts";
import { randomUUID } from "crypto";
import { initPostgres, getPool } from "../lib/postgres.ts";
import {
  openCreatorRewardPeriod,
  closeCreatorRewardPeriod,
} from "../lib/monetisation/creatorRewardsJob.ts";
import { runWalletLedgerReconciliation } from "../lib/monetisation/reconcile.ts";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

async function main() {
  await initPostgres();
  const pool = getPool()!;
  const creatorId = `reward_fix_${randomUUID()}`;
  const starts = new Date(Date.now() - 3 * 86400000);
  const ends = new Date(Date.now() - 2 * 86400000);
  const vid = `vid_${randomUUID()}`;

  await pool.query(
    `INSERT INTO videos (id, user_id, url, privacy, created_at)
     VALUES ($1,$2,'https://cdn.example/t.mp4','public',NOW()) ON CONFLICT DO NOTHING`,
    [vid, creatorId],
  );

  // 8000 followers via generate_series
  await pool.query(
    `INSERT INTO follows (follower_id, following_id)
     SELECT 'rf_' || g::text || '_' || $1, $2
       FROM generate_series(1, 8000) g
     ON CONFLICT DO NOTHING`,
    [creatorId.slice(0, 8), creatorId],
  ).catch(async (err) => {
    // maybe unique constraint name differs
    console.error("follows_seed", err instanceof Error ? err.message : err);
  });

  const viewAt = new Date(starts.getTime() + 3600000);
  for (let i = 0; i < 120; i++) {
    await pool.query(
      `INSERT INTO elix_qualified_video_views
         (video_id, viewer_user_id, creator_user_id, watch_seconds, first_qualified_at)
       VALUES ($1,$2,$3,30,$4) ON CONFLICT DO NOTHING`,
      [vid, `vw_${i}_${randomUUID().slice(0, 6)}`, creatorId, viewAt],
    );
  }

  const pid = await openCreatorRewardPeriod({ startsAt: starts, endsAt: ends });
  if (pid) {
    await pool.query(
      `UPDATE elix_creator_reward_periods SET starts_at=$2, ends_at=$3, status='open' WHERE id=$1`,
      [pid, starts, ends],
    );
  }
  const closed = pid ? await closeCreatorRewardPeriod(pid) : { processed: 0, rewarded: 0 };
  const results = pid
    ? await pool.query(
        `SELECT id, status, qualified_views, reward_pence, ledger_id
           FROM elix_creator_reward_results WHERE reward_period_id=$1`,
        [pid],
      )
    : { rows: [] };
  const reconcile = await runWalletLedgerReconciliation();
  const out = {
    finishedAt: new Date().toISOString(),
    creatorId,
    periodId: pid,
    closed,
    resultCount: results.rows.length,
    sample: results.rows[0] || null,
    reconcile: {
      ok: (reconcile as { ok?: boolean }).ok === true,
      mismatchCount: ((reconcile as { mismatches?: unknown[] }).mismatches || []).length,
    },
  };
  const file = path.join(
    root,
    "docs/evidence",
    `creator-rewards-close-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
  );
  fs.writeFileSync(file, JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ ...out, evidenceFile: file }, null, 2));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
