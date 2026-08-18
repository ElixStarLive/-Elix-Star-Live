/**
 * Unit contract tests for creator monetisation math (no DB required).
 */
import { describe, expect, it } from "vitest";
import {
  allocateLotPence,
  gbpStringToPence,
  netAfterDeductions,
  promotePlatformOnly,
  splitNetRevenue,
} from "./moneyMath";
import {
  calculateCreatorRewardPence,
  evaluateCreatorRewardsEligibility,
  DEFAULT_CREATOR_REWARD_MILESTONES,
} from "./creatorRewardsMath";

describe("splitNetRevenue 60/40", () => {
  it("splits £70 net to £42 / £28", () => {
    const r = splitNetRevenue(7000, 60, 40);
    expect(r.creatorPence).toBe(4200);
    expect(r.platformPence).toBe(2800);
    expect(r.creatorPence + r.platformPence).toBe(7000);
  });

  it("handles different store deductions via net", () => {
    const netA = netAfterDeductions({
      grossPence: 10000,
      appStoreDeductionPence: 3000,
    });
    expect(netA).toBe(7000);
    const a = splitNetRevenue(netA, 60, 40);
    expect(a.creatorPence).toBe(4200);

    const netB = netAfterDeductions({
      grossPence: 10000,
      appStoreDeductionPence: 1500,
      taxDeductionPence: 500,
      processingDeductionPence: 200,
    });
    expect(netB).toBe(7800);
    const b = splitNetRevenue(netB, 60, 40);
    expect(b.creatorPence + b.platformPence).toBe(7800);
  });

  it("assigns remainder pennies to platform", () => {
    const r = splitNetRevenue(101, 60, 40);
    expect(r.creatorPence).toBe(60);
    expect(r.platformPence).toBe(41);
    expect(r.creatorPence + r.platformPence).toBe(101);
  });

  it("rejects non-100 splits", () => {
    expect(() => splitNetRevenue(100, 50, 40)).toThrow();
  });
});

describe("promote platform only", () => {
  it("gives creator £0", () => {
    const r = promotePlatformOnly(500);
    expect(r.creatorPence).toBe(0);
    expect(r.platformPence).toBe(500);
  });
});

describe("gbpStringToPence", () => {
  it("parses without float drift", () => {
    expect(gbpStringToPence("9.99")).toBe(999);
    expect(gbpStringToPence("100")).toBe(10000);
    expect(gbpStringToPence("0.01")).toBe(1);
  });
});

describe("allocateLotPence", () => {
  it("gives a spend its proportional share", () => {
    expect(
      allocateLotPence({
        consumedBefore: 0,
        take: 50,
        totalCoins: 100,
        totalPence: 7000,
      }),
    ).toBe(3500);
  });

  it("a lot spent one coin at a time still gives out every penny", () => {
    // 1000 coins bought for 400p net. Allocating each coin on its own would
    // floor 0.4p to zero a thousand times and record no revenue at all.
    let attributed = 0;
    for (let consumed = 0; consumed < 1000; consumed += 1) {
      attributed += allocateLotPence({
        consumedBefore: consumed,
        take: 1,
        totalCoins: 1000,
        totalPence: 400,
      });
    }
    expect(attributed).toBe(400);
  });

  it("mixed gift sizes total the same as one full spend", () => {
    const takes = [1, 1, 3, 5, 50, 100, 340, 500];
    expect(takes.reduce((a, b) => a + b, 0)).toBe(1000);
    let consumed = 0;
    let attributed = 0;
    for (const take of takes) {
      attributed += allocateLotPence({
        consumedBefore: consumed,
        take,
        totalCoins: 1000,
        totalPence: 1499,
      });
      consumed += take;
    }
    expect(attributed).toBe(1499);
  });

  it("never gives out more than the lot held", () => {
    expect(() =>
      allocateLotPence({
        consumedBefore: 900,
        take: 200,
        totalCoins: 1000,
        totalPence: 400,
      }),
    ).toThrow();
  });
});

describe("Creator Rewards milestones", () => {
  const cases: Array<[number, number]> = [
    [499_999, 0],
    [500_000, 500],
    [1_000_000, 1_000],
    [2_500_000, 2_500],
    [5_000_000, 5_000],
    [10_000_000, 10_000],
    [20_000_000, 25_000],
    [30_000_000, 50_000],
    [40_000_000, 75_000],
    [50_000_000, 100_000],
    [80_000_000, 100_000],
    [4_900_000, 2_500],
    [18_000_000, 10_000],
  ];
  for (const [views, pence] of cases) {
    it(`${views} views → ${pence} pence`, () => {
      expect(calculateCreatorRewardPence(views).rewardPence).toBe(pence);
    });
  }

  it("admin milestone change uses provided table only", () => {
    const future = [{ minQualifiedViews: 100, rewardPence: 50 }];
    expect(calculateCreatorRewardPence(100, future).rewardPence).toBe(50);
    expect(
      calculateCreatorRewardPence(100, DEFAULT_CREATOR_REWARD_MILESTONES).rewardPence,
    ).toBe(0);
  });
});

describe("Creator Rewards eligibility", () => {
  const ok = {
    followers: 8_000,
    prev30dQualifiedViews: 100_000,
    accountInGoodStanding: true,
    countryEligible: true,
    ageEligible: true,
    publicAccountOk: true,
    originalContentOk: true,
    noSeriousViolations: true,
    noUnresolvedFraud: true,
    noManipulatedEngagement: true,
    noPurchasedViewsOrFollowers: true,
  };

  it("eligible at thresholds", () => {
    expect(evaluateCreatorRewardsEligibility(ok).eligible).toBe(true);
  });

  it("rejects below 8k followers", () => {
    expect(
      evaluateCreatorRewardsEligibility({ ...ok, followers: 7_999 }).reason,
    ).toBe("below_min_followers");
  });

  it("rejects below 100k prev views", () => {
    expect(
      evaluateCreatorRewardsEligibility({ ...ok, prev30dQualifiedViews: 99_999 }).reason,
    ).toBe("below_min_prev_30d_qualified_views");
  });

  it("rejects fraud", () => {
    expect(
      evaluateCreatorRewardsEligibility({ ...ok, noUnresolvedFraud: false }).reason,
    ).toBe("unresolved_fraud");
  });
});
