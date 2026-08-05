/**
 * Expanded monetisation unit + schema-contract tests.
 * Full Neon IT matrix runs via TEST_DATABASE_URL + ALLOW_MONEY_IT_ON_URL=1.
 */
import { describe, expect, it } from "vitest";
import {
  appleMilliunitsToMinor,
  extractAppleVerifiedPrice,
} from "./storeSettlement";
import { calculateCreatorRewardPence } from "./creatorRewardsMath";
import { splitNetRevenue, promotePlatformOnly, netAfterDeductions } from "./moneyMath";
import { isBotUserAgent } from "./fraud";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("store settlement price extraction", () => {
  it("converts Apple milliunits to GBP pence", () => {
    expect(appleMilliunitsToMinor(9990)).toBe(999);
    expect(appleMilliunitsToMinor(10000)).toBe(1000);
  });

  it("reads Apple JWS price when GBP", () => {
    const p = extractAppleVerifiedPrice({ price: 7000, currency: "GBP" });
    expect(p?.grossPence).toBe(700);
    expect(p?.source).toBe("apple_jws_price");
  });

  it("does not invent FX for non-GBP Apple prices", () => {
    const p = extractAppleVerifiedPrice({ price: 9990, currency: "USD" });
    expect(p?.grossPence).toBe(0);
    expect(p?.currency).toBe("USD");
  });
});

describe("gift / promote splits", () => {
  it("60/40 from verified net without inventing store fee", () => {
    const net = netAfterDeductions({
      grossPence: 10000,
      appStoreDeductionPence: 0,
      taxDeductionPence: 0,
    });
    expect(net).toBe(10000);
    const s = splitNetRevenue(net, 60, 40);
    expect(s.creatorPence + s.platformPence).toBe(10000);
  });

  it("promote is platform-only", () => {
    expect(promotePlatformOnly(2500).creatorPence).toBe(0);
    expect(promotePlatformOnly(2500).platformPence).toBe(2500);
  });
});

describe("rewards milestones + fraud UA", () => {
  it("caps at £1000", () => {
    expect(calculateCreatorRewardPence(80_000_000).rewardPence).toBe(100_000);
  });

  it("detects bot user agents", () => {
    expect(isBotUserAgent("Googlebot/2.1")).toBe(true);
    expect(isBotUserAgent("Mozilla/5.0 iPhone")).toBe(false);
  });
});

describe("schema contracts", () => {
  it("migration defines qualified view uniqueness", () => {
    const sql = fs.readFileSync(
      path.join(__dirname, "../../migrations/20260805050000_creator_monetisation_ledger_rewards.sql"),
      "utf8",
    );
    expect(sql).toContain("PRIMARY KEY (video_id, viewer_user_id)");
    expect(sql).toContain("elix_qualified_video_views_no_self");
    expect(sql).toContain("elix_creator_withdrawals_gbp");
    expect(sql).toContain("elix_financial_ledger_idempotency");
  });
});
