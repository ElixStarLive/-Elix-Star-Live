/**
 * Trace the most recent Google Play IAP coin purchase(s) on the production Neon
 * database, and print all the fields required as evidence for the owner-performed
 * device action.
 *
 * READ-ONLY. No mutations. Prints:
 *  - ledger row (kind='iap_purchase', provider='google')
 *  - Google orderId (from verification.detail JSON)
 *  - product_id, coins_delta, token_sha256 (server-side reference)
 *  - idempotency_key, external_purchase_id (dedupe evidence)
 *  - paid_coin_lot row (gross_pence, deductions, net_pence, settlement_status)
 *  - balance before / after (computed from ledger deltas)
 *  - starter/promotional balances at row time (confirmation no test coins credited)
 *
 * Usage: npx tsx server/scripts/traceAndroidCoinPurchase.ts [limit=5] [hoursBack=48]
 */
import "../config.ts";
import pg from "pg";
import { normalizeDatabaseUrl } from "../lib/databaseUrl.ts";

const limitArg = Number(process.argv[2]);
const hoursArg = Number(process.argv[3]);
const LIMIT = Number.isFinite(limitArg) && limitArg > 0 ? limitArg : 5;
const HOURS = Number.isFinite(hoursArg) && hoursArg > 0 ? hoursArg : 48;

const url = normalizeDatabaseUrl((process.env.DATABASE_URL || "").trim());
if (!url) {
  console.log(JSON.stringify({ status: "NO_DATABASE_URL" }));
  process.exit(2);
}
const needsSsl = url.includes("neon.tech") || url.includes("sslmode=require");
const pool = new pg.Pool({
  connectionString: url,
  max: 1,
  ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
});

interface LedgerRow {
  id: string;
  user_id: string;
  coins_delta: number;
  provider: string;
  provider_transaction_id: string;
  product_id: string | null;
  idempotency_key: string;
  verification: unknown;
  created_at: string;
}
interface LotRow {
  id: string;
  coins_original: number;
  coins_remaining: number;
  gross_pence: number;
  app_store_deduction_pence: number;
  tax_deduction_pence: number;
  processing_deduction_pence: number;
  net_pence: number | null;
  settlement_status: string;
  settled_at: string | null;
}
interface ProcessedRow {
  external_purchase_id: string;
  provider: string;
  product_id: string;
  user_id: string;
}

