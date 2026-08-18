/**
 * Durable money guarantees that belong to the schema, not to a call site.
 *
 * Every balance debit in the codebase today either clamps with GREATEST or reads
 * the row FOR UPDATE first, so no wallet column is negative in production. That
 * was the only thing keeping them non-negative: the two GBP wallet tables and
 * the coin-denominated creator balances carried no CHECK at all. These tests
 * pin the constraints, and pin that the ledger hold is timed by the database
 * rather than by whatever clock the app host happens to run.
 *
 * Requires: TEST_DATABASE_URL + ALLOW_MONEY_IT_ON_URL=1
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { normalizeDatabaseUrl } from "../databaseUrl";
import {
  applyRepoMigrations,
  assertSafeTestDatabase,
  createTestPool,
} from "../testMigrationBootstrap";

const TEST_URL = normalizeDatabaseUrl((process.env.TEST_DATABASE_URL || "").trim());
const RUN = !!TEST_URL;

describe.skipIf(!RUN)("Money schema guards (real DB)", () => {
  let pool: pg.Pool;

  beforeAll(async () => {
    assertSafeTestDatabase(TEST_URL);
    pool = createTestPool(TEST_URL, 4);
    await applyRepoMigrations(pool);
  }, 180_000);

  afterAll(async () => {
    await pool?.end();
  });

  const NEGATIVE_CASES: { table: string; column: string; seed: string }[] = [
    {
      table: "elix_creator_wallet_gbp",
      column: "available_pence",
      seed: `INSERT INTO elix_creator_wallet_gbp (user_id) VALUES ($1)
             ON CONFLICT (user_id) DO NOTHING`,
    },
    {
      table: "elix_creator_wallet_gbp",
      column: "held_pence",
      seed: `INSERT INTO elix_creator_wallet_gbp (user_id) VALUES ($1)
             ON CONFLICT (user_id) DO NOTHING`,
    },
    {
      table: "elix_creator_balances",
      column: "locked_coins",
      seed: `INSERT INTO elix_creator_balances (user_id) VALUES ($1)
             ON CONFLICT (user_id) DO NOTHING`,
    },
    {
      table: "elix_creator_balances",
      column: "available_coins",
      seed: `INSERT INTO elix_creator_balances (user_id) VALUES ($1)
             ON CONFLICT (user_id) DO NOTHING`,
    },
  ];

  for (const { table, column, seed } of NEGATIVE_CASES) {
    it(`refuses a negative ${table}.${column}`, async () => {
      const userId = `u_guard_${Math.random().toString(36).slice(2, 10)}`;
      await pool.query(seed, [userId]);
      await expect(
        pool.query(`UPDATE ${table} SET ${column} = -1 WHERE user_id = $1`, [userId]),
      ).rejects.toThrow(/violates check constraint/i);
      const after = await pool.query(
        `SELECT ${column}::bigint AS v FROM ${table} WHERE user_id = $1`,
        [userId],
      );
      expect(Number(after.rows[0].v)).toBe(0);
    });
  }

  it("refuses a negative platform wallet balance", async () => {
    await pool.query(
      `INSERT INTO elix_platform_wallet_gbp (id) VALUES ('default') ON CONFLICT (id) DO NOTHING`,
    );
    await expect(
      pool.query(`UPDATE elix_platform_wallet_gbp SET available_pence = -1 WHERE id = 'default'`),
    ).rejects.toThrow(/violates check constraint/i);
  });

  it("times the ledger hold on the database clock, not this process's", async () => {
    const { postLedgerEntry } = await import("./ledger");
    const client = await pool.connect();
    const creator = `u_hold_${Math.random().toString(36).slice(2, 10)}`;
    try {
      await client.query("BEGIN");
      const posted = await postLedgerEntry(client, {
        idempotencyKey: `hold_clock:${creator}`,
        revenueSource: "PAID_GIFT",
        creatorUserId: creator,
        grossPence: 100,
        netRevenuePence: 100,
        creatorPct: 60,
        creatorAmountPence: 60,
        platformPct: 40,
        platformAmountPence: 40,
        status: "pending",
        ruleSnapshot: {},
      });
      // `pending_at` is what maturation compares against NOW(). Read the skew
      // between the row and the database's own clock inside the same statement:
      // a timestamp taken on this host would show up here as the host/Neon
      // difference, which is seconds in practice.
      const r = await client.query<{ skew_ms: string }>(
        `SELECT ABS(EXTRACT(EPOCH FROM (clock_timestamp() - pending_at)) * 1000)::bigint AS skew_ms
           FROM elix_financial_ledger WHERE id = $1`,
        [posted.id],
      );
      expect(Number(r.rows[0].skew_ms)).toBeLessThan(1000);
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  });

  it("reads a banned account as not in good standing", async () => {
    process.env.DATABASE_URL = TEST_URL;
    const postgres = await import("../postgres");
    await postgres.connectPostgres();
    const { isAccountInGoodStanding } = await import("./fraud");

    const banned = `u_banned_${Math.random().toString(36).slice(2, 10)}`;
    const clean = `u_clean_${Math.random().toString(36).slice(2, 10)}`;
    await pool.query(
      `INSERT INTO profiles (user_id, username, banned_until)
       VALUES ($1, $1, NOW() + interval '7 days'), ($2, $2, NULL)
       ON CONFLICT (user_id) DO UPDATE SET banned_until = EXCLUDED.banned_until`,
      [banned, clean],
    );

    expect(await isAccountInGoodStanding(banned)).toBe(false);
    expect(await isAccountInGoodStanding(clean)).toBe(true);
  });

  it("reads an expired ban as in good standing again", async () => {
    process.env.DATABASE_URL = TEST_URL;
    const postgres = await import("../postgres");
    await postgres.connectPostgres();
    const { isAccountInGoodStanding } = await import("./fraud");

    const expired = `u_unbanned_${Math.random().toString(36).slice(2, 10)}`;
    await pool.query(
      `INSERT INTO profiles (user_id, username, banned_until)
       VALUES ($1, $1, NOW() - interval '1 day')
       ON CONFLICT (user_id) DO UPDATE SET banned_until = EXCLUDED.banned_until`,
      [expired],
    );
    expect(await isAccountInGoodStanding(expired)).toBe(true);
  });
});
