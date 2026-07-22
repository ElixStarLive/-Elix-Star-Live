import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  canAcceptTestCoinsBattleScore,
  isProductionTestCoinsBlocked,
  isTestCoinsGiftSource,
} from "./testCoinsPolicy";

const handlersSrc = readFileSync(
  resolve(__dirname, "./handlers.ts"),
  "utf8",
);

describe("testCoinsPolicy", () => {
  it("detects giftSource and gift_source test_coins", () => {
    expect(isTestCoinsGiftSource({ giftSource: "test_coins" })).toBe(true);
    expect(isTestCoinsGiftSource({ gift_source: "test_coins" })).toBe(true);
    expect(isTestCoinsGiftSource({ giftSource: "paid_coins" })).toBe(false);
    expect(isTestCoinsGiftSource(null)).toBe(false);
  });

  it("blocks test-coin battle scoring in production", () => {
    expect(isProductionTestCoinsBlocked("production")).toBe(true);
    expect(isProductionTestCoinsBlocked("development")).toBe(false);
    expect(isProductionTestCoinsBlocked(undefined)).toBe(false);
    expect(canAcceptTestCoinsBattleScore("production")).toBe(false);
  });

  it("production test-coin gift_sent exits before broadcast, battle score, MVP, delivery", () => {
    const start = handlersSrc.indexOf("if (isTestCoinsGiftSource(data))");
    expect(start).toBeGreaterThan(-1);
    const blockEnd = handlersSrc.indexOf("const testGiftId", start);
    expect(blockEnd).toBeGreaterThan(start);
    const blockBranch = handlersSrc.slice(start, blockEnd);
    expect(blockBranch).toContain("canAcceptTestCoinsBattleScore");
    expect(blockBranch).toContain("test_coins_blocked");
    expect(blockBranch).toContain("break");
    expect(blockBranch).not.toContain("broadcastToRoom");
    expect(blockBranch).not.toContain("addBattleScoreForTarget");
    expect(blockBranch).not.toContain("deliverVerifiedGift");
    expect(blockBranch).not.toContain("addMvpPoints");
    expect(blockBranch).not.toContain("neonCreditCreatorEarning");
    expect(blockBranch).not.toContain("INSERT INTO elix_gift");
  });
});
