/**
 * Creator payout money path against a real Neon database.
 *
 * Exercises the production functions — `requestGbpWithdrawal`,
 * `applyGbpWithdrawalStatusOnClient` / `adminSetGbpWithdrawalStatus` and the gift
 * settlement + maturation they depend on — so the reservation, the idempotency
 * key, the state machine, the paid/failed/reversed money movements and creator
 * isolation are checked as they will actually run in production.
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

describe.skipIf(!RUN)("Creator payout money path (real DB)", () => {
  let pool: pg.Pool;
  let requestWithdrawal: typeof import("./gbpWithdrawals").requestGbpWithdrawal;
  let setStatus: typeof import("./gbpWithdrawals").adminSetGbpWithdrawalStatus;
  let debitGift: typeof import("../walletNeon").neonDebitGiftWithCreatorCredit;
  let matureGbp: typeof import("./ledger").matureGbpPendingEarnings;
  let suffix = "";

  beforeAll(async () => {
    assertSafeTestDatabase(TEST_URL);
    pool = createTestPool(TEST_URL, 8);
    await applyRepoMigrations(pool);

    process.env.DATABASE_URL = TEST_URL;
    const postgres = await import("../postgres");
    await postgres.connectPostgres();

    await pool.query(
      `INSERT INTO elix_monetisation_config
         (id, gift_creator_pct, gift_platform_pct, gift_monetisation_enabled,
          gift_settlement_hours, withdraw_min_pence, withdraw_max_pence)
       VALUES ('default', $1, $2, TRUE, 0, 0, NULL)
       ON CONFLICT (id) DO UPDATE SET
         gift_creator_pct = EXCLUDED.gift_creator_pct,
         gift_platform_pct = EXCLUDED.gift_platform_pct,
         gift_monetisation_enabled = TRUE,
         gift_settlement_hours = 0,
         withdraw_min_pence = 0,
         withdraw_max_pence = NULL`,
      [CREATOR_PCT, PLATFORM_PCT],
    );
    const config = await import("./config");
    config.invalidateMonetisationConfigCache();

    const withdrawals = await import("./gbpWithdrawals");
    requestWithdrawal = withdrawals.requestGbpWithdrawal;
    setStatus = withdrawals.adminSetGbpWithdrawalStatus;
    debitGift = (await import("../walletNeon")).neonDebitGiftWithCreatorCredit;
    matureGbp = (await import("./ledger")).matureGbpPendingEarnings;
  }, 180_000);

  afterAll(async () => {
    await pool?.end();
  });

  beforeEach(() => {
    suffix = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  });

  const creator = () => `u_wd_creator_${suffix}`;

  /** A creator with a payout method and `pence` already available. */
  async function fundCreator(pence: number, userId = creator()) {
    await pool.query(
      `INSERT INTO elix_payout_methods (user_id, type, details, is_default)
       VALUES ($1, 'bank', '{"account_name":"t","iban_or_account":"t"}'::jsonb, TRUE)`,
      [userId],
    );
    await pool.query(
      `INSERT INTO elix_creator_wallet_gbp (user_id, available_pence) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET available_pence = EXCLUDED.available_pence`,
      [userId, pence],
    );
  }

  async function wallet(userId = creator()) {
    const r = await pool.query(
      `SELECT pending_pence, available_pence, held_pence, withdrawn_pence, reversed_pence
         FROM elix_creator_wallet_gbp WHERE user_id = $1`,
      [userId],
    );
    const row = r.rows[0];
    return {
      pending: Number(row?.pending_pence) || 0,
      available: Number(row?.available_pence) || 0,
      held: Number(row?.held_pence) || 0,
      withdrawn: Number(row?.withdrawn_pence) || 0,
      reversed: Number(row?.reversed_pence) || 0,
    };
  }

  async function withdrawalStatus(id: string): Promise<string> {
    const r = await pool.query(
      `SELECT status FROM elix_creator_withdrawals_gbp WHERE id = $1`,
      [id],
    );
    return String(r.rows[0]?.status ?? "missing");
  }

  /**
   * Maturation takes 200 rows at a time and the shared test database carries
   * pending rows from other suites, so drain it rather than assume one pass
   * reaches this creator.
   */
  async function matureAll(): Promise<void> {
    for (let i = 0; i < 20; i += 1) {
      if ((await matureGbp(0)) === 0) return;
    }
  }

  async function inTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const out = await fn(client);
      await client.query("COMMIT");
      return out;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * A matured creator earning posted through the ledger, so a later refund can
   * reverse the real row. The platform share is left out of these two cases to
   * keep them off the single shared platform wallet row.
   */
  async function earnViaLedger(pence: number): Promise<string> {
    await pool.query(
      `INSERT INTO elix_payout_methods (user_id, type, details, is_default)
       VALUES ($1, 'bank', '{"account_name":"t","iban_or_account":"t"}'::jsonb, TRUE)`,
      [creator()],
    );
    const { postLedgerEntry } = await import("./ledger");
    return await inTransaction(async (client) => {
      const row = await postLedgerEntry(client, {
        revenueSource: "PAID_GIFT",
        idempotencyKey: `earn_${pence}_${suffix}`,
        creatorUserId: creator(),
        grossPence: pence,
        netRevenuePence: pence,
        creatorPct: 100,
        creatorAmountPence: pence,
        platformPct: 0,
        platformAmountPence: 0,
        status: "available",
        ruleSnapshot: { reason: "test_earning" },
      });
      return row.id;
    });
  }

  /** The refund of a paid gift, through the production reversal path. */
  async function refund(originalLedgerId: string): Promise<void> {
    const { reverseLedgerEntry } = await import("./ledger");
    await inTransaction(async (client) => {
      const reversed = await reverseLedgerEntry(
        client,
        originalLedgerId,
        `refund_${originalLedgerId}`,
        "REFUND_REVERSAL",
      );
      if (!reversed) throw new Error("reversal did not post");
    });
  }

  async function ledgerCount(source: string, withdrawalId: string): Promise<number> {
    const r = await pool.query(
      `SELECT COUNT(*)::int AS c FROM elix_financial_ledger
        WHERE revenue_source = $1 AND (rule_snapshot->>'withdrawal_id') = $2`,
      [source, withdrawalId],
    );
    return Number(r.rows[0].c);
  }

  // ── Reservation + amount ────────────────────────────────────────

  it("reserves the amount from available and records a pending withdrawal", async () => {
    await fundCreator(10_000);
    const r = await requestWithdrawal({
      creatorUserId: creator(),
      amountPence: 4_000,
      idempotencyKey: `k_ok_${suffix}`,
    });
    expect(r.ok).toBe(true);
    if (r.ok !== true) return;
    expect(r.status).toBe("pending");
    expect(await wallet()).toMatchObject({ available: 6_000, held: 4_000 });
    expect(await ledgerCount("WITHDRAWAL", r.id)).toBe(1);
  });

  it("refuses more than the available balance and moves no money", async () => {
    await fundCreator(1_000);
    const r = await requestWithdrawal({
      creatorUserId: creator(),
      amountPence: 1_001,
      idempotencyKey: `k_over_${suffix}`,
    });
    expect(r).toMatchObject({ ok: false, error: "insufficient_available" });
    expect(await wallet()).toMatchObject({ available: 1_000, held: 0 });
  });

  it("refuses zero, negative and non-finite amounts", async () => {
    await fundCreator(5_000);
    for (const amount of [0, -500, Number.NaN, Number.POSITIVE_INFINITY]) {
      const r = await requestWithdrawal({
        creatorUserId: creator(),
        amountPence: amount,
        idempotencyKey: `k_bad_${amount}_${suffix}`,
      });
      expect(r).toMatchObject({ ok: false, error: "invalid_amount" });
    }
    expect(await wallet()).toMatchObject({ available: 5_000, held: 0 });
  });

  // ── Idempotency ─────────────────────────────────────────────────

  it("returns the same withdrawal for a retry and reserves the money once", async () => {
    await fundCreator(10_000);
    const key = `k_retry_${suffix}`;
    const first = await requestWithdrawal({
      creatorUserId: creator(),
      amountPence: 2_500,
      idempotencyKey: key,
    });
    const second = await requestWithdrawal({
      creatorUserId: creator(),
      amountPence: 2_500,
      idempotencyKey: key,
    });
    expect(first.ok && second.ok).toBe(true);
    if (first.ok !== true || second.ok !== true) return;
    expect(second.id).toBe(first.id);
    expect(second.alreadyExists).toBe(true);
    expect(await wallet()).toMatchObject({ available: 7_500, held: 2_500 });
  });

  it("refuses another creator reusing an idempotency key", async () => {
    await fundCreator(10_000);
    const other = `u_wd_other_${suffix}`;
    await fundCreator(10_000, other);
    const key = `k_shared_${suffix}`;
    const mine = await requestWithdrawal({
      creatorUserId: creator(),
      amountPence: 1_000,
      idempotencyKey: key,
    });
    expect(mine.ok).toBe(true);

    const theirs = await requestWithdrawal({
      creatorUserId: other,
      amountPence: 1_000,
      idempotencyKey: key,
    });
    expect(theirs).toMatchObject({ ok: false, error: "idempotency_key_conflict" });
    // Their money is untouched, and they learned nothing about my withdrawal.
    expect(await wallet(other)).toMatchObject({ available: 10_000, held: 0 });
  });

  it("refuses the same key reused for a different amount", async () => {
    await fundCreator(10_000);
    const key = `k_amt_${suffix}`;
    await requestWithdrawal({
      creatorUserId: creator(),
      amountPence: 1_000,
      idempotencyKey: key,
    });
    const changed = await requestWithdrawal({
      creatorUserId: creator(),
      amountPence: 9_000,
      idempotencyKey: key,
    });
    expect(changed).toMatchObject({ ok: false, error: "idempotency_key_conflict" });
    expect(await wallet()).toMatchObject({ available: 9_000, held: 1_000 });
  });

  // ── Concurrency ─────────────────────────────────────────────────

  it("two simultaneous withdrawals for the whole balance: exactly one reserves it", async () => {
    await fundCreator(10_000);
    const [a, b] = await Promise.all([
      requestWithdrawal({
        creatorUserId: creator(),
        amountPence: 10_000,
        idempotencyKey: `k_racea_${suffix}`,
      }),
      requestWithdrawal({
        creatorUserId: creator(),
        amountPence: 10_000,
        idempotencyKey: `k_raceb_${suffix}`,
      }),
    ]);
    const wins = [a, b].filter((r) => r.ok === true);
    expect(wins).toHaveLength(1);
    const loser = [a, b].find((r) => r.ok === false);
    expect(loser).toMatchObject({ error: "insufficient_available" });
    const w = await wallet();
    expect(w.available).toBe(0);
    expect(w.held).toBe(10_000);
  });

  it("the same key from two devices at once settles as one withdrawal", async () => {
    await fundCreator(10_000);
    const key = `k_devices_${suffix}`;
    const results = await Promise.all([
      requestWithdrawal({ creatorUserId: creator(), amountPence: 3_000, idempotencyKey: key }),
      requestWithdrawal({ creatorUserId: creator(), amountPence: 3_000, idempotencyKey: key }),
    ]);
    expect(results.every((r) => r.ok === true)).toBe(true);
    const ids = new Set(results.map((r) => (r.ok === true ? r.id : "")));
    expect(ids.size).toBe(1);
    expect(await wallet()).toMatchObject({ available: 7_000, held: 3_000 });
    const rows = await pool.query(
      `SELECT COUNT(*)::int AS c FROM elix_creator_withdrawals_gbp WHERE idempotency_key = $1`,
      [key],
    );
    expect(rows.rows[0].c).toBe(1);
  });

  // ── Status transitions + money ──────────────────────────────────

  async function reserve(pence: number): Promise<string> {
    await fundCreator(pence);
    const r = await requestWithdrawal({
      creatorUserId: creator(),
      amountPence: pence,
      idempotencyKey: `k_res_${pence}_${suffix}`,
    });
    if (r.ok !== true) throw new Error(`reserve failed: ${r.error}`);
    return r.id;
  }

  it("paid moves held to withdrawn exactly once", async () => {
    const id = await reserve(5_000);
    const paid = await setStatus({
      withdrawalId: id,
      toStatus: "paid",
      adminUserId: "test",
      payoutProviderRef: `tr_${suffix}`,
    });
    expect(paid.ok).toBe(true);
    expect(await wallet()).toMatchObject({ available: 0, held: 0, withdrawn: 5_000 });

    // Redelivered confirmation: no second movement.
    const again = await setStatus({
      withdrawalId: id,
      toStatus: "paid",
      adminUserId: "test",
      payoutProviderRef: `tr_${suffix}`,
    });
    expect(again.ok).toBe(true);
    expect(await wallet()).toMatchObject({ held: 0, withdrawn: 5_000 });
  });

  it("failed before payment returns the money to available exactly once", async () => {
    const id = await reserve(5_000);
    const failed = await setStatus({
      withdrawalId: id,
      toStatus: "failed",
      adminUserId: "test",
      failureReason: "transfer_failed",
    });
    expect(failed.ok).toBe(true);
    expect(await wallet()).toMatchObject({ available: 5_000, held: 0, withdrawn: 0 });
    expect(await ledgerCount("PAYOUT_FAILURE", id)).toBe(1);

    // Redelivered failure: balance is not credited twice.
    await setStatus({ withdrawalId: id, toStatus: "failed", adminUserId: "test" });
    expect(await wallet()).toMatchObject({ available: 5_000, held: 0 });
    expect(await ledgerCount("PAYOUT_FAILURE", id)).toBe(1);
  });

  it("a reversal after paid gives the creator their money back", async () => {
    const id = await reserve(5_000);
    await setStatus({
      withdrawalId: id,
      toStatus: "paid",
      adminUserId: "test",
      payoutProviderRef: `tr_rev_${suffix}`,
    });
    expect(await wallet()).toMatchObject({ available: 0, withdrawn: 5_000 });

    const reversed = await setStatus({
      withdrawalId: id,
      toStatus: "failed",
      adminUserId: "system:stripe_webhook",
      failureReason: "transfer_reversed",
    });
    expect(reversed.ok).toBe(true);
    expect(await withdrawalStatus(id)).toBe("failed");
    expect(await wallet()).toMatchObject({ available: 5_000, withdrawn: 0, held: 0 });
    expect(await ledgerCount("PAYOUT_REVERSAL", id)).toBe(1);

    // Redelivered reversal: no second restore.
    await setStatus({
      withdrawalId: id,
      toStatus: "failed",
      adminUserId: "system:stripe_webhook",
      failureReason: "transfer_reversed",
    });
    expect(await wallet()).toMatchObject({ available: 5_000, withdrawn: 0 });
    expect(await ledgerCount("PAYOUT_REVERSAL", id)).toBe(1);
  });

  it("a late transfer.created cannot pay a withdrawal that already failed", async () => {
    const id = await reserve(5_000);
    await setStatus({ withdrawalId: id, toStatus: "failed", adminUserId: "test" });
    expect(await wallet()).toMatchObject({ available: 5_000, held: 0 });

    const stale = await setStatus({
      withdrawalId: id,
      toStatus: "paid",
      adminUserId: "system:stripe_connect",
      payoutProviderRef: `tr_stale_${suffix}`,
    });
    expect(stale).toMatchObject({ ok: false, error: "invalid_transition" });
    expect(await withdrawalStatus(id)).toBe("failed");
    // The restored balance was not also counted as withdrawn.
    expect(await wallet()).toMatchObject({ available: 5_000, withdrawn: 0 });
  });

  it("a cancelled withdrawal cannot later be marked paid", async () => {
    const id = await reserve(2_000);
    await setStatus({ withdrawalId: id, toStatus: "cancelled", adminUserId: "test" });
    const paid = await setStatus({
      withdrawalId: id,
      toStatus: "paid",
      adminUserId: "test",
      payoutProviderRef: `tr_cx_${suffix}`,
    });
    expect(paid).toMatchObject({ ok: false, error: "invalid_transition" });
    expect(await wallet()).toMatchObject({ available: 2_000, withdrawn: 0 });
  });

  it("one provider reference cannot settle two withdrawals", async () => {
    await fundCreator(10_000);
    const first = await requestWithdrawal({
      creatorUserId: creator(),
      amountPence: 1_000,
      idempotencyKey: `k_ref1_${suffix}`,
    });
    const second = await requestWithdrawal({
      creatorUserId: creator(),
      amountPence: 1_000,
      idempotencyKey: `k_ref2_${suffix}`,
    });
    if (first.ok !== true || second.ok !== true) throw new Error("setup failed");
    const ref = `tr_shared_${suffix}`;
    expect(
      await setStatus({
        withdrawalId: first.id,
        toStatus: "paid",
        adminUserId: "test",
        payoutProviderRef: ref,
      }),
    ).toMatchObject({ ok: true });
    expect(
      await setStatus({
        withdrawalId: second.id,
        toStatus: "paid",
        adminUserId: "test",
        payoutProviderRef: ref,
      }),
    ).toMatchObject({ ok: false, error: "duplicate_provider_ref" });
    expect(await wallet()).toMatchObject({ withdrawn: 1_000, held: 1_000 });
  });

  // ── Where payable money comes from ──────────────────────────────

  it("a gift pays out the creator's 60% only, and only after maturation", async () => {
    const sender = `u_wd_sender_${suffix}`;
    await pool.query(
      `INSERT INTO elix_wallet_balances (user_id, coin_balance) VALUES ($1, 1000)
       ON CONFLICT (user_id) DO UPDATE SET coin_balance = 1000`,
      [sender],
    );
    await pool.query(
      `INSERT INTO elix_paid_coin_lots (
         id, user_id, provider, provider_transaction_id, product_id,
         coins_original, coins_remaining, gross_pence,
         app_store_deduction_pence, tax_deduction_pence, processing_deduction_pence,
         net_pence, settlement_status, created_at, settled_at
       ) VALUES ($1,$2,'apple',$3,'coins_test',1000,1000,2000,1000,0,0,1000,'settled',
                 NOW() - INTERVAL '1 hour', NOW() - INTERVAL '1 hour')`,
      [`lot:wd:${suffix}`, sender, `ptx_wd_${suffix}`],
    );
    const sent = await debitGift({
      userId: sender,
      giftId: "crown",
      roomId: `room_wd_${suffix}`,
      coins: 1000,
      clientTransactionId: `tx_wd_${suffix}`,
      creatorId: creator(),
    });
    expect(sent.ok).toBe(true);

    // £10 of net revenue: creator 600p pending, platform 400p — not the creator's.
    expect(await wallet()).toMatchObject({ pending: 600, available: 0 });
    await pool.query(
      `INSERT INTO elix_payout_methods (user_id, type, details, is_default)
       VALUES ($1, 'bank', '{"account_name":"t","iban_or_account":"t"}'::jsonb, TRUE)`,
      [creator()],
    );
    const tooSoon = await requestWithdrawal({
      creatorUserId: creator(),
      amountPence: 600,
      idempotencyKey: `k_unmatured_${suffix}`,
    });
    expect(tooSoon).toMatchObject({ ok: false, error: "insufficient_available" });

    await matureAll();
    expect(await wallet()).toMatchObject({ pending: 0, available: 600 });

    // The full £10 of gift value is never withdrawable — only the 60%.
    const wholeGift = await requestWithdrawal({
      creatorUserId: creator(),
      amountPence: 1_000,
      idempotencyKey: `k_whole_${suffix}`,
    });
    expect(wholeGift).toMatchObject({ ok: false, error: "insufficient_available" });
    const share = await requestWithdrawal({
      creatorUserId: creator(),
      amountPence: 600,
      idempotencyKey: `k_share_${suffix}`,
    });
    expect(share.ok).toBe(true);
  });

  it("a creator paid only in test coins has nothing to withdraw", async () => {
    const sender = `u_test_sender_${suffix}`;
    // Test coins are issued without a paid lot, so there is no GBP behind them.
    await pool.query(
      `INSERT INTO elix_wallet_balances (user_id, coin_balance) VALUES ($1, 5000)
       ON CONFLICT (user_id) DO UPDATE SET coin_balance = 5000`,
      [sender],
    );
    const sent = await debitGift({
      userId: sender,
      giftId: "crown",
      roomId: `room_test_${suffix}`,
      coins: 1000,
      clientTransactionId: `tx_test_${suffix}`,
      creatorId: creator(),
    });
    expect(sent.ok).toBe(true);

    await matureAll();
    const w = await wallet();
    expect(w.pending).toBe(0);
    expect(w.available).toBe(0);

    await pool.query(
      `INSERT INTO elix_payout_methods (user_id, type, details, is_default)
       VALUES ($1, 'bank', '{"account_name":"t","iban_or_account":"t"}'::jsonb, TRUE)`,
      [creator()],
    );
    const r = await requestWithdrawal({
      creatorUserId: creator(),
      amountPence: 1,
      idempotencyKey: `k_test_coins_${suffix}`,
    });
    expect(r).toMatchObject({ ok: false, error: "insufficient_available" });
    const paidGiftLedger = await pool.query(
      `SELECT COUNT(*)::int AS c FROM elix_financial_ledger
        WHERE creator_user_id = $1 AND revenue_source = 'PAID_GIFT'`,
      [creator()],
    );
    expect(paidGiftLedger.rows[0].c).toBe(0);
  });

  it("a refund does not raid pence already reserved for a payout", async () => {
    const earning = await earnViaLedger(5_000);
    const requested = await requestWithdrawal({
      creatorUserId: creator(),
      amountPence: 5_000,
      idempotencyKey: `k_refund_hold_${suffix}`,
    });
    if (requested.ok !== true) throw new Error(`reserve failed: ${requested.error}`);
    expect(await wallet()).toMatchObject({ available: 0, held: 5_000 });

    // The gift behind these earnings is refunded while the transfer is in
    // flight. Those pence are going to Stripe regardless, so the reversal
    // records what it could not claw back instead of emptying the hold.
    await refund(earning);

    const afterRefund = await wallet();
    expect(afterRefund.held).toBe(5_000);
    expect(afterRefund.available).toBe(0);
    const recoverable = await pool.query(
      `SELECT recoverable_pence::int AS r FROM elix_creator_wallet_gbp WHERE user_id = $1`,
      [creator()],
    );
    expect(recoverable.rows[0].r).toBe(5_000);

    // The payout still settles against its own hold, exactly once.
    await setStatus({
      withdrawalId: requested.id,
      toStatus: "paid",
      adminUserId: "test",
      payoutProviderRef: `tr_refund_${suffix}`,
    });
    expect(await wallet()).toMatchObject({ held: 0, withdrawn: 5_000, available: 0 });
  });

  it("a refund claws back available earnings that are not reserved", async () => {
    const earning = await earnViaLedger(2_000);
    expect(await wallet()).toMatchObject({ available: 2_000, held: 0 });

    await refund(earning);

    const w = await wallet();
    expect(w.available).toBe(0);
    expect(w.reversed).toBe(2_000);
    const recoverable = await pool.query(
      `SELECT recoverable_pence::int AS r FROM elix_creator_wallet_gbp WHERE user_id = $1`,
      [creator()],
    );
    expect(recoverable.rows[0].r).toBe(0);
  });

  it("one creator withdrawing leaves another creator's balance alone", async () => {
    const a = `u_iso_a_${suffix}`;
    const b = `u_iso_b_${suffix}`;
    await fundCreator(8_000, a);
    await fundCreator(3_000, b);

    const r = await requestWithdrawal({
      creatorUserId: a,
      amountPence: 8_000,
      idempotencyKey: `k_iso_${suffix}`,
    });
    expect(r.ok).toBe(true);
    if (r.ok !== true) return;
    await setStatus({
      withdrawalId: r.id,
      toStatus: "paid",
      adminUserId: "test",
      payoutProviderRef: `tr_iso_${suffix}`,
    });

    expect(await wallet(a)).toMatchObject({ available: 0, withdrawn: 8_000 });
    expect(await wallet(b)).toMatchObject({ available: 3_000, held: 0, withdrawn: 0 });
  });

  it("a withdrawal request never reads another creator's wallet", async () => {
    const a = `u_own_a_${suffix}`;
    const b = `u_own_b_${suffix}`;
    await fundCreator(9_000, a);
    await fundCreator(0, b);
    const r = await requestWithdrawal({
      creatorUserId: b,
      amountPence: 9_000,
      idempotencyKey: `k_own_${suffix}`,
    });
    expect(r).toMatchObject({ ok: false, error: "insufficient_available" });
    expect(await wallet(a)).toMatchObject({ available: 9_000, held: 0 });
  });
});
