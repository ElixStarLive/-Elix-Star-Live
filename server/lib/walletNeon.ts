/**
 * Payment + wallet persistence on Neon / Postgres (DATABASE_URL + pg pool).
 * Wallet tables are created by SQL migrations (`npm run migrate`), not at app boot.
 */

import { getPool } from "./postgres";
import { logger } from "./logger";

export async function neonGetCoinBalance(userId: string): Promise<number | null> {
  const pool = getPool();
  if (!pool || !userId) return null;
  try {
    const r = await pool.query(
      `SELECT coin_balance::bigint AS b FROM elix_wallet_balances WHERE user_id = $1`,
      [userId],
    );
    if (r.rows.length === 0) return null;
    return Math.max(0, Number(r.rows[0].b));
  } catch (e) {
    logger.warn({ err: e }, "neonGetCoinBalance failed");
    return null;
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

export async function neonListLedger(userId: string, limit: number): Promise<
  Array<{
    id: string;
    type: "purchase" | "gift_debit";
    coinsDelta: number;
    createdAt: string;
    provider?: string;
    productId?: string;
    providerTransactionId?: string;
    giftId?: string;
    roomId?: string;
    clientTransactionId?: string;
    status: "completed";
  }>
> {
  const pool = getPool();
  if (!pool) return [];
  try {
    const r = await pool.query(
      `SELECT id, kind, coins_delta, provider, provider_transaction_id, product_id, gift_id, room_id, client_transaction_id, created_at
       FROM elix_wallet_ledger WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [userId, limit],
    );
    return (r.rows || []).map((row: Record<string, unknown>) => {
      const createdAt =
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : String(row.created_at ?? "");
      if (row.kind === "iap_purchase") {
        return {
          id: String(row.id),
          type: "purchase" as const,
          coinsDelta: Number(row.coins_delta),
          createdAt,
          provider: row.provider != null ? String(row.provider) : undefined,
          productId: row.product_id != null ? String(row.product_id) : undefined,
          providerTransactionId:
            row.provider_transaction_id != null ? String(row.provider_transaction_id) : undefined,
          status: "completed" as const,
        };
      }
      return {
        id: String(row.id),
        type: "gift_debit" as const,
        coinsDelta: Number(row.coins_delta),
        createdAt,
        giftId: row.gift_id != null ? String(row.gift_id) : undefined,
        roomId: row.room_id != null ? String(row.room_id) : undefined,
        clientTransactionId:
          row.client_transaction_id != null ? String(row.client_transaction_id) : undefined,
        status: "completed" as const,
      };
    });
  } catch (e) {
    logger.warn({ err: e }, "neonListLedger failed");
    return [];
  }
}

export async function neonDebitGift(input: {
  userId: string;
  giftId: string;
  roomId: string;
  coins: number;
  clientTransactionId: string;
}): Promise<
  | { ok: true; newBalance: number; alreadyProcessed: boolean }
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
      `SELECT user_id, room_id, gift_id, coins, gift_source
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
        existingGift.rows[0].gift_source === "starter_coins")
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
    // Gift-tx row must exist in the same commit so WS verification cannot see a
    // debit without a matching paid transaction record.
    await client.query(
      `INSERT INTO elix_gift_transactions (user_id, room_id, gift_id, coins, client_transaction_id, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (client_transaction_id) DO NOTHING`,
      [input.userId, input.roomId, input.giftId, coins, input.clientTransactionId],
    );
    if (ins.rowCount === 0) {
      const balR = await client.query(
        `SELECT coin_balance::bigint AS b FROM elix_wallet_balances WHERE user_id = $1`,
        [input.userId],
      );
      await client.query("COMMIT");
      const b = balR.rows.length ? Math.max(0, Number(balR.rows[0].b)) : 0;
      return { ok: true, newBalance: b, alreadyProcessed: true };
    }
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
    await client.query("COMMIT");
    return {
      ok: true,
      newBalance: Math.max(0, Number(up.rows[0].b)),
      alreadyProcessed: false,
    };
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch (rbErr) {
      logger.error({ err: rbErr }, "ROLLBACK failed");
    }
    logger.error(
      { err: e, userId: input.userId, giftId: input.giftId, roomId: input.roomId },
      "neonDebitGift: unexpected database error (not the normal insufficient_funds balance branch); returning insufficient_funds response shape",
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

/**
 * Credit a creator's earnings ledger + rolling balance for a received gift.
 * Idempotent per gift transaction (id derived from clientTransactionId) so a
 * retried REST call or duplicate delivery cannot double-credit the creator.
 * Revenue share is configurable via CREATOR_GIFT_SHARE_PERCENT (default 100).
 */
export async function neonCreditCreatorEarning(input: {
  creatorId: string;
  senderId: string;
  giftId: string;
  roomId: string;
  coins: number;
  clientTransactionId: string;
}): Promise<{ ok: boolean; credited: number }> {
  const pool = getPool();
  if (!pool) return { ok: false, credited: 0 };
  if (!input.creatorId || input.creatorId === input.senderId) {
    // Do not credit self-gifting or unresolved creators.
    return { ok: false, credited: 0 };
  }
  const sharePct = Math.min(
    100,
    Math.max(0, Number(process.env.CREATOR_GIFT_SHARE_PERCENT ?? 100)),
  );
  const credited = Math.floor((Math.max(0, Math.floor(input.coins)) * sharePct) / 100);
  if (credited <= 0) return { ok: true, credited: 0 };
  const earningId = `earn:${input.clientTransactionId}`;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Hold gift earnings in pending until the store refund window closes.
    // Maturation moves pending → available (see neonMatureCreatorEarnings).
    const ins = await client.query(
      `INSERT INTO elix_creator_earnings (id, creator_id, kind, coins, gift_id, room_id, sender_id, status)
       VALUES ($1, $2, 'gift', $3, $4, $5, $6, 'pending')
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      [earningId, input.creatorId, credited, input.giftId, input.roomId, input.senderId],
    );
    if (ins.rowCount === 0) {
      await client.query("COMMIT");
      return { ok: true, credited: 0 };
    }
    await client.query(
      `INSERT INTO elix_creator_balances (user_id, pending_coins, total_earned, updated_at)
       VALUES ($1, $2, $2, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         pending_coins = elix_creator_balances.pending_coins + EXCLUDED.pending_coins,
         total_earned = elix_creator_balances.total_earned + EXCLUDED.total_earned,
         updated_at = NOW()`,
      [input.creatorId, credited],
    );
    await client.query("COMMIT");
    return { ok: true, credited };
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch (rbErr) {
      logger.error({ err: rbErr }, "neonCreditCreatorEarning ROLLBACK failed");
    }
    logger.warn({ err: e, creatorId: input.creatorId }, "neonCreditCreatorEarning failed");
    return { ok: false, credited: 0 };
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
      if (!id || !creatorId || coins <= 0) continue;
      const upd = await client.query(
        `UPDATE elix_creator_earnings SET status = 'available'
          WHERE id = $1 AND status = 'pending'
          RETURNING id`,
        [id],
      );
      if (!upd.rowCount) continue;
      await client.query(
        `UPDATE elix_creator_balances
            SET pending_coins = GREATEST(0, pending_coins - $2),
                available_coins = available_coins + $2,
                updated_at = NOW()
          WHERE user_id = $1`,
        [creatorId, coins],
      );
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

    // Reverse pending gift earnings funded by this buyer during the hold window.
    const pending = await client.query(
      `SELECT id, creator_id, coins
         FROM elix_creator_earnings
        WHERE sender_id = $1
          AND status = 'pending'
          AND kind = 'gift'
          AND created_at >= $2
        ORDER BY created_at ASC
        FOR UPDATE`,
      [userId, purchasedAt],
    );
    let remainingReversal = coins;
    for (const row of pending.rows || []) {
      const earningId = String(row.id);
      const creatorId = String(row.creator_id);
      const earningCoins = Math.floor(Number(row.coins) || 0);
      if (!earningId || !creatorId || earningCoins <= 0) continue;
      // Never remove more creator earnings than the refunded purchase funded.
      if (earningCoins > remainingReversal) continue;
      await client.query(
        `UPDATE elix_creator_earnings SET status = 'reversed' WHERE id = $1 AND status = 'pending'`,
        [earningId],
      );
      await client.query(
        `UPDATE elix_creator_balances
            SET pending_coins = GREATEST(0, pending_coins - $2), updated_at = NOW()
          WHERE user_id = $1`,
        [creatorId, earningCoins],
      );
      remainingReversal -= earningCoins;
      if (remainingReversal <= 0) break;
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
  await pool.query(
    `INSERT INTO elix_promote_purchases (user_id, provider, provider_transaction_id, product_id, content_type, content_id, goal, amount_gbp)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (provider_transaction_id) DO NOTHING`,
    [
      row.userId,
      row.provider,
      row.providerTransactionId,
      row.productId,
      row.contentType,
      row.contentId,
      row.goal,
      row.amountGbp,
    ],
  );
}

export async function neonInsertMembershipPurchase(row: {
  userId: string;
  creatorId: string | null;
  provider: string;
  providerTransactionId: string;
}): Promise<void> {
  const pool = getPool();
  if (!pool) throw new Error("DATABASE_UNAVAILABLE");
  await pool.query(
    `INSERT INTO elix_membership_purchases (user_id, creator_id, provider, provider_transaction_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (provider_transaction_id) DO NOTHING`,
    [row.userId, row.creatorId, row.provider, row.providerTransactionId],
  );
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
