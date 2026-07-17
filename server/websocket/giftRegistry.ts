import { dbLoadGifts } from "../lib/postgres";
import { logger } from "../lib/logger";
import {
  giftIconUrlFromAnimation,
  resolveGiftMediaUrl,
} from "../lib/giftAssets";

let giftValueCache: Record<string, number> = {};
let giftAnimationCache: Record<string, string> = {};
let cacheLoaded = false;

export async function loadGiftValuesFromDb(): Promise<void> {
  try {
    const gifts = await dbLoadGifts();
    const map: Record<string, number> = {};
    const anim: Record<string, string> = {};
    for (const g of gifts) {
      map[g.gift_id] = g.battle_points || g.coin_cost;
      const url = resolveGiftMediaUrl(g.animation_url);
      if (url && /\.(mp4|webm|mov)(\?|$)/i.test(url)) {
        anim[g.gift_id] = url;
      }
    }
    if (Object.keys(map).length > 0) {
      giftValueCache = map;
      giftAnimationCache = anim;
      cacheLoaded = true;
      logger.info({ count: Object.keys(map).length }, "Gift battle values loaded from DB");
    }
  } catch (err) {
    logger.error({ err }, "loadGiftValuesFromDb failed");
  }
}

export function getGiftValue(giftId: string): number {
  return giftValueCache[giftId] || 0;
}

/** Absolute CDN URL for gift video animation, or null if not a playable video. */
export function getGiftAnimationUrl(giftId: string): string | null {
  if (!giftId) return null;
  return giftAnimationCache[giftId] || null;
}

export function getGiftIconUrl(giftId: string): string | null {
  const anim = getGiftAnimationUrl(giftId);
  return giftIconUrlFromAnimation(anim);
}

export function isGiftCacheLoaded(): boolean {
  return cacheLoaded;
}

export function normalizeBattleTarget(
  rawTarget: unknown,
): "host" | "opponent" | null {
  if (rawTarget === "host" || rawTarget === "opponent") return rawTarget;
  if (rawTarget === "me") return "host";
  if (rawTarget === "player4") return "opponent";
  if (rawTarget === "player3") return "host";
  return null;
}
