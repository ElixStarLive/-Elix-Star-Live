import { describe, expect, it } from "vitest";
import {
  isProductionTestCoinsBlocked,
  isTestCoinsGiftSource,
} from "./testCoinsPolicy";

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
  });
});
