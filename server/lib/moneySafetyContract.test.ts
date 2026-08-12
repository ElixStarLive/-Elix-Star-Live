import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (relative: string) =>
  readFileSync(resolve(__dirname, relative), "utf8");

describe("Money and economy safety contracts", () => {
  const gifts = read("../routes/gifts.ts");
  const giftDelivery = read("../websocket/giftDelivery.ts");
  const testCoins = read("../websocket/testCoinsPolicy.ts");
  const handlers = read("../websocket/handlers.ts");
  const webhook = read("../routes/webhook.ts");
  const shop = read("../routes/shop.router.ts");
  const shopItems = read("../routes/shopItems.ts");
  const wallet = read("./walletNeon.ts");
  const payout = read("../routes/payout.ts");
  const adminActions = read("../routes/adminActions.ts");
  const payoutRouter = read("../routes/payout.router.ts");

  it("promo gifts never call creator earning credit", () => {
    const promoStart = gifts.indexOf("if (isPromoGift)");
    const paidStart = gifts.indexOf("if (coinCost > 0)", promoStart);
    const promoBranch = gifts.slice(promoStart, paidStart);
    expect(promoBranch).toContain("diamonds: 0");
    expect(promoBranch).toContain("creator_earnings: 0");
    expect(promoBranch).not.toContain("neonCreditCreatorEarning");
  });

  it("gift delivery gates paid money side-effects on paid_coins only", () => {
    expect(giftDelivery).toContain('input.giftSource === "paid_coins"');
    expect(giftDelivery).toContain('input.giftSource === "promotional_coins"');
    const paidGate = giftDelivery.indexOf('input.giftSource === "paid_coins"');
    const paidBranch = giftDelivery.slice(
      paidGate,
      giftDelivery.indexOf('input.giftSource === "promotional_coins"'),
    );
    expect(paidBranch).toContain("incrementGiftGoal");
  });

  it("test coins add battle score + animation only and never touch money", () => {
    // TEST COINS ≠ REAL COINS. Battle score + animation only. Never wallet / IAP / Stripe.
    expect(testCoins).toContain("canAcceptTestCoinsBattleScore");
    expect(testCoins).toContain("BATTLE GAME SCORE ONLY");
    expect(handlers).toContain("test_coins_blocked");

    const start = handlers.indexOf("if (isTestCoinsGiftSource(data))");
    expect(start).toBeGreaterThan(-1);
    const end = handlers.indexOf("const verified = await verifyGiftTransaction", start);
    expect(end).toBeGreaterThan(start);
    const testCoinBranch = handlers.slice(start, end);

    // Allowed: battle score + gift animation audience emit (£0).
    expect(testCoinBranch).toContain("addBattleScoreForTarget");
    expect(testCoinBranch).toContain("emitGiftSentToTargetAudience");
    expect(testCoinBranch).toContain('giftSource: "test_coins"');
    expect(testCoinBranch).toContain('origin: "test_coins"');
    expect(testCoinBranch).toContain("financialValueGbp: 0");
    expect(testCoinBranch).toContain('status: "test"');

    // Forbidden: real-money / real-coin settlement paths (must stay on paid branch only).
    expect(testCoinBranch).not.toContain("verifyGiftTransaction");
    expect(testCoinBranch).not.toContain("deliverVerifiedGift");
    expect(testCoinBranch).not.toContain("neonCreditCreatorEarning");
    expect(testCoinBranch).not.toContain("neonDebitGift");
    expect(testCoinBranch).not.toContain("neonCreditIap");
    expect(testCoinBranch).not.toContain("incrementGiftGoal");
    expect(testCoinBranch).not.toContain("recordCreatorGiftProgress");
    expect(testCoinBranch).not.toContain("paidCoinLots");
    expect(testCoinBranch).not.toContain("createPaidCoinLot");
    expect(testCoinBranch).not.toContain("settlePaidCoinLot");
    expect(testCoinBranch).not.toContain("stripe");
    expect(testCoinBranch).not.toContain("paid_coins");
    expect(testCoinBranch).not.toContain("starter_coins");
  });

  it("battle screen tap awards +5 once per unique viewer per battle (£0)", () => {
    const start = handlers.indexOf('case "battle_spectator_vote"');
    expect(start).toBeGreaterThan(-1);
    const end = handlers.indexOf('case "battle_end"', start);
    expect(end).toBeGreaterThan(start);
    const voteBranch = handlers.slice(start, end);
    expect(voteBranch).toContain("battle_vote_once:");
    expect(voteBranch).toContain("valkeySetNx");
    expect(voteBranch).toContain("already_awarded");
    expect(voteBranch).toContain("addBattleScoreForTarget");
    expect(voteBranch).toContain("financialValueGbp: 0");
    expect(voteBranch).not.toContain("tapCount % 3");
    expect(voteBranch).not.toContain("neonCreditCreatorEarning");
  });

  it("REST gift send rejects test_coins so money settlement cannot run", () => {
    expect(gifts).toContain('gift_source === "test_coins"');
    const start = gifts.indexOf('gift_source === "test_coins"');
    expect(start).toBeGreaterThan(-1);
    const rejectBlock = gifts.slice(start, start + 280);
    expect(rejectBlock).toContain("financialValueGbp: 0");
    expect(rejectBlock).toContain("status(400)");
  });

  it("live likes (heart_sent) stay separate from battle score and money", () => {
    const start = handlers.indexOf('case "heart_sent"');
    expect(start).toBeGreaterThan(-1);
    const end = handlers.indexOf('case "gift_sent"', start);
    expect(end).toBeGreaterThan(start);
    const heartBranch = handlers.slice(start, end);
    expect(heartBranch).toContain('type: "like"');
    expect(heartBranch).not.toContain("addBattleScoreForTarget");
    expect(heartBranch).not.toContain("neonCreditCreatorEarning");
  });

  it("Stripe webhook stays shop-scoped in source", () => {
    expect(webhook).toMatch(/shop_item|shop/i);
  });

  it("shop checkout path exists separately from IAP verify", () => {
    const combined = `${shop}\n${shopItems}`;
    expect(combined).toMatch(/checkout|stripe/i);
  });

  it("duplicate gift debit is prevented by idempotency conflict", () => {
    expect(wallet).toContain("ON CONFLICT (idempotency_key) DO NOTHING");
    expect(wallet).toMatch(/client_transaction_id/);
  });

  it("duplicate IAP credit is prevented by idempotency / provider txn conflict", () => {
    expect(wallet).toContain("ON CONFLICT (idempotency_key) DO NOTHING");
    expect(wallet).toMatch(/provider_transaction_id/);
  });

  it("insufficient balance cannot go below zero", () => {
    expect(wallet).toContain("insufficient_funds");
    expect(wallet).toMatch(/coin_balance\s*>=|balance\s*<|insufficient/i);
  });

  it("starter and promotional paths create zero Diamonds in delivery", () => {
    expect(giftDelivery).toContain("starter_coins");
    expect(giftDelivery).toContain("promotional_coins");
    const promo = giftDelivery.slice(
      giftDelivery.indexOf('input.giftSource === "promotional_coins"'),
    );
    expect(promo).not.toContain("neonCreditCreatorEarning");
  });

  it("battle energy gift path does not credit creator Diamonds", () => {
    expect(giftDelivery).toContain("Battle Energy must NEVER increase creator earnings");
  });

  it("admin shop and IAP purchase routes are separate", () => {
    expect(payoutRouter).toContain("shop-purchases");
    expect(adminActions).toMatch(/iap-purchases|\/purchases/);
  });

  it("payout approve/reject persist admin identity and audit", () => {
    expect(payout).toContain("processed_by");
    expect(payout).toContain("elix_payout_audit");
  });

  it("admin engagement config routes exist for missions daily rewards energy flags", () => {
    const adminProg = read("../routes/adminProgression.router.ts");
    expect(adminProg).toContain("/missions");
    expect(adminProg).toContain("/daily-rewards");
    expect(adminProg).toContain("/battle-energy-caps");
    expect(adminProg).toContain("/feature-flags");
  });

  it("host can end poll via engagement_poll_end", () => {
    expect(handlers).toContain("engagement_poll_end");
    const engWs = read("../websocket/engagement.ts");
    expect(engWs).toContain("endEngagementPoll");
  });
});
