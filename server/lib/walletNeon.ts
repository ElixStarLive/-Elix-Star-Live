/**
 * Payment + wallet persistence on Neon / Postgres (DATABASE_URL + pg pool).
 * Wallet tables are created by SQL migrations (`npm run migrate`), not at app boot.
 */

import { getPool } from "./postgres";
import { logger } from "./logger";
import { createPaidCoinLot, consumeSettledNetForGift } from "./monetisation/paidCoinLots";
import { loadMonetisationConfig, ruleSnapshotFromConfig } from "./monetisation/config";
import { splitNetRevenue } from "./monetisation/moneyMath";
import { postLedgerEntry } from "./monetisation/ledger";
import {
  resolveCoinPurchaseVerifiedPrice,
  reversePurchaseFinancialsOnClient,
} from "./monetisation/storeSettlement";
import type { AppleTxPayload } from "./appleIap";

/** A timestamp column as a Date, or null when it is absent or unparseable. */
function toDateOrNull(raw: unknown): Date | null {
  if (raw instanceof Date) return Number.isFinite(raw.getTime()) ? raw : null;
  if (typeof raw !== "string" || !raw.trim()) return null;
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

export async function neonGetCoinBalance(userId: string): Promise<number | null> {
  const pool = getPool();
  if (!userId) return null;
  if (!pool) {
    throw new Error("Postgres pool is not initialized");
  }
  try {
    const r = await pool.query(
      `SELECT coin_balance::bigint AS b FROM elix_wallet_balances WHERE user_id = $1`,
      [userId],
    );
    if (r.rows.length === 0) return null;
    return Math.max(0, Number(r.rows[0].b));
  } catch (e) {
    logger.warn({ err: e }, "neonGetCoinBalance failed");
    throw e;
  }
}

/** Ensure user has a Neon wallet row without relying on legacy file stores. */
export async function neonEnsureBalanceFromFile(userId: string): Promise<void> {
  const pool = getPool();
  if (!pool || !userId) return;
  try {
    await pool.query(
      `INSERT INTO elix_wallet_balances (user_id, coin_balance) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING`,
      [userId, 0],
    );
  } catch (e) {
    logger.warn({ err: e }, "neonEnsureBalanceFromFile failed");
  }
}

export async function neonIsIapProcessed(
  provider: string,
  providerTransactionId: string,
): Promise<boolean> {
  const pool = getPool();
  if (!pool) throw new Error("DATABASE_UNAVAILABLE");
  try {
    const r = await pool.query(
      `SELECT 1 FROM elix_wallet_ledger WHERE kind = 'iap_purchase' AND provider = $1 AND provider_transaction_id = $2 LIMIT 1`,
      [provider, providerTransactionId],
    );
    return r.rows.length > 0;
  } catch (e) {
    logger.error(
      { err: e, provider, providerTransactionId },
      "neonIsIapProcessed: database error — failing closed (throwing)",
    );
    throw e;
  }
}

/**
 * Who a store transaction already settled for, from the durable purchase
 * record. Used to refuse a replay from another account or against another
 * product instead of answering it with somebody else's "already processed".
 * Throws when the database is unavailable — never guesses "nobody owns it".
 */
export async function neonSettledIapPurchase(
  provider: string,
  providerTransactionId: string,
): Promise<{ userId: string; productId: string | null } | null> {
  const pool = getPool();
  if (!pool) throw new Error("DATABASE_UNAVAILABLE");
  try {
    const r = await pool.query(
      `SELECT l.user_id, l.product_id
         FROM elix_wallet_ledger l
        WHERE l.kind = 'iap_purchase'
          AND l.provider = $1
          AND l.provider_transaction_id = $2
        LIMIT 1`,
      [provider, providerTransactionId],
    );
    if (!r.rows.length) return null;
    return {
      userId: String(r.rows[0].user_id),
      productId: r.rows[0].product_id != null ? String(r.rows[0].product_id) : null,
    };
  } catch (e) {
    logger.error(
      { err: e, provider, providerTransactionId },
      "neonSettledIapPurchase: database error — failing closed (throwing)",
    );
    throw e;
  }
}

/** Promote purchases are keyed on provider_transaction_id — not coin IAP ledger. */
export async function neonIsPromoteProcessed(
  providerTransactionId: string,
): Promise<boolean> {
  const pool = getPool();
  if (!pool) throw new Error("DATABASE_UNAVAILABLE");
  try {
    const r = await pool.query(
      `SELECT 1 FROM elix_promote_purchases WHERE provider_transaction_id = $1 LIMIT 1`,
      [providerTransactionId],
    );
    return r.rows.length > 0;
  } catch (e) {
    logger.error(
      { err: e, providerTransactionId },
      "neonIsPromoteProcessed: database error — failing closed (throwing)",
    );
    throw e;
  }
}

type CreditOk = { ok: true; newBalance: number; ledgerId: string };
type CreditDup = { ok: false; alreadyProcessed: true; newBalance: number };
type CreditErr = { ok: false; error: string };

export async function neonCreditIap(input: {
  userId: string;
  provider: string;
  providerTransactionId: string;
  productId: string;
  coins: number;
  verification: Record<string, unknown>;
  applePayload?: AppleTxPayload | Record<string, unknown> | null;
  googlePurchaseToken?: string | null;
  /**
   * Store evidence says the buyer paid nothing (Play license test, promo code,
   * rewarded product). The coins are real; the money is not, so the lot must
   * carry no GBP for paid gifts or creator revenue to attribute later.
   */
  unpaidPurchase?: boolean;
  /** Store-verified units bought. Multiplies both coins and the paid value. */
  quantity?: number;
}): Promise<CreditOk | CreditDup | CreditErr> {
  const pool = getPool();
  if (!pool) return { ok: false, error: "no_pool" };
  const coins = Math.max(0, Math.floor(input.coins));
  const idem = `iap:${input.provider}:${input.providerTransactionId}`;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const ins = await client.query(
      `INSERT INTO elix_wallet_ledger (user_id, kind, coins_delta, provider, provider_transaction_id, product_id, idempotency_key, verification)
       VALUES ($1, 'iap_purchase', $2, $3, $4, $5, $6, $7::jsonb)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING id`,
      [
        input.userId,
        coins,
        input.provider,
        input.providerTransactionId,
        input.productId,
        idem,
        JSON.stringify(input.verification ?? {}),
      ],
    );
    if (ins.rowCount === 0) {
      const balR = await client.query(
        `SELECT coin_balance::bigint AS b FROM elix_wallet_balances WHERE user_id = $1`,
        [input.userId],
      );
      await client.query("COMMIT");
      const b = balR.rows.length ? Math.max(0, Number(balR.rows[0].b)) : 0;
      return { ok: false, alreadyProcessed: true, newBalance: b };
    }
    await client.query(
      `INSERT INTO elix_wallet_balances (user_id, coin_balance, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         coin_balance = elix_wallet_balances.coin_balance + EXCLUDED.coin_balance,
         updated_at = NOW()`,
      [input.userId, coins],
    );
    // Paid coin lot — required in the same transaction as coin credit (fail closed).
    const unitPrice = await resolveCoinPurchaseVerifiedPrice({
      provider: input.provider === "google" ? "google" : "apple",
      productId: input.productId,
      applePayload: (input.applePayload as Record<string, unknown>) || null,
    });
    const units = Math.max(1, Math.floor(input.quantity ?? 1));
    // A purchase nobody paid for carries no provable value, so it gets none:
    // the lot stays unsettled with no GBP rather than borrowing the shelf price.
    const price = input.unpaidPurchase
      ? {
          grossPence: 0,
          appStoreDeductionPence: 0,
          taxDeductionPence: 0,
          processingDeductionPence: 0,
        }
      : {
          grossPence: unitPrice.grossPence * units,
          appStoreDeductionPence: unitPrice.appStoreDeductionPence * units,
          taxDeductionPence: unitPrice.taxDeductionPence * units,
          processingDeductionPence: unitPrice.processingDeductionPence * units,
        };
    const net =
      price.grossPence -
      price.appStoreDeductionPence -
      price.taxDeductionPence -
      price.processingDeductionPence;
    await createPaidCoinLot(client, {
      userId: input.userId,
      provider: input.provider,
      providerTransactionId: input.providerTransactionId,
      productId: input.productId,
      coins,
      grossPence: price.grossPence,
      netPence: Math.max(0, net),
      appStoreDeductionPence: price.appStoreDeductionPence,
      taxDeductionPence: price.taxDeductionPence,
      processingDeductionPence: price.processingDeductionPence,
      settled: price.grossPence > 0,
    });
    const googlePurchaseToken =
      input.provider === "google" ? String(input.googlePurchaseToken || "").trim() : "";
    await client.query(
      `INSERT INTO elix_processed_purchases
         (external_purchase_id, provider, product_id, user_id, google_purchase_token)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (external_purchase_id) DO UPDATE SET
         google_purchase_token = COALESCE(
           elix_processed_purchases.google_purchase_token,
           EXCLUDED.google_purchase_token
         )`,
      [
        `${input.provider}:${input.providerTransactionId}`,
        input.provider,
        input.productId,
        input.userId,
        googlePurchaseToken || null,
      ],
    );
    const balR = await client.query(
      `SELECT coin_balance::bigint AS b FROM elix_wallet_balances WHERE user_id = $1`,
      [input.userId],
    );
    await client.query("COMMIT");
    const newBalance = Math.max(0, Number(balR.rows[0]?.b ?? 0));
    return { ok: true, newBalance, ledgerId: String(ins.rows[0].id) };
  } catch (e: unknown) {
    try {
      await client.query("ROLLBACK");
    } catch (rbErr) {
      logger.error({ err: rbErr }, "ROLLBACK failed");
    }
    const msg = e instanceof Error ? e.message : String(e);
    logger.error({ err: e }, "neonCreditIap failed");
    return { ok: false, error: msg || "credit_failed" };
  } finally {
    client.release();
  }
}

