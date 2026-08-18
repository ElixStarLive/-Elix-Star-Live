/**
 * Paid coin lots — FIFO attribution of settled IAP net revenue to paid gifts.
 */
import type { PoolClient } from "pg";
import { randomUUID } from "crypto";
import { getPool } from "../postgres";
import { logger } from "../logger";
import { allocateLotPence } from "./moneyMath";

export async function createPaidCoinLot(
  client: PoolClient,
  input: {
    userId: string;
    provider: string;
    providerTransactionId: string;
    productId: string;
    coins: number;
    grossPence: number;
    netPence?: number | null;
    appStoreDeductionPence?: number;
    taxDeductionPence?: number;
    processingDeductionPence?: number;
    settled?: boolean;
  },
): Promise<string | null> {
  const coins = Math.max(0, Math.floor(input.coins));
  if (coins <= 0) return null;
  const id = `lot:${input.provider}:${input.providerTransactionId}`;
  const settled = input.settled === true && input.netPence != null && input.netPence >= 0;
  const netPenceSettled = settled && input.netPence != null ? Math.floor(input.netPence) : null;
  await client.query(
    `INSERT INTO elix_paid_coin_lots (
       id, user_id, provider, provider_transaction_id, product_id,
       coins_original, coins_remaining, gross_pence,
       app_store_deduction_pence, tax_deduction_pence, processing_deduction_pence,
       net_pence, settlement_status, settled_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$6,$7,$8,$9,$10,$11,$12,$13)
     ON CONFLICT (provider, provider_transaction_id) DO NOTHING`,
    [
      id,
      input.userId,
      input.provider,
      input.providerTransactionId,
      input.productId,
      coins,
      Math.max(0, Math.floor(input.grossPence)),
      input.appStoreDeductionPence ?? 0,
      input.taxDeductionPence ?? 0,
      input.processingDeductionPence ?? 0,
      netPenceSettled,
      settled ? "settled" : "pending_settlement",
      settled ? new Date() : null,
    ],
  );
  return id;
}

/** Apply verified settlement to a lot. Does not invent fees. */
export async function settlePaidCoinLot(input: {
  provider: string;
  providerTransactionId: string;
  appStoreDeductionPence: number;
  taxDeductionPence: number;
  processingDeductionPence: number;
  netPence: number;
}): Promise<boolean> {
  const pool = getPool();
  if (!pool) return false;
  try {
    const r = await pool.query(
      `UPDATE elix_paid_coin_lots SET
         app_store_deduction_pence = $3,
         tax_deduction_pence = $4,
         processing_deduction_pence = $5,
         net_pence = $6,
         settlement_status = 'settled',
         settled_at = NOW()
       WHERE provider = $1 AND provider_transaction_id = $2
         AND settlement_status = 'pending_settlement'
       RETURNING id`,
      [
        input.provider,
        input.providerTransactionId,
        Math.max(0, Math.floor(input.appStoreDeductionPence)),
        Math.max(0, Math.floor(input.taxDeductionPence)),
        Math.max(0, Math.floor(input.processingDeductionPence)),
        Math.max(0, Math.floor(input.netPence)),
      ],
    );
    return (r.rowCount ?? 0) > 0;
  } catch (err) {
    logger.error({ err }, "settlePaidCoinLot failed");
    return false;
  }
}

export type GiftNetAttribution = {
  netPence: number;
  grossPence: number;
  appStoreDeductionPence: number;
  taxDeductionPence: number;
  processingDeductionPence: number;
  lotIds: string[];
  settled: boolean;
};

/**
 * Consume settled paid coin lots FIFO for a gift coin spend.
 * Returns settled=false and zeros when no settled net is attributable
 * (GBP creator credit must wait — coin Diamonds may still apply separately).
 */
export async function consumeSettledNetForGift(
  client: PoolClient,
  userId: string,
  coins: number,
): Promise<GiftNetAttribution> {
  const need = Math.max(0, Math.floor(coins));
  const empty: GiftNetAttribution = {
    netPence: 0,
    grossPence: 0,
    appStoreDeductionPence: 0,
    taxDeductionPence: 0,
    processingDeductionPence: 0,
    lotIds: [],
    settled: false,
  };
  if (need <= 0) return empty;

  const lots = await client.query(
    `SELECT id, coins_remaining, coins_original, gross_pence, net_pence,
            app_store_deduction_pence, tax_deduction_pence, processing_deduction_pence
       FROM elix_paid_coin_lots
      WHERE user_id = $1
        AND coins_remaining > 0
        AND settlement_status = 'settled'
        AND net_pence IS NOT NULL
      ORDER BY created_at ASC
      FOR UPDATE`,
    [userId],
  );

  let remaining = need;
  let net = 0;
  let gross = 0;
  let app = 0;
  let tax = 0;
  let proc = 0;
  const lotIds: string[] = [];

  for (const row of lots.rows) {
    if (remaining <= 0) break;
    const avail = Math.floor(Number(row.coins_remaining) || 0);
    if (avail <= 0) continue;
    const take = Math.min(avail, remaining);
    const orig = Math.floor(Number(row.coins_original) || 0) || avail;
    const lotNet = Math.floor(Number(row.net_pence) || 0);
    const lotGross = Math.floor(Number(row.gross_pence) || 0);
    const lotApp = Math.floor(Number(row.app_store_deduction_pence) || 0);
    const lotTax = Math.floor(Number(row.tax_deduction_pence) || 0);
    const lotProc = Math.floor(Number(row.processing_deduction_pence) || 0);
    // What the lot has already given out decides this spend's share, so many
    // small gifts attribute the same total as one big one instead of rounding
    // every gift's fraction of a penny away.
    const consumedBefore = Math.max(0, orig - avail);
    const fromLot = (totalPence: number) =>
      allocateLotPence({ consumedBefore, take, totalCoins: orig, totalPence });

    net += fromLot(lotNet);
    gross += fromLot(lotGross);
    app += fromLot(lotApp);
    tax += fromLot(lotTax);
    proc += fromLot(lotProc);

    await client.query(
      `UPDATE elix_paid_coin_lots SET coins_remaining = coins_remaining - $2 WHERE id = $1`,
      [row.id, take],
    );
    lotIds.push(String(row.id));
    remaining -= take;
  }

  if (lotIds.length === 0) return empty;
  return {
    netPence: net,
    grossPence: gross,
    appStoreDeductionPence: app,
    taxDeductionPence: tax,
    processingDeductionPence: proc,
    lotIds,
    settled: true,
  };
}

export function newLotId(): string {
  return randomUUID();
}
