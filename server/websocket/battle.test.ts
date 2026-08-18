import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  holdValkeyFakeLock,
  resetValkeyFake,
  setValkeyFakeHashesReachable,
  setValkeyFakeLocksAvailable,
  setValkeyFakeStringsWritable,
  valkeyFake,
} from "./battleValkeyFake";
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
  flushPendingBattleResults,
  getBattleFromStore,
  getBattleScoresState,
  removeBattleParticipant,
  startBattleIfReady,
} = battle;

const ROOM = "host-room";

/** Live scores, failing the test if the fake claims they are unreadable. */
async function scoresOf(roomId: string) {
  const read = await getBattleScoresState(roomId);
  if (read.status !== "ok") throw new Error("scores unexpectedly unreadable");
  return read.scores;
}

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
      expect((await scoresOf(ROOM)).host).toBe(40);
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
        expect((await claimBattleSeat(ROOM, id, id, `${id}-room`)).status).toBe(
          "seated",
        );
      }
      expect((await claimBattleSeat(ROOM, "c5", "c5", "c5-room")).status).toBe("full");
      const session = await getBattleFromStore(ROOM);
      expect(session?.participants.map((p) => [p.seat, p.userId])).toEqual([
        ["host", "c1"],
        ["opponent", "c2"],
        ["player3", "c3"],
        ["player4", "c4"],
      ]);
    });

    it("seats creators 1-4, refuses the 5th, and starts only when all are ready", async () => {
      // Creator 1 (host).
      await ensureBattleForHost({ roomId: ROOM, hostUserId: "c1", hostName: "C1" });
      await confirmBattleParticipantPresence(ROOM, "c1");
      expect(await startBattleIfReady(ROOM)).toMatchObject({ reason: "no_rivals" });

      // Creator 2 → a complete 1x1 that starts.
      expect((await claimBattleSeat(ROOM, "c2", "C2", "c2-room")).status).toBe(
        "seated",
      );
      await confirmBattleParticipantPresence(ROOM, "c2");
      expect((await startBattleIfReady(ROOM)).ok).toBe(true);
      expect((await getBattleFromStore(ROOM))?.battleType).toBe("1x1");
      expect((await getBattleFromStore(ROOM))?.participants).toHaveLength(2);

      // Creator 3 IS seated (never refused) — it is only the 2x2 START that waits.
      expect((await claimBattleSeat(ROOM, "c3", "C3", "c3-room")).status).toBe(
        "seated",
      );
      await confirmBattleParticipantPresence(ROOM, "c3");
      expect((await getBattleFromStore(ROOM))?.participants).toHaveLength(3);

      // Creator 4 completes the 2x2 roster.
      expect((await claimBattleSeat(ROOM, "c4", "C4", "c4-room")).status).toBe(
        "seated",
      );
      await confirmBattleParticipantPresence(ROOM, "c4");
      const full = await getBattleFromStore(ROOM);
      expect(full?.participants.map((p) => [p.seat, p.userId, p.teamId])).toEqual([
        ["host", "c1", "teamA"],
        ["opponent", "c2", "teamB"],
        ["player3", "c3", "teamA"],
        ["player4", "c4", "teamB"],
      ]);
      expect(full?.battleType).toBe("2x2");

      // Creator 5 is refused: four seats is the hard maximum.
      expect((await claimBattleSeat(ROOM, "c5", "C5", "c5-room")).status).toBe("full");
      expect((await getBattleFromStore(ROOM))?.participants).toHaveLength(4);
    });

    it("holds the 2x2 start until the fourth creator is present", async () => {
      await ensureBattleForHost({ roomId: ROOM, hostUserId: "c1", hostName: "C1" });
      for (const id of ["c2", "c3"]) {
        await claimBattleSeat(ROOM, id, id, `${id}-room`);
      }
      for (const id of ["c1", "c2", "c3"]) {
        await confirmBattleParticipantPresence(ROOM, id);
      }
      // Three creators = an unbalanced 2x2 roster: start is refused, seats stay.
      expect(await startBattleIfReady(ROOM)).toMatchObject({
        ok: false,
        reason: "incomplete_teams",
      });
      const waiting = await getBattleFromStore(ROOM);
      expect(waiting?.status).toBe("WAITING");
      expect(waiting?.participants).toHaveLength(3);

      await claimBattleSeat(ROOM, "c4", "C4", "c4-room");
      expect(await startBattleIfReady(ROOM)).toMatchObject({
        ok: false,
        reason: "not_ready",
        notReady: ["c4"],
      });
      await confirmBattleParticipantPresence(ROOM, "c4");
      expect((await startBattleIfReady(ROOM)).ok).toBe(true);
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
      const scores = await scoresOf(ROOM);
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
      expect((await scoresOf(ROOM)).host).toBe(9);
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
      expect(state.state).toMatchObject({
        status: "ACTIVE",
        battleType: "1x1",
        hostUserId: "c1",
        opponentUserId: "c2",
        hostScore: 6,
        teamAScore: 6,
      });
      expect(Number(state.state?.timeLeft)).toBeGreaterThan(0);
      // A room with no battle is describable — the answer is "there is none".
      expect(await buildBattleStateForRoom("no-battle")).toEqual({
        state: null,
        unreadable: false,
      });
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

    it("keeps the real result and retries when Neon is down", async () => {
      insertFails = true;
      await activeBattle();
      await addBattleScore({ roomId: ROOM, seat: "host", points: 17, source: "paid_gift" });
      const finalized = await finalizeBattle(ROOM, "timer");

      // The battle really ended, so clients are told the true frozen scores.
      expect(finalized?.status).toBe("ENDED");
      expect(eventsOf("battle_ended")).toHaveLength(1);
      expect(eventsOf("battle_ended")[0].payload).toMatchObject({ hostScore: 17 });
      // Nothing was written, and nothing was lost: the result is queued.
      expect(persisted).toHaveLength(0);
      expect(await valkeyFake.valkeySmembers("battles:result_outbox")).toEqual([
        finalized?.id,
      ]);

      // A retry pass while the database is still down changes nothing.
      await flushPendingBattleResults();
      expect(persisted).toHaveLength(0);
      expect(await valkeyFake.valkeySmembers("battles:result_outbox")).toEqual([
        finalized?.id,
      ]);

      // Database back: the queued result is written and leaves the outbox.
      insertFails = false;
      await flushPendingBattleResults();
      expect(persisted).toHaveLength(1);
      expect(persisted[0]).toMatchObject({
        battleId: finalized?.id,
        teamAScore: 17,
        finalizeReason: "timer",
      });
      expect(await valkeyFake.valkeySmembers("battles:result_outbox")).toEqual([]);
      expect(
        await valkeyFake.valkeyGet(`battle:result_pending:${finalized?.id}`),
      ).toBe(null);
    });

    it("a failed permanent write never blocks the next battle", async () => {
      insertFails = true;
      await activeBattle();
      const dropped = await finalizeBattle(ROOM, "timer");
      expect(dropped?.status).toBe("ENDED");

      // The finalize claim is per battle id, so a new battle finalizes normally
      // even while the previous result is still queued.
      insertFails = false;
      const rematch = await ensureBattleForHost({
        roomId: ROOM,
        hostUserId: "c1",
        hostName: "C1",
      });
      expect(rematch?.id).not.toBe(dropped?.id);
      await confirmBattleParticipantPresence(ROOM, "c1");
      await confirmBattleParticipantPresence(ROOM, "c2");
      expect((await startBattleIfReady(ROOM)).ok).toBe(true);
      const second = await finalizeBattle(ROOM, "host_end");
      expect(second?.id).toBe(rematch?.id);
      expect(persisted.map((r) => r.battleId)).toEqual([rematch?.id]);

      // And the earlier queued result still reaches Neon on the next pass.
      await flushPendingBattleResults();
      expect(persisted.map((r) => r.battleId).sort()).toEqual(
        [rematch?.id, dropped?.id].sort(),
      );
    });

    it("retries are idempotent — one row per battle even if flushed twice", async () => {
      insertFails = true;
      await activeBattle();
      const finalized = await finalizeBattle(ROOM, "timer");
      insertFails = false;
      await flushPendingBattleResults();
      await flushPendingBattleResults();
      expect(persisted.filter((r) => r.battleId === finalized?.id)).toHaveLength(1);
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
      expect(await scoresOf(ROOM)).toMatchObject({ host: 0, opponent: 0 });

      const started = await startBattleIfReady(ROOM);
      expect(started.ok).toBe(true);
      const active = await getBattleFromStore(ROOM);
      expect(active?.id).toBe(rematch?.id);
      expect(active?.endsAt).toBeGreaterThan(Date.now());
      // The finished battle was persisted once; the rematch is a separate record.
      expect(persisted).toHaveLength(1);
    });
  });

  /**
   * Scores live in one Valkey hash. When that hash cannot be read or written,
   * the honest answer is "unknown" — never zero. Zero is a real score, and this
   * is the path that decides who won and writes it down permanently.
   */
  describe("unreadable scores are never treated as zero", () => {
    it("refuses to score a gift whose points did not land", async () => {
      await activeBattle();
      setValkeyFakeHashesReachable(false);

      const scored = await addBattleScore({
        roomId: ROOM,
        seat: "opponent",
        points: 40,
        source: "paid_gift",
      });

      // The viewer already paid: saying "ok" would credit points nobody has.
      expect(scored).toMatchObject({ ok: false, reason: "unavailable" });
      expect(eventsOf("battle_score")).toHaveLength(0);
    });

    it("does not finalize a battle whose scores cannot be read", async () => {
      await activeBattle();
      await addBattleScore({ roomId: ROOM, seat: "host", points: 30, source: "paid_gift" });
      setValkeyFakeHashesReachable(false);

      expect(await finalizeBattle(ROOM, "timer")).toBe(null);

      // Still ACTIVE, nothing frozen, nothing written down, nobody told.
      const after = await getBattleFromStore(ROOM);
      expect(after?.status).toBe("ACTIVE");
      expect(after?.finalScores).toBe(null);
      expect(persisted).toEqual([]);
      expect(eventsOf("battle_ended")).toHaveLength(0);
    });

    it("finalizes with the real scores once the hash can be read again", async () => {
      await activeBattle();
      await addBattleScore({ roomId: ROOM, seat: "host", points: 30, source: "paid_gift" });
      setValkeyFakeHashesReachable(false);
      await finalizeBattle(ROOM, "timer");

      setValkeyFakeHashesReachable(true);
      const finalized = await finalizeBattle(ROOM, "timer");

      // The retry is not blocked by the claim the refused pass took out.
      expect(finalized?.status).toBe("ENDED");
      expect(finalized?.finalScores).toMatchObject({ host: 30, opponent: 0 });
      expect(finalized?.winner).toBe("teamA");
      expect(persisted.map((r) => r.teamAScore)).toEqual([30]);
    });

    it("never reports a played battle as a 0-0 draw", async () => {
      await activeBattle();
      await addBattleScore({ roomId: ROOM, seat: "opponent", points: 12, source: "tap" });
      setValkeyFakeHashesReachable(false);
      await finalizeBattle(ROOM, "host_end");
      setValkeyFakeHashesReachable(true);

      const finalized = await finalizeBattle(ROOM, "host_end");

      expect(finalized?.winner).toBe("teamB");
      expect(persisted).toHaveLength(1);
      expect(persisted[0].winner).not.toBe("draw");
    });

    it("says nothing about a state it cannot describe", async () => {
      await activeBattle();
      setValkeyFakeHashesReachable(false);

      // Reporting ENDED here would close the battle layout on a live match.
      expect(await buildBattleStateForRoom(ROOM)).toEqual({
        state: null,
        unreadable: true,
      });
    });

    it("still describes a WAITING battle, where zero really is the score", async () => {
      await seatedWaitingBattle();
      setValkeyFakeHashesReachable(false);

      const state = await buildBattleStateForRoom(ROOM);

      expect(state.unreadable).toBe(false);
      expect(state.state).toMatchObject({ status: "WAITING", hostScore: 0 });
    });
  });

  /**
   * Room ids are the creator's own id, so the room a live ends in is the room
   * its next live starts in. Nothing about the old battle may survive that.
   */
  describe("a battle does not outlive its live", () => {
    it("leaves nothing behind for the next live in the same room", async () => {
      await activeBattle();
      await addBattleScore({ roomId: ROOM, seat: "host", points: 15, source: "paid_gift" });
      await battle.setBattleInvite(ROOM, "c3");
      await battle.setBattleAcceptedGrant(ROOM, "c2");

      await battle.clearBattleRuntimeForRoom(ROOM);

      expect(await getBattleFromStore(ROOM)).toBe(null);
      expect(await scoresOf(ROOM)).toMatchObject({ host: 0, opponent: 0 });
      // The invite key is the one the accept path reads, not just the tracking set.
      expect(await battle.hasBattleInvite(ROOM, "c3")).toBe(false);
      expect(await battle.hasBattleAcceptedGrant(ROOM, "c2")).toBe(false);
      expect(await battle.getUserBattleRoom("c2")).toBe(null);
      // The rival's publish authority in this room goes with it.
      expect(revoked).toEqual(
        expect.arrayContaining([{ roomId: ROOM, userId: "c2" }]),
      );
    });

    it("cannot be re-entered as a rematch after the live ended", async () => {
      await activeBattle();
      await battle.clearBattleRuntimeForRoom(ROOM);

      const fresh = await ensureBattleForHost({
        roomId: ROOM,
        hostUserId: "c1",
        hostName: "C1",
      });

      // A brand new WAITING session with only the host — not the old stage.
      expect(fresh?.status).toBe("WAITING");
      expect(fresh?.participants.map((p) => p.userId)).toEqual(["c1"]);
    });
  });

  /**
   * A 2x2 has four creators acting at once, each possibly on a different server
   * instance. Every seat, ready flag and start decision is a read-modify-write
   * of one shared session, so they all go through one guarded writer.
   */
  describe("four creators writing the same session at once", () => {
    it("keeps every seat when all three rivals accept simultaneously", async () => {
      await ensureBattleForHost({ roomId: ROOM, hostUserId: "c1", hostName: "C1" });

      const claims = await Promise.all([
        claimBattleSeat(ROOM, "c2", "C2", "c2-room"),
        claimBattleSeat(ROOM, "c3", "C3", "c3-room"),
        claimBattleSeat(ROOM, "c4", "C4", "c4-room"),
      ]);

      expect(claims.map((c) => c.status)).toEqual(["seated", "seated", "seated"]);
      const session = await getBattleFromStore(ROOM);
      // No accept overwrote another: four distinct creators on four seats.
      expect(session?.participants.map((p) => p.seat)).toEqual([
        "host",
        "opponent",
        "player3",
        "player4",
      ]);
      expect(session?.participants.map((p) => p.userId)).toEqual([
        "c1",
        "c2",
        "c3",
        "c4",
      ]);
    });

    it("seats exactly four when a fifth creator accepts in the same instant", async () => {
      await ensureBattleForHost({ roomId: ROOM, hostUserId: "c1", hostName: "C1" });

      const claims = await Promise.all(
        ["c2", "c3", "c4", "c5", "c6"].map((id) =>
          claimBattleSeat(ROOM, id, id, `${id}-room`),
        ),
      );

      expect(claims.filter((c) => c.status === "seated")).toHaveLength(3);
      expect(claims.filter((c) => c.status === "full")).toHaveLength(2);
      expect((await getBattleFromStore(ROOM))?.participants).toHaveLength(4);
    });

    it("does not lose a ready flag when all four confirm together", async () => {
      await ensureBattleForHost({ roomId: ROOM, hostUserId: "c1", hostName: "C1" });
      for (const id of ["c2", "c3", "c4"]) {
        await claimBattleSeat(ROOM, id, id, `${id}-room`);
      }

      await Promise.all(
        ["c1", "c2", "c3", "c4"].map((id) =>
          confirmBattleParticipantPresence(ROOM, id),
        ),
      );

      const session = await getBattleFromStore(ROOM);
      expect(session?.participants.map((p) => p.ready)).toEqual([
        true,
        true,
        true,
        true,
      ]);
      // All four present means the 2x2 is allowed to start.
      expect((await startBattleIfReady(ROOM)).ok).toBe(true);
    });

    it("starts the match once when the host's start races itself", async () => {
      await ensureBattleForHost({ roomId: ROOM, hostUserId: "c1", hostName: "C1" });
      for (const id of ["c2", "c3", "c4"]) {
        await claimBattleSeat(ROOM, id, id, `${id}-room`);
        await confirmBattleParticipantPresence(ROOM, id);
      }
      await confirmBattleParticipantPresence(ROOM, "c1");

      const starts = await Promise.all([
        startBattleIfReady(ROOM),
        startBattleIfReady(ROOM),
        startBattleIfReady(ROOM),
      ]);

      // One start stamps the clock; the others see a match already running.
      expect(starts.filter((s) => s.ok)).toHaveLength(1);
      const session = await getBattleFromStore(ROOM);
      expect(session?.status).toBe("ACTIVE");
      expect(session?.battleType).toBe("2x2");
      const startedEvents = eventsOf("battle_state_sync").filter(
        (b) => (b.payload as { status?: string }).status === "ACTIVE",
      );
      expect(startedEvents.length).toBeGreaterThan(0);
    });

    it("does not lose the four scores when all four seats are gifted at once", async () => {
      await ensureBattleForHost({ roomId: ROOM, hostUserId: "c1", hostName: "C1" });
      for (const id of ["c2", "c3", "c4"]) {
        await claimBattleSeat(ROOM, id, id, `${id}-room`);
        await confirmBattleParticipantPresence(ROOM, id);
      }
      await confirmBattleParticipantPresence(ROOM, "c1");
      await startBattleIfReady(ROOM);

      await Promise.all([
        addBattleScore({ roomId: ROOM, seat: "host", points: 10, source: "paid_gift" }),
        addBattleScore({ roomId: ROOM, seat: "opponent", points: 20, source: "paid_gift" }),
        addBattleScore({ roomId: ROOM, seat: "player3", points: 30, source: "paid_gift" }),
        addBattleScore({ roomId: ROOM, seat: "player4", points: 40, source: "tap" }),
        addBattleScore({ roomId: ROOM, seat: "host", points: 5, source: "tap" }),
      ]);

      // Team A = host + player3, team B = opponent + player4.
      expect(await scoresOf(ROOM)).toMatchObject({
        host: 15,
        opponent: 20,
        player3: 30,
        player4: 40,
      });
    });
  });

  /**
   * A seat that was not written is not a seat. Every refusal has to say which
   * refusal it is, or a creator with a valid invite is told the stage is full.
   */
  describe("refusals are honest", () => {
    it("reports contention as retryable, never as a full stage", async () => {
      await ensureBattleForHost({ roomId: ROOM, hostUserId: "c1", hostName: "C1" });
      holdValkeyFakeLock("battle:seat_lock:" + ROOM);

      const claim = await claimBattleSeat(ROOM, "c2", "C2", "c2-room");

      expect(claim.status).toBe("contended");
      // The invite is still good: the accepter simply did not get the lock.
      expect((await getBattleFromStore(ROOM))?.participants).toHaveLength(1);
    });

    it("reports an unreachable store as unavailable, never as a full stage", async () => {
      await ensureBattleForHost({ roomId: ROOM, hostUserId: "c1", hostName: "C1" });
      setValkeyFakeLocksAvailable(false);

      expect((await claimBattleSeat(ROOM, "c2", "C2", "c2-room")).status).toBe(
        "unavailable",
      );
    });

    it("distinguishes no battle from a full battle", async () => {
      expect((await claimBattleSeat(ROOM, "c2", "C2", "c2-room")).status).toBe(
        "no_battle",
      );
    });

    it("never reports a seat it could not write", async () => {
      await ensureBattleForHost({ roomId: ROOM, hostUserId: "c1", hostName: "C1" });
      setValkeyFakeStringsWritable(false);

      const claim = await claimBattleSeat(ROOM, "c2", "C2", "c2-room");

      expect(claim.status).toBe("unavailable");
      setValkeyFakeStringsWritable(true);
      // Nothing was persisted, so the stage really is still host-only.
      expect((await getBattleFromStore(ROOM))?.participants).toHaveLength(1);
    });

    it("never reports a start it could not write", async () => {
      await seatedWaitingBattle();
      setValkeyFakeStringsWritable(false);

      expect(await startBattleIfReady(ROOM)).toMatchObject({
        ok: false,
        reason: "unavailable",
      });

      setValkeyFakeStringsWritable(true);
      // No half-started match: still WAITING, no clock, nothing broadcast ACTIVE.
      const session = await getBattleFromStore(ROOM);
      expect(session?.status).toBe("WAITING");
      expect(session?.endsAt).toBe(0);
    });

    it("does not finalize a battle whose result could not be written", async () => {
      await activeBattle();
      await addBattleScore({ roomId: ROOM, seat: "host", points: 25, source: "paid_gift" });
      setValkeyFakeStringsWritable(false);

      expect(await finalizeBattle(ROOM, "timer")).toBe(null);

      setValkeyFakeStringsWritable(true);
      // The match is still live and finalizable — not silently "ended".
      expect((await getBattleFromStore(ROOM))?.status).toBe("ACTIVE");
      const retried = await finalizeBattle(ROOM, "timer");
      expect(retried?.status).toBe("ENDED");
      expect(retried?.finalScores).toMatchObject({ host: 25 });
    });
  });

  /**
   * Leaving a 2x2 must end that creator's authority in the match and nothing
   * else: the other three keep their seats and their live streams.
   */
  describe("leaving a 2x2", () => {
    it("takes the leaver's accept with them so they cannot walk back in", async () => {
      await activeBattle();
      await claimBattleSeat(ROOM, "c3", "C3", "c3-room");
      await battle.setBattleAcceptedGrant(ROOM, "c3");

      expect(await removeBattleParticipant(ROOM, "c3")).toBe(true);

      // Without this, c3's next connect is still authorised to take a seat.
      expect(await battle.hasBattleAcceptedGrant(ROOM, "c3")).toBe(false);
      expect(await battle.getUserBattleRoom("c3")).toBe(null);
    });

    it("leaves the other three creators seated and the match running", async () => {
      await ensureBattleForHost({ roomId: ROOM, hostUserId: "c1", hostName: "C1" });
      for (const id of ["c2", "c3", "c4"]) {
        await claimBattleSeat(ROOM, id, id, `${id}-room`);
        await confirmBattleParticipantPresence(ROOM, id);
      }
      await confirmBattleParticipantPresence(ROOM, "c1");
      await startBattleIfReady(ROOM);
      await addBattleScore({ roomId: ROOM, seat: "host", points: 18, source: "paid_gift" });

      expect(await removeBattleParticipant(ROOM, "c4")).toBe(true);

      const session = await getBattleFromStore(ROOM);
      expect(session?.status).toBe("ACTIVE");
      expect(session?.participants.map((p) => p.userId)).toEqual(["c1", "c2", "c3"]);
      // The seats that stayed keep the points their team already earned.
      expect(await scoresOf(ROOM)).toMatchObject({ host: 18 });
    });
  });
});
