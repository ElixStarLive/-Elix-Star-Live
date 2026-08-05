/**
 * Apply verified store settlement to purchases / lots, then post immutable ledger rows.
 * Never invents app-store commission — caller must pass verified deduction pence.
 */
import { getPool } from "../postgres";
import { logger } from "../logger";
import { settlePaidCoinLot } from "./paidCoinLots";
import { netAfterDeductions, promotePlatformOnly, splitNetRevenue } from "./moneyMath";
import { loadMonetisationConfig, ruleSnapshotFromConfig } from "./config";
import { postLedgerEntry, reverseLedgerEntry } from "./ledger";
import { catalogGbpNumberToPence } from "./moneyMath";

export async function applyIapSettlementToCoinLot(input: {
  provider: string;
  providerTransactionId: string;
  appStoreDeductionPence: number;
  taxDeductionPence?: number;
  processingDeductionPence?: number;
  /** If omitted, computed as gross - deductions from the lot row. */
  netPence?: number;
}): Promise<{ ok: boolean; error?: string }> {
  const pool = getPool();
  if (!pool) return { ok: false, error: "no_pool" };
  try {
    const lot = await pool.query(
      `SELECT gross_pence FROM elix_paid_coin_lots
        WHERE provider = $1 AND provider_transaction_id = $2 LIMIT 1`,
      [input.provider, input.providerTransactionId],
    );
    if (!lot.rowCount) return { ok: false, error: "lot_not_found" };
    const gross = Math.floor(Number(lot.rows[0].gross_pence) || 0);
    const net =
      input.netPence != null
        ? Math.max(0, Math.floor(input.netPence))
        : netAfterDeductions({
            grossPence: gross,
            appStoreDeductionPence: input.appStoreDeductionPence,
            taxDeductionPence: input.taxDeductionPence,
            processingDeductionPence: input.processingDeductionPence,
          });
    const ok = await settlePaidCoinLot({
      provider: input.provider,
      providerTransactionId: input.providerTransactionId,
      appStoreDeductionPence: input.appStoreDeductionPence,
      taxDeductionPence: input.taxDeductionPence ?? 0,
      processingDeductionPence: input.processingDeductionPence ?? 0,
      netPence: net,
    });
    return ok ? { ok: true } : { ok: false, error: "settle_failed" };
  } catch (err) {
    logger.error({ err }, "applyIapSettlementToCoinLot failed");
    return { ok: false, error: "db_error" };
  }
}

export async function postPromotePlatformRevenue(input: {
  promotionId: string;
  userId: string;
  videoId?: string;
  providerTransactionId: string;
  grossPence: number;
  appStoreDeductionPence?: number;
  taxDeductionPence?: number;
  processingDeductionPence?: number;
  netPence?: number;
}): Promise<{ ok: boolean; ledgerId?: string }> {
  const pool = getPool();
  if (!pool) return { ok: false };
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const net =
      input.netPence != null
        ? Math.max(0, Math.floor(input.netPence))
        : netAfterDeductions({
            grossPence: input.grossPence,
            appStoreDeductionPence: input.appStoreDeductionPence,
            taxDeductionPence: input.taxDeductionPence,
            processingDeductionPence: input.processingDeductionPence,
          });
    const split = promotePlatformOnly(net);
    const cfg = await loadMonetisationConfig();
    const ledger = await postLedgerEntry(client, {
      idempotencyKey: `promote:${input.providerTransactionId}`,
      revenueSource: "PROMOTE_VIDEO",
      payerUserId: input.userId,
      promotionId: input.promotionId,
      videoId: input.videoId ?? null,
      externalTransactionId: input.providerTransactionId,
      grossPence: Math.floor(input.grossPence),
      appStoreDeductionPence: input.appStoreDeductionPence ?? 0,
      taxDeductionPence: input.taxDeductionPence ?? 0,
      processingDeductionPence: input.processingDeductionPence ?? 0,
      netRevenuePence: split.netPence,
      creatorPct: 0,
      creatorAmountPence: 0,
      platformPct: 100,
      platformAmountPence: split.platformPence,
      status: "available",
      ruleSnapshot: ruleSnapshotFromConfig(cfg, { promote: true }),
    });
    await client.query(
      `UPDATE elix_promote_purchases SET
         gross_pence = $2,
         deduction_pence = $3,
         net_platform_pence = $4,
         ledger_id = $5
       WHERE provider_transaction_id = $1`,
      [
        input.providerTransactionId,
        Math.floor(input.grossPence),
        (input.appStoreDeductionPence ?? 0) +
          (input.taxDeductionPence ?? 0) +
          (input.processingDeductionPence ?? 0),
        split.platformPence,
        ledger.id,
      ],
    );
    await client.query("COMMIT");
    return { ok: true, ledgerId: ledger.id };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    logger.error({ err }, "postPromotePlatformRevenue failed");
    return { ok: false };
  } finally {
    client.release();
  }
}

