/**
 * MVP columns (2- or 4-player): map server `battleTarget` to red vs blue team for leaderboards.
 * Server buckets: P1=host, P2=opponent, P3=player3, P4=player4.
 * Red team = host + player3; blue = opponent + player4 (2-player: only P1/P2; P3/P4 absent).
 */
export type BattleGiftSide = "host" | "opponent";

/** Server PK slot / gift bucket — not UI-relative "me". */
export type ServerBattleGiftTarget = "host" | "opponent" | "player3" | "player4";

/**
 * Map LiveStream UI selection (left/right "me"/"opponent") to server team slots.
 * Server always uses host=red (P1), opponent=blue (P2); UI "opponent" means "other panel" and flips by perspective.
 */
export function liveStreamUiGiftTargetToServerBattleTarget(
  giftTarget: "me" | "opponent" | "player3" | "player4",
  params: {
    isBroadcast: boolean;
    isBattleJoiner: boolean;
    effectiveStreamId: string;
    hostRoomId: string;
    opponentRoomId: string;
  },
): ServerBattleGiftTarget {
  if (giftTarget === "player3") return "player3";
  if (giftTarget === "player4") return "player4";
  if (params.isBroadcast) {
    return giftTarget === "me" ? "host" : "opponent";
  }
  if (params.isBattleJoiner) {
    return giftTarget === "me" ? "opponent" : "host";
  }
  const { effectiveStreamId, hostRoomId, opponentRoomId } = params;
  if (opponentRoomId && effectiveStreamId === opponentRoomId) {
    return giftTarget === "me" ? "opponent" : "host";
  }
  if (hostRoomId && effectiveStreamId === hostRoomId) {
    return giftTarget === "me" ? "host" : "opponent";
  }
  return giftTarget === "me" ? "host" : "opponent";
}

export function normalizeBattleGiftTarget(raw: unknown): BattleGiftSide | null {
  if (raw === "host" || raw === "me" || raw === "player3") return "host";
  if (raw === "opponent" || raw === "player4") return "opponent";
  return null;
}

/** Resolve gift PNG/icon URL for battle tile stacks (icon only — never video). */
export function resolveBattleGiftIconUrl(
  icon: unknown,
  resolveAsset: (path: string) => string,
): string | null {
  if (typeof icon !== "string") return null;
  const raw = icon.trim();
  if (!raw || raw === "🎁") return null;
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  return resolveAsset(raw.startsWith("/") ? raw : `/${raw}`);
}

/** Recent gift icons shown on battle half / slot tiles (oldest → newest, capped). */
export type BattleTileGifts = {
  host: string[];
  opponent: string[];
  player3: string[];
  player4: string[];
};

export const EMPTY_BATTLE_TILE_GIFTS: BattleTileGifts = {
  host: [],
  opponent: [],
  player3: [],
  player4: [],
};

export const BATTLE_TILE_GIFT_STACK_CAP = 8;

export function appendBattleTileGift(
  prev: BattleTileGifts,
  slot: keyof BattleTileGifts,
  iconUrl: string,
): BattleTileGifts {
  if (!iconUrl) return prev;
  const next = [...prev[slot], iconUrl];
  return {
    ...prev,
    [slot]:
      next.length > BATTLE_TILE_GIFT_STACK_CAP
        ? next.slice(-BATTLE_TILE_GIFT_STACK_CAP)
        : next,
  };
}

/** Append icon for a server battleTarget (P3/P4 also mirror onto team host/opponent tiles). */
export function appendBattleTileGiftForTarget(
  prev: BattleTileGifts,
  target: unknown,
  iconUrl: string,
): BattleTileGifts {
  if (!iconUrl) return prev;
  if (target === "player3") {
    return appendBattleTileGift(appendBattleTileGift(prev, "player3", iconUrl), "host", iconUrl);
  }
  if (target === "player4") {
    return appendBattleTileGift(appendBattleTileGift(prev, "player4", iconUrl), "opponent", iconUrl);
  }
  const side = normalizeBattleGiftTarget(target);
  if (side === "host" || target === "host" || target === "me") {
    return appendBattleTileGift(prev, "host", iconUrl);
  }
  if (side === "opponent" || target === "opponent") {
    return appendBattleTileGift(prev, "opponent", iconUrl);
  }
  return prev;
}