/**
 * Atomic paid-gift settlement: debit the sender's wallet AND credit the
 * recipient creator's pending earnings in a SINGLE database transaction.
 *
 * This closes the split-transaction gap where a committed debit could be
 * followed by a failed creator credit (sender charged, creator never paid).
 * Both sides commit together or not at all.
 *
 * Idempotent per clientTransactionId on both the debit (idempotency_key) and
 * the credit (earn:{clientTransactionId}). Retries cannot double-apply either side.
 *
 * CRITICAL: `coins` must be the purchased gift economic value only. Never pass
 * Battle Energy / Fan multipliers — Diamonds stay tied to purchased coin cost.
 */
export async function neonDebitGiftWithCreatorCredit(input: {
  userId: string;
  giftId: string;
  roomId: string;
  coins: number;
  clientTransactionId: string;
  creatorId: string;
}): Promise<
  | {
      ok: true;
      newBalance: number;
      alreadyProcessed: boolean;
      credited: number;
      /**
       * When this transaction was settled, as recorded in
       * `elix_gift_transactions.created_at` — the same row the WebSocket
       * `gift_sent` verification reads. Reported for the first settlement and
       * every replay of it.
       */
      settledAt: Date | null;
      /**
       * How long ago that settlement happened, measured by the database.
       *
       * The caller uses this to decide whether the gift may still be delivered,
       * because delivery side effects are only once-only while the transaction
       * claim that guards them is alive. It is measured here, next to the row,
       * because the app clock and the database clock are not the same clock:
       * comparing `Date.now()` against a stored timestamp made the REST path and
       * the WebSocket path (which asks in SQL) disagree about the age of the same
       * gift by the skew between the two hosts.
       *
       * null when the age could not be established, which fails the window closed.
       */
      settledAgeMs: number | null;
    }
  | {
      ok: false;
      error:
        | "insufficient_funds"
        | "invalid_amount"
        | "transaction_conflict"
        | "database_error";
      newBalance: number;
    }
