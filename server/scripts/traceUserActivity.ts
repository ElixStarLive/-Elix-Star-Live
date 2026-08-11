/**
 * Given a userId, print all server-side activity in the last N hours across
 * every table we care about for device verification (read-only).
 *
 * Column names verified via information_schema against production Neon:
 *   elix_wallet_ledger, elix_wallet_balances, elix_creator_balances,
 *   elix_gift_transactions (user_id = sender),
 *   elix_membership_purchases, elix_promote_purchases,
 *   elix_reports (reporter_user_id, target_type, target_id),
 *   elix_blocked_users, live_streams,
 *   auth_users, profiles.
 *
 * Usage: npx tsx server/scripts/traceUserActivity.ts <userId> [hoursBack=72]
 */
import "../config.ts";
import pg from "pg";
import { normalizeDatabaseUrl } from "../lib/databaseUrl.ts";

const userId = String(process.argv[2] || "").trim();
if (!userId) {
  console.log(JSON.stringify({ status: "USAGE", message: "userId required" }));
  process.exit(2);
}
const hoursArg = Number(process.argv[3]);
const HOURS = Number.isFinite(hoursArg) && hoursArg > 0 ? hoursArg : 72;

const url = normalizeDatabaseUrl((process.env.DATABASE_URL || "").trim());
const needsSsl = url.includes("neon.tech") || url.includes("sslmode=require");
const pool = new pg.Pool({
  connectionString: url,
  max: 1,
  ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
});

async function q<T = Record<string, unknown>>(
  sql: string,
  params: unknown[],
): Promise<{ rows: T[]; error?: string }> {
  try {
    const r = await pool.query(sql, params);
    return { rows: r.rows as T[] };
  } catch (e) {
    return { rows: [], error: e instanceof Error ? e.message : String(e) };
  }
}

async function main(): Promise<void> {
  const now = new Date().toISOString();

  const account = await q(
    `SELECT id::text, email, username, created_at::text
       FROM auth_users WHERE id = $1`,
    [userId],
  );
  const profile = await q(
    `SELECT user_id::text, username, display_name, coins::text AS profile_coins_column,
            is_admin, banned_until::text, created_at::text
       FROM profiles WHERE user_id = $1`,
    [userId],
  );
  const balance = await q(
    `SELECT coin_balance::text AS coin_balance, updated_at::text
       FROM elix_wallet_balances WHERE user_id = $1`,
    [userId],
  );
  const creator = await q(
    `SELECT pending_coins::text, available_coins::text, locked_coins::text
       FROM elix_creator_balances WHERE user_id = $1`,
    [userId],
  );

  const ledger = await q(
    `SELECT id::text, kind, coins_delta, provider, provider_transaction_id, product_id,
            gift_id::text, room_id, client_transaction_id, created_at::text
       FROM elix_wallet_ledger
      WHERE user_id = $1 AND created_at >= NOW() - ($2 || ' hours')::interval
      ORDER BY created_at DESC`,
    [userId, String(HOURS)],
  );

  const giftsSent = await q(
    `SELECT id::text, gift_id, room_id, coins, client_transaction_id, gift_source, created_at::text
       FROM elix_gift_transactions
      WHERE user_id = $1 AND created_at >= NOW() - ($2 || ' hours')::interval
      ORDER BY created_at DESC`,
    [userId, String(HOURS)],
  );

  const memberships = await q(
    `SELECT id::text, creator_id::text, provider, product_id, base_plan_id, subscription_state,
            expires_at::text, latest_order_id, purchase_token_hash, created_at::text
       FROM elix_membership_purchases
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 20`,
    [userId],
  );

  const promotes = await q(
    `SELECT id::text, provider, product_id, goal, amount_gbp::text,
            gross_pence, deduction_pence, net_platform_pence, status,
            starts_at::text, ends_at::text, created_at::text
       FROM elix_promote_purchases
      WHERE user_id = $1 AND created_at >= NOW() - ($2 || ' hours')::interval
      ORDER BY created_at DESC`,
    [userId, String(HOURS)],
  );

  const reportsMade = await q(
    `SELECT id::text, target_type, target_id::text, reason, status, created_at::text
       FROM elix_reports
      WHERE reporter_user_id = $1 AND created_at >= NOW() - ($2 || ' hours')::interval
      ORDER BY created_at DESC`,
    [userId, String(HOURS)],
  );

  const reportsAgainst = await q(
    `SELECT id::text, reporter_user_id::text, target_type, reason, status, created_at::text
       FROM elix_reports
      WHERE target_type = 'user' AND target_id::text = $1
        AND created_at >= NOW() - ($2 || ' hours')::interval
      ORDER BY created_at DESC`,
    [userId, String(HOURS)],
  );

  const blocksMade = await q(
    `SELECT blocked_user_id::text, created_at::text
       FROM elix_blocked_users
      WHERE blocker_user_id = $1 AND created_at >= NOW() - ($2 || ' hours')::interval
      ORDER BY created_at DESC`,
    [userId, String(HOURS)],
  );

  const liveAsHost = await q(
    `SELECT stream_key, display_name, is_live, viewer_count, started_at::text, ended_at::text
       FROM live_streams
      WHERE user_id = $1 AND started_at >= NOW() - ($2 || ' hours')::interval
      ORDER BY started_at DESC`,
    [userId, String(HOURS)],
  );

  console.log(
    JSON.stringify(
      {
        status: "OK",
        userId,
        atUtc: now,
        windowHours: HOURS,
        account,
        profile,
        walletBalance: balance,
        creatorBalance: creator,
        ledgerRows: ledger.rows.length,
        ledger,
        giftsSent,
        memberships,
        promotes,
        reportsMade,
        reportsAgainst,
        blocksMade,
        liveAsHost,
      },
      null,
      2,
    ),
  );

  await pool.end();
}

main().catch((err) => {
  console.log(JSON.stringify({ status: "ERROR", message: err instanceof Error ? err.message : String(err) }));
  process.exit(1);
});
