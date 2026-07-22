/**
 * Client Engagement Phase 1 flags.
 * Defaults match the approval gate. Wallet-changing features stay off until
 * Neon migrations are explicitly approved and server flags are flipped.
 *
 * Optional Vite overrides (build-time):
 * VITE_ENGAGEMENT_HUB_ENABLED, VITE_DAILY_LOGIN_ENABLED, etc.
 */
function viteBool(name: string, fallback: boolean): boolean {
  const raw = String(import.meta.env[name] ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return fallback;
}

export const engagementFlags = {
  engagementHubEnabled: viteBool("VITE_ENGAGEMENT_HUB_ENABLED", true),
  promotionalCoinsEnabled: viteBool("VITE_PROMOTIONAL_COINS_ENABLED", false),
  battleEnergyEnabled: viteBool("VITE_BATTLE_ENERGY_ENABLED", false),
  dailyLoginEnabled: viteBool("VITE_DAILY_LOGIN_ENABLED", true),
  missionRewardsEnabled: viteBool("VITE_MISSION_REWARDS_ENABLED", true),
  promoGiftSpendEnabled: viteBool("VITE_PROMO_GIFT_SPEND_ENABLED", false),
  treasureHuntEnabled: viteBool("VITE_TREASURE_HUNT_ENABLED", true),
  stickerCollectionEnabled: viteBool("VITE_STICKER_COLLECTION_ENABLED", true),
  creatorCollectionsEnabled: viteBool("VITE_CREATOR_COLLECTIONS_ENABLED", true),
} as const;