> {
  const pool = getPool();
  if (!pool) return { ok: false, error: "invalid_amount", newBalance: 0 };
  const coins = Math.max(0, Math.floor(input.coins));
  if (coins <= 0) return { ok: false, error: "invalid_amount", newBalance: 0 };
  const idem = `gift:${input.userId}:${input.clientTransactionId}`;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existingGift = await client.query(
      `SELECT user_id, room_id, gift_id, coins, gift_source, created_at
         FROM elix_gift_transactions
        WHERE client_transaction_id = $1
        LIMIT 1`,
      [input.clientTransactionId],
    );
    if (
      existingGift.rows[0] &&
      (String(existingGift.rows[0].user_id) !== input.userId ||
        String(existingGift.rows[0].room_id) !== input.roomId ||
        String(existingGift.rows[0].gift_id) !== input.giftId ||
        Number(existingGift.rows[0].coins) !== coins ||
        existingGift.rows[0].gift_source === "starter_coins" ||
        existingGift.rows[0].gift_source === "promotional_coins")
    ) {
      await client.query("ROLLBACK");
      return { ok: false, error: "transaction_conflict", newBalance: 0 };
    }
    const ins = await client.query(
      `INSERT INTO elix_wallet_ledger (user_id, kind, coins_delta, gift_id, room_id, client_transaction_id, idempotency_key)
       VALUES ($1, 'gift_debit', $2, $3, $4, $5, $6)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING id`,
      [input.userId, -coins, input.giftId, input.roomId, input.clientTransactionId, idem],
    );
    const giftIns = await client.query(
      `INSERT INTO elix_gift_transactions (user_id, room_id, gift_id, coins, client_transaction_id, gift_source, created_at)
       VALUES ($1, $2, $3, $4, $5, 'paid_coins', NOW())
       ON CONFLICT (client_transaction_id) DO NOTHING
       RETURNING created_at`,
      [input.userId, input.roomId, input.giftId, coins, input.clientTransactionId],
    );

    const alreadyProcessed = ins.rowCount === 0;
    let newBalance: number;
    if (!alreadyProcessed) {
      const up = await client.query(
        `UPDATE elix_wallet_balances SET coin_balance = coin_balance - $2, updated_at = NOW()
         WHERE user_id = $1 AND coin_balance >= $2
         RETURNING coin_balance::bigint AS b`,
        [input.userId, coins],
      );
      if (up.rowCount === 0) {
        await client.query("ROLLBACK");
        const balR = await pool.query(
          `SELECT coin_balance::bigint AS b FROM elix_wallet_balances WHERE user_id = $1`,
          [input.userId],
        );
        const b = balR.rows.length ? Math.max(0, Number(balR.rows[0].b)) : 0;
        return { ok: false, error: "insufficient_funds", newBalance: b };
      }
      newBalance = Math.max(0, Number(up.rows[0].b));
    } else {
      const balR = await client.query(
        `SELECT coin_balance::bigint AS b FROM elix_wallet_balances WHERE user_id = $1`,
        [input.userId],
      );
      newBalance = balR.rows.length ? Math.max(0, Number(balR.rows[0].b)) : 0;
    }

    // Creator credit (same transaction). Idempotent via earn:{txid}.
    // Coin Diamonds and GBP ledger use the same monetisation split. Any failure
    // after this point rolls back the whole gift (wallet, lots, Diamonds, GBP).
    let credited = 0;
    if (input.creatorId && input.creatorId !== input.userId) {
      const cfg = await loadMonetisationConfig();
      // Diamonds are whole coins, so the creator share of a 1-coin gift rounds
      // down to zero. That is a rounding of the Diamond counter only — the money
      // is the GBP split below, so neither the earning row (which is also the
      // durable record of WHO this gift paid) nor the ledger may be skipped
      // because of it. Gating them on this number lost 100% of the revenue from
      // every 1-coin gift: sender debited, nothing recorded for anyone.
      const c = Math.floor((coins * cfg.giftCreatorPct) / 100);
      const earningId = `earn:${input.clientTransactionId}`;
      const earnIns = await client.query(
        `INSERT INTO elix_creator_earnings (id, creator_id, kind, coins, gift_id, room_id, sender_id, status)
           VALUES ($1, $2, 'gift', $3, $4, $5, $6, 'pending')
           ON CONFLICT (id) DO NOTHING
           RETURNING id`,
        [earningId, input.creatorId, c, input.giftId, input.roomId, input.userId],
      );
      // First settlement of this transaction: apply the creator side exactly once.
      if ((earnIns.rowCount ?? 0) > 0) {
        if (c > 0) {
          await client.query(
            `INSERT INTO elix_creator_balances (user_id, pending_coins, total_earned, updated_at)
             VALUES ($1, $2, $2, NOW())
             ON CONFLICT (user_id) DO UPDATE SET
               pending_coins = elix_creator_balances.pending_coins + EXCLUDED.pending_coins,
               total_earned = elix_creator_balances.total_earned + EXCLUDED.total_earned,
               updated_at = NOW()`,
            [input.creatorId, c],
          );
          credited = c;
        }

        if (cfg.giftMonetisationEnabled) {
          const attr = await consumeSettledNetForGift(client, input.userId, coins);
          if (attr.settled && attr.netPence > 0) {
            const split = splitNetRevenue(
              attr.netPence,
              cfg.giftCreatorPct,
              cfg.giftPlatformPct,
            );
            const ledger = await postLedgerEntry(client, {
              idempotencyKey: `paid_gift:${input.clientTransactionId}`,
              revenueSource: "PAID_GIFT",
              creatorUserId: input.creatorId,
              payerUserId: input.userId,
              giftId: input.giftId,
              liveRoomId: input.roomId,
              coinAmount: coins,
              coinSource: "paid",
              grossPence: attr.grossPence,
              appStoreDeductionPence: attr.appStoreDeductionPence,
              taxDeductionPence: attr.taxDeductionPence,
              processingDeductionPence: attr.processingDeductionPence,
              netRevenuePence: split.netPence,
              creatorPct: split.creatorPct,
              creatorAmountPence: split.creatorPence,
              platformPct: split.platformPct,
              platformAmountPence: split.platformPence,
              status: "pending",
              ruleSnapshot: ruleSnapshotFromConfig(cfg, {
                lot_ids: attr.lotIds,
                client_transaction_id: input.clientTransactionId,
              }),
            });
            if (ledger.id && !ledger.alreadyExisted) {
              await client.query(
                `UPDATE elix_creator_earnings
                      SET amount_pence = $2, ledger_id = $3, rule_snapshot = $4::jsonb
                    WHERE id = $1`,
                [
                  earningId,
                  split.creatorPence,
                  ledger.id,
                  JSON.stringify(ruleSnapshotFromConfig(cfg)),
                ],
              );
            }
          }
        }
      }
    }

    // The settlement time and its age both come from the row, in this
    // transaction, so a replay reports the original instant rather than the time
    // of the replay, and the age is on the database's clock — the same one the
    // WebSocket verification query compares against.
    let settledAt = toDateOrNull(giftIns.rows[0]?.created_at);
    let settledAgeMs = settledAt ? 0 : null;
    if (!settledAt) {
      // Either this is a replay, or a concurrent first settlement won the row
      // after our snapshot began. A fresh statement sees the committed row.
      const settled = await client.query(
        `SELECT created_at,
                GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (clock_timestamp() - created_at)) * 1000))::bigint AS age_ms
           FROM elix_gift_transactions
          WHERE client_transaction_id = $1
          LIMIT 1`,
        [input.clientTransactionId],
      );
      settledAt = toDateOrNull(settled.rows[0]?.created_at);
      const age = Number(settled.rows[0]?.age_ms);
      settledAgeMs = Number.isFinite(age) ? age : null;
    }

    await client.query("COMMIT");
    return {
      ok: true,
      newBalance,
      alreadyProcessed,
      credited,
      settledAt,
      settledAgeMs,
    };
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch (rbErr) {
      logger.error({ err: rbErr }, "neonDebitGiftWithCreatorCredit ROLLBACK failed");
    }
    logger.error(
      { err: e, userId: input.userId, giftId: input.giftId, roomId: input.roomId },
      "neonDebitGiftWithCreatorCredit: unexpected database error",
    );
    const balR = await pool
      .query(`SELECT coin_balance::bigint AS b FROM elix_wallet_balances WHERE user_id = $1`, [
        input.userId,
      ])
      .catch(() => ({ rows: [] as { b: string }[] }));
    const b = balR.rows?.length ? Math.max(0, Number(balR.rows[0].b)) : 0;
    return { ok: false, error: "database_error", newBalance: b };
  } finally {
    client.release();
  }
}

