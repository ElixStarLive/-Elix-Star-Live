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
        | "database_error"
        | "no_payout_method";
    }
> {
  const pool = getPool();
  if (!pool) return { ok: false, error: "database_error" };
  const amount = Math.floor(Number(input.amountPence) || 0);
  if (amount <= 0) return { ok: false, error: "invalid_amount" };
  const cfg = await loadMonetisationConfig();
  if (amount < cfg.withdrawMinPence) return { ok: false, error: "below_minimum" };
  if (cfg.withdrawMaxPence != null && amount > cfg.withdrawMaxPence) {
    return { ok: false, error: "above_maximum" };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query(
      `SELECT id, status FROM elix_creator_withdrawals_gbp WHERE idempotency_key = $1 LIMIT 1`,
      [input.idempotencyKey],
    );
    if (existing.rowCount) {
      await client.query("COMMIT");
      return {
        ok: true,
        id: String(existing.rows[0].id),
        status: existing.rows[0].status as WithdrawalStatus,
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
      [id, input.idempotencyKey, input.creatorUserId, amount, input.currency || "GBP"],
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
    logger.error({ err }, "requestGbpWithdrawal failed");
    await recordFraudDecision({
      subjectType: "withdrawal",
      subjectId: input.idempotencyKey,
      userId: input.creatorUserId,
      reasonCode: "duplicate_withdrawal",
      details: { err: String(err) },
    });
    return { ok: false, error: "database_error" };
  } finally {
    client.release();
  }
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
    const rowR = await client.query(
      `SELECT * FROM elix_creator_withdrawals_gbp WHERE id = $1 FOR UPDATE`,
      [input.withdrawalId],
    );
    if (!rowR.rowCount) {
      await client.query("ROLLBACK");
      return { ok: false, error: "not_found" };
    }
    const row = rowR.rows[0];
    const from = String(row.status);
    const amount = Math.floor(Number(row.amount_pence) || 0);
    const creatorId = String(row.creator_user_id);

    if (input.payoutProviderRef) {
      const dup = await client.query(
        `SELECT id FROM elix_creator_withdrawals_gbp
          WHERE payout_provider_ref = $1 AND id <> $2 LIMIT 1`,
        [input.payoutProviderRef, input.withdrawalId],
      );
      if (dup.rowCount) {
        await client.query("ROLLBACK");
        return { ok: false, error: "duplicate_provider_ref" };
      }
    }

    await client.query(
      `UPDATE elix_creator_withdrawals_gbp SET
         status = $2,
         payout_provider_ref = COALESCE($3, payout_provider_ref),
         failure_reason = COALESCE($4, failure_reason),
         processing_at = CASE WHEN $2 = 'processing' THEN COALESCE(processing_at, NOW()) ELSE processing_at END,
         paid_at = CASE WHEN $2 = 'paid' THEN NOW() ELSE paid_at END
       WHERE id = $1`,
      [
        input.withdrawalId,
        input.toStatus,
        input.payoutProviderRef ?? null,
        input.failureReason ?? null,
      ],
    );
    await appendStatusHistory(
      client,
      input.withdrawalId,
      from,
      input.toStatus,
      input.adminUserId,
      input.note,
    );

    if (input.toStatus === "paid" && from !== "paid") {
      await client.query(
        `UPDATE elix_creator_wallet_gbp
            SET held_pence = GREATEST(0, held_pence - $2),
                withdrawn_pence = withdrawn_pence + $2,
                updated_at = NOW()
          WHERE user_id = $1`,
        [creatorId, amount],
      );
      // Mark the matching WITHDRAWAL ledger row paid so reconcile can count withdrawn.
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
      (input.toStatus === "failed" ||
        input.toStatus === "rejected" ||
        input.toStatus === "cancelled") &&
      from !== "paid"
    ) {
      // Only restore when a held WITHDRAWAL ledger row proves funds were reserved.
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
        // Release held only — available is restored via PAYOUT_FAILURE creator credit below.
        await client.query(
          `UPDATE elix_creator_wallet_gbp
              SET held_pence = GREATEST(0, held_pence - $2),
                  updated_at = NOW()
            WHERE user_id = $1`,
          [creatorId, amount],
        );
      }
      // Release held WITHDRAWAL ledger so it no longer counts as held.
      await client.query(
        `UPDATE elix_financial_ledger SET
           status = 'cancelled',
           updated_at = NOW()
         WHERE revenue_source = 'WITHDRAWAL'
           AND status = 'held'
           AND (rule_snapshot->>'withdrawal_id') = $1`,
        [input.withdrawalId],
      );
      // Creator restore only — never credit platform wallet on payout failure.
      // postLedgerEntry applies available += creatorAmountPence (reconcile excludes
      // PAYOUT_FAILURE from available expected so cancel+restore stays balanced).
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

    await client.query("COMMIT");
    return { ok: true };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
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
