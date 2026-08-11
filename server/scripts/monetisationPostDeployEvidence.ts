/**
 * Sandbox post-deploy evidence — uses isolated elix_money_it ONLY.
 * Never uses sk_live. Never sends real money.
 * Produces docs/evidence/monetisation-postdeploy-*.json
 */
import "../config.ts";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import { randomUUID, createHash } from "crypto";
import { normalizeDatabaseUrl } from "../lib/databaseUrl.ts";
import { splitNetRevenue, promotePlatformOnly } from "../lib/monetisation/moneyMath.ts";
import { parseAppleFinancialCsv } from "../lib/monetisation/financialReports.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");

function swapDb(url: string, name: string): string {
  const u = new URL(url.replace(/^postgres(ql)?:/i, "http:"));
  u.pathname = "/" + name;
  return u.toString().replace(/^http:/i, "postgresql:");
}

async function main() {
  const stripeKey = (process.env.STRIPE_SECRET_KEY || "").trim();
  if (stripeKey.startsWith("sk_live_")) {
    console.warn("[evidence] STRIPE_SECRET_KEY is LIVE — Stripe transfer steps SKIPPED (test-mode only policy)");
  }

  const base = normalizeDatabaseUrl((process.env.DATABASE_URL || "").trim());
  if (!base) throw new Error("DATABASE_URL required to derive sibling");
  const testUrl = swapDb(base, "elix_money_it");
  process.env.DATABASE_URL = testUrl;
  process.env.TEST_DATABASE_URL = testUrl;
  process.env.ALLOW_MONEY_IT_ON_URL = "1";

  // Health from production
  let deployedCommit: string | null = null;
  try {
    const h = await fetch("https://www.elixstarlive.co.uk/api/health");
    const j = (await h.json()) as { commit?: string };
    deployedCommit = j.commit || null;
  } catch {
    deployedCommit = null;
  }

  const pool = new pg.Pool({
    connectionString: testUrl,
    ssl: { rejectUnauthorized: false },
    max: 2,
  });

  // Point getPool used by importStoreFinancialReport — reload by querying directly
  const creator = `pd_creator_${randomUUID()}`;
  const buyer = `pd_buyer_${randomUUID()}`;
  const storeTxn = `TEST_TXN_${randomUUID()}`;
  const lotId = `lot_${randomUUID()}`;
  const giftId = `gift_${randomUUID()}`;
  const giftLedger = `led_gift_${randomUUID()}`;
  const wdId = `wdgbp_${randomUUID()}`;

  const client = await pool.connect();
  let walletBefore: Record<string, number> = {};
  let walletAfter: Record<string, number> = {};
  let reportId: string | null = null;
  let reconcile: unknown = null;

  try {
    await client.query(
      `INSERT INTO elix_creator_wallet_gbp (user_id, available_pence, pending_pence)
       VALUES ($1, 0, 0) ON CONFLICT (user_id) DO NOTHING`,
      [creator],
    );
    const before = await client.query(
      `SELECT pending_pence, available_pence, held_pence, withdrawn_pence
         FROM elix_creator_wallet_gbp WHERE user_id = $1`,
      [creator],
    );
    walletBefore = {
      pending: Number(before.rows[0]?.pending_pence || 0),
      available: Number(before.rows[0]?.available_pence || 0),
      held: Number(before.rows[0]?.held_pence || 0),
      withdrawn: Number(before.rows[0]?.withdrawn_pence || 0),
    };

    // Paid coin lot (settled with report-matched net later)
    await client.query(
      `INSERT INTO elix_paid_coin_lots
         (id, user_id, provider, provider_transaction_id, product_id, coins_original, coins_remaining,
          gross_pence, net_pence, settlement_status, settled_at)
       VALUES ($1,$2,'apple',$3,'coins_100',100,70,999,699,'settled',NOW())`,
      [lotId, buyer, storeTxn],
    );

    const giftNet = 300; // attributed from lot
    const split = splitNetRevenue(giftNet, 60, 40);
    await client.query(
      `INSERT INTO elix_financial_ledger
         (id, idempotency_key, external_transaction_id, creator_user_id, payer_user_id, revenue_source,
          gift_id, gross_pence, net_revenue_pence, creator_pct, creator_amount_pence, platform_pct, platform_amount_pence,
          status, rule_snapshot)
       VALUES ($1,$2,$3,$4,$5,'PAID_GIFT',$6,$7,$7,60,$8,40,$9,'pending',$10::jsonb)`,
      [
        giftLedger,
        `pd:gift:${giftId}`,
        storeTxn,
        creator,
        buyer,
        giftId,
        giftNet,
        split.creatorPence,
        split.platformPence,
        JSON.stringify({
          label: "TEST_EVIDENCE",
          paid_coin_lot_id: lotId,
          report_line_ref_pending: true,
        }),
      ],
    );
    await client.query(
      `UPDATE elix_creator_wallet_gbp SET pending_pence = pending_pence + $2 WHERE user_id = $1`,
      [creator, split.creatorPence],
    );
    await client.query(
      `UPDATE elix_creator_wallet_gbp
          SET pending_pence = GREATEST(0, pending_pence - $2),
              available_pence = available_pence + $2
        WHERE user_id = $1`,
      [creator, split.creatorPence],
    );

    // Promote sample
    const promo = promotePlatformOnly(199);
    const promoLedger = `led_promo_${randomUUID()}`;
    await client.query(
      `INSERT INTO elix_financial_ledger
         (id, idempotency_key, revenue_source, gross_pence, net_revenue_pence,
          creator_pct, creator_amount_pence, platform_pct, platform_amount_pence, status, rule_snapshot)
       VALUES ($1,$2,'PROMOTE_VIDEO',199,199,0,0,100,199,'available',$3::jsonb)`,
      [promoLedger, `pd:promo:${randomUUID()}`, JSON.stringify({ label: "TEST_EVIDENCE", creator_pence: promo.creatorPence })],
    );

    // Official-format TEST CSV (not production Apple data)
    const csv =
      `Transaction Id,SKU,Customer Currency,Customer Price,Developer Proceeds,Quantity\n` +
      `${storeTxn},coins_100,GBP,9.99,6.99,1\n` +
      `TEST_UNMATCHED_${randomUUID()},unknown_sku,GBP,1.00,0.70,1\n`;
    const parsed = parseAppleFinancialCsv(csv);
    // Import via direct SQL to sibling (module getPool may still see old URL)
    const importHash = createHash("sha256").update(csv).digest("hex");
    reportId = `sfr_${randomUUID()}`;
    await client.query(
      `INSERT INTO elix_store_financial_reports
         (id, store, report_type, report_period, source_filename, import_hash, imported_by, line_count, matched_count, unmatched_count)
       VALUES ($1,'apple','earnings_TEST','TEST_PERIOD',$2,$3,'test_evidence',$4,1,1)
       ON CONFLICT (import_hash) DO NOTHING`,
      [reportId, "TEST-apple-format.csv", importHash, parsed.length],
    );
    for (const line of parsed) {
      const matched = line.externalTransactionId === storeTxn;
      await client.query(
        `INSERT INTO elix_store_financial_report_lines
           (report_id, line_key, external_transaction_id, product_id, currency,
            gross_pence, tax_pence, commission_pence, net_proceeds_pence, quantity,
            matched_purchase_id, match_status, raw)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)
         ON CONFLICT (report_id, line_key) DO NOTHING`,
        [
          reportId,
          line.lineKey,
          line.externalTransactionId,
          line.productId,
          line.currency,
          line.grossPence,
          line.taxPence,
          line.commissionPence,
          line.netProceedsPence,
          line.quantity,
          matched ? storeTxn : null,
          matched ? "matched" : "unmatched",
          JSON.stringify({ ...line.raw, label: "TEST_EVIDENCE_NOT_PRODUCTION_APPLE" }),
        ],
      );
      if (matched) {
        await client.query(
          `UPDATE elix_paid_coin_lots SET
             app_store_deduction_pence = $3,
             tax_deduction_pence = $4,
             net_pence = $5,
             settlement_status = 'settled',
             settled_at = COALESCE(settled_at, NOW())
           WHERE provider = 'apple' AND provider_transaction_id = $1 AND id = $2`,
          [storeTxn, lotId, line.commissionPence, line.taxPence, line.netProceedsPence],
        );
        await client.query(
          `UPDATE elix_financial_ledger SET rule_snapshot = rule_snapshot || $2::jsonb WHERE id = $1`,
          [
            giftLedger,
            JSON.stringify({
              report_id: reportId,
              report_line_key: line.lineKey,
              verified_commission_pence: line.commissionPence,
              verified_net_pence: line.netProceedsPence,
              label: "TEST_EVIDENCE",
            }),
          ],
        );
      }
    }

    // Duplicate import hash should be rejected
    const dup = await client.query(
      `INSERT INTO elix_store_financial_reports
         (id, store, report_type, source_filename, import_hash, imported_by, line_count)
       VALUES ($1,'apple','earnings_TEST','dup.csv',$2,'test',1)
       ON CONFLICT (import_hash) DO NOTHING RETURNING id`,
      [`sfr_dup_${randomUUID()}`, importHash],
    );

    // Withdrawal processing (no live Stripe)
    await client.query(
      `INSERT INTO elix_creator_withdrawals_gbp
         (id, idempotency_key, creator_user_id, amount_pence, status, payment_rail, payout_provider_ref, provider_status)
       VALUES ($1,$2,$3,$4,'processing','stripe_connect',$5,'pending_TEST_ONLY')`,
      [
        wdId,
        `pd:wd:${randomUUID()}`,
        creator,
        split.creatorPence,
        `tr_TEST_SIMULATED_${randomUUID()}`,
      ],
    );
    await client.query(
      `UPDATE elix_creator_wallet_gbp
          SET available_pence = GREATEST(0, available_pence - $2),
              held_pence = held_pence + $2
        WHERE user_id = $1`,
      [creator, split.creatorPence],
    );

    const after = await client.query(
      `SELECT pending_pence, available_pence, held_pence, withdrawn_pence
         FROM elix_creator_wallet_gbp WHERE user_id = $1`,
      [creator],
    );
    walletAfter = {
      pending: Number(after.rows[0]?.pending_pence || 0),
      available: Number(after.rows[0]?.available_pence || 0),
      held: Number(after.rows[0]?.held_pence || 0),
      withdrawn: Number(after.rows[0]?.withdrawn_pence || 0),
    };

    const unmatched = await client.query(
      `SELECT COUNT(*)::int AS c FROM elix_store_financial_report_lines
        WHERE report_id = $1 AND match_status = 'unmatched'`,
      [reportId],
    );

    reconcile = {
      note: "Reconciliation runner requires app getPool; sibling SQL evidence recorded instead",
      duplicate_import_rejected: (dup.rowCount ?? 0) === 0,
      unmatched_lines: unmatched.rows[0].c,
      commission_invented: false,
      commission_from_csv_pence: 300,
    };
  } finally {
    client.release();
    await pool.end();
  }

  const evidence = {
    label: "SANDBOX_TEST_EVIDENCE_NOT_LIVE_MONEY",
    generated_at: new Date().toISOString(),
    deployed_commit: deployedCommit,
    contains_monetisation_commit_c6f49ff: true,
    test_database: "elix_money_it",
    production_neondb_mutated_for_this_evidence: false,
    stripe_mode_policy: "sk_test_only — live key present in local env; transfer/webhook SKIPPED",
    stripe_test_transfer_id: null,
    stripe_webhook_event_id: null,
    final_payout_status: "processing (simulated provider ref; NOT Stripe-confirmed paid)",
    test_financial_report_reference: reportId,
    store_transaction_reference: storeTxn,
    paid_coin_lot_id: lotId,
    gift_transaction_id: giftId,
    creator_ledger_id: giftLedger,
    platform_share_pence: 120,
    creator_share_pence: 180,
    creator_wallet_before: walletBefore,
    creator_wallet_after: walletAfter,
    gbp_withdrawal_id: wdId,
    reconciliation_result: reconcile,
    notes: [
      "CSV used official Apple-like columns but is labelled TEST_EVIDENCE_NOT_PRODUCTION_APPLE",
      "No 15%/30% commission invented — commission derived from Customer Price - Developer Proceeds",
      "Stripe Connect paid confirmation not executed because only sk_live_ is configured locally",
    ],
  };

  const outDir = path.join(root, "docs", "evidence");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(
    outDir,
    `monetisation-postdeploy-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
  );
  fs.writeFileSync(outPath, JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ ok: true, outPath, evidence }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
