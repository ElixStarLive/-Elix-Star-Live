import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetValkeyFake, valkeyFake } from "./battleValkeyFake";
import type { BattleResultRecord } from "../lib/postgres";

const broadcasts: Array<{ roomId: string; event: string; payload: unknown }> = [];
const revoked: Array<{ roomId: string; userId: string }> = [];
const persisted: BattleResultRecord[] = [];
let insertFails = false;

vi.mock("../lib/valkey", () => valkeyFake);

vi.mock("./index", () => ({
  broadcastToRoom: (roomId: string, event: string, payload: unknown) => {
    broadcasts.push({ roomId, event, payload });
  },
  revokeBattlePublish: async (roomId: string, userId: string) => {
    revoked.push({ roomId, userId });
  },
}));

vi.mock("../lib/postgres", () => ({
  dbInsertBattleResult: async (record: BattleResultRecord) => {
    if (insertFails) throw new Error("neon down");
    persisted.push(record);
  },
}));

const battle = await import("./battle");
const {
  addBattleScore,
  buildBattleStateForRoom,
  claimBattleSeat,
  confirmBattleParticipantPresence,
  ensureBattleForHost,
  finalizeBattle,
  getBattleFromStore,
  getBattleScores,
  removeBattleParticipant,
  startBattleIfReady,
} = battle;

const ROOM = "host-room";

function eventsOf(event: string) {
  return broadcasts.filter((b) => b.event === event);
}

async function seatedWaitingBattle(): Promise<void> {
  await ensureBattleForHost({ roomId: ROOM, hostUserId: "c1", hostName: "C1" });
  await confirmBattleParticipantPresence(ROOM, "c1");
  await claimBattleSeat(ROOM, "c2", "C2", "c2-room");
  await confirmBattleParticipantPresence(ROOM, "c2");
}

async function activeBattle(): Promise<void> {
  await seatedWaitingBattle();
  const started = await startBattleIfReady(ROOM);
  expect(started.ok).toBe(true);
}

