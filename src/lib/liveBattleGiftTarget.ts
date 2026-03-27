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
