/**
 * Automatic store settlement from verified Apple/Google purchase data.
 *
 * Rules:
 * - Never invent a fixed store commission (e.g. 30%).
 * - Gross comes from verified store price fields when present, else catalog GBP
 *   for a purchase that already passed store verification (tagged in snapshot).
 * - Deductions only when the store (or a later financial-report ingest) provides them.
 * - net = gross - verified deductions (may equal gross when commission unknown).
 * - Later proceeds adjustments create immutable ledger adjustment rows.
 */
import type { PoolClient } from "pg";
import { getPool } from "../postgres";
import { logger } from "../logger";
import { catalogGbpNumberToPence, gbpStringToPence } from "./moneyMath";
import {
  postCreatorSubscriptionRevenue,
  postPromotePlatformRevenue,
} from "./settlements";
import { reverseLedgerEntry } from "./ledger";
import { loadMembershipPriceConfig } from "../googlePlaySubscriptions";
import { moneyPartsToGbpPence } from "./moneyMath";

export type VerifiedPrice = {
  grossPence: number;
  currency: string;
  source: "apple_jws_price" | "google_inapp_list_price" | "catalog_gbp" | "promote_catalog";
  appStoreDeductionPence: number;
  taxDeductionPence: number;
  processingDeductionPence: number;
  /** True when store provided explicit commission/tax fields (not merely absent). */
  deductionsFromStore: boolean;
};

/** Apple JWS `price` is milliunits of currency (9990 = 9.99). */
export function appleMilliunitsToMinor(priceMilliunits: number): number {
  const n = Math.max(0, Math.floor(Number(priceMilliunits) || 0));
  return Math.round(n / 10);
}

export function extractAppleVerifiedPrice(payload: Record<string, unknown> | null | undefined): VerifiedPrice | null {
  if (!payload) return null;
  const priceRaw = payload.price;
  const currency = String(payload.currency || "").toUpperCase();
  if (typeof priceRaw !== "number" && typeof priceRaw !== "string") return null;
  const milli = typeof priceRaw === "number" ? priceRaw : Math.floor(Number(priceRaw) || 0);
  if (!currency || milli <= 0) return null;
  const minor = appleMilliunitsToMinor(milli);
  if (currency !== "GBP") {
    // Do not invent FX — return currency-tagged amount as 0 GBP gross and require catalog fallback upstream.
    return {
      grossPence: 0,
      currency,
      source: "apple_jws_price",
      appStoreDeductionPence: 0,
      taxDeductionPence: 0,
      processingDeductionPence: 0,
      deductionsFromStore: false,
    };
  }
  return {
    grossPence: minor,
    currency: "GBP",
    source: "apple_jws_price",
    appStoreDeductionPence: 0,
    taxDeductionPence: 0,
    processingDeductionPence: 0,
    deductionsFromStore: false,
  };
}

export async function lookupCatalogGrossPence(productId: string): Promise<number> {
  const pool = getPool();
  if (!pool) return 0;
  try {
    const r = await pool.query(
      `SELECT price FROM elix_coin_packages WHERE product_id = $1 OR id = $1 LIMIT 1`,
      [productId],
    );
    if (!r.rowCount) return 0;
    return catalogGbpNumberToPence(Number(r.rows[0].price));
  } catch {
    return 0;
  }
}

/**
 * Resolve verified gross for a coin IAP after store validity is confirmed.
 * Prefers Apple JWS price (GBP); else catalog GBP for the verified productId.
 */
export async function resolveCoinPurchaseVerifiedPrice(input: {
  provider: "apple" | "google";
  productId: string;
  applePayload?: Record<string, unknown> | null;
}): Promise<VerifiedPrice> {
  if (input.provider === "apple" && input.applePayload) {
    const apple = extractAppleVerifiedPrice(input.applePayload);
    if (apple && apple.currency === "GBP" && apple.grossPence > 0) return apple;
  }
  const catalog = await lookupCatalogGrossPence(input.productId);
  return {
    grossPence: catalog,
    currency: "GBP",
    source: "catalog_gbp",
    appStoreDeductionPence: 0,
    taxDeductionPence: 0,
    processingDeductionPence: 0,
    deductionsFromStore: false,
  };
}

export function membershipGrossPenceFromConfig(): number {
  const price = loadMembershipPriceConfig();
  const gbp = price.regions.find((r) => r.regionCode === "GB" || r.regionCode === "UK")?.price;
  if (!gbp) return gbpStringToPence(process.env.CREATOR_MEMBERSHIP_PRICE_GBP || "9.99");
  return moneyPartsToGbpPence(gbp) ?? gbpStringToPence(`${gbp.units}.99`);
}

/**
 * Apply later verified proceeds (financial report) without inventing fees.
 * Updates lot deductions/net and does not rewrite past gift ledger rows —
 * posts ADMIN_ADJUSTMENT / settlement deltas when needed via caller.
 */
