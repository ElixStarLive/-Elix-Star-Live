/**
 * Engagement feature flags — Phase 1 + 1.5 production defaults ON.
 * Promo gift spend creates ZERO Diamonds (never creator withdrawable value).
 * Env is baseline; admin DB overrides (engagement_settings.feature_flags) merge on top.
 * ENGAGEMENT_NEON_APPROVED=false in env always wins as a kill-switch.
 */
function envBool(name: string, fallback: boolean): boolean {
  const raw = (process.env[name] || "").trim().toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return fallback;
}

export type EngagementFlags = {
  engagementHubEnabled: boolean;
  promotionalCoinsEnabled: boolean;
  battleEnergyEnabled: boolean;
  dailyLoginEnabled: boolean;
  missionRewardsEnabled: boolean;
  /** Promo gifts allowed; always 0 Diamonds when true */
  promoGiftSpendEnabled: boolean;
  treasureHuntEnabled: boolean;
  stickerCollectionEnabled: boolean;
  creatorCollectionsEnabled: boolean;
  /** Allows Neon engagement table writes (migrations must be applied) */
  engagementNeonApproved: boolean;
};

let flagOverrideCache: Partial<EngagementFlags> = {};

export function setEngagementFlagOverrides(
  overrides: Partial<EngagementFlags>,
): void {
  flagOverrideCache = { ...overrides };
}

export function getEngagementFlagsFromEnv(): EngagementFlags {
  const engagementNeonApproved = envBool("ENGAGEMENT_NEON_APPROVED", true);
  return {
    engagementHubEnabled: envBool("ENGAGEMENT_HUB_ENABLED", true),
    promotionalCoinsEnabled:
      engagementNeonApproved && envBool("PROMOTIONAL_COINS_ENABLED", true),
    battleEnergyEnabled:
      engagementNeonApproved && envBool("BATTLE_ENERGY_ENABLED", true),
    dailyLoginEnabled: envBool("DAILY_LOGIN_ENABLED", true),
    missionRewardsEnabled: envBool("MISSION_REWARDS_ENABLED", true),
    promoGiftSpendEnabled:
      engagementNeonApproved && envBool("PROMO_GIFT_SPEND_ENABLED", true),
    treasureHuntEnabled: envBool("TREASURE_HUNT_ENABLED", true),
    stickerCollectionEnabled: envBool("STICKER_COLLECTION_ENABLED", true),
    creatorCollectionsEnabled: envBool("CREATOR_COLLECTIONS_ENABLED", true),
    engagementNeonApproved,
  };
}

export function getEngagementFlags(): EngagementFlags {
  const envFlags = getEngagementFlagsFromEnv();
  const merged: EngagementFlags = { ...envFlags, ...flagOverrideCache };
  if (!envFlags.engagementNeonApproved) {
    merged.engagementNeonApproved = false;
    merged.promotionalCoinsEnabled = false;
    merged.battleEnergyEnabled = false;
    merged.promoGiftSpendEnabled = false;
  }
  return merged;
}

export function canWriteEngagementWallets(): boolean {
  return getEngagementFlags().engagementNeonApproved;
}
