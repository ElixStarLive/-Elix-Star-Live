/**
 * Immutable financial ledger (GBP pence) + creator GBP wallet updates.
 * Never delete or silently rewrite ledger rows — reversals are new rows.
 */
import type { PoolClient } from "pg";
import { randomUUID } from "crypto";
import { getPool } from "../postgres";
import { logger } from "../logger";
import { assertNonNegInt } from "./moneyMath";

export type RevenueSource =
  | "PAID_GIFT"
  | "CREATOR_SUBSCRIPTION"
  | "CREATOR_REWARD"
  | "PROMOTE_VIDEO"
  | "ADMIN_ADJUSTMENT"
  | "REFUND_REVERSAL"
  | "CHARGEBACK_REVERSAL"
  | "WITHDRAWAL"
  | "PAYOUT_FAILURE"
  | "PAYOUT_REVERSAL";

export type LedgerStatus =
  | "pending"
  | "available"
  | "paid"
  | "reversed"
  | "held"
  | "awaiting_settlement";

export type LedgerPostInput = {
  idempotencyKey: string;
  revenueSource: RevenueSource;
  creatorUserId?: string | null;
  payerUserId?: string | null;
  externalTransactionId?: string | null;
  giftId?: string | null;
  subscriptionId?: string | null;
  promotionId?: string | null;
  rewardPeriodId?: string | null;
  videoId?: string | null;
  liveRoomId?: string | null;
  coinAmount?: number;
  coinSource?: string | null;
  grossPence: number;
  appStoreDeductionPence?: number;
  taxDeductionPence?: number;
  processingDeductionPence?: number;
  refundPence?: number;
  chargebackPence?: number;
  netRevenuePence: number;
  creatorPct: number;
  creatorAmountPence: number;
  platformPct: number;
  platformAmountPence: number;
  currency?: string;
  exchangeRateBp?: number | null;
  pendingAt?: Date | null;
  availableAt?: Date | null;
  status?: LedgerStatus;
  reversalOfId?: string | null;
  ruleSnapshot: Record<string, unknown>;
};

export type LedgerRow = {
  id: string;
  alreadyExisted: boolean;
};