/** Hours gift earnings stay pending before becoming withdrawable. */
export function creatorEarningHoldHours(): number {
  const n = Number(process.env.CREATOR_EARNING_HOLD_HOURS ?? 72);
  return Number.isFinite(n) && n >= 0 ? Math.min(720, Math.floor(n)) : 72;
}

/** Move matured pending gift earnings into available_coins (refund-window hold). */
export async function neonMatureCreatorEarnings(): Promise<number> {
  const pool = getPool();
  if (!pool) return 0;
  const holdHours = creatorEarningHoldHours();
  const client = await pool.connect();
  let matured = 0;
  try {
    await client.query("BEGIN");
    const due = await client.query(
      `SELECT id, creator_id, coins
         FROM elix_creator_earnings
        WHERE status = 'pending'
          AND kind = 'gift'
          AND created_at <= NOW() - ($1::text || ' hours')::interval
        ORDER BY created_at ASC
        LIMIT 200
        FOR UPDATE SKIP LOCKED`,
      [String(holdHours)],
    );
    for (const row of due.rows || []) {
      const id = String(row.id);
      const creatorId = String(row.creator_id);
      const coins = Math.floor(Number(row.coins) || 0);
      if (!id || !creatorId) continue;
      const upd = await client.query(
        `UPDATE elix_creator_earnings SET status = 'available'
          WHERE id = $1 AND status = 'pending'
          RETURNING id`,
        [id],
      );
      if (!upd.rowCount) continue;
      // A gift whose creator share rounds below one Diamond still matures: its
      // money is the GBP amount on the row. Leaving it pending would park it at
      // the head of this scan forever and starve the earnings behind it.
      if (coins > 0) {
        await client.query(
          `UPDATE elix_creator_balances
            SET pending_coins = GREATEST(0, pending_coins - $2),
                available_coins = available_coins + $2,
                updated_at = NOW()
          WHERE user_id = $1`,
          [creatorId, coins],
        );
      }
      matured += 1;
    }
    await client.query("COMMIT");
    return matured;
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch (rbErr) {
      logger.error({ err: rbErr }, "neonMatureCreatorEarnings ROLLBACK failed");
    }
    logger.warn({ err: e }, "neonMatureCreatorEarnings failed");
    return 0;
  } finally {
    client.release();
  }
}

