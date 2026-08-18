/**
 * Google Play money path against a real Postgres database.
 *
 * This runs the production functions themselves — `neonCreditIap`,
 * `neonDebitGiftWithCreatorCredit` and `neonReverseIapPurchase` — so the whole
 * Android chain is proven as it will actually run: a Google-verified purchase
 * becomes a wallet credit, a purchase ledger row, a settled paid coin lot with
 * GBP provenance and a processed-purchase record carrying the purchase token, in
 * ONE transaction; a paid gift then consumes that lot's value and splits it
 * 60/40; a Play void unwinds all of it; a multi-quantity purchase credits and
 * values every unit; and a licence-test purchase creates coins with no GBP.
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

/** The Google Play SKU and its catalogue price, as shipped in the migrations. */
const GOOGLE_PRODUCT_ID = "coins500a";
const GOOGLE_PRODUCT_COINS = 500;
const GOOGLE_PRODUCT_PENCE = 175;

describe.skipIf(!RUN)("Google Play money path (real DB)", () => {
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

  const buyer = () => `u_google_buyer_${suffix}`;
  const creator = () => `u_google_creator_${suffix}`;
  /** The server keys Google purchases on the SHA-256 of the purchase token. */
  const googleTxn = (tag = "a") => `token_sha256:${tag}_${suffix}`;
  const rawToken = (tag = "a") => `gpa.token_${tag}_${suffix}`;

  function buyCoins(
    tag: string,
    opts: { quantity?: number; unpaidPurchase?: boolean; productId?: string } = {},
  ) {
    const productId = opts.productId ?? GOOGLE_PRODUCT_ID;
    const quantity = opts.quantity ?? 1;
    return creditIap({
      userId: buyer(),
      provider: "google",
      providerTransactionId: googleTxn(tag),
      productId,
      coins: GOOGLE_PRODUCT_COINS * quantity,
      verification: {
        provider: "google",
        verified: true,
        productId,
        quantity,
        purchaseType: opts.unpaidPurchase ? 0 : null,
        orderId: `GPA.${tag}_${suffix}`,
        unpaidPurchase: opts.unpaidPurchase === true,
      },
      googlePurchaseToken: rawToken(tag),
      quantity,
      unpaidPurchase: opts.unpaidPurchase === true,
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

  async function lot(tag: string) {
    const r = await pool.query(
      `SELECT id, user_id, provider, provider_transaction_id, product_id,
              coins_original, coins_remaining, gross_pence, net_pence,
              settlement_status, settled_at, created_at
         FROM elix_paid_coin_lots
        WHERE provider = 'google' AND provider_transaction_id = $1`,
      [googleTxn(tag)],
    );
    return r.rows[0] ?? null;
  }

  async function processedPurchase(tag: string) {
    const r = await pool.query(
      `SELECT provider, product_id, user_id, google_purchase_token, google_consumed_at
         FROM elix_processed_purchases
        WHERE external_purchase_id = $1`,
      [`google:${googleTxn(tag)}`],
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

  it("turns one verified Google purchase into wallet, ledger, paid lot and provenance", async () => {
    const credited = await buyCoins("one");

    expect(credited.ok).toBe(true);
    if (credited.ok !== true) return;
    expect(credited.newBalance).toBe(GOOGLE_PRODUCT_COINS);
    expect(await coinBalance()).toBe(GOOGLE_PRODUCT_COINS);
    expect(await purchaseLedgerRows()).toBe(1);

    // The raw token is kept so the server can finish the Play purchase itself.
    expect(await processedPurchase("one")).toMatchObject({
      provider: "google",
      product_id: GOOGLE_PRODUCT_ID,
      user_id: buyer(),
      google_purchase_token: rawToken("one"),
      google_consumed_at: null,
    });

    const row = await lot("one");
    expect(row).toMatchObject({
      user_id: buyer(),
      provider: "google",
      provider_transaction_id: googleTxn("one"),
      product_id: GOOGLE_PRODUCT_ID,
      settlement_status: "settled",
    });
    expect(Number(row.coins_original)).toBe(GOOGLE_PRODUCT_COINS);
    expect(Number(row.coins_remaining)).toBe(GOOGLE_PRODUCT_COINS);
    // The server's own catalogue price is the GBP provenance — never a client claim.
    expect(Number(row.gross_pence)).toBe(GOOGLE_PRODUCT_PENCE);
    expect(Number(row.net_pence)).toBe(GOOGLE_PRODUCT_PENCE);
    expect(row.settled_at).not.toBeNull();
  });

  it("credits one purchase token exactly once however often it is replayed", async () => {
    const first = await buyCoins("replay");
    const replays = await Promise.all([
      buyCoins("replay"),
      buyCoins("replay"),
      buyCoins("replay"),
    ]);

    expect(first.ok).toBe(true);
    for (const replay of replays) {
      expect(replay.ok).toBe(false);
      expect(
        replay.ok === false && "alreadyProcessed" in replay && replay.alreadyProcessed,
      ).toBe(true);
    }
    expect(await coinBalance()).toBe(GOOGLE_PRODUCT_COINS);
    expect(await purchaseLedgerRows()).toBe(1);
    const lots = await pool.query(
      `SELECT COUNT(*)::int AS c FROM elix_paid_coin_lots WHERE provider_transaction_id = $1`,
      [googleTxn("replay")],
    );
    expect(lots.rows[0].c).toBe(1);
  });

  it("credits once when the same token reaches several servers at the same moment", async () => {
    const results = await Promise.all(Array.from({ length: 6 }, () => buyCoins("race")));

    expect(results.filter((r) => r.ok === true)).toHaveLength(1);
    expect(await coinBalance()).toBe(GOOGLE_PRODUCT_COINS);
    expect(await purchaseLedgerRows()).toBe(1);
  });

  it("keeps two different purchases as two lots and one summed balance", async () => {
    await Promise.all([buyCoins("m1"), buyCoins("m2")]);

    expect(await coinBalance()).toBe(GOOGLE_PRODUCT_COINS * 2);
    expect(await purchaseLedgerRows()).toBe(2);
    expect(Number((await lot("m1")).coins_remaining)).toBe(GOOGLE_PRODUCT_COINS);
    expect(Number((await lot("m2")).coins_remaining)).toBe(GOOGLE_PRODUCT_COINS);
  });

  it("Google purchase → paid gift → exact 60/40 creator and platform GBP", async () => {
    expect((await buyCoins("gift")).ok).toBe(true);
    const platformBefore = await platformPending();
    const giftTxn = `ggift_${suffix}`;

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
    expect(Number((await lot("gift")).coins_remaining)).toBe(400);

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

  it("values every unit of a multi-quantity Play purchase", async () => {
    // Play multi-quantity: two packs on one token. Crediting one pack, or pricing
    // two packs at one pack's GBP, would keep money for coins never delivered.
    const credited = await buyCoins("qty", { quantity: 2 });

    expect(credited.ok).toBe(true);
    expect(await coinBalance()).toBe(GOOGLE_PRODUCT_COINS * 2);
    const row = await lot("qty");
    expect(Number(row.coins_original)).toBe(GOOGLE_PRODUCT_COINS * 2);
    expect(Number(row.gross_pence)).toBe(GOOGLE_PRODUCT_PENCE * 2);
    expect(Number(row.net_pence)).toBe(GOOGLE_PRODUCT_PENCE * 2);
    expect(row.settlement_status).toBe("settled");

    // Per-coin value is unchanged, so a 100-coin gift is still worth 35p.
    const giftTxn = `gqty_${suffix}`;
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
    const ledger = await giftLedger(giftTxn);
    expect(Number(ledger.net_revenue_pence)).toBe(35);
    expect(Number(ledger.creator_amount_pence)).toBe(21);
  });

  it("gives a licence-test Play purchase coins but never GBP", async () => {
    // purchaseType 0/1/2 is a real Play purchase nobody paid the shelf price for.
    // The coins are owned, so they are credited; borrowing the catalogue price
    // would invent revenue and a creator payout liability out of nothing.
    const credited = await buyCoins("licence", { unpaidPurchase: true });

    expect(credited.ok).toBe(true);
    expect(await coinBalance()).toBe(GOOGLE_PRODUCT_COINS);
    const row = await lot("licence");
    expect(row.settlement_status).toBe("pending_settlement");
    expect(Number(row.gross_pence)).toBe(0);
    expect(row.net_pence).toBeNull();

    const giftTxn = `glicence_${suffix}`;
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

    expect(await giftLedger(giftTxn)).toBeNull();
    expect(await creatorPending()).toBe(0);
  });

  it("spending the whole Google lot pays out its whole net revenue and nothing more", async () => {
    expect((await buyCoins("full")).ok).toBe(true);
    const platformBefore = await platformPending();

    for (let i = 0; i < 5; i += 1) {
      const result = await debitGift({
        userId: buyer(),
        giftId: "crown",
        roomId: `room_${suffix}`,
        coins: 100,
        clientTransactionId: `gfull_${suffix}_${i}`,
        creatorId: creator(),
      });
      expect(result.ok).toBe(true);
    }

    expect(await coinBalance()).toBe(0);
    expect(Number((await lot("full")).coins_remaining)).toBe(0);
    const totals = await pool.query(
      `SELECT COALESCE(SUM(net_revenue_pence),0)::int AS net,
              COALESCE(SUM(creator_amount_pence),0)::int AS creator,
              COALESCE(SUM(platform_amount_pence),0)::int AS platform
         FROM elix_financial_ledger
        WHERE payer_user_id = $1 AND revenue_source = 'PAID_GIFT'`,
      [buyer()],
    );
    expect(totals.rows[0].net).toBe(GOOGLE_PRODUCT_PENCE);
    expect(totals.rows[0].creator + totals.rows[0].platform).toBe(GOOGLE_PRODUCT_PENCE);
    expect(await creatorPending()).toBe(totals.rows[0].creator);
    expect(await platformPending()).toBe(platformBefore + totals.rows[0].platform);
  });

  it("a Play void unwinds the coins, the lot value and the creator's earning", async () => {
    expect((await buyCoins("void")).ok).toBe(true);
    const creatorBefore = await creatorPending();
    const platformBefore = await platformPending();
    const giftTxn = `gvoid_${suffix}`;
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
      provider: "google",
      providerTransactionId: googleTxn("void"),
    });

    expect(reversed.ok).toBe(true);
    if (reversed.ok !== true) return;
    expect(reversed.reversedCoins).toBe(GOOGLE_PRODUCT_COINS);
    expect(await coinBalance()).toBe(0);

    const row = await lot("void");
    expect(row.settlement_status).toBe("reversed");
    expect(Number(row.coins_remaining)).toBe(0);
    expect(Number(row.net_pence)).toBe(0);

    const earning = await pool.query(
      `SELECT status FROM elix_creator_earnings WHERE id = $1`,
      [`earn:${giftTxn}`],
    );
    expect(earning.rows[0].status).toBe("reversed");

    // The gift's GBP row is reversed by an immutable counter-entry, not deleted,
    // and the money Google took back leaves the creator and platform wallets too.
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

  it("a redelivered void notification takes nothing twice", async () => {
    expect((await buyCoins("voidtwice")).ok).toBe(true);

    const first = await reversePurchase({
      provider: "google",
      providerTransactionId: googleTxn("voidtwice"),
    });
    const second = await reversePurchase({
      provider: "google",
      providerTransactionId: googleTxn("voidtwice"),
    });
    const third = await reversePurchase({
      provider: "google",
      providerTransactionId: googleTxn("voidtwice"),
    });

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

  it("refuses to void a purchase this server never credited", async () => {
    const result = await reversePurchase({
      provider: "google",
      providerTransactionId: googleTxn("ghost"),
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toBe("purchase_not_found");
  });
});
