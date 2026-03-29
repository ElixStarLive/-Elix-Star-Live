import { dbLoadGifts } from "../lib/postgres";
import { logger } from "../lib/logger";

let giftValueCache: Record<string, number> = {};
let cacheLoaded = false;

export async function loadGiftValuesFromDb(): Promise<void> {
  try {
    const gifts = await dbLoadGifts();
    const map: Record<string, number> = {};
    for (const g of gifts) {
      map[g.gift_id] = g.battle_points || g.coin_cost;
    }
    if (Object.keys(map).length > 0) {
      giftValueCache = map;
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