/**
 * Reverse a credited IAP after a store refund/void.
 * Also reverses still-pending gift earnings from that buyer (collusion window).
 */
export async function neonReverseIapPurchase(input: {
  provider: "google" | "apple";
  providerTransactionId: string;
}): Promise<
  | { ok: true; alreadyProcessed: boolean; reversedCoins: number }
  | { ok: false; error: string }
> {
  const pool = getPool();
  if (!pool) return { ok: false, error: "no_pool" };
  const txnId = input.providerTransactionId.trim();
  if (!txnId) return { ok: false, error: "missing_transaction" };
  const refundIdem = `iap_refund:${input.provider}:${txnId}`;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const dup = await client.query(
      `SELECT 1 FROM elix_wallet_ledger WHERE idempotency_key = $1 LIMIT 1`,
      [refundIdem],
    );
    if (dup.rowCount) {
      const gbpHeal = await reversePurchaseFinancialsOnClient(client, {
        provider: input.provider,
        providerTransactionId: txnId,
        kind: "REFUND_REVERSAL",
        webhookEventId: `iap_gbp_rev:${input.provider}:${txnId}`,
      });
      if (!gbpHeal.ok) {
        throw new Error("gbp_reverse_failed");
      }
      await client.query("COMMIT");
      return { ok: true, alreadyProcessed: true, reversedCoins: 0 };
    }
    const purchase = await client.query(
      `SELECT user_id, coins_delta, created_at
         FROM elix_wallet_ledger
        WHERE kind = 'iap_purchase'
          AND provider = $1
          AND provider_transaction_id = $2
        LIMIT 1
        FOR UPDATE`,
      [input.provider, txnId],
    );
    if (!purchase.rowCount) {
      await client.query("ROLLBACK");
      return { ok: false, error: "purchase_not_found" };
    }
    const userId = String(purchase.rows[0].user_id);
    const coins = Math.max(0, Math.floor(Number(purchase.rows[0].coins_delta) || 0));
    const purchasedAt = purchase.rows[0].created_at;
    if (coins > 0) {
      await client.query(
        `INSERT INTO elix_wallet_ledger
           (user_id, kind, coins_delta, provider, provider_transaction_id, product_id, idempotency_key, verification)
         VALUES ($1, 'iap_refund', $2, $3, $4, NULL, $5, $6::jsonb)`,
        [
          userId,
          -coins,
          input.provider,
          txnId,
          refundIdem,
          JSON.stringify({ reason: "store_void_or_refund" }),
        ],
      );
      await client.query(
        `UPDATE elix_wallet_balances
            SET coin_balance = GREATEST(0, coin_balance - $2), updated_at = NOW()
          WHERE user_id = $1`,
        [userId, coins],
      );
    } else {
      await client.query(
        `INSERT INTO elix_wallet_ledger
           (user_id, kind, coins_delta, provider, provider_transaction_id, product_id, idempotency_key, verification)
         VALUES ($1, 'iap_refund', 0, $2, $3, NULL, $4, $5::jsonb)
         ON CONFLICT (idempotency_key) DO NOTHING`,
        [
          userId,
          input.provider,
          txnId,
          refundIdem,
          JSON.stringify({ reason: "store_void_or_refund" }),
        ],
      );
    }

    // Reverse pending AND available gift earnings funded by this buyer.
    const earnings = await client.query(
      `SELECT id, creator_id, coins, status
         FROM elix_creator_earnings
        WHERE sender_id = $1
          AND status IN ('pending', 'available')
          AND kind = 'gift'
          AND created_at >= $2
        ORDER BY created_at ASC
        FOR UPDATE`,
      [userId, purchasedAt],
    );
    let remainingReversal = coins;
    for (const row of earnings.rows || []) {
      const earningId = String(row.id);
      const creatorId = String(row.creator_id);
      const earningCoins = Math.floor(Number(row.coins) || 0);
      const status = String(row.status);
      if (!earningId || !creatorId || earningCoins <= 0) continue;
      if (earningCoins > remainingReversal) continue;
      const flipped = await client.query(
        `UPDATE elix_creator_earnings SET status = 'reversed'
          WHERE id = $1 AND status IN ('pending', 'available')`,
        [earningId],
      );
      if (!flipped.rowCount) continue;
      if (status === "pending") {
        await client.query(
          `UPDATE elix_creator_balances
              SET pending_coins = GREATEST(0, pending_coins - $2), updated_at = NOW()
            WHERE user_id = $1`,
          [creatorId, earningCoins],
        );
      } else {
        await client.query(
          `UPDATE elix_creator_balances
              SET available_coins = GREATEST(0, available_coins - $2), updated_at = NOW()
            WHERE user_id = $1`,
          [creatorId, earningCoins],
        );
      }
      remainingReversal -= earningCoins;
      if (remainingReversal <= 0) break;
    }

    const gbp = await reversePurchaseFinancialsOnClient(client, {
      provider: input.provider,
      providerTransactionId: txnId,
      kind: "REFUND_REVERSAL",
      webhookEventId: `iap_gbp_rev:${input.provider}:${txnId}`,
    });
    if (!gbp.ok) {
      throw new Error("gbp_reverse_failed");
    }

    await client.query("COMMIT");
    return { ok: true, alreadyProcessed: false, reversedCoins: coins };
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch (rbErr) {
      logger.error({ err: rbErr }, "neonReverseIapPurchase ROLLBACK failed");
    }
    const msg = e instanceof Error ? e.message : String(e);
    logger.error({ err: e, provider: input.provider, txnId }, "neonReverseIapPurchase failed");
    return { ok: false, error: msg || "reverse_failed" };
  } finally {
    client.release();
  }
}

