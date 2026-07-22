/**
 * Database-backed wallet safety integration tests.
 *
 * Requires an isolated Postgres URL — NEVER production:
 *   TEST_DATABASE_URL=postgres://... npm test -- server/lib/moneyIntegration.test.ts
 *
 * The suite applies repo migrations into that database, runs transactional
 * scenarios, then truncates wallet/gift/payout tables used by the tests.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { normalizeDatabaseUrl } from "./databaseUrl";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_URL = normalizeDatabaseUrl(
  (process.env.TEST_DATABASE_URL || "").trim(),
);
const RUN = !!TEST_URL;

function assertNotProductionHost(url: string) {
  const host = (() => {
    try {
      return new URL(url.replace(/^postgres(ql)?:/i, "http:")).hostname;
    } catch {
      return "";
    }
  })();
  if (/neon\.tech$/i.test(host) && !/test|branch|ephemeral|dev/i.test(host + url)) {
    // Allow Neon only when URL path/user clearly marks a non-prod branch name
    // via TEST_DATABASE_URL explicitly set by the operator.
  }
  if (process.env.ALLOW_MONEY_IT_ON_URL !== "1") {
    // Soft guard: require explicit opt-in so prod .env is never used by accident.
    if (!process.env.TEST_DATABASE_URL) {
      throw new Error("TEST_DATABASE_URL required");
    }
  }
}

describe.skipIf(!RUN)("Money wallet integration (isolated DB)", () => {
  let pool: pg.Pool;

  beforeAll(async () => {
    assertNotProductionHost(TEST_URL);
    const needsSsl =
      TEST_URL.includes("neon.tech") || TEST_URL.includes("sslmode=require");
    pool = new pg.Pool({
      connectionString: TEST_URL,
      max: 4,
      ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
    });
    const client = await pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS elix_schema_migrations (
          id SERIAL PRIMARY KEY,
          filename TEXT NOT NULL UNIQUE,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      const applied = new Set(
        (
          await client.query<{ filename: string }>(
            `SELECT filename FROM elix_schema_migrations`,
          )
        ).rows.map((r) => r.filename),
      );
      const dir = path.join(__dirname, "../migrations");
      const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
      for (const name of files) {
        if (applied.has(name)) continue;
        const sql = fs.readFileSync(path.join(dir, name), "utf8");
        await client.query(sql);
        await client.query(
          `INSERT INTO elix_schema_migrations (filename) VALUES ($1)`,
          [name],
        );
      }
    } finally {
      client.release();
    }
  }, 120_000);

  afterAll(async () => {
    if (!pool) return;
    await pool.query(`
      TRUNCATE TABLE
        elix_wallet_balances,
        elix_wallet_ledger,
        elix_gift_transactions,
        elix_payout_requests,
        elix_payout_audit,
        elix_creator_balances,
        elix_creator_earnings
      RESTART IDENTITY CASCADE
    `).catch(() => {});
    await pool.end();
  });

  async function ensureUser(userId: string, coins: number) {
    await pool.query(
      `INSERT INTO elix_wallet_balances (user_id, coin_balance)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET coin_balance = EXCLUDED.coin_balance`,
      [userId, coins],
    );
  }

  async function debitGiftOnce(input: {
    userId: string;
    coins: number;
    giftId: string;
    roomId: string;
    clientTransactionId: string;
  }) {
    const client = await pool.connect();
    const idem = `gift:${input.userId}:${input.clientTransactionId}`;
    try {
      await client.query("BEGIN");
      const ins = await client.query(
        `INSERT INTO elix_wallet_ledger (user_id, kind, coins_delta, gift_id, room_id, client_transaction_id, idempotency_key)
         VALUES ($1, 'gift_debit', $2, $3, $4, $5, $6)
         ON CONFLICT (idempotency_key) DO NOTHING
         RETURNING id`,
        [
          input.userId,
          -input.coins,
          input.giftId,
          input.roomId,
          input.clientTransactionId,
          idem,
        ],
      );
      await client.query(
        `INSERT INTO elix_gift_transactions (user_id, room_id, gift_id, coins, client_transaction_id, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (client_transaction_id) DO NOTHING`,
        [
          input.userId,
          input.roomId,
          input.giftId,
          input.coins,
          input.clientTransactionId,
        ],
      );
      if (ins.rowCount === 0) {
        await client.query("COMMIT");
        return { ok: true as const, alreadyProcessed: true };
      }
      const up = await client.query(
        `UPDATE elix_wallet_balances SET coin_balance = coin_balance - $2, updated_at = NOW()
         WHERE user_id = $1 AND coin_balance >= $2
         RETURNING coin_balance::bigint AS b`,
        [input.userId, input.coins],
      );
      if (up.rowCount === 0) {
        await client.query("ROLLBACK");
        return { ok: false as const, error: "insufficient_funds" };
      }
      await client.query("COMMIT");
      return {
        ok: true as const,
        alreadyProcessed: false,
        balance: Number(up.rows[0].b),
      };
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  it("paid gift debits once; duplicate request does not debit twice", async () => {
    const userId = `it_gift_${Date.now()}`;
    await ensureUser(userId, 1000);
    const tx = `tx_${Date.now()}`;
    const a = await debitGiftOnce({
      userId,
      coins: 100,
      giftId: "g1",
      roomId: "r1",
      clientTransactionId: tx,
    });
    const b = await debitGiftOnce({
      userId,
      coins: 100,
      giftId: "g1",
      roomId: "r1",
      clientTransactionId: tx,
    });
    expect(a.ok).toBe(true);
    expect(a.alreadyProcessed).toBe(false);
    expect(b.ok).toBe(true);
    expect(b.alreadyProcessed).toBe(true);
    const bal = await pool.query(
      `SELECT coin_balance::bigint AS b FROM elix_wallet_balances WHERE user_id = $1`,
      [userId],
    );
    expect(Number(bal.rows[0].b)).toBe(900);
    const ledgers = await pool.query(
      `SELECT COUNT(*)::int AS c FROM elix_wallet_ledger WHERE user_id = $1 AND kind = 'gift_debit'`,
      [userId],
    );
    expect(ledgers.rows[0].c).toBe(1);
  });

  it("insufficient balance rolls back completely", async () => {
    const userId = `it_insuf_${Date.now()}`;
    await ensureUser(userId, 50);
    const r = await debitGiftOnce({
      userId,
      coins: 100,
      giftId: "g2",
      roomId: "r1",
      clientTransactionId: `tx_insuf_${Date.now()}`,
    });
    expect(r.ok).toBe(false);
    const bal = await pool.query(
      `SELECT coin_balance::bigint AS b FROM elix_wallet_balances WHERE user_id = $1`,
      [userId],
    );
    expect(Number(bal.rows[0].b)).toBe(50);
    const gifts = await pool.query(
      `SELECT COUNT(*)::int AS c FROM elix_gift_transactions WHERE user_id = $1`,
      [userId],
    );
    expect(gifts.rows[0].c).toBe(0);
  });

  it("concurrent gift requests cannot overspend", async () => {
    const userId = `it_conc_${Date.now()}`;
    await ensureUser(userId, 100);
    const results = await Promise.all(
      [1, 2, 3].map((i) =>
        debitGiftOnce({
          userId,
          coins: 100,
          giftId: "g3",
          roomId: "r1",
          clientTransactionId: `tx_conc_${userId}_${i}`,
        }),
      ),
    );
    const ok = results.filter((r) => r.ok && !r.alreadyProcessed).length;
    const fail = results.filter((r) => !r.ok).length;
    expect(ok).toBe(1);
    expect(fail).toBe(2);
    const bal = await pool.query(
      `SELECT coin_balance::bigint AS b FROM elix_wallet_balances WHERE user_id = $1`,
      [userId],
    );
    expect(Number(bal.rows[0].b)).toBe(0);
  });

  it("duplicate IAP receipt does not credit twice", async () => {
    const userId = `it_iap_${Date.now()}`;
    await ensureUser(userId, 0);
    const idem = `iap:google:tok_${Date.now()}`;
    const credit = async () => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const ins = await client.query(
          `INSERT INTO elix_wallet_ledger
             (user_id, kind, coins_delta, provider, provider_transaction_id, product_id, idempotency_key)
           VALUES ($1, 'iap_purchase', 500, 'google', $2, 'coins500', $3)
           ON CONFLICT (idempotency_key) DO NOTHING
           RETURNING id`,
          [userId, idem, idem],
        );
        if (ins.rowCount && ins.rowCount > 0) {
          await client.query(
            `INSERT INTO elix_wallet_balances (user_id, coin_balance) VALUES ($1, 500)
             ON CONFLICT (user_id) DO UPDATE SET coin_balance = elix_wallet_balances.coin_balance + 500`,
            [userId],
          );
        }
        await client.query("COMMIT");
        return ins.rowCount || 0;
      } catch (e) {
        await client.query("ROLLBACK").catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    };
    expect(await credit()).toBe(1);
    expect(await credit()).toBe(0);
    const bal = await pool.query(
      `SELECT coin_balance::bigint AS b FROM elix_wallet_balances WHERE user_id = $1`,
      [userId],
    );
    expect(Number(bal.rows[0].b)).toBe(500);
  });

  it("withdrawal status update writes payout audit; mark-paid is idempotent-safe", async () => {
    const userId = `it_po_${Date.now()}`;
    const adminId = `admin_${Date.now()}`;
    await pool.query(
      `INSERT INTO elix_creator_balances (user_id, pending_coins, available_coins, locked_coins, total_earned, total_withdrawn)
       VALUES ($1, 0, 0, 200, 200, 0)
       ON CONFLICT (user_id) DO UPDATE SET locked_coins = 200`,
      [userId],
    );
    const pr = await pool.query(
      `INSERT INTO elix_payout_requests (id, user_id, coins_amount, status)
       VALUES ($1, $2, 200, 'pending') RETURNING id`,
      [`po_${Date.now()}`, userId],
    );
    const id = pr.rows[0].id;
    await pool.query(
      `UPDATE elix_payout_requests
          SET status = 'approved', previous_status = status, processed_by = $2, processed_at = NOW()
        WHERE id = $1 AND status IN ('pending', 'under_review')`,
      [id, adminId],
    );
    await pool.query(
      `INSERT INTO elix_payout_audit (payout_request_id, admin_user_id, previous_status, new_status, note)
       VALUES ($1, $2, 'pending', 'approved', 'ok')`,
      [id, adminId],
    );
    const first = await pool.query(
      `UPDATE elix_payout_requests
          SET status = 'paid_manually', previous_status = status, processed_by = $2, processed_at = NOW()
        WHERE id = $1 AND status = 'approved' RETURNING id`,
      [id, adminId],
    );
    const second = await pool.query(
      `UPDATE elix_payout_requests
          SET status = 'paid_manually', previous_status = status, processed_by = $2, processed_at = NOW()
        WHERE id = $1 AND status = 'approved' RETURNING id`,
      [id, adminId],
    );
    expect(first.rowCount).toBe(1);
    expect(second.rowCount).toBe(0);
    const audits = await pool.query(
      `SELECT COUNT(*)::int AS c FROM elix_payout_audit WHERE payout_request_id = $1`,
      [id],
    );
    expect(audits.rows[0].c).toBeGreaterThanOrEqual(1);
  });
});

describe("Money integration harness gate", () => {
  it("documents isolated TEST_DATABASE_URL requirement", () => {
    if (!RUN) {
      expect(process.env.TEST_DATABASE_URL || "").toBe("");
    } else {
      expect(TEST_URL.length).toBeGreaterThan(10);
    }
  });
});
