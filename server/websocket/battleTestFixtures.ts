/**
 * Canonical battle session builder for tests.
 *
 * Tests must never hand-roll a battle object: if the domain model changes, this
 * one builder changes with it, so a test can't keep asserting against a shape
 * the server no longer stores.
 */

import {
  BATTLE_DURATION_SECONDS,
  type BattleSeat,
  type BattleSession,
  type BattleStatus,
  SEAT_TEAM,
  battleTypeForParticipants,
  emptyBattleScores,
  type BattleScores,
} from "./battleModel";

export function battleSessionFixture(opts: {
  id?: string;
  roomId?: string;
  status?: BattleStatus;
  seats: Partial<Record<BattleSeat, string>>;
  ready?: boolean;
  startedAt?: number;
  endsAt?: number;
  now?: number;
}): BattleSession {
  const now = opts.now ?? Date.now();
  const roomId = opts.roomId ?? "room-1";
  const status = opts.status ?? "WAITING";
  const ready = opts.ready ?? true;
  const participants = (Object.keys(opts.seats) as BattleSeat[])
    .filter((seat) => !!opts.seats[seat])
    .map((seat) => ({
      userId: opts.seats[seat] as string,
      name: opts.seats[seat] as string,
      roomId: seat === "host" ? roomId : `${opts.seats[seat]}-room`,
      seat,
      teamId: SEAT_TEAM[seat],
      ready,
      joinedAt: now,
    }));
  const active = status === "ACTIVE";
  return {
    id: opts.id ?? "battle-test",
    roomId,
    battleType: battleTypeForParticipants(participants),
    status,
    createdAt: now,
    startedAt: opts.startedAt ?? (active ? now : 0),
    endsAt:
      opts.endsAt ?? (active ? now + BATTLE_DURATION_SECONDS * 1000 : 0),
    finalizedAt: 0,
    participants,
    winner: null,
    finalScores: null,
    finalizeReason: "",
  };
}

export function battleScoresFixture(
  partial: Partial<BattleScores>,
): BattleScores {
  return { ...emptyBattleScores(), ...partial };
}
