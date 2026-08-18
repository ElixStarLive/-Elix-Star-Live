/**
 * Apple IAP money path against a real Postgres database.
 *
 * This runs the production functions themselves — `neonCreditIap`,
 * `neonDebitGiftWithCreatorCredit` and `neonReverseIapPurchase` — so the whole
 * chain is proven as it will actually run: a verified Apple purchase becomes a
 * wallet credit, a purchase ledger row, a settled paid coin lot with GBP
 * provenance and a processed-purchase record in ONE transaction; a paid gift then
 * consumes that lot's value and splits it 60/40; and an Apple refund unwinds all
 * of it.
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

/** The Apple SKU and its catalogue price, as shipped in the migrations. */
const APPLE_PRODUCT_ID = "coins500";
const APPLE_PRODUCT_COINS = 500;
const APPLE_PRODUCT_PENCE = 175;

describe.skipIf(!RUN)("Apple IAP money path (real DB)", () => {
  let pool: pg.Pool;
  let creditIap: typeof import("../walletNeon").neonCreditIap;
  let debitGift: typeof import("../walletNeon").neonDebitGiftWithCreatorCredit;
  let reversePurchase: typeof import("../walletNeon").neonReverseIapPurchase;
  let suffix = "";

  beforeAll(async () => {
    assertSafeTestDatabase(TEST_URL);
    pool = createTestPool(TEST_URL, 8);
    await applyRepoMigrations(pool);

    process.env.DATABASE_URL = TEST_URL;
    const postgres = await import("../postgres");
    await postgres.connectPostgres();

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
    creditIap = wallet.neonCreditIap;
    debitGift = wallet.neonDebitGiftWithCreatorCredit;
    reversePurchase = wallet.neonReverseIapPurchase;
  }, 180_000);

  afterAll(async () => {
    await pool?.end();
  });

  beforeEach(() => {
    suffix = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  });

  const buyer = () => `u_apple_buyer_${suffix}`;
  const creator = () => `u_apple_creator_${suffix}`;
  const appleTxn = (tag = "a") => `2000000${tag}_${suffix}`;

  function buyCoins(
    transactionId: string,
    productId = APPLE_PRODUCT_ID,
    coins = APPLE_PRODUCT_COINS,
  ) {
    return creditIap({
      userId: buyer(),
      provider: "apple",
      providerTransactionId: transactionId,
      productId,
      coins,
      verification: {
        provider: "apple",
        verified: true,
        productId,
        environment: "Production",
        bundleId: "com.elixstarlive.app",
      },
      applePayload: {
        transactionId,
        originalTransactionId: transactionId,
        productId,
        bundleId: "com.elixstarlive.app",
        environment: "Production",
      },
    });
  }

  async function coinBalance(userId = buyer()): Promise<number> {
    const r = await pool.query(
      `SELECT coin_balance::bigint AS b FROM elix_wallet_balances WHERE user_id = $1`,
      [userId],
    );
    return r.rows.length ? Number(r.rows[0].b) : -1;
  }

  async function purchaseLedgerRows(): Promise<number> {
    const r = await pool.query(
      `SELECT COUNT(*)::int AS c FROM elix_wallet_ledger
        WHERE user_id = $1 AND kind = 'iap_purchase'`,
      [buyer()],
    );
    return r.rows[0].c;
  }

  async function lot(transactionId: string) {
    const r = await pool.query(
      `SELECT id, user_id, provider, provider_transaction_id, product_id,
              coins_original, coins_remaining, gross_pence, net_pence,
              settlement_status, settled_at, created_at
         FROM elix_paid_coin_lots
        WHERE provider = 'apple' AND provider_transaction_id = $1`,
      [transactionId],
    );
    return r.rows[0] ?? null;
  }

  async function processedPurchase(transactionId: string) {
    const r = await pool.query(
      `SELECT provider, product_id, user_id FROM elix_processed_purchases
        WHERE external_purchase_id = $1`,
      [`apple:${transactionId}`],
    );
    return r.rows[0] ?? null;
  }

  async function giftLedger(txnId: string) {
    const r = await pool.query(
      `SELECT id, net_revenue_pence, creator_amount_pence, platform_amount_pence,
              coin_source, revenue_source, creator_user_id, payer_user_id
         FROM elix_financial_ledger WHERE idempotency_key = $1`,
      [`paid_gift:${txnId}`],
    );
    return r.rows[0] ?? null;
  }

  async function creatorPending(): Promise<number> {
    const r = await pool.query(
      `SELECT pending_pence FROM elix_creator_wallet_gbp WHERE user_id = $1`,
      [creator()],
    );
    return r.rows.length ? Number(r.rows[0].pending_pence) : 0;
  }

  async function platformPending(): Promise<number> {
    const r = await pool.query(
      `SELECT pending_pence FROM elix_platform_wallet_gbp WHERE id = 'default'`,
    );
    return r.rows.length ? Number(r.rows[0].pending_pence) : 0;
  }

  it("turns one verified Apple purchase into wallet, ledger, paid lot and provenance", async () => {
    const txn = appleTxn("one");

    const credited = await buyCoins(txn);

    expect(credited.ok).toBe(true);
    if (credited.ok !== true) return;
    expect(credited.newBalance).toBe(APPLE_PRODUCT_COINS);
    expect(await coinBalance()).toBe(APPLE_PRODUCT_COINS);
    expect(await purchaseLedgerRows()).toBe(1);
    expect(await processedPurchase(txn)).toMatchObject({
      provider: "apple",
      product_id: APPLE_PRODUCT_ID,
      user_id: buyer(),
    });

    const row = await lot(txn);
    expect(row).toMatchObject({
      user_id: buyer(),
      provider: "apple",
      provider_transaction_id: txn,
      product_id: APPLE_PRODUCT_ID,
      settlement_status: "settled",
    });
    expect(Number(row.coins_original)).toBe(APPLE_PRODUCT_COINS);
    expect(Number(row.coins_remaining)).toBe(APPLE_PRODUCT_COINS);
    // The server's own catalogue price is the GBP provenance — never a client claim.
    expect(Number(row.gross_pence)).toBe(APPLE_PRODUCT_PENCE);
    expect(Number(row.net_pence)).toBe(APPLE_PRODUCT_PENCE);
    expect(row.settled_at).not.toBeNull();
  });

  it("credits one Apple transaction exactly once however often it is replayed", async () => {
    const txn = appleTxn("replay");

    const first = await buyCoins(txn);
    const replays = await Promise.all([buyCoins(txn), buyCoins(txn), buyCoins(txn)]);

    expect(first.ok).toBe(true);
    for (const replay of replays) {
      expect(replay.ok).toBe(false);
      expect(replay.ok === false && "alreadyProcessed" in replay && replay.alreadyProcessed).toBe(
        true,
      );
    }
    expect(await coinBalance()).toBe(APPLE_PRODUCT_COINS);
    expect(await purchaseLedgerRows()).toBe(1);
    const lots = await pool.query(
      `SELECT COUNT(*)::int AS c FROM elix_paid_coin_lots WHERE provider_transaction_id = $1`,
      [txn],
    );
    expect(lots.rows[0].c).toBe(1);
  });

  it("credits once when the same transaction reaches several servers at the same moment", async () => {
    const txn = appleTxn("race");

    const results = await Promise.all(
      Array.from({ length: 6 }, () => buyCoins(txn)),
    );

    expect(results.filter((r) => r.ok === true)).toHaveLength(1);
    expect(await coinBalance()).toBe(APPLE_PRODUCT_COINS);
    expect(await purchaseLedgerRows()).toBe(1);
  });

  it("keeps two different purchases as two lots and one summed balance", async () => {
    const first = appleTxn("m1");
    const second = appleTxn("m2");

    await Promise.all([buyCoins(first), buyCoins(second)]);

    expect(await coinBalance()).toBe(APPLE_PRODUCT_COINS * 2);
    expect(await purchaseLedgerRows()).toBe(2);
    expect(Number((await lot(first)).coins_remaining)).toBe(APPLE_PRODUCT_COINS);
    expect(Number((await lot(second)).coins_remaining)).toBe(APPLE_PRODUCT_COINS);
  });

  it("Apple purchase → paid gift → exact 60/40 creator and platform GBP", async () => {
    const txn = appleTxn("gift");
    expect((await buyCoins(txn)).ok).toBe(true);
    const platformBefore = await platformPending();
    const giftTxn = `gift_${suffix}`;

    const sent = await debitGift({
      userId: buyer(),
      giftId: "crown",
      roomId: `room_${suffix}`,
      coins: 100,
      clientTransactionId: giftTxn,
      creatorId: creator(),
    });

    expect(sent.ok).toBe(true);
    if (sent.ok !== true) return;
    expect(await coinBalance()).toBe(400);
    expect(Number((await lot(txn)).coins_remaining)).toBe(400);

    // 100 of 500 coins is 35p of the lot's 175p net, split 60/40 to the penny.
    const ledger = await giftLedger(giftTxn);
    expect(ledger).toMatchObject({
      revenue_source: "PAID_GIFT",
      coin_source: "paid",
      creator_user_id: creator(),
      payer_user_id: buyer(),
    });
    expect(Number(ledger.net_revenue_pence)).toBe(35);
    expect(Number(ledger.creator_amount_pence)).toBe(21);
    expect(Number(ledger.platform_amount_pence)).toBe(14);
    expect(
      Number(ledger.creator_amount_pence) + Number(ledger.platform_amount_pence),
    ).toBe(Number(ledger.net_revenue_pence));
    expect(await creatorPending()).toBe(21);
    expect(await platformPending()).toBe(platformBefore + 14);
  });

  it("spending the whole Apple lot pays out its whole net revenue and nothing more", async () => {
    const txn = appleTxn("full");
    expect((await buyCoins(txn)).ok).toBe(true);
    const platformBefore = await platformPending();

    for (let i = 0; i < 5; i += 1) {
      const result = await debitGift({
        userId: buyer(),
        giftId: "crown",
        roomId: `room_${suffix}`,
        coins: 100,
        clientTransactionId: `gift_full_${suffix}_${i}`,
        creatorId: creator(),
      });
      expect(result.ok).toBe(true);
    }

    expect(await coinBalance()).toBe(0);
    expect(Number((await lot(txn)).coins_remaining)).toBe(0);
    const totals = await pool.query(
      `SELECT COALESCE(SUM(net_revenue_pence),0)::int AS net,
              COALESCE(SUM(creator_amount_pence),0)::int AS creator,
              COALESCE(SUM(platform_amount_pence),0)::int AS platform
         FROM elix_financial_ledger
        WHERE payer_user_id = $1 AND revenue_source = 'PAID_GIFT'`,
      [buyer()],
    );
    expect(totals.rows[0].net).toBe(APPLE_PRODUCT_PENCE);
    expect(totals.rows[0].creator + totals.rows[0].platform).toBe(APPLE_PRODUCT_PENCE);
    expect(await creatorPending()).toBe(totals.rows[0].creator);
    expect(await platformPending()).toBe(platformBefore + totals.rows[0].platform);
  });

  it("records no GBP value it cannot prove, and invents none later", async () => {
    // A product with no catalogue price has no verified gross yet. The coins are
    // real, so they are credited, but the lot stays pending settlement with a NULL
    // net and a gift from it must attribute nothing rather than guess a price.
    const txn = appleTxn("unpriced");
    const credited = await creditIap({
      userId: buyer(),
      provider: "apple",
      providerTransactionId: txn,
      productId: `coins_not_in_catalogue_${suffix}`,
      coins: 100,
      verification: { provider: "apple", verified: true },
      applePayload: { transactionId: txn, environment: "Production" },
    });

    expect(credited.ok).toBe(true);
    const row = await lot(txn);
    expect(row.settlement_status).toBe("pending_settlement");
    expect(row.net_pence).toBeNull();
    expect(Number(row.gross_pence)).toBe(0);

    const giftTxn = `gift_unpriced_${suffix}`;
    const sent = await debitGift({
      userId: buyer(),
      giftId: "crown",
      roomId: `room_${suffix}`,
      coins: 100,
      clientTransactionId: giftTxn,
      creatorId: creator(),
    });

    expect(sent.ok).toBe(true);
    expect(await giftLedger(giftTxn)).toBeNull();
    expect(await creatorPending()).toBe(0);
  });

  it("an Apple refund unwinds the coins, the lot value and the creator's earning", async () => {
    const txn = appleTxn("refund");
    expect((await buyCoins(txn)).ok).toBe(true);
    const creatorBefore = await creatorPending();
    const platformBefore = await platformPending();
    const giftTxn = `gift_refund_${suffix}`;
    expect(
      (
        await debitGift({
          userId: buyer(),
          giftId: "crown",
          roomId: `room_${suffix}`,
          coins: 100,
          clientTransactionId: giftTxn,
          creatorId: creator(),
        })
      ).ok,
    ).toBe(true);
    expect(await creatorPending()).toBe(creatorBefore + 21);
    expect(await platformPending()).toBe(platformBefore + 14);

    const reversed = await reversePurchase({
      provider: "apple",
      providerTransactionId: txn,
    });

    expect(reversed.ok).toBe(true);
    if (reversed.ok !== true) return;
    expect(reversed.reversedCoins).toBe(APPLE_PRODUCT_COINS);
    expect(await coinBalance()).toBe(0);

    const row = await lot(txn);
    expect(row.settlement_status).toBe("reversed");
    expect(Number(row.coins_remaining)).toBe(0);
    expect(Number(row.net_pence)).toBe(0);

    const earning = await pool.query(
      `SELECT status FROM elix_creator_earnings WHERE id = $1`,
      [`earn:${giftTxn}`],
    );
    expect(earning.rows[0].status).toBe("reversed");

    // The gift's GBP row is reversed by an immutable counter-entry, not deleted,
    // and the money Apple took back leaves the creator and platform wallets too.
    const original = await giftLedger(giftTxn);
    expect(Number(original.creator_amount_pence)).toBe(21);
    const reversal = await pool.query(
      `SELECT revenue_source, creator_amount_pence, platform_amount_pence
         FROM elix_financial_ledger
        WHERE reversal_of_id = $1`,
      [String(original.id)],
    );
    expect(reversal.rowCount).toBe(1);
    expect(reversal.rows[0].revenue_source).toBe("REFUND_REVERSAL");
    expect(Number(reversal.rows[0].creator_amount_pence)).toBe(-21);
    expect(Number(reversal.rows[0].platform_amount_pence)).toBe(-14);
    expect(await creatorPending()).toBe(creatorBefore);
    expect(await platformPending()).toBe(platformBefore);
  });

  it("a repeated Apple refund notification takes nothing twice", async () => {
    const txn = appleTxn("refundtwice");
    expect((await buyCoins(txn)).ok).toBe(true);

    const first = await reversePurchase({ provider: "apple", providerTransactionId: txn });
    const second = await reversePurchase({ provider: "apple", providerTransactionId: txn });
    const third = await reversePurchase({ provider: "apple", providerTransactionId: txn });

    expect(first.ok && first.alreadyProcessed).toBe(false);
    expect(second.ok && second.alreadyProcessed).toBe(true);
    expect(third.ok && third.alreadyProcessed).toBe(true);
    expect(await coinBalance()).toBe(0);
    const refunds = await pool.query(
      `SELECT COUNT(*)::int AS c FROM elix_wallet_ledger
        WHERE user_id = $1 AND kind = 'iap_refund'`,
      [buyer()],
    );
    expect(refunds.rows[0].c).toBe(1);
  });

  it("refuses to reverse a purchase this server never credited", async () => {
    const result = await reversePurchase({
      provider: "apple",
      providerTransactionId: appleTxn("ghost"),
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toBe("purchase_not_found");
  });
});
