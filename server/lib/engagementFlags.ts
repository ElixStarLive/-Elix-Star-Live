/**
 * Engagement Phase 1 feature flags.
 * Wallet-changing / Neon-backed economy features stay OFF until explicit approval.
 * Defaults match the Phase 1 approval gate.
 */
function envBool(name: string, fallback: boolean): boolean {
  const raw = (process.env[name] || "").trim().toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return fallback;
}

export type EngagementFlags = {
  /** Hub routes + read-only shells */
  engagementHubEnabled: boolean;
  /** Promotional coin balance/ledger writes */
  promotionalCoinsEnabled: boolean;
  /** Battle Energy earn/boost + Fan Energy multiplier */
  battleEnergyEnabled: boolean;
  /** Daily login claim (rewards still respect promo/energy flags) */
  dailyLoginEnabled: boolean;
  /** Mission claim rewards (XP always; promo/energy gated separately) */
  missionRewardsEnabled: boolean;
  /** Spending promotional coins on gifts (zero Diamonds when enabled) */
  promoGiftSpendEnabled: boolean;
  /**
   * Explicit Neon migration approval. Even if other flags are on, balance
   * writes stay disabled until this is true AND the pending migration is applied.
   */
  engagementNeonApproved: boolean;
};

export function getEngagementFlags(): EngagementFlags {
  const engagementNeonApproved = envBool("ENGAGEMENT_NEON_APPROVED", false);
  return {
    engagementHubEnabled: envBool("ENGAGEMENT_HUB_ENABLED", true),
    promotionalCoinsEnabled:
      engagementNeonApproved && envBool("PROMOTIONAL_COINS_ENABLED", false),
    battleEnergyEnabled:
      engagementNeonApproved && envBool("BATTLE_ENERGY_ENABLED", false),
    dailyLoginEnabled: envBool("DAILY_LOGIN_ENABLED", true),
    missionRewardsEnabled: envBool("MISSION_REWARDS_ENABLED", true),
    promoGiftSpendEnabled:
      engagementNeonApproved && envBool("PROMO_GIFT_SPEND_ENABLED", false),
    engagementNeonApproved,
  };
}

/** True only when Neon engagement schema may be written. */
export function canWriteEngagementWallets(): boolean {
  return getEngagementFlags().engagementNeonApproved;
}
