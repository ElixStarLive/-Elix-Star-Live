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

  it("allows test-coin battle scoring in every env (money stays separate), with a kill switch", () => {
    // Production flag still reports correctly for any future money gating.
    expect(isProductionTestCoinsBlocked("production")).toBe(true);
    expect(isProductionTestCoinsBlocked("development")).toBe(false);
    expect(isProductionTestCoinsBlocked(undefined)).toBe(false);

    // Test coins: catalog battle points + animation, never money (payment-wise
    // like free tap). Battle scoring allowed in production too for gift QA.
    const prev = process.env.ALLOW_TEST_COINS_BATTLE_SCORE;
    delete process.env.ALLOW_TEST_COINS_BATTLE_SCORE;
    expect(canAcceptTestCoinsBattleScore("production")).toBe(true);
    expect(canAcceptTestCoinsBattleScore("development")).toBe(true);

    // Operators keep a hard kill switch.
    process.env.ALLOW_TEST_COINS_BATTLE_SCORE = "0";
    expect(canAcceptTestCoinsBattleScore("production")).toBe(false);
    if (prev === undefined) delete process.env.ALLOW_TEST_COINS_BATTLE_SCORE;
    else process.env.ALLOW_TEST_COINS_BATTLE_SCORE = prev;
  });

  it("test-coin kill-switch guard exits before broadcast, battle score, MVP, delivery", () => {
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
