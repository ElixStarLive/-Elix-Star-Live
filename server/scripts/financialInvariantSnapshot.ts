/**
 * Read-only financial + migration invariant snapshot (no mutations).
 * Usage: npx tsx server/scripts/financialInvariantSnapshot.ts
 */
import "../config.ts";
import pg from "pg";
import { normalizeDatabaseUrl } from "../lib/databaseUrl.ts";

const url = normalizeDatabaseUrl((process.env.DATABASE_URL || "").trim());
const needsSsl = url.includes("neon.tech") || url.includes("sslmode=require");
const pool = new pg.Pool({
  connectionString: url,
  max: 1,
  ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
});
const c = await pool.connect();

try {
  const purchased = await c.query(
    `SELECT COUNT(*)::int AS users, COALESCE(SUM(coin_balance),0)::bigint AS coins
       FROM elix_wallet_balances`,
  );
  const starter = await c.query(
    `SELECT COALESCE(SUM(balance),0)::bigint AS s FROM starter_coin_balances`,
  );
  let promo = "0";
  try {
    const pr = await c.query(
      `SELECT COALESCE(SUM(balance),0)::bigint AS p FROM promotional_coin_balances`,
    );
    promo = String(pr.rows[0].p);
  } catch {
    promo = "table_missing";
  }
  const diamonds = await c.query(
    `SELECT COALESCE(SUM(pending_coins + available_coins + locked_coins),0)::bigint AS d
       FROM elix_creator_balances`,
  );
  const gifts = await c.query(
    `SELECT COUNT(*)::int AS c FROM elix_gift_transactions`,
  );
  const ledger = await c.query(
    `SELECT COUNT(*)::int AS c FROM elix_wallet_ledger`,
  );
  const payouts = await c.query(
    `SELECT status, COUNT(*)::int AS c FROM elix_payout_requests GROUP BY status ORDER BY 1`,
  );
  const mig = await c.query(
    `SELECT COUNT(*)::int AS c FROM elix_schema_migrations WHERE filename LIKE '20260722%'`,
  );
  const dups = await c.query(
    `SELECT COUNT(*)::int AS c FROM (
       SELECT filename FROM elix_schema_migrations GROUP BY filename HAVING COUNT(*) > 1
     ) t`,
  );

  console.log("PURCHASED_USERS=" + purchased.rows[0].users);
  console.log("PURCHASED_COINS=" + purchased.rows[0].coins);
  console.log("STARTER_COINS=" + starter.rows[0].s);
  console.log("PROMO_COINS=" + promo);
  console.log("DIAMONDS_AGG=" + diamonds.rows[0].d);
  console.log("GIFT_ROWS=" + gifts.rows[0].c);
  console.log("LEDGER_ROWS=" + ledger.rows[0].c);
  console.log("MIG_20260722=" + mig.rows[0].c);
  console.log("DUP_MIG=" + dups.rows[0].c);
  for (const r of payouts.rows) {
    console.log("PAYOUT|" + r.status + "=" + r.c);
  }
  if (payouts.rows.length === 0) console.log("PAYOUT|none=0");
} finally {
  c.release();
  await pool.end();
}