export async function applyVerifiedProceedsAdjustment(input: {
  provider: string;
  providerTransactionId: string;
  appStoreDeductionPence: number;
  taxDeductionPence: number;
  processingDeductionPence: number;
  netPence: number;
  webhookEventId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const pool = getPool();
  if (!pool) return { ok: false, error: "no_pool" };
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const wh = await client.query(
      `INSERT INTO elix_processed_webhook_events (webhook_event_id, provider, event_type)
       VALUES ($1, $2, 'proceeds_adjustment')
       ON CONFLICT (webhook_event_id) DO NOTHING
       RETURNING webhook_event_id`,
      [input.webhookEventId, input.provider],
    );
    if (!wh.rowCount) {
      await client.query("COMMIT");
      return { ok: true };
    }
    await client.query(
      `UPDATE elix_paid_coin_lots SET
         app_store_deduction_pence = $3,
         tax_deduction_pence = $4,
         processing_deduction_pence = $5,
         net_pence = $6,
         settlement_status = 'settled',
         settled_at = COALESCE(settled_at, NOW())
       WHERE provider = $1 AND provider_transaction_id = $2`,
      [
        input.provider,
        input.providerTransactionId,
        Math.max(0, Math.floor(input.appStoreDeductionPence)),
        Math.max(0, Math.floor(input.taxDeductionPence)),
        Math.max(0, Math.floor(input.processingDeductionPence)),
        Math.max(0, Math.floor(input.netPence)),
      ],
    );
    await client.query("COMMIT");
    return { ok: true };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    logger.error({ err }, "applyVerifiedProceedsAdjustment failed");
    return { ok: false, error: "db_error" };
  } finally {
    client.release();
  }
}

/** Reverse paid coin lot + all linked financial ledger rows for a store refund. */
export async function reversePurchaseFinancialsOnClient(
  client: PoolClient,
  input: {
    provider: string;
    providerTransactionId: string;
    kind: "REFUND_REVERSAL" | "CHARGEBACK_REVERSAL";
    webhookEventId: string;
  },
): Promise<{ ok: true; reversedLedger: number; alreadyProcessed: boolean }> {
  const wh = await client.query(
    `INSERT INTO elix_processed_webhook_events (webhook_event_id, provider, event_type)
     VALUES ($1, $2, $3)
     ON CONFLICT (webhook_event_id) DO NOTHING
     RETURNING webhook_event_id`,
    [input.webhookEventId, input.provider, input.kind],
  );
  const eventInserted = (wh.rowCount ?? 0) > 0;

  // Read the lots before zeroing them: a paid gift's GBP revenue is keyed by the
  // gift, not by the store transaction, so the lot id is the only durable link
  // back from that revenue to the purchase the store is taking back.
  const lots = await client.query(
    `SELECT id FROM elix_paid_coin_lots
      WHERE provider = $1 AND provider_transaction_id = $2`,
    [input.provider, input.providerTransactionId],
  );
  const lotIds = lots.rows.map((r) => String(r.id)).filter(Boolean);

  await client.query(
    `UPDATE elix_paid_coin_lots SET
       settlement_status = 'reversed',
       coins_remaining = 0,
       net_pence = 0
     WHERE provider = $1 AND provider_transaction_id = $2`,
    [input.provider, input.providerTransactionId],
  );

  const extIds = [
    input.providerTransactionId,
    `${input.provider}:${input.providerTransactionId}`,
  ];
  const rows = await client.query(
    `SELECT id FROM elix_financial_ledger
      WHERE reversal_of_id IS NULL
        AND (
          external_transaction_id = ANY($1::text[])
          OR idempotency_key LIKE $2
          OR (rule_snapshot -> 'lot_ids') ?| $3::text[]
        )`,
    [extIds, `%${input.providerTransactionId}%`, lotIds],
  );
  let reversedLedger = 0;
  for (const row of rows.rows) {
    const r = await reverseLedgerEntry(
      client,
      String(row.id),
      `rev:${input.kind}:${row.id}`,
      input.kind,
    );
    if (r && !r.alreadyExisted) reversedLedger += 1;
  }
  return { ok: true, reversedLedger, alreadyProcessed: !eventInserted && reversedLedger === 0 };
}

export async function autoPostPromoteRevenue(input: {
  providerTransactionId: string;
  userId: string;
  productId: string;
  contentId: string;
  amountGbp: number;
  applePayload?: Record<string, unknown> | null;
}): Promise<{ ok: boolean; ledgerId?: string }> {
  let gross = Math.round(Math.max(0, input.amountGbp) * 100);
  let appStore = 0;
  let tax = 0;
  if (input.applePayload) {
    const apple = extractAppleVerifiedPrice(input.applePayload);
    if (apple && apple.currency === "GBP" && apple.grossPence > 0) {
      gross = apple.grossPence;
      appStore = apple.appStoreDeductionPence;
      tax = apple.taxDeductionPence;
    }
  }
  return postPromotePlatformRevenue({
    promotionId: input.providerTransactionId,
    userId: input.userId,
    videoId: input.contentId || undefined,
    providerTransactionId: input.providerTransactionId,
    grossPence: gross,
    appStoreDeductionPence: appStore,
    taxDeductionPence: tax,
  });
}

export async function autoPostSubscriptionRevenue(input: {
  subscriptionId: string;
  creatorUserId: string;
  payerUserId: string;
  externalTransactionId: string;
  applePayload?: Record<string, unknown> | null;
}): Promise<{ ok: boolean; ledgerId?: string; creatorPence?: number }> {
  let gross = membershipGrossPenceFromConfig();
  let appStore = 0;
  let tax = 0;
  if (input.applePayload) {
    const apple = extractAppleVerifiedPrice(input.applePayload);
    if (apple && apple.currency === "GBP" && apple.grossPence > 0) {
      gross = apple.grossPence;
      appStore = apple.appStoreDeductionPence;
      tax = apple.taxDeductionPence;
    }
  }
  return postCreatorSubscriptionRevenue({
    subscriptionId: input.subscriptionId,
    creatorUserId: input.creatorUserId,
    payerUserId: input.payerUserId,
    externalTransactionId: input.externalTransactionId,
    grossPence: gross,
    appStoreDeductionPence: appStore,
    taxDeductionPence: tax,
  });
}
