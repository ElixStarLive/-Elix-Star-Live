import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (relative: string) =>
  readFileSync(resolve(__dirname, relative), "utf8");

describe("Money and economy safety contracts", () => {
  const gifts = read("../routes/gifts.ts");
  const giftDelivery = read("../websocket/giftDelivery.ts");
  const testCoins = read("../websocket/testCoinsPolicy.ts");
  const webhook = read("../routes/webhook.ts");
  const shop = read("../routes/shop.router.ts");
  const shopItems = read("../routes/shopItems.ts");

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

  it("blocks test-coin battle scoring in production", () => {
    expect(testCoins).toContain('=== "production"');
    expect(testCoins).toContain("canAcceptTestCoinsBattleScore");
  });

  it("Stripe webhook stays shop-scoped in source", () => {
    expect(webhook).toMatch(/shop_item|shop/i);
  });

  it("shop checkout path exists separately from IAP verify", () => {
    const combined = `${shop}\n${shopItems}`;
    expect(combined).toMatch(/checkout|stripe/i);
  });
});
