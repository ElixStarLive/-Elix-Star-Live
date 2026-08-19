/**
 * Creator Rewards milestone table — highest milestone reached, max cap.
 * Amounts are integer pence. Views are integers.
 */

export type RewardMilestone = {
  minQualifiedViews: number;
  rewardPence: number;
};

/** Default production table from the permanent monetisation plan. */
export const DEFAULT_CREATOR_REWARD_MILESTONES: RewardMilestone[] = [
  { minQualifiedViews: 500_000, rewardPence: 500 }, // £5
  { minQualifiedViews: 1_000_000, rewardPence: 1_000 }, // £10
  { minQualifiedViews: 2_500_000, rewardPence: 2_500 }, // £25
  { minQualifiedViews: 5_000_000, rewardPence: 5_000 }, // £50
  { minQualifiedViews: 10_000_000, rewardPence: 10_000 }, // £100
  { minQualifiedViews: 20_000_000, rewardPence: 25_000 }, // £250
  { minQualifiedViews: 30_000_000, rewardPence: 50_000 }, // £500
  { minQualifiedViews: 40_000_000, rewardPence: 75_000 }, // £750
  { minQualifiedViews: 50_000_000, rewardPence: 100_000 }, // £1,000
];

export const DEFAULT_MAX_REWARD_PENCE = 100_000; // £1,000
export const DEFAULT_MIN_FOLLOWERS = 8_000;
export const DEFAULT_MIN_PREV_30D_QUALIFIED = 100_000;

type RewardCalcResult = {
  rewardPence: number;
  milestoneViews: number;
  nextMilestoneViews: number | null;
  nextMilestoneRewardPence: number | null;
};

/**
 * Highest milestone at or below qualified views. No partial amounts between milestones.
 * Cap at maxRewardPence (default £1,000). Views above 50M do not increase reward.
 */
export function calculateCreatorRewardPence(
  qualifiedViews: number,
  milestones: RewardMilestone[] = DEFAULT_CREATOR_REWARD_MILESTONES,
  maxRewardPence: number = DEFAULT_MAX_REWARD_PENCE,
): RewardCalcResult {
  const views = Math.max(0, Math.floor(Number(qualifiedViews) || 0));
  const max = Math.max(0, Math.floor(Number(maxRewardPence) || 0));
  const sorted = [...milestones]
    .filter((m) => Number.isFinite(m.minQualifiedViews) && Number.isFinite(m.rewardPence))
    .map((m) => ({
      minQualifiedViews: Math.max(0, Math.floor(m.minQualifiedViews)),
      rewardPence: Math.max(0, Math.floor(m.rewardPence)),
    }))
    .sort((a, b) => a.minQualifiedViews - b.minQualifiedViews);

  let rewardPence = 0;
  let milestoneViews = 0;
  for (const m of sorted) {
    if (views >= m.minQualifiedViews) {
      rewardPence = Math.min(max, m.rewardPence);
      milestoneViews = m.minQualifiedViews;
    }
  }

  const next = sorted.find((m) => m.minQualifiedViews > views) ?? null;
  return {
    rewardPence,
    milestoneViews,
    nextMilestoneViews: next ? next.minQualifiedViews : null,
    nextMilestoneRewardPence: next ? Math.min(max, next.rewardPence) : null,
  };
}

type EligibilityInput = {
  followers: number;
  prev30dQualifiedViews: number;
  accountInGoodStanding: boolean;
  countryEligible: boolean;
  ageEligible: boolean;
  publicAccountOk: boolean;
  originalContentOk: boolean;
  noSeriousViolations: boolean;
  noUnresolvedFraud: boolean;
  noManipulatedEngagement: boolean;
  noPurchasedViewsOrFollowers: boolean;
  minFollowers?: number;
  minPrev30dQualifiedViews?: number;
};

type EligibilityResult = { eligible: boolean; reason: string | null };

export function evaluateCreatorRewardsEligibility(input: EligibilityInput): EligibilityResult {
  const minFollowers = input.minFollowers ?? DEFAULT_MIN_FOLLOWERS;
  const minPrev = input.minPrev30dQualifiedViews ?? DEFAULT_MIN_PREV_30D_QUALIFIED;
  if (input.followers < minFollowers) {
    return { eligible: false, reason: "below_min_followers" };
  }
  if (input.prev30dQualifiedViews < minPrev) {
    return { eligible: false, reason: "below_min_prev_30d_qualified_views" };
  }
  if (!input.accountInGoodStanding) return { eligible: false, reason: "account_not_in_good_standing" };
  if (!input.countryEligible) return { eligible: false, reason: "country_ineligible" };
  if (!input.ageEligible) return { eligible: false, reason: "age_ineligible" };
  if (!input.publicAccountOk) return { eligible: false, reason: "account_not_public" };
  if (!input.originalContentOk) return { eligible: false, reason: "content_not_original" };
  if (!input.noSeriousViolations) return { eligible: false, reason: "community_guidelines" };
  if (!input.noUnresolvedFraud) return { eligible: false, reason: "unresolved_fraud" };
  if (!input.noManipulatedEngagement) return { eligible: false, reason: "manipulated_engagement" };
  if (!input.noPurchasedViewsOrFollowers) {
    return { eligible: false, reason: "purchased_views_or_followers" };
  }
  return { eligible: true, reason: null };
}
