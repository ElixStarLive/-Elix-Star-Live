/**
 * Shared host↔spectator mapping of battle_state_sync / battle_score seat + room ids.
 */

export type BattleStreamIds = {
  hostRoomId: string;
  hostUserId: string;
  opponentRoomId: string;
  opponentUserId: string;
  player3UserId: string;
  player4UserId: string;
};

/** Parse battle participant / room ids from a WS payload (missing → ''). */
export function battleStreamIdsFromPayload(data: {
  hostRoomId?: unknown;
  hostUserId?: unknown;
  opponentRoomId?: unknown;
  opponentUserId?: unknown;
  player3UserId?: unknown;
  player4UserId?: unknown;
}): BattleStreamIds {
  return {
    hostRoomId: typeof data.hostRoomId === 'string' ? data.hostRoomId : '',
    hostUserId: typeof data.hostUserId === 'string' ? data.hostUserId : '',
    opponentRoomId: typeof data.opponentRoomId === 'string' ? data.opponentRoomId : '',
    opponentUserId: typeof data.opponentUserId === 'string' ? data.opponentUserId : '',
    player3UserId: typeof data.player3UserId === 'string' ? data.player3UserId : '',
    player4UserId: typeof data.player4UserId === 'string' ? data.player4UserId : '',
  };
}
