import { dbLoadGifts } from "../lib/postgres";
import { logger } from "../lib/logger";
import {
  giftIconUrlFromAnimation,
  resolveGiftMediaUrl,
} from "../lib/giftAssets";
import { SEAT_TEAM, type BattleSeat } from "./battleModel";

let giftValueCache: Record<string, number> = {};
let giftAnimationCache: Record<string, string> = {};

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
      logger.info({ count: Object.keys(map).length }, "Gift battle values loaded from DB");
    }
  } catch (err) {
    logger.error({ err }, "loadGiftValuesFromDb failed");
  }
}

export function getGiftValue(giftId: string): number {
  return giftValueCache[giftId] || 0;
}

function isPlayableGiftVideoUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  return /\.(mp4|webm|mov)(\?|$)/i.test(url.split("?")[0] || url);
}

/** Absolute CDN URL for gift video animation, or null if not a playable video. */
export function getGiftAnimationUrl(giftId: string): string | null {
  if (!giftId) return null;
  const cached = giftAnimationCache[giftId] || null;
  return isPlayableGiftVideoUrl(cached) ? cached : null;
}

/**
 * Resolve a playable gift video URL for delivery. Prefers an explicit URL from
 * the caller (REST already loaded the gift row), then cache, then a fresh DB read.
 */
export async function resolvePlayableGiftVideoUrl(
  giftId: string,
  explicitUrl?: string | null,
): Promise<string | null> {
  const fromExplicit = resolveGiftMediaUrl(explicitUrl ?? null);
  if (isPlayableGiftVideoUrl(fromExplicit)) {
    giftAnimationCache[giftId] = fromExplicit;
    return fromExplicit;
  }
  const cached = getGiftAnimationUrl(giftId);
  if (cached) return cached;
  try {
    await loadGiftValuesFromDb();
  } catch {
    /* ignore */
  }
  return getGiftAnimationUrl(giftId);
}

export function getGiftIconUrl(giftId: string): string | null {
  const anim = getGiftAnimationUrl(giftId);
  return giftIconUrlFromAnimation(anim);
}

/**
 * Fan Energy side: red = host + player3, blue = opponent + player4.
 * Seat → team mapping itself lives in `battleModel.ts`; this only names the two
 * Fan Energy bars the client already renders.
 */
export function battleTargetToFanSide(target: BattleSeat): "host" | "opponent" {
  return SEAT_TEAM[target] === "teamB" ? "opponent" : "host";
}
