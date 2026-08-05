/**
 * Sandbox E2E evidence generator for monetisation flows (isolated TEST_DATABASE_URL only).
 * Does NOT send real money. Writes JSON evidence to docs/evidence/.
 *
 * Usage:
 *   ALLOW_MONEY_IT_ON_URL=1 TEST_DATABASE_URL=... npx tsx server/scripts/monetisationE2eEvidence.ts
 */
import "../config.ts";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import { randomUUID } from "crypto";
import { normalizeDatabaseUrl } from "../lib/databaseUrl.ts";
import { splitNetRevenue, promotePlatformOnly } from "../lib/monetisation/moneyMath.ts";
import { calculateCreatorRewardPence } from "../lib/monetisation/creatorRewardsMath.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const outDir = path.join(root, "docs", "evidence");

async function main() {
  const url = normalizeDatabaseUrl((process.env.TEST_DATABASE_URL || "").trim());
  if (!url || process.env.ALLOW_MONEY_IT_ON_URL !== "1") {
    console.error("Requires TEST_DATABASE_URL + ALLOW_MONEY_IT_ON_URL=1");
    process.exit(1);
  }
  if (/neon\.tech/i.test(url) && !/money.?it|test|branch|ephemeral|dev/i.test(url)) {
    console.error("Refusing production-looking Neon URL");
    process.exit(1);
  }

  const pool = new pg.Pool({
    connectionString: url,
    ssl: url.includes("neon.tech") ? { rejectUnauthorized: false } : undefined,
  });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const evidence: Record<string, unknown> = {
    generated_at: new Date().toISOString(),
    database: "elix_money_it_or_isolated",
    note: "Sandbox simulation — no real Stripe payout or store settlement executed",
  };

  const client = await pool.connect();
  try {
    // Gift chain (simulated ledger)
    const giftCreator = `e2e_creator_${randomUUID()}`;
    const giftTxn = `e2e_gift_ext_${randomUUID()}`;
    const giftNet = 7000;
    const giftSplit = splitNetRevenue(giftNet, 60, 40);
    const giftLedgerId = `led_gift_${randomUUID()}`;
    await client.query(
      `INSERT INTO elix_creator_wallet_gbp (user_id, pending_pence) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET pending_pence = elix_creator_wallet_gbp.pending_pence + $2`,
      [giftCreator, giftSplit.creatorPence],
    );
    await client.query(
      `INSERT INTO elix_financial_ledger
         (id, idempotency_key, external_transaction_id, creator_user_id, revenue_source,
          gross_pence, net_revenue_pence, creator_pct, creator_amount_pence, platform_pct, platform_amount_pence,
          status, rule_snapshot)
       VALUES ($1,$2,$3,$4,'PAID_GIFT',$5,$5,60,$6,40,$7,'pending',$8::jsonb)`,
      [
        giftLedgerId,
        `e2e:gift:${giftTxn}`,
        giftTxn,
        giftCreator,
        giftNet,
        giftSplit.creatorPence,
        giftSplit.platformPence,
        JSON.stringify({ e2e: true, flow: "gift" }),
      ],
    );
    const giftWdId = `wdgbp_${randomUUID()}`;
    await client.query(
      `UPDATE elix_creator_wallet_gbp
          SET pending_pence = GREATEST(0, pending_pence - $2),
              available_pence = available_pence + $2
        WHERE user_id = $1`,
      [giftCreator, giftSplit.creatorPence],
    );
    await client.query(
      `INSERT INTO elix_creator_withdrawals_gbp
         (id, idempotency_key, creator_user_id, amount_pence, status, payment_rail, payout_provider_ref)
       VALUES ($1,$2,$3,$4,'processing','stripe_connect',$5)`,
      [giftWdId, `e2e:wd:${giftTxn}`, giftCreator, giftSplit.creatorPence, `tr_sandbox_${randomUUID()}`],
    );
    evidence.gift = {
      external_transaction_id: giftTxn,
      ledger_id: giftLedgerId,
      creator_pence: giftSplit.creatorPence,
      platform_pence: giftSplit.platformPence,
      withdrawal_id: giftWdId,
      payout_provider_transaction_id: "tr_sandbox_* (simulated — not live)",
      wallet_after_pending_to_available: giftSplit.creatorPence,
      final_status_note: "withdrawal left processing — live paid requires Stripe Connect sandbox approval",
    };

    // Subscription
    const subTxn = `e2e_sub_${randomUUID()}`;
    const subSplit = splitNetRevenue(499, 60, 40);
    const subLedger = `led_sub_${randomUUID()}`;
    await client.query(
      `INSERT INTO elix_financial_ledger
         (id, idempotency_key, external_transaction_id, creator_user_id, revenue_source,
          gross_pence, net_revenue_pence, creator_pct, creator_amount_pence, platform_pct, platform_amount_pence,
          status, rule_snapshot)
       VALUES ($1,$2,$3,$4,'CREATOR_SUBSCRIPTION',499,499,60,$5,40,$6,'pending',$7::jsonb)`,
      [
        subLedger,
        `e2e:sub:${subTxn}`,
        subTxn,
        giftCreator,
        subSplit.creatorPence,
        subSplit.platformPence,
        JSON.stringify({ e2e: true, flow: "subscription" }),
      ],
    );
    evidence.subscription = {
      external_transaction_id: subTxn,
      ledger_id: subLedger,
      creator_pence: subSplit.creatorPence,
      platform_pence: subSplit.platformPence,
    };

    // Promote
    const promoTxn = `e2e_promo_${randomUUID()}`;
    const promo = promotePlatformOnly(199);
    const promoLedger = `led_promo_${randomUUID()}`;
    await client.query(
      `INSERT INTO elix_financial_ledger
         (id, idempotency_key, external_transaction_id, revenue_source,
          gross_pence, net_revenue_pence, creator_pct, creator_amount_pence, platform_pct, platform_amount_pence,
          status, rule_snapshot)
       VALUES ($1,$2,$3,'PROMOTE_VIDEO',199,199,0,0,100,199,'available',$4::jsonb)`,
      [promoLedger, `e2e:promo:${promoTxn}`, promoTxn, JSON.stringify({ e2e: true, flow: "promote" })],
    );
    evidence.promote = {
      external_transaction_id: promoTxn,
      ledger_id: promoLedger,
      creator_pence: promo.creatorPence,
      platform_pence: promo.platformPence,
    };

    // Rewards
    const periodId = `rp_e2e_${randomUUID()}`;
    const rewardCalc = calculateCreatorRewardPence(500_000);
    await client.query(
      `INSERT INTO elix_creator_reward_periods (id, starts_at, ends_at, status, rules_snapshot, monthly_budget_pence)
       VALUES ($1, NOW()-interval '30 days', NOW(), 'closed', '{}'::jsonb, 100000)`,
      [periodId],
    );
    const resultId = `rr_${randomUUID()}`;
    await client.query(
      `INSERT INTO elix_creator_reward_results
         (id, reward_period_id, creator_user_id, qualified_views, reward_pence, status, eligible)
       VALUES ($1,$2,$3,500000,$4,'approved',TRUE)`,
      [resultId, periodId, giftCreator, rewardCalc.rewardPence],
    );
    const rewardLedger = `led_rw_${randomUUID()}`;
    await client.query(
      `INSERT INTO elix_financial_ledger
         (id, idempotency_key, creator_user_id, revenue_source, reward_period_id,
          gross_pence, net_revenue_pence, creator_pct, creator_amount_pence, platform_pct, platform_amount_pence,
          status, rule_snapshot)
       VALUES ($1,$2,$3,'CREATOR_REWARD',$4,$5,$5,100,$5,0,0,'pending',$6::jsonb)`,
      [
        rewardLedger,
        `e2e:reward:${periodId}:${giftCreator}`,
        giftCreator,
        periodId,
        rewardCalc.rewardPence,
        JSON.stringify({ e2e: true, flow: "rewards" }),
      ],
    );
    evidence.rewards = {
      period_id: periodId,
      result_id: resultId,
      ledger_id: rewardLedger,
      reward_pence: rewardCalc.rewardPence,
      qualified_views: 500_000,
    };

    evidence.reconciliation_note =
      "Run POST /api/admin/monetisation/reconciliation/run after deploy against Neon schema";
  } finally {
    client.release();
    await pool.end();
  }

  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `monetisation-e2e-${stamp}.json`);
  fs.writeFileSync(outPath, JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ ok: true, outPath, evidence }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