async function ensureCreatorWallet(client: PoolClient, userId: string): Promise<void> {
  await client.query(
    `INSERT INTO elix_creator_wallet_gbp (user_id)
     VALUES ($1)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId],
  );
}

/**
 * Apply creator-side wallet movement for a new ledger posting.
 * Only creator_amount_pence != 0 moves the GBP wallet.
 */
async function applyCreatorWalletDelta(
  client: PoolClient,
  creatorUserId: string,
  creatorAmountPence: number,
  status: LedgerStatus,
): Promise<void> {
  if (!creatorUserId || creatorAmountPence === 0) return;
  await ensureCreatorWallet(client, creatorUserId);
  if (creatorAmountPence > 0) {
    if (status === "available") {
      await client.query(
        `UPDATE elix_creator_wallet_gbp
            SET available_pence = available_pence + $2, updated_at = NOW()
          WHERE user_id = $1`,
        [creatorUserId, creatorAmountPence],
      );
    } else if (status === "held") {
      await client.query(
        `UPDATE elix_creator_wallet_gbp
            SET held_pence = held_pence + $2, updated_at = NOW()
          WHERE user_id = $1`,
        [creatorUserId, creatorAmountPence],
      );
    } else if (status === "pending" || status === "awaiting_settlement") {
      await client.query(
        `UPDATE elix_creator_wallet_gbp
            SET pending_pence = pending_pence + $2, updated_at = NOW()
          WHERE user_id = $1`,
        [creatorUserId, creatorAmountPence],
      );
    }
    // paid / reversed handled by dedicated flows
    return;
  }
  // Negative creator amount (reversal): claw back from pending, then available.
  //
  // held_pence is not available to claw back: it is reserved for a withdrawal
  // that is already on its way to Stripe and will still be transferred. Taking
  // it here would leave that payout to subtract from a balance that no longer
  // holds it, and the shortfall would vanish from the books instead of being
  // recorded as money the platform has to recover.
  const abs = Math.abs(creatorAmountPence);
  const bal = await client.query(
    `SELECT pending_pence, available_pence
       FROM elix_creator_wallet_gbp WHERE user_id = $1 FOR UPDATE`,
    [creatorUserId],
  );
  let remaining = abs;
  const pending = Math.max(0, Number(bal.rows[0]?.pending_pence) || 0);
  const available = Math.max(0, Number(bal.rows[0]?.available_pence) || 0);
  const fromPending = Math.min(pending, remaining);
  remaining -= fromPending;
  const fromAvailable = Math.min(available, remaining);
  remaining -= fromAvailable;
  const recovered = abs - remaining;
  await client.query(
    `UPDATE elix_creator_wallet_gbp SET
       pending_pence = GREATEST(0, pending_pence - $2),
       available_pence = GREATEST(0, available_pence - $3),
       reversed_pence = reversed_pence + $4,
       recoverable_pence = recoverable_pence + $5,
       updated_at = NOW()
     WHERE user_id = $1`,
    [creatorUserId, fromPending, fromAvailable, recovered, remaining],
  );
}

/** Platform GBP books — mirrors creator wallet deltas for platform share. */
async function applyPlatformWalletDelta(
  client: PoolClient,
  platformAmountPence: number,
  status: LedgerStatus,
): Promise<void> {
  if (platformAmountPence === 0) return;
  await client.query(
    `INSERT INTO elix_platform_wallet_gbp (id) VALUES ('default') ON CONFLICT (id) DO NOTHING`,
  );
  if (platformAmountPence > 0) {
    if (status === "pending" || status === "awaiting_settlement") {
      await client.query(
        `UPDATE elix_platform_wallet_gbp
            SET pending_pence = pending_pence + $1, updated_at = NOW()
          WHERE id = 'default'`,
        [platformAmountPence],
      );
    } else {
      await client.query(
        `UPDATE elix_platform_wallet_gbp
            SET available_pence = available_pence + $1, updated_at = NOW()
          WHERE id = 'default'`,
        [platformAmountPence],
      );
    }
    return;
  }
  const abs = Math.abs(platformAmountPence);
  const bal = await client.query(
    `SELECT pending_pence, available_pence FROM elix_platform_wallet_gbp WHERE id = 'default' FOR UPDATE`,
  );
  let remaining = abs;
  const pending = Math.max(0, Number(bal.rows[0]?.pending_pence) || 0);
  const available = Math.max(0, Number(bal.rows[0]?.available_pence) || 0);
  const fromPending = Math.min(pending, remaining);
  remaining -= fromPending;
  const fromAvailable = Math.min(available, remaining);
  remaining -= fromAvailable;
  const recovered = abs - remaining;
  await client.query(
    `UPDATE elix_platform_wallet_gbp SET
       pending_pence = GREATEST(0, pending_pence - $1),
       available_pence = GREATEST(0, available_pence - $2),
       reversed_pence = reversed_pence + $3,
       recoverable_pence = recoverable_pence + $4,
       updated_at = NOW()
     WHERE id = 'default'`,
    [fromPending, fromAvailable, recovered, remaining],
  );
}

export async function postLedgerEntry(
  client: PoolClient,
  input: LedgerPostInput,
): Promise<LedgerRow> {
  assertNonNegInt(input.grossPence, "grossPence");
  assertNonNegInt(input.netRevenuePence, "netRevenuePence");
  if (!Number.isInteger(input.creatorAmountPence)) {
    throw new Error("creatorAmountPence must be integer");
  }
  if (!Number.isInteger(input.platformAmountPence)) {
    throw new Error("platformAmountPence must be integer");
  }
  if (input.creatorAmountPence + input.platformAmountPence !== input.netRevenuePence) {
    // Allow negative creator on reversals where signs flip — skip exact check when reversing
    if (!input.reversalOfId) {
      throw new Error("creator + platform amounts must equal net revenue");
    }
  }

  const id = randomUUID();
  const status: LedgerStatus = input.status ?? "pending";
  const ins = await client.query(
    `INSERT INTO elix_financial_ledger (
       id, idempotency_key, external_transaction_id, creator_user_id, payer_user_id,
       revenue_source, gift_id, subscription_id, promotion_id, reward_period_id,
       video_id, live_room_id, coin_amount, coin_source,
       gross_pence, app_store_deduction_pence, tax_deduction_pence, processing_deduction_pence,
       refund_pence, chargeback_pence, net_revenue_pence,
       creator_pct, creator_amount_pence, platform_pct, platform_amount_pence,
       currency, exchange_rate_bp, pending_at, available_at, status, reversal_of_id, rule_snapshot
     ) VALUES (
       $1,$2,$3,$4,$5,
       $6,$7,$8,$9,$10,
       $11,$12,$13,$14,
       $15,$16,$17,$18,
       $19,$20,$21,
       $22,$23,$24,$25,
       $26,$27,$28,$29,$30,$31,$32::jsonb
     )
     ON CONFLICT (idempotency_key) DO NOTHING
     RETURNING id`,
    [
      id,
      input.idempotencyKey,
      input.externalTransactionId ?? null,
      input.creatorUserId ?? null,
      input.payerUserId ?? null,
      input.revenueSource,
      input.giftId ?? null,
      input.subscriptionId ?? null,
      input.promotionId ?? null,
      input.rewardPeriodId ?? null,
      input.videoId ?? null,
      input.liveRoomId ?? null,
      Math.floor(input.coinAmount ?? 0),
      input.coinSource ?? null,
      input.grossPence,
      input.appStoreDeductionPence ?? 0,
      input.taxDeductionPence ?? 0,
      input.processingDeductionPence ?? 0,
      input.refundPence ?? 0,
      input.chargebackPence ?? 0,
      input.netRevenuePence,
      input.creatorPct,
      input.creatorAmountPence,
      input.platformPct,
      input.platformAmountPence,
      input.currency ?? "GBP",
      input.exchangeRateBp ?? null,
      input.pendingAt ?? new Date(),
      input.availableAt ?? null,
      status,
      input.reversalOfId ?? null,
      JSON.stringify(input.ruleSnapshot ?? {}),
    ],
  );

  if ((ins.rowCount ?? 0) === 0) {
    const existing = await client.query(
      `SELECT id FROM elix_financial_ledger WHERE idempotency_key = $1 LIMIT 1`,
      [input.idempotencyKey],
    );
    return { id: String(existing.rows[0]?.id ?? ""), alreadyExisted: true };
  }

  const ledgerId = String(ins.rows[0].id);
  if (input.creatorUserId && input.creatorAmountPence !== 0) {
    await applyCreatorWalletDelta(client, input.creatorUserId, input.creatorAmountPence, status);
  }
  if (input.platformAmountPence !== 0) {
    await applyPlatformWalletDelta(client, input.platformAmountPence, status);
  }
  return { id: ledgerId, alreadyExisted: false };
}

export async function postLedgerEntryStandalone(input: LedgerPostInput): Promise<LedgerRow | null> {
  const pool = getPool();
  if (!pool) return null;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const row = await postLedgerEntry(client, input);
    await client.query("COMMIT");
    return row;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (rb) {
      logger.error({ err: rb }, "postLedgerEntryStandalone ROLLBACK failed");
    }
    logger.error({ err, key: input.idempotencyKey }, "postLedgerEntryStandalone failed");
    return null;
  } finally {
    client.release();
  }
}

/**
 * Create a full reversal of an existing ledger row (refund / chargeback).
 * Original row is never deleted.
 */
export async function reverseLedgerEntry(
  client: PoolClient,
  originalId: string,
  idempotencyKey: string,
  revenueSource: "REFUND_REVERSAL" | "CHARGEBACK_REVERSAL",
  extra: Partial<LedgerPostInput> = {},
): Promise<LedgerRow | null> {
  const orig = await client.query(`SELECT * FROM elix_financial_ledger WHERE id = $1 LIMIT 1`, [
    originalId,
  ]);
  if (!orig.rowCount) return null;
  const o = orig.rows[0];
  return postLedgerEntry(client, {
    idempotencyKey,
    revenueSource,
    creatorUserId: o.creator_user_id,
    payerUserId: o.payer_user_id,
    externalTransactionId: extra.externalTransactionId ?? o.external_transaction_id,
    giftId: o.gift_id,
    subscriptionId: o.subscription_id,
    promotionId: o.promotion_id,
    rewardPeriodId: o.reward_period_id,
    videoId: o.video_id,
    liveRoomId: o.live_room_id,
    coinAmount: Number(o.coin_amount) || 0,
    coinSource: o.coin_source,
    grossPence: Number(o.gross_pence) || 0,
    appStoreDeductionPence: Number(o.app_store_deduction_pence) || 0,
    taxDeductionPence: Number(o.tax_deduction_pence) || 0,
    processingDeductionPence: Number(o.processing_deduction_pence) || 0,
    refundPence:
      extra.refundPence != null ? extra.refundPence : Number(o.refund_pence) || 0,
    chargebackPence:
      extra.chargebackPence != null ? extra.chargebackPence : Number(o.chargeback_pence) || 0,
    netRevenuePence: Number(o.net_revenue_pence) || 0,
    creatorPct: Number(o.creator_pct) || 0,
    creatorAmountPence: -(Number(o.creator_amount_pence) || 0),
    platformPct: Number(o.platform_pct) || 0,
    platformAmountPence: -(Number(o.platform_amount_pence) || 0),
    currency: o.currency || "GBP",
    status: "reversed",
    reversalOfId: originalId,
    ruleSnapshot: {
      ...(typeof o.rule_snapshot === "object" && o.rule_snapshot ? o.rule_snapshot : {}),
      reversal_of: originalId,
      ...extra.ruleSnapshot,
    },
  });
}

export async function matureGbpPendingEarnings(holdHours: number): Promise<number> {
  const pool = getPool();
  if (!pool) return 0;
  const hours = Math.max(0, Math.floor(holdHours));
  const client = await pool.connect();
  let matured = 0;
  try {
    await client.query("BEGIN");
    const due = await client.query(
      `SELECT id, creator_user_id, creator_amount_pence
         FROM elix_financial_ledger
        WHERE status = 'pending'
          AND creator_amount_pence > 0
          AND creator_user_id IS NOT NULL
          AND revenue_source IN ('PAID_GIFT', 'CREATOR_SUBSCRIPTION', 'CREATOR_REWARD', 'ADMIN_ADJUSTMENT')
          AND pending_at <= NOW() - ($1::text || ' hours')::interval
        ORDER BY pending_at ASC
        LIMIT 200
        FOR UPDATE SKIP LOCKED`,
      [String(hours)],
    );
    for (const row of due.rows) {
      const id = String(row.id);
      const creatorId = String(row.creator_user_id);
      const amount = Math.floor(Number(row.creator_amount_pence) || 0);
      if (!id || !creatorId || amount <= 0) continue;
      const upd = await client.query(
        `UPDATE elix_financial_ledger
            SET status = 'available', available_at = NOW(), updated_at = NOW()
          WHERE id = $1 AND status = 'pending'
          RETURNING id`,
        [id],
      );
      if (!upd.rowCount) continue;
      await ensureCreatorWallet(client, creatorId);
      const recR = await client.query(
        `SELECT recoverable_pence FROM elix_creator_wallet_gbp WHERE user_id = $1 FOR UPDATE`,
        [creatorId],
      );
      const recoverable = Math.max(0, Math.floor(Number(recR.rows[0]?.recoverable_pence) || 0));
      const toDebt = Math.min(amount, recoverable);
      const toAvailable = amount - toDebt;
      await client.query(
        `UPDATE elix_creator_wallet_gbp
            SET pending_pence = GREATEST(0, pending_pence - $2),
                recoverable_pence = GREATEST(0, recoverable_pence - $3),
                available_pence = available_pence + $4,
                updated_at = NOW()
          WHERE user_id = $1`,
        [creatorId, amount, toDebt, toAvailable],
      );
      matured += 1;
    }
    await client.query("COMMIT");
    return matured;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (rb) {
      logger.error({ err: rb }, "matureGbpPendingEarnings ROLLBACK failed");
    }
    logger.warn({ err }, "matureGbpPendingEarnings failed");
    return 0;
  } finally {
    client.release();
  }
}
