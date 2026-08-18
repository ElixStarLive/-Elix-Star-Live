/**
 * GBP creator withdrawals — available_pence only, idempotent, row-locked.
 */
import { randomUUID } from "crypto";
import { getPool } from "../postgres";
import { logger } from "../logger";
import { loadMonetisationConfig } from "./config";
import { postLedgerEntry } from "./ledger";
import { recordFraudDecision } from "./fraud";

export type WithdrawalStatus =
  | "pending"
  | "approved"
  | "processing"
  | "paid"
  | "failed"
  | "rejected"
  | "cancelled";

/**
 * Which status a withdrawal may move to, from each status it can be in.
 *
 * A withdrawal that ended badly is final: its reserved pence were already put
 * back in available_pence, so re-submitting it to Stripe would pay money that
 * is no longer reserved. A creator who still wants that money requests a new
 * withdrawal. `paid -> failed` is the one exception, and only because Stripe
 * reversing a transfer must be able to unwind the payout (see PAYOUT_REVERSAL).
 * Same-status entries make redelivered provider events a no-op instead of a
 * second money movement.
 */
const ALLOWED_TRANSITIONS: Record<WithdrawalStatus, readonly WithdrawalStatus[]> = {
  pending: ["pending", "approved", "processing", "paid", "failed", "rejected", "cancelled"],
  approved: ["approved", "processing", "paid", "failed", "rejected", "cancelled"],
  processing: ["processing", "paid", "failed", "cancelled"],
  paid: ["paid", "failed"],
  failed: ["failed"],
  rejected: ["rejected"],
  cancelled: ["cancelled"],
};

async function appendStatusHistory(
  client: import("pg").PoolClient,
  withdrawalId: string,
  fromStatus: string | null,
  toStatus: string,
  adminUserId?: string | null,
  note?: string | null,
): Promise<void> {
  await client.query(
    `INSERT INTO elix_creator_withdrawal_status_history
       (withdrawal_id, from_status, to_status, admin_user_id, note)
     VALUES ($1, $2, $3, $4, $5)`,
    [withdrawalId, fromStatus, toStatus, adminUserId ?? null, note ?? null],
  );
}

async function settledByIdempotencyKey(
  client: import("pg").PoolClient,
  idempotencyKey: string,
): Promise<
  | {
      id: string;
      status: WithdrawalStatus;
      creatorUserId: string;
      amountPence: number;
      currency: string;
    }
  | null
> {
  const r = await client.query(
    `SELECT id, status, creator_user_id, amount_pence, currency
       FROM elix_creator_withdrawals_gbp
      WHERE idempotency_key = $1
      LIMIT 1`,
    [idempotencyKey],
  );
  if (!r.rowCount) return null;
  return {
    id: String(r.rows[0].id),
    status: r.rows[0].status as WithdrawalStatus,
    creatorUserId: String(r.rows[0].creator_user_id),
    amountPence: Math.floor(Number(r.rows[0].amount_pence) || 0),
    currency: String(r.rows[0].currency || "GBP"),
  };
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    String((err as { code?: unknown }).code) === "23505"
  );
}

export async function requestGbpWithdrawal(input: {
  creatorUserId: string;
  amountPence: number;
  idempotencyKey: string;
  currency?: string;
}): Promise<
  | { ok: true; id: string; status: WithdrawalStatus; alreadyExists: boolean }
  | {
      ok: false;
      error:
        | "insufficient_available"
        | "below_minimum"
        | "above_maximum"
        | "invalid_amount"
        | "idempotency_key_conflict"
        | "database_error"
        | "no_payout_method";
    }
