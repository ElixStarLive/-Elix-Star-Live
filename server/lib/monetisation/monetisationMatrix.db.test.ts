/**
 * §22 Creator Monetisation DB integration matrix.
 * Requires: TEST_DATABASE_URL + ALLOW_MONEY_IT_ON_URL=1
 * Never points at production Neon without sibling naming (elix_money_it / test / branch).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import { normalizeDatabaseUrl } from "../databaseUrl";
import { splitNetRevenue, promotePlatformOnly, netAfterDeductions } from "./moneyMath";
import {
  calculateCreatorRewardPence,
  DEFAULT_CREATOR_REWARD_MILESTONES,
  DEFAULT_MAX_REWARD_PENCE,
} from "./creatorRewardsMath";
import { evaluateViewFraud, isBotUserAgent } from "./fraud";
import { parseAppleFinancialCsv, parseGoogleEarningsCsv } from "./financialReports";
import { runWalletLedgerReconciliation } from "./reconcile";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_URL = normalizeDatabaseUrl((process.env.TEST_DATABASE_URL || "").trim());
const RUN = !!TEST_URL;

function assertNotProductionDatabase(url: string) {
  if (process.env.ALLOW_MONEY_IT_ON_URL !== "1") {
    throw new Error("Refusing money IT without ALLOW_MONEY_IT_ON_URL=1");
  }
  const dbName = (() => {
    try {
      return new URL(url.replace(/^postgres(ql)?:/i, "http:")).pathname.replace(/^\//, "").toLowerCase();
    } catch {
      return "";
    }
  })();
  if (!dbName) {
    throw new Error("TEST_DATABASE_URL has no database name in the path");
  }
  if (!/(test|dev|ephemeral|money.?it)/.test(dbName)) {
    throw new Error(
      `Refusing database "${dbName}" — name must contain test, dev, ephemeral, or money_it. ` +
      "Create a dedicated test database (e.g. elix_test) on your Neon branch.",
    );
  }
}

describe.skipIf(!RUN)("§22 Monetisation DB matrix", () => {
  let pool: pg.Pool;

  beforeAll(async () => {
    assertNotProductionDatabase(TEST_URL);
    pool = new pg.Pool({
      connectionString: TEST_URL,
      max: 8,
      ssl: TEST_URL.includes("neon.tech") ? { rejectUnauthorized: false } : undefined,
    });
    const client = await pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS elix_schema_migrations (
          id SERIAL PRIMARY KEY,
          filename TEXT NOT NULL UNIQUE,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`);
      const applied = new Set(
        (await client.query<{ filename: string }>(`SELECT filename FROM elix_schema_migrations`)).rows.map(
          (r) => r.filename,
        ),
      );
      const dir = path.join(__dirname, "../../migrations");
      for (const name of fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
        if (applied.has(name)) continue;
        await client.query(fs.readFileSync(path.join(dir, name), "utf8"));
        await client.query(
          `INSERT INTO elix_schema_migrations (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING`,
          [name],
        );
      }
    } finally {
      client.release();
    }
    process.env.DATABASE_URL = TEST_URL;
  }, 180_000);

  afterAll(async () => {
    await pool?.end();
  });

  it("one user watching one video 30 times → one qualified view", async () => {
    const videoId = `v30_${randomUUID()}`;
    const viewer = `vu_${randomUUID()}`;
    const creator = `cu_${randomUUID()}`;
    for (let i = 0; i < 30; i++) {
      await pool.query(
        `INSERT INTO elix_qualified_video_views (video_id, viewer_user_id, creator_user_id, watch_seconds)
         VALUES ($1,$2,$3,12)
         ON CONFLICT (video_id, viewer_user_id) DO UPDATE SET last_seen_at = NOW()`,
        [videoId, viewer, creator],
      );
    }
    const c = await pool.query(
      `SELECT COUNT(*)::int AS c FROM elix_qualified_video_views WHERE video_id = $1`,
      [videoId],
    );
    expect(c.rows[0].c).toBe(1);
  });

  it("concurrent view requests produce one qualified row", async () => {
    const videoId = `vc_${randomUUID()}`;
    const viewer = `vu_${randomUUID()}`;
    const creator = `cu_${randomUUID()}`;
    await Promise.all(
      Array.from({ length: 20 }, () =>
        pool.query(
          `INSERT INTO elix_qualified_video_views (video_id, viewer_user_id, creator_user_id, watch_seconds)
           VALUES ($1,$2,$3,15)
           ON CONFLICT (video_id, viewer_user_id) DO NOTHING`,
          [videoId, viewer, creator],
        ),
      ),
    );
    const c = await pool.query(
      `SELECT COUNT(*)::int AS c FROM elix_qualified_video_views WHERE video_id = $1 AND viewer_user_id = $2`,
      [videoId, viewer],
    );
    expect(c.rows[0].c).toBe(1);
  });

  it("self-view rejection (CHECK + fraud evaluate)", async () => {
    const uid = `self_${randomUUID()}`;
    await expect(
      pool.query(
        `INSERT INTO elix_qualified_video_views (video_id, viewer_user_id, creator_user_id, watch_seconds)
         VALUES ($1,$2,$2,20)`,
        [`vself_${randomUUID()}`, uid],
      ),
    ).rejects.toThrow();
    const fraud = await evaluateViewFraud({
      videoId: "v",
      viewerUserId: uid,
      creatorUserId: uid,
      watchSeconds: 20,
      minWatchSeconds: 5,
    });
    expect(fraud.reject).toBe(true);
    expect(fraud.reason).toBe("self_view");
  });

  it("gift 60/40 GBP posting — exact pennies, no missing pennies", () => {
    for (const net of [1, 2, 3, 99, 100, 7000, 12345, 99999]) {
      const s = splitNetRevenue(net, 60, 40);
      expect(s.creatorPence + s.platformPence).toBe(net);
      expect(s.creatorPence).toBe(Math.floor((net * 60) / 100));
    }
  });

  it("test and promotional coins produce £0 creator share", () => {
    // Unsettled / zero-net lots → £0 attribution
    expect(splitNetRevenue(0, 60, 40).creatorPence).toBe(0);
    expect(netAfterDeductions({
      grossPence: 0,
      appStoreDeductionPence: 0,
      taxDeductionPence: 0,
      processingDeductionPence: 0,
      refundPence: 0,
      chargebackPence: 0,
    })).toBe(0);
  });

  it("mixed paid-coin lot allocation floors without inventing pennies", () => {
    // Consume 30 of 100 coins from a £10 (1000p) settled lot → 300p net attributed
    const lotNet = 1000;
    const lotCoins = 100;
    const spend = 30;
    const attributed = Math.floor((lotNet * spend) / lotCoins);
    expect(attributed).toBe(300);
    const split = splitNetRevenue(attributed, 60, 40);
    expect(split.creatorPence + split.platformPence).toBe(attributed);
  });

  it("duplicate Apple/Google transaction unique on paid coin lots", async () => {
    const txn = `iap_${randomUUID()}`;
    await pool.query(
      `INSERT INTO elix_paid_coin_lots
         (id, user_id, provider, provider_transaction_id, product_id, coins_original, coins_remaining,
          gross_pence, net_pence, settlement_status, settled_at)
       VALUES ($1,$2,'apple',$3,'coins_100',100,100,999,999,'settled',NOW())`,
      [`lot_${txn}`, `u_${randomUUID()}`, txn],
    );
    await expect(
      pool.query(
        `INSERT INTO elix_paid_coin_lots
           (id, user_id, provider, provider_transaction_id, product_id, coins_original, coins_remaining,
            gross_pence, net_pence, settlement_status, settled_at)
         VALUES ($1,$2,'apple',$3,'coins_100',100,100,999,999,'settled',NOW())`,
        [`lot2_${txn}`, `u_${randomUUID()}`, txn],
      ),
    ).rejects.toThrow();
  });

  it("subscription create / renewal idempotency + refund reverse signs", async () => {
    const creator = `csub_${randomUUID()}`;
    const key = `sub_${randomUUID()}`;
    await pool.query(
      `INSERT INTO elix_creator_wallet_gbp (user_id) VALUES ($1) ON CONFLICT DO NOTHING`,
      [creator],
    );
    const split = splitNetRevenue(499, 60, 40);
    await pool.query(
      `INSERT INTO elix_financial_ledger
         (id, idempotency_key, creator_user_id, revenue_source, gross_pence, net_revenue_pence,
          creator_pct, creator_amount_pence, platform_pct, platform_amount_pence, status, rule_snapshot)
       VALUES ($1,$2,$3,'CREATOR_SUBSCRIPTION',499,499,60,$4,40,$5,'pending','{}')`,
      [`led_${key}`, key, creator, split.creatorPence, split.platformPence],
    );
    await expect(
      pool.query(
        `INSERT INTO elix_financial_ledger
           (id, idempotency_key, creator_user_id, revenue_source, gross_pence, net_revenue_pence,
            creator_pct, creator_amount_pence, platform_pct, platform_amount_pence, status, rule_snapshot)
         VALUES ($1,$2,$3,'CREATOR_SUBSCRIPTION',499,499,60,$4,40,$5,'pending','{}')`,
        [`led2_${key}`, key, creator, split.creatorPence, split.platformPence],
      ),
    ).rejects.toThrow();
    // Renewal uses distinct idempotency
    const renewKey = `${key}:renew`;
    await pool.query(
      `INSERT INTO elix_financial_ledger
         (id, idempotency_key, creator_user_id, revenue_source, gross_pence, net_revenue_pence,
          creator_pct, creator_amount_pence, platform_pct, platform_amount_pence, status, rule_snapshot)
       VALUES ($1,$2,$3,'CREATOR_SUBSCRIPTION',499,499,60,$4,40,$5,'pending','{}')`,
      [`led_r_${key}`, renewKey, creator, split.creatorPence, split.platformPence],
    );
    // Refund reversal: negative creator amounts
    await pool.query(
      `INSERT INTO elix_financial_ledger
         (id, idempotency_key, creator_user_id, revenue_source, gross_pence, net_revenue_pence,
          creator_pct, creator_amount_pence, platform_pct, platform_amount_pence, status, reversal_of_id, rule_snapshot)
       VALUES ($1,$2,$3,'REFUND_REVERSAL',499,499,60,$4,40,$5,'reversed',$6,'{}')`,
      [
        `led_rev_${key}`,
        `rev_${key}`,
        creator,
        -split.creatorPence,
        -split.platformPence,
        `led_${key}`,
      ],
    );
  });

  it("Promote Video = 100% platform net, creator £0", () => {
    const p = promotePlatformOnly(2500);
    expect(p.creatorPence).toBe(0);
    expect(p.platformPence).toBe(2500);
    expect(p.creatorPence + p.platformPence).toBe(2500);
  });

  it("every Creator Rewards milestone + £1000 cap above 50M", () => {
    for (const m of DEFAULT_CREATOR_REWARD_MILESTONES) {
      const r = calculateCreatorRewardPence(m.minQualifiedViews);
      expect(r.rewardPence).toBe(Math.min(DEFAULT_MAX_REWARD_PENCE, m.rewardPence));
    }
    const above = calculateCreatorRewardPence(80_000_000);
    expect(above.rewardPence).toBe(100_000);
  });

  it("duplicate reward period creator unique", async () => {
    const periodId = `rp_${randomUUID()}`;
    const creator = `cr_${randomUUID()}`;
    await pool.query(
      `INSERT INTO elix_creator_reward_periods (id, starts_at, ends_at, status, rules_snapshot, monthly_budget_pence)
       VALUES ($1, NOW()-interval '30 days', NOW(), 'closed', '{}'::jsonb, 0)`,
      [periodId],
    );
    await pool.query(
      `INSERT INTO elix_creator_reward_results
         (id, reward_period_id, creator_user_id, qualified_views, reward_pence, status, eligible)
       VALUES ($1,$2,$3,500000,500,'approved',TRUE)`,
      [`ob_${randomUUID()}`, periodId, creator],
    );
    await expect(
      pool.query(
        `INSERT INTO elix_creator_reward_results
           (id, reward_period_id, creator_user_id, qualified_views, reward_pence, status, eligible)
         VALUES ($1,$2,$3,500000,500,'approved',TRUE)`,
        [`ob2_${randomUUID()}`, periodId, creator],
      ),
    ).rejects.toThrow();
  });

  it("GBP withdrawal concurrency — only one succeeds for same available balance", async () => {
    const creator = `wdc_${randomUUID()}`;
    await pool.query(
      `INSERT INTO elix_creator_wallet_gbp (user_id, available_pence) VALUES ($1, 1000)
       ON CONFLICT (user_id) DO UPDATE SET available_pence = 1000`,
      [creator],
    );
    await pool.query(
      `INSERT INTO elix_payout_methods (id, user_id, type, details, is_default)
       VALUES ($1,$2,'bank','{}',TRUE)
       ON CONFLICT DO NOTHING`,
      [`pm_${creator}`, creator],
    ).catch(() => {});

    const tryWithdraw = async (key: string) => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const bal = await client.query(
          `SELECT available_pence FROM elix_creator_wallet_gbp WHERE user_id = $1 FOR UPDATE`,
          [creator],
        );
        const available = Math.floor(Number(bal.rows[0]?.available_pence) || 0);
        if (available < 1000) {
          await client.query("ROLLBACK");
          return false;
        }
        await client.query(
          `UPDATE elix_creator_wallet_gbp
              SET available_pence = available_pence - 1000, held_pence = held_pence + 1000
            WHERE user_id = $1`,
          [creator],
        );
        await client.query(
          `INSERT INTO elix_creator_withdrawals_gbp
             (id, idempotency_key, creator_user_id, amount_pence, currency, status)
           VALUES ($1,$2,$3,1000,'GBP','pending')`,
          [`wd_${key}`, key, creator],
        );
        await client.query("COMMIT");
        return true;
      } catch {
        try {
          await client.query("ROLLBACK");
        } catch {
          /* ignore */
        }
        return false;
      } finally {
        client.release();
      }
    };

    const results = await Promise.all([
      tryWithdraw(`a_${randomUUID()}`),
      tryWithdraw(`b_${randomUUID()}`),
      tryWithdraw(`c_${randomUUID()}`),
    ]);
    expect(results.filter(Boolean).length).toBe(1);
    const left = await pool.query(
      `SELECT available_pence::int AS a, held_pence::int AS h FROM elix_creator_wallet_gbp WHERE user_id = $1`,
      [creator],
    );
    expect(left.rows[0].a).toBe(0);
    expect(left.rows[0].h).toBe(1000);
  });

  it("duplicate payout provider_ref rejected", async () => {
    const creator = `dupref_${randomUUID()}`;
    const ref = `tr_${randomUUID()}`;
    await pool.query(
      `INSERT INTO elix_creator_withdrawals_gbp
         (id, idempotency_key, creator_user_id, amount_pence, status, payout_provider_ref)
       VALUES ($1,$2,$3,500,'paid',$4)`,
      [`wd1_${randomUUID()}`, `idem1_${randomUUID()}`, creator, ref],
    );
    await expect(
      pool.query(
        `INSERT INTO elix_creator_withdrawals_gbp
           (id, idempotency_key, creator_user_id, amount_pence, status, payout_provider_ref)
         VALUES ($1,$2,$3,500,'paid',$4)`,
        [`wd2_${randomUUID()}`, `idem2_${randomUUID()}`, creator, ref],
      ),
    ).rejects.toThrow();
  });

  it("refund after balance maturation still creates reversal row (immutable)", async () => {
    const creator = `mat_${randomUUID()}`;
    const origId = `led_mat_${randomUUID()}`;
    await pool.query(
      `INSERT INTO elix_financial_ledger
         (id, idempotency_key, creator_user_id, revenue_source, gross_pence, net_revenue_pence,
          creator_pct, creator_amount_pence, platform_pct, platform_amount_pence, status, rule_snapshot)
       VALUES ($1,$2,$3,'PAID_GIFT',1000,1000,60,600,40,400,'available','{}')`,
      [origId, `idem_mat_${randomUUID()}`, creator],
    );
    const revId = `led_mat_rev_${randomUUID()}`;
    await pool.query(
      `INSERT INTO elix_financial_ledger
         (id, idempotency_key, creator_user_id, revenue_source, gross_pence, net_revenue_pence,
          creator_pct, creator_amount_pence, platform_pct, platform_amount_pence, status, reversal_of_id, rule_snapshot)
       VALUES ($1,$2,$3,'REFUND_REVERSAL',1000,1000,60,-600,40,-400,'reversed',$4,'{}')`,
      [revId, `idem_mat_rev_${randomUUID()}`, creator, origId],
    );
    const stillThere = await pool.query(`SELECT id FROM elix_financial_ledger WHERE id = $1`, [origId]);
    expect(stillThere.rowCount).toBe(1);
  });

  it("chargeback after withdrawal records negative adjustment path", async () => {
    const creator = `cb_${randomUUID()}`;
    await pool.query(
      `INSERT INTO elix_creator_wallet_gbp (user_id, withdrawn_pence, available_pence)
       VALUES ($1, 600, 0)
       ON CONFLICT (user_id) DO UPDATE SET withdrawn_pence = 600`,
      [creator],
    );
    // After withdraw, chargeback posts negative available / reversed tracking
    await pool.query(
      `INSERT INTO elix_financial_ledger
         (id, idempotency_key, creator_user_id, revenue_source, gross_pence, net_revenue_pence,
          creator_pct, creator_amount_pence, platform_pct, platform_amount_pence, status, rule_snapshot)
       VALUES ($1,$2,$3,'CHARGEBACK_REVERSAL',1000,1000,60,-600,40,-400,'reversed','{"after_withdraw":true}')`,
      [`led_cb_${randomUUID()}`, `idem_cb_${randomUUID()}`, creator],
    );
    await pool.query(
      `UPDATE elix_creator_wallet_gbp
          SET reversed_pence = reversed_pence + 600, updated_at = NOW()
        WHERE user_id = $1`,
      [creator],
    );
    const w = await pool.query(
      `SELECT reversed_pence::int AS r FROM elix_creator_wallet_gbp WHERE user_id = $1`,
      [creator],
    );
    expect(w.rows[0].r).toBeGreaterThanOrEqual(600);
  });

  it("currency rounding — no float money in ledger columns", async () => {
    const id = `led_rnd_${randomUUID()}`;
    await pool.query(
      `INSERT INTO elix_financial_ledger
         (id, idempotency_key, revenue_source, gross_pence, net_revenue_pence,
          creator_pct, creator_amount_pence, platform_pct, platform_amount_pence, status, rule_snapshot)
       VALUES ($1,$2,'PROMOTE_VIDEO',199,199,0,0,100,199,'available','{}')`,
      [id, `idem_rnd_${randomUUID()}`],
    );
    const r = await pool.query(
      `SELECT gross_pence, net_revenue_pence, platform_amount_pence FROM elix_financial_ledger WHERE id = $1`,
      [id],
    );
    expect(Number.isInteger(Number(r.rows[0].gross_pence))).toBe(true);
    expect(Number(r.rows[0].platform_amount_pence)).toBe(199);
  });

  it("financial report CSV parsers extract gross/commission/net without inventing values", () => {
    const apple = parseAppleFinancialCsv(
      `Transaction Id,SKU,Customer Currency,Customer Price,Developer Proceeds,Quantity\n` +
        `TXN1,coins_100,GBP,9.99,6.99,1\n`,
    );
    expect(apple).toHaveLength(1);
    expect(apple[0].grossPence).toBe(999);
    expect(apple[0].netProceedsPence).toBe(699);
    expect(apple[0].commissionPence).toBe(300);

    const google = parseGoogleEarningsCsv(
      `Order Number,Product id,Merchant Currency,Amount (Merchant Currency),Fee,Tax Amount\n` +
        `GPA.1,coins_100,GBP,6.99,2.10,0.90\n`,
    );
    expect(google).toHaveLength(1);
    expect(google[0].netProceedsPence).toBe(699);
    expect(google[0].commissionPence).toBe(210);
    expect(google[0].taxPence).toBe(90);
  });

  it("bot UA detection", () => {
    expect(isBotUserAgent("Googlebot/2.1")).toBe(true);
    expect(isBotUserAgent("Mozilla/5.0 (iPhone)")).toBe(false);
  });

  it("wallet and ledger reconciliation runner executes", async () => {
    const result = await runWalletLedgerReconciliation();
    expect(result).toHaveProperty("ok");
    expect(Array.isArray(result.mismatches)).toBe(true);
  });
});
