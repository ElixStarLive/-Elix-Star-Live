/**
 * Payment + wallet persistence on Neon / Postgres (DATABASE_URL + pg pool).
 *
 * Only reads/writes tables named elix_* — does not use or modify your existing Neon tables.
 * `initWalletPaymentTables` runs from initPostgres (same DATABASE_URL) so elix_* exist on boot.
 */

import type pg from "pg";
import { getPool } from "./postgres";
import { logger } from "./logger";

export async function initWalletPaymentTables(pool: pg.Pool): Promise<void> {
  await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`).catch(() => {});
  await pool.query(`
    CREATE TABLE IF NOT EXISTS elix_wallet_balances (
      user_id TEXT PRIMARY KEY,
      coin_balance BIGINT NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      CONSTRAINT elix_wallet_balance_nn CHECK (coin_balance >= 0)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS elix_wallet_ledger (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      coins_delta INTEGER NOT NULL,
      provider TEXT,
      provider_transaction_id TEXT,
      product_id TEXT,
      gift_id TEXT,
      room_id TEXT,
      client_transaction_id TEXT,
      idempotency_key TEXT NOT NULL UNIQUE,
      verification JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_elix_ledger_user_time ON elix_wallet_ledger (user_id, created_at DESC)`,
  );
  await pool.query(`
    CREATE TABLE IF NOT EXISTS elix_promote_purchases (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      provider_transaction_id TEXT NOT NULL UNIQUE,
      product_id TEXT NOT NULL,
      content_type TEXT,
      content_id TEXT,
      goal TEXT NOT NULL,
      amount_gbp NUMERIC,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS elix_membership_purchases (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id TEXT NOT NULL,
      creator_id TEXT,
      provider TEXT NOT NULL,
      provider_transaction_id TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS elix_shop_purchases (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      stripe_session_id TEXT NOT NULL UNIQUE,
      item_id TEXT NOT NULL,
      buyer_id TEXT NOT NULL,
      seller_id TEXT NOT NULL,
      amount_gbp NUMERIC,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

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
  if (!pool) return false;
  try {
    const r = await pool.query(
      `SELECT 1 FROM elix_wallet_ledger WHERE kind = 'iap_purchase' AND provider = $1 AND provider_transaction_id = $2 LIMIT 1`,
      [provider, providerTransactionId],
    );
    return r.rows.length > 0;
  } catch {
    return false;
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
    } catch {
      /* noop */
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
  | { ok: false; error: "insufficient_funds" | "invalid_amount"; newBalance: number }
> {
  const pool = getPool();
  if (!pool) return { ok: false, error: "invalid_amount", newBalance: 0 };
  const coins = Math.max(0, Math.floor(input.coins));
  if (coins <= 0) return { ok: false, error: "invalid_amount", newBalance: 0 };
  const idem = `gift:${input.userId}:${input.clientTransactionId}`;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const ins = await client.query(
      `INSERT INTO elix_wallet_ledger (user_id, kind, coins_delta, gift_id, room_id, client_transaction_id, idempotency_key)
       VALUES ($1, 'gift_debit', $2, $3, $4, $5, $6)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING id`,
      [input.userId, -coins, input.giftId, input.roomId, input.clientTransactionId, idem],
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
    } catch {
      /* noop */
    }
    logger.error({ err: e }, "neonDebitGift failed");
    const balR = await pool
      .query(`SELECT coin_balance::bigint AS b FROM elix_wallet_balances WHERE user_id = $1`, [
        input.userId,
      ])
      .catch(() => ({ rows: [] as { b: string }[] }));
    const b = balR.rows?.length ? Math.max(0, Number(balR.rows[0].b)) : 0;
    return { ok: false, error: "insufficient_funds", newBalance: b };
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
  if (!pool) return;
  try {
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
  } catch (e) {
    logger.warn({ err: e }, "neonInsertPromotePurchase failed");
  }
}

export async function neonInsertMembershipPurchase(row: {
  userId: string;
  creatorId: string | null;
  provider: string;
  providerTransactionId: string;
}): Promise<void> {
  const pool = getPool();
  if (!pool) return;
  try {
    await pool.query(
      `INSERT INTO elix_membership_purchases (user_id, creator_id, provider, provider_transaction_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (provider_transaction_id) DO NOTHING`,
      [row.userId, row.creatorId, row.provider, row.providerTransactionId],
    );
  } catch (e) {
    logger.warn({ err: e }, "neonInsertMembershipPurchase failed");
  }
}

export async function neonInsertShopPurchase(row: {
  stripeSessionId: string;
  itemId: string;
  buyerId: string;
  sellerId: string;
  amountGbp: number;
}): Promise<void> {
  const pool = getPool();
  if (!pool) return;
  try {
    await pool.query(
      `INSERT INTO elix_shop_purchases (stripe_session_id, item_id, buyer_id, seller_id, amount_gbp)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (stripe_session_id) DO NOTHING`,
      [row.stripeSessionId, row.itemId, row.buyerId, row.sellerId, row.amountGbp],
    );
  } catch (e) {
    logger.warn({ err: e }, "neonInsertShopPurchase failed");
  }
}