export async function neonInsertPromotePurchase(row: {
  userId: string;
  provider: string;
  providerTransactionId: string;
  productId: string;
  contentType: string;
  contentId: string;
  goal: string;
  amountGbp: number;
}): Promise<void> {
  const pool = getPool();
  if (!pool) throw new Error("DATABASE_UNAVAILABLE");
  const grossPence = Math.round(Math.max(0, Number(row.amountGbp) || 0) * 100);
  const params = [
    row.userId,
    row.provider,
    row.providerTransactionId,
    row.productId,
    row.contentType,
    row.contentId,
    row.goal,
    row.amountGbp,
    grossPence,
  ];
  try {
    await pool.query(
      `INSERT INTO elix_promote_purchases
         (user_id, provider, provider_transaction_id, product_id, content_type, content_id, goal, amount_gbp, gross_pence, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active')
       ON CONFLICT (provider_transaction_id) DO NOTHING`,
      params,
    );
  } catch (err) {
    // Pre-migration fallback (columns not yet present).
    logger.warn({ err }, "promote insert with gross_pence failed — falling back");
    await pool.query(
      `INSERT INTO elix_promote_purchases (user_id, provider, provider_transaction_id, product_id, content_type, content_id, goal, amount_gbp)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (provider_transaction_id) DO NOTHING`,
      params.slice(0, 8),
    );
  }
}

