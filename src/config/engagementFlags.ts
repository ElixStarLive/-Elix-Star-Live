/**
 * Client Engagement flags — Phase 1 + 1.5 live defaults.
 * Optional Vite overrides still supported.
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
  promotionalCoinsEnabled: viteBool("VITE_PROMOTIONAL_COINS_ENABLED", true),
  battleEnergyEnabled: viteBool("VITE_BATTLE_ENERGY_ENABLED", true),
  dailyLoginEnabled: viteBool("VITE_DAILY_LOGIN_ENABLED", true),
  missionRewardsEnabled: viteBool("VITE_MISSION_REWARDS_ENABLED", true),
  promoGiftSpendEnabled: viteBool("VITE_PROMO_GIFT_SPEND_ENABLED", true),
  treasureHuntEnabled: viteBool("VITE_TREASURE_HUNT_ENABLED", true),
  stickerCollectionEnabled: viteBool("VITE_STICKER_COLLECTION_ENABLED", true),
  creatorCollectionsEnabled: viteBool("VITE_CREATOR_COLLECTIONS_ENABLED", true),
} as const;