describe("battle authority", () => {
  beforeEach(() => {
    resetValkeyFake();
    broadcasts.length = 0;
    revoked.length = 0;
    persisted.length = 0;
    insertFails = false;
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("start readiness gate", () => {
    it("stays WAITING with only the host seated", async () => {
      await ensureBattleForHost({ roomId: ROOM, hostUserId: "c1", hostName: "C1" });
      await confirmBattleParticipantPresence(ROOM, "c1");
      const started = await startBattleIfReady(ROOM);
      expect(started).toMatchObject({ ok: false, reason: "no_rivals" });
      expect((await getBattleFromStore(ROOM))?.status).toBe("WAITING");
    });

    it("stays WAITING until every seated creator is confirmed present", async () => {
      await ensureBattleForHost({ roomId: ROOM, hostUserId: "c1", hostName: "C1" });
      await confirmBattleParticipantPresence(ROOM, "c1");
      await claimBattleSeat(ROOM, "c2", "C2", "c2-room");

      const held = await startBattleIfReady(ROOM);
      expect(held).toMatchObject({ ok: false, reason: "not_ready", notReady: ["c2"] });
      const waiting = await getBattleFromStore(ROOM);
      expect(waiting?.status).toBe("WAITING");
      expect(waiting?.startedAt).toBe(0);
      expect(waiting?.endsAt).toBe(0);

      await confirmBattleParticipantPresence(ROOM, "c2");
      const started = await startBattleIfReady(ROOM);
      expect(started.ok).toBe(true);
      const active = await getBattleFromStore(ROOM);
      expect(active?.status).toBe("ACTIVE");
      expect(active?.startedAt).toBeGreaterThan(0);
      expect(active?.endsAt).toBeGreaterThan(active?.startedAt ?? 0);
    });

    it("refuses a 3-creator match (player3 without player4)", async () => {
      await seatedWaitingBattle();
      await claimBattleSeat(ROOM, "c3", "C3", "c3-room");
      await confirmBattleParticipantPresence(ROOM, "c3");
      expect(await startBattleIfReady(ROOM)).toMatchObject({
        ok: false,
        reason: "incomplete_teams",
      });

      await claimBattleSeat(ROOM, "c4", "C4", "c4-room");
      await confirmBattleParticipantPresence(ROOM, "c4");
      const started = await startBattleIfReady(ROOM);
      expect(started.ok).toBe(true);
      expect((await getBattleFromStore(ROOM))?.battleType).toBe("2x2");
    });

    it("re-entering battle mode never resets a running battle", async () => {
      await activeBattle();
      const before = await getBattleFromStore(ROOM);
      await addBattleScore({ roomId: ROOM, seat: "host", points: 40, source: "tap" });

      const again = await ensureBattleForHost({
        roomId: ROOM,
        hostUserId: "c1",
        hostName: "C1",
      });
      expect(again?.id).toBe(before?.id);
      expect(again?.status).toBe("ACTIVE");
      expect(again?.endsAt).toBe(before?.endsAt);
      expect((await getBattleScores(ROOM)).host).toBe(40);
    });

    it("only the host may enter/start the battle for the room", async () => {
      await ensureBattleForHost({ roomId: ROOM, hostUserId: "c1", hostName: "C1" });
      expect(
        await ensureBattleForHost({
          roomId: ROOM,
          hostUserId: "intruder",
          hostName: "X",
        }),
      ).toBe(null);
    });
  });

  describe("seating", () => {
    it("fills rival seats in order and refuses a fifth creator", async () => {
      await ensureBattleForHost({ roomId: ROOM, hostUserId: "c1", hostName: "C1" });
      for (const id of ["c2", "c3", "c4"]) {
        expect(await claimBattleSeat(ROOM, id, id, `${id}-room`)).not.toBe(null);
      }
      expect(await claimBattleSeat(ROOM, "c5", "c5", "c5-room")).toBe(null);
      const session = await getBattleFromStore(ROOM);
      expect(session?.participants.map((p) => [p.seat, p.userId])).toEqual([
        ["host", "c1"],
        ["opponent", "c2"],
        ["player3", "c3"],
        ["player4", "c4"],
      ]);
    });

    it("records the creator's own room from the server, not the client", async () => {
      await ensureBattleForHost({ roomId: ROOM, hostUserId: "c1", hostName: "C1" });
      await claimBattleSeat(ROOM, "c2", "C2", "c2-room");
      const seat = (await getBattleFromStore(ROOM))?.participants.find(
        (p) => p.userId === "c2",
      );
      expect(seat?.roomId).toBe("c2-room");
      expect(seat?.teamId).toBe("teamB");
    });

    it("removing one creator frees that seat only and zeroes that seat's score", async () => {
      await activeBattle();
      await claimBattleSeat(ROOM, "c3", "C3", "c3-room");
      await addBattleScore({ roomId: ROOM, seat: "host", points: 10, source: "tap" });
      await addBattleScore({ roomId: ROOM, seat: "player3", points: 7, source: "tap" });

      expect(await removeBattleParticipant(ROOM, "c3")).toBe(true);
      const scores = await getBattleScores(ROOM);
      expect(scores.player3).toBe(0);
      expect(scores.host).toBe(10);
      const session = await getBattleFromStore(ROOM);
      expect(session?.participants.map((p) => p.userId)).toEqual(["c1", "c2"]);
      expect(session?.status).toBe("ACTIVE");
    });

    it("never removes the host through the participant path", async () => {
      await activeBattle();
      expect(await removeBattleParticipant(ROOM, "c1")).toBe(false);
      expect((await getBattleFromStore(ROOM))?.participants).toHaveLength(2);
    });
  });

  describe("scoring choke point", () => {
    it("scores a real seat and broadcasts per-seat + per-team totals", async () => {
      await activeBattle();
      const result = await addBattleScore({
        roomId: ROOM,
        seat: "opponent",
        points: 12,
        source: "paid_gift",
      });
      expect(result).toMatchObject({
        ok: true,
        seat: "opponent",
        creatorId: "c2",
        teamId: "teamB",
        points: 12,
      });
      expect(eventsOf("battle_score").at(-1)?.payload).toMatchObject({
        opponentScore: 12,
        teamBScore: 12,
        teamAScore: 0,
        lastScorer: "opponent",
      });
    });

    it("refuses scoring before start, after expiry, on empty seats and on bad input", async () => {
      await seatedWaitingBattle();
      expect(
        await addBattleScore({ roomId: ROOM, seat: "host", points: 5, source: "tap" }),
      ).toMatchObject({ ok: false, reason: "not_active" });

      await startBattleIfReady(ROOM);
      expect(
        await addBattleScore({
          roomId: ROOM,
          seat: "player4",
          points: 5,
          source: "paid_gift",
        }),
      ).toMatchObject({ ok: false, reason: "empty_seat" });
      expect(
        await addBattleScore({ roomId: ROOM, seat: "host", points: 0, source: "tap" }),
      ).toMatchObject({ ok: false, reason: "invalid_points" });
      expect(
        await addBattleScore({ roomId: ROOM, seat: "host", points: -50, source: "tap" }),
      ).toMatchObject({ ok: false, reason: "invalid_points" });
      expect(
        await addBattleScore({
          roomId: ROOM,
          seat: "host",
          points: 5,
          // A client-invented source must never reach the score hash.
          source: "free_money" as never,
        }),
      ).toMatchObject({ ok: false, reason: "invalid_source" });

      // Expire the clock: late points are refused, and the score stays frozen.
      const active = await getBattleFromStore(ROOM);
      if (!active) throw new Error("battle missing");
      await addBattleScore({ roomId: ROOM, seat: "host", points: 9, source: "tap" });
      vi.setSystemTime(new Date(active.endsAt + 1));
      expect(
        await addBattleScore({
          roomId: ROOM,
          seat: "host",
          points: 1000,
          source: "paid_gift",
        }),
      ).toMatchObject({ ok: false, reason: "expired" });
      expect((await getBattleScores(ROOM)).host).toBe(9);
    });

    it("refuses scoring for a room with no battle", async () => {
      expect(
        await addBattleScore({
          roomId: "no-battle",
          seat: "host",
          points: 5,
          source: "tap",
        }),
      ).toMatchObject({ ok: false, reason: "no_battle" });
    });
  });

  describe("state sync", () => {
    it("serves the same payload from the live score hash", async () => {
      await activeBattle();
      await addBattleScore({ roomId: ROOM, seat: "host", points: 6, source: "tap" });
      const state = await buildBattleStateForRoom(ROOM);
      expect(state).toMatchObject({
        status: "ACTIVE",
        battleType: "1x1",
        hostUserId: "c1",
        opponentUserId: "c2",
        hostScore: 6,
        teamAScore: 6,
      });
      expect(Number(state?.timeLeft)).toBeGreaterThan(0);
      expect(await buildBattleStateForRoom("no-battle")).toBe(null);
    });
  });

  describe("finalization", () => {
    it("freezes scores, picks the winner, persists once and revokes battle publish", async () => {
      await activeBattle();
      await addBattleScore({ roomId: ROOM, seat: "host", points: 30, source: "paid_gift" });
      await addBattleScore({ roomId: ROOM, seat: "opponent", points: 12, source: "test_gift" });

      const finalized = await finalizeBattle(ROOM, "timer");
      expect(finalized?.status).toBe("ENDED");
      expect(finalized?.winner).toBe("teamA");
      expect(finalized?.finalScores).toMatchObject({ host: 30, opponent: 12 });
      expect(eventsOf("battle_ended")).toHaveLength(1);
      expect(eventsOf("battle_ended")[0].payload).toMatchObject({
        winner: "host",
        hostScore: 30,
        opponentScore: 12,
        teamAScore: 30,
        teamBScore: 12,
      });
      expect(persisted).toHaveLength(1);
      expect(persisted[0]).toMatchObject({
        roomId: ROOM,
        battleType: "1x1",
        winner: "teamA",
        teamAScore: 30,
        teamBScore: 12,
        finalizeReason: "timer",
      });
      expect(persisted[0].participants).toEqual([
        { seat: "host", creatorUserId: "c1", teamId: "teamA", score: 30 },
        { seat: "opponent", creatorUserId: "c2", teamId: "teamB", score: 12 },
      ]);
      // The rival's battle-only publish grant ends; the creators stay live.
      expect(revoked).toEqual([{ roomId: ROOM, userId: "c2" }]);
    });

    it("is exactly-once under concurrent finalize attempts", async () => {
      await activeBattle();
      await addBattleScore({ roomId: ROOM, seat: "opponent", points: 5, source: "tap" });

      const results = await Promise.all([
        finalizeBattle(ROOM, "timer"),
        finalizeBattle(ROOM, "host_end"),
        finalizeBattle(ROOM, "participant_disconnect"),
        finalizeBattle(ROOM, "timer"),
      ]);
      expect(results.filter(Boolean)).toHaveLength(1);
      expect(eventsOf("battle_ended")).toHaveLength(1);
      expect(persisted).toHaveLength(1);

      // A later attempt on the ENDED session is still a no-op.
      expect(await finalizeBattle(ROOM, "host_end")).toBe(null);
      expect(eventsOf("battle_ended")).toHaveLength(1);
    });

    it("blocks all scoring after finalization", async () => {
      await activeBattle();
      await finalizeBattle(ROOM, "timer");
      expect(
        await addBattleScore({
          roomId: ROOM,
          seat: "host",
          points: 500,
          source: "paid_gift",
        }),
      ).toMatchObject({ ok: false, reason: "not_active" });
    });

    it("reports a draw as a draw", async () => {
      await activeBattle();
      await addBattleScore({ roomId: ROOM, seat: "host", points: 8, source: "tap" });
      await addBattleScore({ roomId: ROOM, seat: "opponent", points: 8, source: "tap" });
      const finalized = await finalizeBattle(ROOM, "timer");
      expect(finalized?.winner).toBe("draw");
      expect(eventsOf("battle_ended")[0].payload).toMatchObject({ winner: "draw" });
    });

    it("still ends the battle for clients when the permanent write fails", async () => {
      insertFails = true;
      await activeBattle();
      const finalized = await finalizeBattle(ROOM, "timer");
      expect(finalized?.status).toBe("ENDED");
      expect(eventsOf("battle_ended")).toHaveLength(1);
      expect(persisted).toHaveLength(0);
    });

    it("rematch finalizes nothing twice and starts a NEW battle id with zero scores", async () => {
      await activeBattle();
      await addBattleScore({ roomId: ROOM, seat: "host", points: 25, source: "paid_gift" });
      const first = await finalizeBattle(ROOM, "host_end");

      const rematch = await ensureBattleForHost({
        roomId: ROOM,
        hostUserId: "c1",
        hostName: "C1",
      });
      expect(rematch?.id).not.toBe(first?.id);
      expect(rematch?.status).toBe("WAITING");
      expect(rematch?.winner).toBe(null);
      expect(rematch?.finalScores).toBe(null);
      expect(rematch?.participants.map((p) => p.userId)).toEqual(["c1", "c2"]);
      expect(await getBattleScores(ROOM)).toMatchObject({ host: 0, opponent: 0 });

      const started = await startBattleIfReady(ROOM);
      expect(started.ok).toBe(true);
      const active = await getBattleFromStore(ROOM);
      expect(active?.id).toBe(rematch?.id);
      expect(active?.endsAt).toBeGreaterThan(Date.now());
      // The finished battle was persisted once; the rematch is a separate record.
      expect(persisted).toHaveLength(1);
    });
  });
});