// --- Creator-specific Google Play subscription entitlements ---
// Rows live in elix_membership_purchases keyed by purchase_token_hash
// (sha256 hex — raw purchase tokens are never stored).

export type MembershipEntitlement = {
  id: string;
  userId: string;
  creatorId: string | null;
  productId: string | null;
  basePlanId: string | null;
  subscriptionState: string | null;
  expiresAt: string | null;
  autoRenewEnabled: boolean | null;
  acknowledgementState: string | null;
  latestOrderId: string | null;
};

type UpsertEntitlementOk = { ok: true; id: string; created: boolean };
type UpsertEntitlementErr = { ok: false; error: "ownership_conflict" | "database_error" };

/**
 * Atomically insert or refresh a creator-subscription entitlement keyed by
 * purchase token hash. Same-owner retries are idempotent updates; a token
 * already bound to another user or creator is rejected (fail closed).
 * Throws when the database pool is unavailable.
 */
export async function neonUpsertMembershipEntitlement(input: {
  userId: string;
  creatorId: string;
  provider: string;
  purchaseTokenHash: string;
  /** Defaults to token_sha256:<hash>; Apple should pass originalTransactionId. */
  providerTransactionId?: string;
  productId: string;
  basePlanId: string | null;
  subscriptionState: string;
  expiresAt: string | null;
  autoRenewEnabled: boolean;
  acknowledgementState: string | null;
  latestOrderId: string | null;
  linkedPurchaseTokenHash: string | null;
  verification: Record<string, unknown>;
}): Promise<UpsertEntitlementOk | UpsertEntitlementErr> {
  const pool = getPool();
  if (!pool) throw new Error("DATABASE_UNAVAILABLE");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query(
      `SELECT id, user_id, creator_id FROM elix_membership_purchases
        WHERE purchase_token_hash = $1
        LIMIT 1
        FOR UPDATE`,
      [input.purchaseTokenHash],
    );
    if (existing.rowCount) {
      const row = existing.rows[0];
      if (String(row.user_id) !== input.userId || String(row.creator_id ?? "") !== input.creatorId) {
        await client.query("ROLLBACK");
        logger.warn(
          {
            purchaseTokenHash: input.purchaseTokenHash,
            userId: input.userId,
            creatorId: input.creatorId,
          },
          "neonUpsertMembershipEntitlement: purchase token already bound to another owner",
        );
        return { ok: false, error: "ownership_conflict" };
      }
      await client.query(
        `UPDATE elix_membership_purchases SET
           product_id = $2,
           base_plan_id = $3,
           subscription_state = $4,
           expires_at = $5,
           auto_renew_enabled = $6,
           acknowledgement_state = $7,
           latest_order_id = $8,
           linked_purchase_token_hash = $9,
           verification = $10::jsonb,
           verified_at = NOW(),
           updated_at = NOW()
         WHERE id = $1`,
        [
          row.id,
          input.productId,
          input.basePlanId,
          input.subscriptionState,
          input.expiresAt,
          input.autoRenewEnabled,
          input.acknowledgementState,
          input.latestOrderId,
          input.linkedPurchaseTokenHash,
          JSON.stringify(input.verification ?? {}),
        ],
      );
      await client.query("COMMIT");
      return { ok: true, id: String(row.id), created: false };
    }
    const providerTxnId =
      (input.providerTransactionId && input.providerTransactionId.trim()) ||
      `token_sha256:${input.purchaseTokenHash}`;
    const ins = await client.query(
      `INSERT INTO elix_membership_purchases
         (user_id, creator_id, provider, provider_transaction_id, product_id, base_plan_id,
          purchase_token_hash, subscription_state, expires_at, auto_renew_enabled,
          acknowledgement_state, latest_order_id, linked_purchase_token_hash,
          verification, verified_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, NOW(), NOW())
       RETURNING id`,
      [
        input.userId,
        input.creatorId,
        input.provider,
        providerTxnId,
        input.productId,
        input.basePlanId,
        input.purchaseTokenHash,
        input.subscriptionState,
        input.expiresAt,
        input.autoRenewEnabled,
        input.acknowledgementState,
        input.latestOrderId,
        input.linkedPurchaseTokenHash,
        JSON.stringify(input.verification ?? {}),
      ],
    );
    await client.query("COMMIT");
    return { ok: true, id: String(ins.rows[0].id), created: true };
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch (rbErr) {
      logger.error({ err: rbErr }, "neonUpsertMembershipEntitlement ROLLBACK failed");
    }
    logger.error(
      { err: e, userId: input.userId, creatorId: input.creatorId },
      "neonUpsertMembershipEntitlement failed",
    );
    return { ok: false, error: "database_error" };
  } finally {
    client.release();
  }
}