export async function postCreatorSubscriptionRevenue(input: {
  subscriptionId: string;
  creatorUserId: string;
  payerUserId: string;
  externalTransactionId: string;
  grossPence: number;
  appStoreDeductionPence?: number;
  taxDeductionPence?: number;
  processingDeductionPence?: number;
  netPence?: number;
}): Promise<{ ok: boolean; ledgerId?: string; creatorPence?: number }> {
  const pool = getPool();
  if (!pool) return { ok: false };
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const cfg = await loadMonetisationConfig();
    if (!cfg.subMonetisationEnabled) {
      await client.query("ROLLBACK");
      return { ok: false };
    }
    const net =
      input.netPence != null
        ? Math.max(0, Math.floor(input.netPence))
        : netAfterDeductions({
            grossPence: input.grossPence,
            appStoreDeductionPence: input.appStoreDeductionPence,
            taxDeductionPence: input.taxDeductionPence,
            processingDeductionPence: input.processingDeductionPence,
          });
    const split = splitNetRevenue(net, cfg.subCreatorPct, cfg.subPlatformPct);
    const ledger = await postLedgerEntry(client, {
      idempotencyKey: `creator_sub:${input.externalTransactionId}`,
      revenueSource: "CREATOR_SUBSCRIPTION",
      creatorUserId: input.creatorUserId,
      payerUserId: input.payerUserId,
      subscriptionId: input.subscriptionId,
      externalTransactionId: input.externalTransactionId,
      grossPence: Math.floor(input.grossPence),
      appStoreDeductionPence: input.appStoreDeductionPence ?? 0,
      taxDeductionPence: input.taxDeductionPence ?? 0,
      processingDeductionPence: input.processingDeductionPence ?? 0,
      netRevenuePence: split.netPence,
      creatorPct: split.creatorPct,
      creatorAmountPence: split.creatorPence,
      platformPct: split.platformPct,
      platformAmountPence: split.platformPence,
      status: "pending",
      ruleSnapshot: ruleSnapshotFromConfig(cfg, { subscription: true }),
    });
    if (!ledger.alreadyExisted && split.creatorPence > 0) {
      await client.query(
        `INSERT INTO elix_creator_earnings
           (id, creator_id, kind, coins, amount_pence, sender_id, status, ledger_id, rule_snapshot)
         VALUES ($1, $2, 'subscription', 0, $3, $4, 'pending', $5, $6::jsonb)
         ON CONFLICT (id) DO NOTHING`,
        [
          `earn_sub:${input.externalTransactionId}`,
          input.creatorUserId,
          split.creatorPence,
          input.payerUserId,
          ledger.id,
          JSON.stringify(ruleSnapshotFromConfig(cfg)),
        ],
      );
    }
    await client.query("COMMIT");
    return { ok: true, ledgerId: ledger.id, creatorPence: split.creatorPence };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    logger.error({ err }, "postCreatorSubscriptionRevenue failed");
    return { ok: false };
  } finally {
    client.release();
  }
}

export async function reverseByExternalTransaction(input: {
  externalTransactionId: string;
  kind: "REFUND_REVERSAL" | "CHARGEBACK_REVERSAL";
  webhookEventId: string;
}): Promise<{ ok: boolean; reversed: number }> {
  const pool = getPool();
  if (!pool) return { ok: false, reversed: 0 };
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const wh = await client.query(
      `INSERT INTO elix_processed_webhook_events (webhook_event_id, provider, event_type)
       VALUES ($1, 'store', $2)
       ON CONFLICT (webhook_event_id) DO NOTHING
       RETURNING webhook_event_id`,
      [input.webhookEventId, input.kind],
    );
    if (!wh.rowCount) {
      await client.query("COMMIT");
      return { ok: true, reversed: 0 };
    }
    const rows = await client.query(
      `SELECT id FROM elix_financial_ledger
        WHERE external_transaction_id = $1
          AND reversal_of_id IS NULL
          AND revenue_source IN ('PAID_GIFT', 'CREATOR_SUBSCRIPTION', 'PROMOTE_VIDEO')`,
      [input.externalTransactionId],
    );
    let reversed = 0;
    for (const row of rows.rows) {
      const r = await reverseLedgerEntry(
        client,
        String(row.id),
        `rev:${input.kind}:${row.id}`,
        input.kind,
      );
      if (r && !r.alreadyExisted) reversed += 1;
    }
    await client.query("COMMIT");
    return { ok: true, reversed };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    logger.error({ err }, "reverseByExternalTransaction failed");
    return { ok: false, reversed: 0 };
  } finally {
    client.release();
  }
}

export { catalogGbpNumberToPence };
