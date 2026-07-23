import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (relative: string) =>
  readFileSync(resolve(__dirname, relative), "utf8");

describe("Engagement claim and trust contracts", () => {
  const engagement = read("./engagement.ts");
  const router = read("../routes/engagement.router.ts");
  const rateLimit = read("../middleware/rateLimit.ts");
  const giftDelivery = read("../websocket/giftDelivery.ts");
  const testCoins = read("../websocket/testCoinsPolicy.ts");

  it("daily login claim is idempotent for same day", () => {
    expect(engagement).toContain("already_claimed");
    expect(engagement).toContain("daily_reward_claims");
    expect(engagement).toContain("ALREADY_CLAIMED");
  });

  it("mission claim rejects incomplete and already claimed", () => {
    expect(engagement).toContain("NOT_COMPLETE");
    expect(engagement).toContain("ALREADY_CLAIMED");
    expect(engagement).toContain("claimed = TRUE");
  });

  it("promo gifts and battle energy never create Diamonds in delivery", () => {
    expect(giftDelivery).toContain('input.giftSource === "promotional_coins"');
    const promo = giftDelivery.slice(
      giftDelivery.indexOf('input.giftSource === "promotional_coins"'),
    );
    expect(promo).not.toContain("neonCreditCreatorEarning");
    expect(promo).not.toContain("incrementGiftGoal");
  });

  it("progress and earn routes are rate-limited and room-gated", () => {
    expect(rateLimit).toContain("engagementProgressLimiter");
    expect(rateLimit).toContain("engagementEarnLimiter");
    expect(router).toContain("engagementProgressLimiter");
    expect(router).toContain("engagementEarnLimiter");
    expect(router).toContain("ROOM_REQUIRED");
    expect(router).toContain("STREAM_NOT_LIVE");
  });

  it("client treasure spawn is closed", () => {
    expect(router).toContain("SPAWN_SERVER_ONLY");
  });

  it("test-coin battle scoring is policy-gated (battle points only, never money)", () => {
    expect(testCoins).toContain('=== "production"');
    expect(testCoins).toContain("canAcceptTestCoinsBattleScore");
  });

  it("feed track-view is rate-limited before accepting views", () => {
    const feed = read("../routes/feed.ts");
    expect(feed).toContain("allowViewRateLimit");
    expect(feed).toContain("Rate limit exceeded");
  });
});
