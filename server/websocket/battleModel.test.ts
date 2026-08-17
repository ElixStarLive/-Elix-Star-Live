import { describe, expect, it } from "vitest";
import {
  BATTLE_DURATION_SECONDS,
  allRequiredReady,
  battleOpenSeatCount,
  battleTimeLeftSeconds,
  battleTypeForParticipants,
  buildBattleStatePayload,
  checkBattleScoreTarget,
  createBattleSession,
  isBattleScorable,
  nextOpenRivalSeat,
  notReadyUserIds,
  parseBattleSession,
  rematchBattleSession,
  teamOfSeat,
  teamTotals,
  winnerFromScores,
} from "./battleModel";
import { battleScoresFixture, battleSessionFixture } from "./battleTestFixtures";

describe("battle domain model", () => {
  it("puts host + player3 on team A and opponent + player4 on team B", () => {
    expect(teamOfSeat("host")).toBe("teamA");
    expect(teamOfSeat("player3")).toBe("teamA");
    expect(teamOfSeat("opponent")).toBe("teamB");
    expect(teamOfSeat("player4")).toBe("teamB");
  });

  it("is 1x1 until BOTH support seats are filled", () => {
    const oneVsOne = battleSessionFixture({
      seats: { host: "c1", opponent: "c2" },
    });
    expect(oneVsOne.battleType).toBe("1x1");
    expect(
      battleTypeForParticipants(
        battleSessionFixture({
          seats: { host: "c1", opponent: "c2", player3: "c3" },
        }).participants,
      ),
    ).toBe("1x1");
    expect(
      battleTypeForParticipants(
        battleSessionFixture({
          seats: { host: "c1", opponent: "c2", player3: "c3", player4: "c4" },
        }).participants,
      ),
    ).toBe("2x2");
  });

  it("allocates rival seats in order and reports remaining capacity", () => {
    const solo = createBattleSession({
      roomId: "room-1",
      hostUserId: "c1",
      hostName: "C1",
    });
    expect(nextOpenRivalSeat(solo)).toBe("opponent");
    expect(battleOpenSeatCount(solo)).toBe(3);

    const full = battleSessionFixture({
      seats: { host: "c1", opponent: "c2", player3: "c3", player4: "c4" },
    });
    expect(nextOpenRivalSeat(full)).toBe(null);
    expect(battleOpenSeatCount(full)).toBe(0);
  });

  it("requires two seated creators, all present, before a battle may start", () => {
    const hostOnly = createBattleSession({
      roomId: "room-1",
      hostUserId: "c1",
      hostName: "C1",
    });
    expect(allRequiredReady(hostOnly)).toBe(false);

    const waiting = battleSessionFixture({
      seats: { host: "c1", opponent: "c2" },
      ready: false,
    });
    expect(allRequiredReady(waiting)).toBe(false);
    expect(notReadyUserIds(waiting)).toEqual(["c1", "c2"]);

    const present = battleSessionFixture({
      seats: { host: "c1", opponent: "c2" },
      ready: true,
    });
    expect(allRequiredReady(present)).toBe(true);
    expect(notReadyUserIds(present)).toEqual([]);
  });

  it("sums team totals from seats, not from screen position", () => {
    const scores = battleScoresFixture({
      host: 10,
      opponent: 4,
      player3: 5,
      player4: 20,
    });
    expect(teamTotals(scores)).toEqual({ teamA: 15, teamB: 24 });
    expect(winnerFromScores(scores)).toBe("teamB");
    expect(winnerFromScores(battleScoresFixture({ host: 7, opponent: 7 }))).toBe(
      "draw",
    );
    expect(winnerFromScores(battleScoresFixture({ host: 8, opponent: 7 }))).toBe(
      "teamA",
    );
  });

  it("refuses scoring outside an ACTIVE battle's own clock window", () => {
    const now = 1_000_000;
    const active = battleSessionFixture({
      status: "ACTIVE",
      seats: { host: "c1", opponent: "c2" },
      startedAt: now,
      endsAt: now + 5_000,
      now,
    });
    expect(isBattleScorable(active, now + 1_000)).toBe(true);
    expect(checkBattleScoreTarget(active, "host", now + 1_000)).toEqual({
      ok: true,
      participant: active.participants[0],
    });

    expect(isBattleScorable(active, now + 5_000)).toBe(false);
    expect(checkBattleScoreTarget(active, "host", now + 5_000)).toEqual({
      ok: false,
      reason: "expired",
    });

    const waiting = battleSessionFixture({
      seats: { host: "c1", opponent: "c2" },
    });
    expect(checkBattleScoreTarget(waiting, "host", now)).toEqual({
      ok: false,
      reason: "not_active",
    });
  });

  it("never scores an empty seat", () => {
    const now = 2_000_000;
    const oneVsOne = battleSessionFixture({
      status: "ACTIVE",
      seats: { host: "c1", opponent: "c2" },
      startedAt: now,
      endsAt: now + 10_000,
      now,
    });
    expect(checkBattleScoreTarget(oneVsOne, "player3", now + 1)).toEqual({
      ok: false,
      reason: "empty_seat",
    });
    expect(checkBattleScoreTarget(oneVsOne, "player4", now + 1)).toEqual({
      ok: false,
      reason: "empty_seat",
    });
  });

  it("derives remaining time from endsAt (never a stored countdown)", () => {
    const now = 3_000_000;
    const active = battleSessionFixture({
      status: "ACTIVE",
      seats: { host: "c1", opponent: "c2" },
      startedAt: now,
      endsAt: now + 42_000,
      now,
    });
    expect(battleTimeLeftSeconds(active, now)).toBe(42);
    expect(battleTimeLeftSeconds(active, now + 40_000)).toBe(2);
    expect(battleTimeLeftSeconds(active, now + 99_000)).toBe(0);

    const waiting = battleSessionFixture({
      seats: { host: "c1", opponent: "c2" },
    });
    expect(battleTimeLeftSeconds(waiting, now)).toBe(BATTLE_DURATION_SECONDS);
  });

  it("builds one wire payload with per-seat and per-team scores", () => {
    const now = 4_000_000;
    const battle = battleSessionFixture({
      status: "ACTIVE",
      seats: { host: "c1", opponent: "c2", player3: "c3", player4: "c4" },
      startedAt: now,
      endsAt: now + 60_000,
      now,
    });
    const payload = buildBattleStatePayload(
      battle,
      battleScoresFixture({ host: 3, opponent: 1, player3: 2, player4: 4 }),
      now,
    );
    expect(payload).toMatchObject({
      status: "ACTIVE",
      battleType: "2x2",
      hostUserId: "c1",
      opponentUserId: "c2",
      player3UserId: "c3",
      player4UserId: "c4",
      hostScore: 3,
      opponentScore: 1,
      player3Score: 2,
      player4Score: 4,
      teamAScore: 5,
      teamBScore: 5,
      timeLeft: 60,
      endsAt: now + 60_000,
      winner: null,
    });
  });

  it("rematch mints a new battle id with the same seats and zero scores", () => {
    const finished = {
      ...battleSessionFixture({
        status: "ENDED",
        seats: { host: "c1", opponent: "c2" },
      }),
      winner: "teamA" as const,
      finalScores: battleScoresFixture({ host: 9 }),
      finalizedAt: 123,
      finalizeReason: "timer",
    };
    const next = rematchBattleSession(finished, 5_000_000);
    expect(next.id).not.toBe(finished.id);
    expect(next.status).toBe("WAITING");
    expect(next.startedAt).toBe(0);
    expect(next.endsAt).toBe(0);
    expect(next.finalizedAt).toBe(0);
    expect(next.winner).toBe(null);
    expect(next.finalScores).toBe(null);
    expect(next.participants.map((p) => p.userId)).toEqual(["c1", "c2"]);
  });

  it("rejects a stored value that is not a canonical session", () => {
    const good = battleSessionFixture({ seats: { host: "c1", opponent: "c2" } });
    expect(parseBattleSession(JSON.parse(JSON.stringify(good)))).toEqual(good);

    expect(parseBattleSession(null)).toBe(null);
    expect(parseBattleSession({})).toBe(null);
    // Legacy flat shape from before the seat model: must NOT be silently adopted.
    expect(
      parseBattleSession({
        id: "b1",
        roomId: "room-1",
        status: "ACTIVE",
        hostUserId: "c1",
        opponentUserId: "c2",
      }),
    ).toBe(null);
    // Duplicate seat, unknown seat and missing host are all invalid.
    expect(
      parseBattleSession({ ...good, participants: [
        { userId: "c1", seat: "host" },
        { userId: "c9", seat: "host" },
      ] }),
    ).toBe(null);
    expect(
      parseBattleSession({ ...good, participants: [{ userId: "c1", seat: "player9" }] }),
    ).toBe(null);
    expect(
      parseBattleSession({ ...good, participants: [{ userId: "c2", seat: "opponent" }] }),
    ).toBe(null);
  });
});
