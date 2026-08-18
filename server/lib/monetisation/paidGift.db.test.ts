/**
 * Paid gift money path against a real Neon database.
 *
 * This exercises the production settlement function itself —
 * `neonDebitGiftWithCreatorCredit` — not a reimplementation of it, so the wallet
 * debit, the creator's Diamonds, the FIFO paid coin lots, the GBP ledger and the
 * 60/40 split are checked as they will actually run in production.
 *
 * Requires: TEST_DATABASE_URL + ALLOW_MONEY_IT_ON_URL=1
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import pg from "pg";
import { normalizeDatabaseUrl } from "../databaseUrl";
import {
  applyRepoMigrations,
  assertSafeTestDatabase,
  createTestPool,
} from "../testMigrationBootstrap";

const TEST_URL = normalizeDatabaseUrl((process.env.TEST_DATABASE_URL || "").trim());
const RUN = !!TEST_URL;

const CREATOR_PCT = 60;
const PLATFORM_PCT = 40;

describe.skipIf(!RUN)("Paid gift money path (real DB)", () => {
  let pool: pg.Pool;
  let debitGift: typeof import("../walletNeon").neonDebitGiftWithCreatorCredit;
  let matureEarnings: typeof import("../walletNeon").neonMatureCreatorEarnings;
  let suffix = "";

  beforeAll(async () => {
    assertSafeTestDatabase(TEST_URL);
    pool = createTestPool(TEST_URL, 6);
    await applyRepoMigrations(pool);

    // The settlement function takes its pool from the postgres module, so point
    // that module at the test database and let it connect the way it does in
    // production.
    process.env.DATABASE_URL = TEST_URL;
    const postgres = await import("../postgres");
    await postgres.connectPostgres();

    // Pin the split so the assertions are about the code, not about whatever a
    // config row happens to hold.
    await pool.query(
      `INSERT INTO elix_monetisation_config (id, gift_creator_pct, gift_platform_pct, gift_monetisation_enabled)
       VALUES ('default', $1, $2, TRUE)
       ON CONFLICT (id) DO UPDATE SET
         gift_creator_pct = EXCLUDED.gift_creator_pct,
         gift_platform_pct = EXCLUDED.gift_platform_pct,
         gift_monetisation_enabled = TRUE`,
      [CREATOR_PCT, PLATFORM_PCT],
    );
    const config = await import("./config");
    config.invalidateMonetisationConfigCache();

    const wallet = await import("../walletNeon");
    debitGift = wallet.neonDebitGiftWithCreatorCredit;
    matureEarnings = wallet.neonMatureCreatorEarnings;
  }, 180_000);

  afterAll(async () => {
    await pool?.end();
  });

  beforeEach(() => {
    suffix = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  });

  const sender = () => `u_gift_sender_${suffix}`;
  const creator = () => `u_gift_creator_${suffix}`;
  const room = () => `room_gift_${suffix}`;

  /** A sender holding `coins`, backed by one settled lot worth `netPence`. */
  async function fundSender(coins: number, netPence: number, grossPence = netPence * 2) {
    await pool.query(
      `INSERT INTO elix_wallet_balances (user_id, coin_balance) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET coin_balance = EXCLUDED.coin_balance`,
      [sender(), coins],
    );
    await pool.query(
      `INSERT INTO elix_paid_coin_lots (
         id, user_id, provider, provider_transaction_id, product_id,
         coins_original, coins_remaining, gross_pence,
         app_store_deduction_pence, tax_deduction_pence, processing_deduction_pence,
         net_pence, settlement_status, created_at, settled_at
       ) VALUES ($1,$2,'apple',$3,'coins_test',$4,$4,$5,$6,0,0,$7,'settled',
                 NOW() - INTERVAL '1 hour', NOW() - INTERVAL '1 hour')`,
      [
        `lot:apple:${suffix}`,
        sender(),
        `ptx_${suffix}`,
        coins,
        grossPence,
        grossPence - netPence,
        netPence,
      ],
    );
  }

  async function coinBalance(userId = sender()): Promise<number> {
    const r = await pool.query(
      `SELECT coin_balance::bigint AS b FROM elix_wallet_balances WHERE user_id = $1`,
      [userId],
    );
    return r.rows.length ? Number(r.rows[0].b) : -1;
  }

  async function debitRows(): Promise<number> {
    const r = await pool.query(
      `SELECT COUNT(*)::int AS c FROM elix_wallet_ledger
        WHERE user_id = $1 AND kind = 'gift_debit'`,
      [sender()],
    );
    return r.rows[0].c;
  }

  async function earning(txnId: string) {
    const r = await pool.query(
      `SELECT creator_id, coins, amount_pence, ledger_id, status
         FROM elix_creator_earnings WHERE id = $1`,
      [`earn:${txnId}`],
    );
    return r.rows[0] ?? null;
  }

  async function ledgerRow(txnId: string) {
    const r = await pool.query(
      `SELECT creator_user_id, payer_user_id, coin_amount, coin_source, revenue_source,
              gross_pence, net_revenue_pence, creator_pct, creator_amount_pence,
              platform_pct, platform_amount_pence
         FROM elix_financial_ledger WHERE idempotency_key = $1`,
      [`paid_gift:${txnId}`],
    );
    return r.rows[0] ?? null;
  }

  async function lotRemaining(): Promise<number> {
    const r = await pool.query(
      `SELECT coins_remaining FROM elix_paid_coin_lots WHERE id = $1`,
      [`lot:apple:${suffix}`],
    );
    return r.rows.length ? Number(r.rows[0].coins_remaining) : -1;
  }

  async function platformPending(): Promise<number> {
    const r = await pool.query(
      `SELECT pending_pence FROM elix_platform_wallet_gbp WHERE id = 'default'`,
    );
    return r.rows.length ? Number(r.rows[0].pending_pence) : 0;
  }

  async function creatorPending(): Promise<number> {
    const r = await pool.query(
      `SELECT pending_pence FROM elix_creator_wallet_gbp WHERE user_id = $1`,
      [creator()],
    );
    return r.rows.length ? Number(r.rows[0].pending_pence) : 0;
  }

  const send = (coins: number, txnId: string, giftId = "crown") =>
    debitGift({
      userId: sender(),
      giftId,
      roomId: room(),
      coins,
      clientTransactionId: txnId,
      creatorId: creator(),
    });

  it("settles one gift: sender debited once, creator 60%, platform 40%, ledger written", async () => {
    await fundSender(1000, 400);
    const platformBefore = await platformPending();
    const txn = `tx_ok_${suffix}`;

    const result = await send(100, txn);

    expect(result.ok).toBe(true);
    if (result.ok !== true) return;
    expect(result.alreadyProcessed).toBe(false);
    expect(await coinBalance()).toBe(900);
    expect(await debitRows()).toBe(1);
    expect(await lotRemaining()).toBe(900);

    // Diamonds: 60% of the coin cost, floored.
    expect(result.credited).toBe(60);
    expect(await earning(txn)).toMatchObject({ creator_id: creator(), coins: 60 });

    // GBP: 100 of 1000 coins is 40p of the lot's net, split 60/40.
    const ledger = await ledgerRow(txn);
    expect(ledger).toMatchObject({
      revenue_source: "PAID_GIFT",
      creator_user_id: creator(),
      payer_user_id: sender(),
      coin_amount: 100,
      coin_source: "paid",
      net_revenue_pence: 40,
      creator_pct: CREATOR_PCT,
      creator_amount_pence: 24,
      platform_pct: PLATFORM_PCT,
      platform_amount_pence: 16,
    });
    expect(Number(ledger.creator_amount_pence) + Number(ledger.platform_amount_pence)).toBe(
      Number(ledger.net_revenue_pence),
    );
    expect(await creatorPending()).toBe(24);
    expect(await platformPending()).toBe(platformBefore + 16);
  });

  it("records the revenue of a 1-coin gift even though its Diamonds round to zero", async () => {
    // A rose costs 1 coin, and 60% of one coin is not a whole Diamond. That must
    // not stop the money being recorded: the sender really paid, so both the
    // creator's share and the platform's share have to land in the ledger.
    await fundSender(10, 100);
    const platformBefore = await platformPending();
    const txn = `tx_rose_${suffix}`;

    const result = await send(1, txn, "rose");

    expect(result.ok).toBe(true);
    if (result.ok !== true) return;
    expect(result.credited).toBe(0);
    expect(await coinBalance()).toBe(9);
    expect(await lotRemaining()).toBe(9);

    // The earning row still exists: it is the durable record of WHICH creator
    // this gift paid, which the live delivery path relies on.
    expect(await earning(txn)).toMatchObject({ creator_id: creator(), coins: 0 });

    const ledger = await ledgerRow(txn);
    expect(ledger).toMatchObject({
      net_revenue_pence: 10,
      creator_amount_pence: 6,
      platform_amount_pence: 4,
    });
    expect(await creatorPending()).toBe(6);
    expect(await platformPending()).toBe(platformBefore + 4);
  });

  it("a lot spent one coin at a time still pays out its whole net revenue", async () => {
    // Ten 1-coin gifts from a 10-coin lot worth 7p. Allocating each gift's share
    // on its own would floor 0.7p to nothing ten times over and record no
    // revenue at all for a fully spent lot.
    await fundSender(10, 7);
    const platformBefore = await platformPending();

    for (let i = 0; i < 10; i += 1) {
      const result = await send(1, `tx_drip_${suffix}_${i}`, "rose");
      expect(result.ok).toBe(true);
    }

    expect(await coinBalance()).toBe(0);
    expect(await lotRemaining()).toBe(0);

    const totals = await pool.query(
      `SELECT COALESCE(SUM(net_revenue_pence),0)::int AS net,
              COALESCE(SUM(creator_amount_pence),0)::int AS creator,
              COALESCE(SUM(platform_amount_pence),0)::int AS platform,
              COUNT(*)::int AS rows
         FROM elix_financial_ledger
        WHERE payer_user_id = $1 AND revenue_source = 'PAID_GIFT'`,
      [sender()],
    );
    expect(totals.rows[0].net).toBe(7);
    expect(totals.rows[0].creator + totals.rows[0].platform).toBe(7);
    expect(await creatorPending()).toBe(totals.rows[0].creator);
    expect(await platformPending()).toBe(platformBefore + totals.rows[0].platform);
  });

  it("spans multiple lots and takes the exact share of each", async () => {
    await fundSender(100, 50);
    await pool.query(
      `INSERT INTO elix_paid_coin_lots (
         id, user_id, provider, provider_transaction_id, product_id,
         coins_original, coins_remaining, gross_pence,
         app_store_deduction_pence, tax_deduction_pence, processing_deduction_pence,
         net_pence, settlement_status, created_at, settled_at
       ) VALUES ($1,$2,'google',$3,'coins_test',200,200,600,300,0,0,300,'settled',NOW(),NOW())`,
      [`lot:google:${suffix}`, sender(), `gtx_${suffix}`],
    );
    await pool.query(
      `UPDATE elix_wallet_balances SET coin_balance = 300 WHERE user_id = $1`,
      [sender()],
    );
    const txn = `tx_span_${suffix}`;

    const result = await send(150, txn);

    expect(result.ok).toBe(true);
    // FIFO: the whole 100-coin lot (50p) then 50 of the 200-coin lot (75p).
    expect(await lotRemaining()).toBe(0);
    const second = await pool.query(
      `SELECT coins_remaining FROM elix_paid_coin_lots WHERE id = $1`,
      [`lot:google:${suffix}`],
    );
    expect(Number(second.rows[0].coins_remaining)).toBe(150);
    const ledger = await ledgerRow(txn);
    expect(Number(ledger.net_revenue_pence)).toBe(125);
    expect(Number(ledger.creator_amount_pence)).toBe(75);
    expect(Number(ledger.platform_amount_pence)).toBe(50);
  });

  it("replaying the same transaction id debits, credits and records nothing twice", async () => {
    await fundSender(1000, 400);
    const txn = `tx_replay_${suffix}`;

    const first = await send(100, txn);
    const platformAfterFirst = await platformPending();
    const second = await send(100, txn);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (first.ok !== true || second.ok !== true) return;
    expect(second.alreadyProcessed).toBe(true);
    expect(await coinBalance()).toBe(900);
    expect(await debitRows()).toBe(1);
    expect(await lotRemaining()).toBe(900);
    expect(await creatorPending()).toBe(24);
    expect(await platformPending()).toBe(platformAfterFirst);

    const earnings = await pool.query(
      `SELECT COUNT(*)::int AS c FROM elix_creator_earnings WHERE creator_id = $1`,
      [creator()],
    );
    expect(earnings.rows[0].c).toBe(1);
    const ledgerRows = await pool.query(
      `SELECT COUNT(*)::int AS c FROM elix_financial_ledger WHERE payer_user_id = $1`,
      [sender()],
    );
    expect(ledgerRows.rows[0].c).toBe(1);

    // The replay reports the ORIGINAL settlement time, which is what tells the
    // caller whether this gift may still be delivered.
    expect(second.settledAt.getTime()).toBeLessThanOrEqual(first.settledAt.getTime() + 1000);
  });

  it("refuses to reuse a transaction id for a different gift", async () => {
    await fundSender(1000, 400);
    const txn = `tx_conflict_${suffix}`;

    expect((await send(100, txn)).ok).toBe(true);
    const conflict = await send(500, txn, "rocket");

    expect(conflict.ok).toBe(false);
    if (conflict.ok !== false) return;
    expect(conflict.error).toBe("transaction_conflict");
    expect(await coinBalance()).toBe(900);
    expect(await debitRows()).toBe(1);
  });

  it("pays nobody when the sender cannot afford the gift", async () => {
    await fundSender(10, 100);
    const platformBefore = await platformPending();
    const txn = `tx_poor_${suffix}`;

    const result = await send(500, txn);

    expect(result.ok).toBe(false);
    if (result.ok !== false) return;
    expect(result.error).toBe("insufficient_funds");
    expect(await coinBalance()).toBe(10);
    expect(await debitRows()).toBe(0);
    expect(await earning(txn)).toBeNull();
    expect(await ledgerRow(txn)).toBeNull();
    expect(await lotRemaining()).toBe(10);
    expect(await platformPending()).toBe(platformBefore);
  });

  it("concurrent gifts cannot overspend the wallet or go negative", async () => {
    await fundSender(100, 100);

    const results = await Promise.all([
      send(60, `tx_race_a_${suffix}`),
      send(60, `tx_race_b_${suffix}`),
      send(60, `tx_race_c_${suffix}`),
    ]);

    const ok = results.filter((r) => r.ok === true);
    expect(ok).toHaveLength(1);
    expect(await coinBalance()).toBe(40);
    expect(await debitRows()).toBe(1);
    expect(await lotRemaining()).toBe(40);
  });

  it("a creator gifting on their own live earns nothing and posts no revenue", async () => {
    await pool.query(
      `INSERT INTO elix_wallet_balances (user_id, coin_balance) VALUES ($1, 1000)
       ON CONFLICT (user_id) DO UPDATE SET coin_balance = 1000`,
      [sender()],
    );
    const platformBefore = await platformPending();
    const txn = `tx_self_${suffix}`;

    const result = await debitGift({
      userId: sender(),
      giftId: "crown",
      roomId: room(),
      coins: 100,
      clientTransactionId: txn,
      creatorId: sender(),
    });

    expect(result.ok).toBe(true);
    if (result.ok !== true) return;
    expect(result.credited).toBe(0);
    expect(await coinBalance()).toBe(900);
    expect(await earning(txn)).toBeNull();
    expect(await ledgerRow(txn)).toBeNull();
    expect(await platformPending()).toBe(platformBefore);
  });

  it("a gift whose Diamonds rounded to zero does not stall the maturation scan", async () => {
    // The scan takes the oldest pending gift earnings. A row it refuses to
    // resolve would sit at the head of that queue and starve every real earning
    // behind it.
    await fundSender(10, 100);
    const zeroTxn = `tx_mature_zero_${suffix}`;
    const paidTxn = `tx_mature_paid_${suffix}`;
    expect((await send(1, zeroTxn, "rose")).ok).toBe(true);
    expect((await send(9, paidTxn)).ok).toBe(true);
    // Oldest pending rows in the database, so this scan's `ORDER BY created_at
    // ASC LIMIT 200` is certain to reach them whatever else the test database
    // holds.
    await pool.query(
      `UPDATE elix_creator_earnings SET created_at = NOW() - INTERVAL '5 years' WHERE id IN ($1, $2)`,
      [`earn:${zeroTxn}`, `earn:${paidTxn}`],
    );

    await matureEarnings();

    expect(await earning(zeroTxn)).toMatchObject({ status: "available", coins: 0 });
    expect(await earning(paidTxn)).toMatchObject({ status: "available", coins: 5 });
    const balances = await pool.query(
      `SELECT pending_coins, available_coins FROM elix_creator_balances WHERE user_id = $1`,
      [creator()],
    );
    expect(Number(balances.rows[0].available_coins)).toBe(5);
    expect(Number(balances.rows[0].pending_coins)).toBe(0);
  });
});