> {
  const pool = getPool();
  if (!pool) return { ok: false, error: "database_error" };
  // This function is the money authority, so it validates the amount itself
  // rather than trusting a caller to have done it. Infinity survives `|| 0` and
  // would otherwise reach the balance comparison as a real request.
  const requested = Number(input.amountPence);
  if (!Number.isFinite(requested)) return { ok: false, error: "invalid_amount" };
  const amount = Math.floor(requested);
  if (amount <= 0 || !Number.isSafeInteger(amount)) {
    return { ok: false, error: "invalid_amount" };
  }
  const cfg = await loadMonetisationConfig();
  if (amount < cfg.withdrawMinPence) return { ok: false, error: "below_minimum" };
  if (cfg.withdrawMaxPence != null && amount > cfg.withdrawMaxPence) {
    return { ok: false, error: "above_maximum" };
  }

  const currency = input.currency || "GBP";
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const settled = await settledByIdempotencyKey(client, input.idempotencyKey);
    if (settled) {
      await client.query("COMMIT");
      // The key belongs to the first request that used it. Replaying it for a
      // different creator, amount or currency is not that request retrying, so
      // it must not read back as that creator's withdrawal.
      if (
        settled.creatorUserId !== input.creatorUserId ||
        settled.amountPence !== amount ||
        settled.currency !== currency
      ) {
        logger.warn(
          { creatorUserId: input.creatorUserId, amount, currency },
          "GBP withdrawal refused — idempotency key reused with different terms",
        );
        return { ok: false, error: "idempotency_key_conflict" };
      }
      return {
        ok: true,
        id: settled.id,
        status: settled.status,
        alreadyExists: true,
      };
    }

    const method = await client.query(
      `SELECT id FROM elix_payout_methods WHERE user_id = $1 ORDER BY is_default DESC, created_at DESC LIMIT 1`,
      [input.creatorUserId],
    );
    if (!method.rowCount) {
      await client.query("ROLLBACK");
      return { ok: false, error: "no_payout_method" };
    }

    await client.query(
      `INSERT INTO elix_creator_wallet_gbp (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
      [input.creatorUserId],
    );
    const bal = await client.query(
      `SELECT available_pence FROM elix_creator_wallet_gbp WHERE user_id = $1 FOR UPDATE`,
      [input.creatorUserId],
    );
    const available = Math.floor(Number(bal.rows[0]?.available_pence) || 0);
    if (available < amount) {
      await client.query("ROLLBACK");
      return { ok: false, error: "insufficient_available" };
    }

    const id = `wdgbp_${randomUUID()}`;
    await client.query(
      `UPDATE elix_creator_wallet_gbp
          SET available_pence = available_pence - $2,
              held_pence = held_pence + $2,
              updated_at = NOW()
        WHERE user_id = $1`,
      [input.creatorUserId, amount],
    );
    await client.query(
      `INSERT INTO elix_creator_withdrawals_gbp
         (id, idempotency_key, creator_user_id, amount_pence, currency, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')`,
      [id, input.idempotencyKey, input.creatorUserId, amount, currency],
    );
    await appendStatusHistory(client, id, null, "pending");
    await postLedgerEntry(client, {
      idempotencyKey: `withdrawal:${input.idempotencyKey}`,
      revenueSource: "WITHDRAWAL",
      creatorUserId: input.creatorUserId,
      grossPence: amount,
      // Memo only: wallet already moved available→held. Do not credit platform.
      netRevenuePence: 0,
      creatorPct: 100,
      creatorAmountPence: 0,
      platformPct: 0,
      platformAmountPence: 0,
      status: "held",
      ruleSnapshot: { withdrawal_id: id, amount_pence: amount },
    });
    await client.query("COMMIT");
    return { ok: true, id, status: "pending", alreadyExists: false };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    // Two devices tapping withdraw at the same moment race on the unique
    // idempotency key. The loser lost nothing — the winner reserved the money —
    // so it must return that settled withdrawal, not a 500 the client retries.
    if (isUniqueViolation(err)) {
      await recordFraudDecision({
        subjectType: "withdrawal",
        subjectId: input.idempotencyKey,
        userId: input.creatorUserId,
        reasonCode: "duplicate_withdrawal",
        details: { concurrent_request: true },
      });
      try {
        const settled = await settledByIdempotencyKey(client, input.idempotencyKey);
        if (settled) {
          if (
            settled.creatorUserId !== input.creatorUserId ||
            settled.amountPence !== amount ||
            settled.currency !== currency
          ) {
            return { ok: false, error: "idempotency_key_conflict" };
          }
          return { ok: true, id: settled.id, status: settled.status, alreadyExists: true };
        }
      } catch (reReadErr) {
        logger.error({ err: reReadErr }, "requestGbpWithdrawal duplicate re-read failed");
      }
    }
    logger.error({ err }, "requestGbpWithdrawal failed");
    return { ok: false, error: "database_error" };
  } finally {
    client.release();
  }
}