function extractOrderId(verification: unknown): string | null {
  if (!verification || typeof verification !== "object") return null;
  const v = verification as { detail?: unknown };
  if (typeof v.detail !== "string") return null;
  try {
    const j = JSON.parse(v.detail) as { orderId?: unknown };
    return typeof j.orderId === "string" ? j.orderId : null;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const client = await pool.connect();
  try {
    const ledgerRes = await client.query<LedgerRow>(
      `SELECT id::text, user_id::text, coins_delta, provider, provider_transaction_id,
              product_id, idempotency_key, verification, created_at::text
         FROM elix_wallet_ledger
        WHERE kind = 'iap_purchase' AND provider = 'google'
          AND created_at >= NOW() - ($1 || ' hours')::interval
        ORDER BY created_at DESC
        LIMIT $2`,
      [String(HOURS), LIMIT],
    );

    const dedupeCounts = new Map<string, number>();
    if (ledgerRes.rows.length > 0) {
      const keys = ledgerRes.rows.map((r) => r.idempotency_key);
      const dupRes = await client.query<{ k: string; c: string }>(
        `SELECT idempotency_key AS k, COUNT(*)::text AS c
           FROM elix_wallet_ledger
          WHERE idempotency_key = ANY($1::text[])
          GROUP BY idempotency_key`,
        [keys],
      );
      for (const r of dupRes.rows) dedupeCounts.set(r.k, Number(r.c));
    }

    const rows = [] as Array<Record<string, unknown>>;
    for (const row of ledgerRes.rows) {
      const orderId = extractOrderId(row.verification);
      const externalPurchaseId = `${row.provider}:${row.provider_transaction_id}`;
      const [lotRes, procRes, curBalanceRes, priorSumRes, promoRes, starterRes] = await Promise.all([
        client.query<LotRow>(
          `SELECT id, coins_original, coins_remaining, gross_pence,
                  app_store_deduction_pence, tax_deduction_pence, processing_deduction_pence,
                  net_pence, settlement_status, settled_at::text
             FROM elix_paid_coin_lots
            WHERE provider = $1 AND provider_transaction_id = $2`,
          [row.provider, row.provider_transaction_id],
        ),
        client.query<ProcessedRow>(
          `SELECT external_purchase_id, provider, product_id, user_id::text
             FROM elix_processed_purchases
            WHERE external_purchase_id = $1`,
          [externalPurchaseId],
        ),
        client.query<{ b: string }>(
          `SELECT coin_balance::text AS b FROM elix_wallet_balances WHERE user_id = $1`,
          [row.user_id],
        ),
        client.query<{ s: string }>(
          `SELECT COALESCE(SUM(coins_delta),0)::text AS s
             FROM elix_wallet_ledger
            WHERE user_id = $1 AND created_at <= $2::timestamptz`,
          [row.user_id, row.created_at],
        ),
        client
          .query<{ p: string }>(
            `SELECT COALESCE(balance,0)::text AS p FROM promotional_coin_balances WHERE user_id = $1`,
            [row.user_id],
          )
          .catch(() => ({ rows: [{ p: "table_missing" }] })),
        client
          .query<{ s: string }>(
            `SELECT COALESCE(balance,0)::text AS s FROM starter_coin_balances WHERE user_id = $1`,
            [row.user_id],
          )
          .catch(() => ({ rows: [{ s: "table_missing" }] })),
      ]);

      const currentBalance = curBalanceRes.rows[0] ? Number(curBalanceRes.rows[0].b) : 0;
      const cumulativeAtThisRow = Number(priorSumRes.rows[0]?.s ?? 0);
      const balanceBefore = cumulativeAtThisRow - Number(row.coins_delta);
      const balanceAfterThisRow = cumulativeAtThisRow;

      rows.push({
        ledger: {
          id: row.id,
          userId: row.user_id,
          kind: "iap_purchase",
          provider: row.provider,
          coinsDelta: Number(row.coins_delta),
          providerTransactionId: row.provider_transaction_id,
          productId: row.product_id,
          idempotencyKey: row.idempotency_key,
          createdAt: row.created_at,
          googleOrderId: orderId,
          verificationVerified: (row.verification as { verified?: unknown } | null)?.verified,
        },
        dedupe: {
          idempotencyKeyRowsInLedger: dedupeCounts.get(row.idempotency_key) ?? 0,
          externalPurchaseIdRowsInProcessed: procRes.rows.length,
        },
        paidCoinLot: lotRes.rows[0]
          ? {
              id: lotRes.rows[0].id,
              coinsOriginal: Number(lotRes.rows[0].coins_original),
              coinsRemaining: Number(lotRes.rows[0].coins_remaining),
              grossPence: Number(lotRes.rows[0].gross_pence),
              appStoreDeductionPence: Number(lotRes.rows[0].app_store_deduction_pence),
              taxDeductionPence: Number(lotRes.rows[0].tax_deduction_pence),
              processingDeductionPence: Number(lotRes.rows[0].processing_deduction_pence),
              netPence: lotRes.rows[0].net_pence == null ? null : Number(lotRes.rows[0].net_pence),
              settlementStatus: lotRes.rows[0].settlement_status,
              settledAt: lotRes.rows[0].settled_at,
            }
          : null,
        wallet: {
          balanceBeforeCredit: balanceBefore,
          balanceAfterCredit: balanceAfterThisRow,
          currentBalance,
        },
        nonPaidCoinChannels: {
          promotionalCoinBalance:
            promoRes.rows[0] && "p" in promoRes.rows[0] ? promoRes.rows[0].p : null,
          starterCoinBalance:
            starterRes.rows[0] && "s" in starterRes.rows[0] ? starterRes.rows[0].s : null,
        },
      });
    }

    console.log(
      JSON.stringify(
        {
          status: "OK",
          windowHours: HOURS,
          limit: LIMIT,
          countReturned: rows.length,
          rows,
        },
        null,
        2,
      ),
    );
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.log(JSON.stringify({ status: "ERROR", message: err instanceof Error ? err.message : String(err) }));
  process.exit(1);
});