/**
 * Active entitlement for viewer + creator, or null.
 * Entitled = ACTIVE, IN_GRACE_PERIOD, or CANCELED, all with a future expiry.
 * Fails closed: throws on DB unavailable or query error (never guesses).
 */
export async function neonGetActiveMembershipEntitlement(
  viewerId: string,
  creatorId: string,
): Promise<MembershipEntitlement | null> {
  const pool = getPool();
  if (!pool) throw new Error("DATABASE_UNAVAILABLE");
  try {
    const r = await pool.query(
      `SELECT id, user_id, creator_id, product_id, base_plan_id, subscription_state,
              expires_at, auto_renew_enabled, acknowledgement_state, latest_order_id
         FROM elix_membership_purchases
        WHERE user_id = $1
          AND creator_id = $2
          AND purchase_token_hash IS NOT NULL
          AND subscription_state IN ('ACTIVE', 'IN_GRACE_PERIOD', 'CANCELED')
          AND expires_at > NOW()
        ORDER BY expires_at DESC
        LIMIT 1`,
      [viewerId, creatorId],
    );
    if (!r.rowCount) return null;
    const row = r.rows[0];
    return {
      id: String(row.id),
      userId: String(row.user_id),
      creatorId: row.creator_id != null ? String(row.creator_id) : null,
      productId: row.product_id != null ? String(row.product_id) : null,
      basePlanId: row.base_plan_id != null ? String(row.base_plan_id) : null,
      subscriptionState: row.subscription_state != null ? String(row.subscription_state) : null,
      expiresAt: row.expires_at instanceof Date ? row.expires_at.toISOString() : row.expires_at != null ? String(row.expires_at) : null,
      autoRenewEnabled: row.auto_renew_enabled != null ? Boolean(row.auto_renew_enabled) : null,
      acknowledgementState:
        row.acknowledgement_state != null ? String(row.acknowledgement_state) : null,
      latestOrderId: row.latest_order_id != null ? String(row.latest_order_id) : null,
    };
  } catch (e) {
    logger.error(
      { err: e, viewerId, creatorId },
      "neonGetActiveMembershipEntitlement: database error — failing closed (throwing)",
    );
    throw e;
  }
}

/**
 * Apply an RTDN-driven state change by purchase token hash (never raw token).
 * Optional fields keep their stored value when not provided.
 * Throws when the database pool is unavailable.
 */
export async function neonUpdateMembershipSubscriptionState(input: {
  purchaseTokenHash: string;
  subscriptionState: string;
  expiresAt?: string | null;
  autoRenewEnabled?: boolean | null;
  acknowledgementState?: string | null;
  latestOrderId?: string | null;
}): Promise<
  | { ok: true; updated: true; userId: string; creatorId: string | null }
  | { ok: true; updated: false }
  | { ok: false; error: "database_error" }
> {
  const pool = getPool();
  if (!pool) throw new Error("DATABASE_UNAVAILABLE");
  try {
    const r = await pool.query(
      `UPDATE elix_membership_purchases SET
         subscription_state = $2,
         expires_at = COALESCE($3, expires_at),
         auto_renew_enabled = COALESCE($4, auto_renew_enabled),
         acknowledgement_state = COALESCE($5, acknowledgement_state),
         latest_order_id = COALESCE($6, latest_order_id),
         updated_at = NOW()
       WHERE purchase_token_hash = $1
       RETURNING user_id, creator_id`,
      [
        input.purchaseTokenHash,
        input.subscriptionState,
        input.expiresAt ?? null,
        input.autoRenewEnabled ?? null,
        input.acknowledgementState ?? null,
        input.latestOrderId ?? null,
      ],
    );
    if (!r.rowCount) return { ok: true, updated: false };
    return {
      ok: true,
      updated: true,
      userId: String(r.rows[0].user_id),
      creatorId: r.rows[0].creator_id != null ? String(r.rows[0].creator_id) : null,
    };
  } catch (e) {
    logger.error(
      { err: e, purchaseTokenHash: input.purchaseTokenHash },
      "neonUpdateMembershipSubscriptionState failed",
    );
    return { ok: false, error: "database_error" };
  }
}

/** Returns true only when a new purchase row was inserted (false = duplicate webhook delivery). */
export async function neonInsertShopPurchase(row: {
  stripeSessionId: string;
  itemId: string;
  buyerId: string;
  sellerId: string;
  amountGbp: number;
}): Promise<boolean> {
  const pool = getPool();
  if (!pool) return false;
  try {
    const r = await pool.query(
      `INSERT INTO elix_shop_purchases (stripe_session_id, item_id, buyer_id, seller_id, amount_gbp)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (stripe_session_id, item_id) DO NOTHING`,
      [row.stripeSessionId, row.itemId, row.buyerId, row.sellerId, row.amountGbp],
    );
    return (r.rowCount ?? 0) > 0;
  } catch (e) {
    logger.warn({ err: e }, "neonInsertShopPurchase failed");
    return false;
  }
}