export async function applyGbpWithdrawalStatusOnClient(
  client: import("pg").PoolClient,
  input: {
    withdrawalId: string;
    toStatus: WithdrawalStatus;
    adminUserId: string;
    note?: string;
    payoutProviderRef?: string | null;
    failureReason?: string | null;
  },
): Promise<{ ok: boolean; error?: string }> {
  const rowR = await client.query(
    `SELECT * FROM elix_creator_withdrawals_gbp WHERE id = $1 FOR UPDATE`,
    [input.withdrawalId],
  );
  if (!rowR.rowCount) {
    return { ok: false, error: "not_found" };
  }
  const row = rowR.rows[0];
  const from = String(row.status) as WithdrawalStatus;
  const amount = Math.floor(Number(row.amount_pence) || 0);
  const creatorId = String(row.creator_user_id);

  const allowed = ALLOWED_TRANSITIONS[from];
  if (!allowed || !allowed.includes(input.toStatus)) {
    // A late or out-of-order provider event must not resurrect a withdrawal
    // whose money was already given back, nor re-pay one already settled.
    logger.warn(
      { withdrawalId: input.withdrawalId, from, to: input.toStatus },
      "GBP withdrawal transition refused",
    );
    return { ok: false, error: "invalid_transition" };
  }

  if (input.payoutProviderRef) {
    const dup = await client.query(
      `SELECT id FROM elix_creator_withdrawals_gbp
        WHERE payout_provider_ref = $1 AND id <> $2 LIMIT 1`,
      [input.payoutProviderRef, input.withdrawalId],
    );
    if (dup.rowCount) {
      return { ok: false, error: "duplicate_provider_ref" };
    }
  }

  await client.query(
    `UPDATE elix_creator_withdrawals_gbp SET
       status = $2,
       payout_provider_ref = COALESCE($3, payout_provider_ref),
       failure_reason = COALESCE($4, failure_reason),
       processing_at = CASE WHEN $2 = 'processing' THEN COALESCE(processing_at, NOW()) ELSE processing_at END,
       paid_at = CASE WHEN $2 = 'paid' THEN COALESCE(paid_at, NOW()) ELSE paid_at END
     WHERE id = $1`,
    [
      input.withdrawalId,
      input.toStatus,
      input.payoutProviderRef ?? null,
      input.failureReason ?? null,
    ],
  );
  if (from !== input.toStatus) {
    await appendStatusHistory(
      client,
      input.withdrawalId,
      from,
      input.toStatus,
      input.adminUserId,
      input.note,
    );
  }

  if (
    from === "paid" &&
    (input.toStatus === "failed" ||
      input.toStatus === "rejected" ||
      input.toStatus === "cancelled")
  ) {
    // Stripe pulled the transfer back out of the connected account, so this
    // payout did not stand. Leaving withdrawn_pence counted would take the
    // money off the creator for a payout they never kept.
    const reversal = await postLedgerEntry(client, {
      idempotencyKey: `payout_reversal:${input.withdrawalId}`,
      revenueSource: "PAYOUT_REVERSAL",
      creatorUserId: creatorId,
      grossPence: amount,
      netRevenuePence: amount,
      creatorPct: 100,
      // Restores available_pence through the one wallet-credit path.
      creatorAmountPence: amount,
      platformPct: 0,
      platformAmountPence: 0,
      status: "available",
      ruleSnapshot: {
        withdrawal_id: input.withdrawalId,
        restored: true,
        from_status: from,
        provider_reversal: true,
        reason: input.failureReason ?? null,
      },
    });
    if (!reversal.alreadyExisted) {
      await client.query(
        `UPDATE elix_creator_wallet_gbp
            SET withdrawn_pence = GREATEST(0, withdrawn_pence - $2),
                updated_at = NOW()
          WHERE user_id = $1`,
        [creatorId, amount],
      );
      await client.query(
        `UPDATE elix_financial_ledger SET
           status = 'reversed',
           updated_at = NOW()
         WHERE revenue_source = 'WITHDRAWAL'
           AND status = 'paid'
           AND (rule_snapshot->>'withdrawal_id') = $1`,
        [input.withdrawalId],
      );
    }
    return { ok: true };
  }

  if (input.toStatus === "paid" && from !== "paid") {
    await client.query(
      `UPDATE elix_creator_wallet_gbp
          SET held_pence = GREATEST(0, held_pence - $2),
              withdrawn_pence = withdrawn_pence + $2,
              updated_at = NOW()
        WHERE user_id = $1`,
      [creatorId, amount],
    );
    await client.query(
      `UPDATE elix_financial_ledger SET
         status = 'paid',
         paid_at = NOW(),
         updated_at = NOW()
       WHERE revenue_source = 'WITHDRAWAL'
         AND status = 'held'
         AND (rule_snapshot->>'withdrawal_id') = $1`,
      [input.withdrawalId],
    );
  } else if (
    input.toStatus === "failed" ||
    input.toStatus === "rejected" ||
    input.toStatus === "cancelled"
  ) {
    const heldLedger = await client.query(
      `SELECT id FROM elix_financial_ledger
        WHERE revenue_source = 'WITHDRAWAL'
          AND status = 'held'
          AND (rule_snapshot->>'withdrawal_id') = $1
        LIMIT 1`,
      [input.withdrawalId],
    );
    const fundsWereHeld = (heldLedger.rowCount ?? 0) > 0;
    if (fundsWereHeld) {
      await client.query(
        `UPDATE elix_creator_wallet_gbp
            SET held_pence = GREATEST(0, held_pence - $2),
                updated_at = NOW()
          WHERE user_id = $1`,
        [creatorId, amount],
      );
    }
    await client.query(
      `UPDATE elix_financial_ledger SET
         status = 'cancelled',
         updated_at = NOW()
       WHERE revenue_source = 'WITHDRAWAL'
         AND status = 'held'
         AND (rule_snapshot->>'withdrawal_id') = $1`,
      [input.withdrawalId],
    );
    if (fundsWereHeld) {
      await postLedgerEntry(client, {
        idempotencyKey: `payout_failure:${input.withdrawalId}:${input.toStatus}`,
        revenueSource: "PAYOUT_FAILURE",
        creatorUserId: creatorId,
        grossPence: amount,
        netRevenuePence: amount,
        creatorPct: 100,
        creatorAmountPence: amount,
        platformPct: 0,
        platformAmountPence: 0,
        status: "available",
        ruleSnapshot: {
          withdrawal_id: input.withdrawalId,
          restored: true,
          from_status: from,
        },
      });
    }
  }

  return { ok: true };
}

export async function adminSetGbpWithdrawalStatus(input: {
  withdrawalId: string;
  toStatus: WithdrawalStatus;
  adminUserId: string;
  note?: string;
  payoutProviderRef?: string | null;
  failureReason?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const pool = getPool();
  if (!pool) return { ok: false, error: "database_error" };
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const r = await applyGbpWithdrawalStatusOnClient(client, input);
    if (!r.ok) {
      await client.query("ROLLBACK");
      return r;
    }
    await client.query("COMMIT");
    return { ok: true };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (rbErr) {
      logger.error({ err: rbErr }, "adminSetGbpWithdrawalStatus ROLLBACK failed");
    }
    logger.error({ err }, "adminSetGbpWithdrawalStatus failed");
    return { ok: false, error: "database_error" };
  } finally {
    client.release();
  }
}

export async function listGbpWithdrawals(creatorUserId: string, limit = 50) {
  const pool = getPool();
  if (!pool) throw new Error("DATABASE_UNAVAILABLE");
  const r = await pool.query(
    `SELECT * FROM elix_creator_withdrawals_gbp
      WHERE creator_user_id = $1
      ORDER BY created_at DESC
      LIMIT $2`,
    [creatorUserId, limit],
  );
  return r.rows;
}
