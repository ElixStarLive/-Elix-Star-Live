/**
 * Battle result durability against a real Neon database.
 *
 * `battle.test.ts` proves the finalization/outbox logic with a fake writer. This
 * suite proves the other half: that a finalized battle actually lands in Neon,
 * that the schema itself enforces one permanent result per battle, and that an
 * outage leaves the result retryable rather than lost.
 *
 * Valkey is faked (the battle store), Postgres is NOT: `dbInsertBattleResult`
 * runs for real. The only injected fault is a transient connection failure,
 * which is what an outage looks like to the caller.
 *
 * Requires: TEST_DATABASE_URL + ALLOW_MONEY_IT_ON_URL=1
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import pg from "pg";
import { normalizeDatabaseUrl } from "../lib/databaseUrl";
import {
  applyRepoMigrations,
  assertSafeTestDatabase,
  createTestPool,
} from "../lib/testMigrationBootstrap";
import { resetValkeyFake, valkeyFake } from "./battleValkeyFake";

const TEST_URL = normalizeDatabaseUrl((process.env.TEST_DATABASE_URL || "").trim());
const RUN = !!TEST_URL;

/** Transient Neon outage, injected in front of the real writer. */
let neonDown = false;

vi.mock("../lib/valkey", () => valkeyFake);

vi.mock("./index", () => ({
  broadcastToRoom: () => {},
  revokeBattlePublish: async () => {},
}));

vi.mock("../lib/postgres", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/postgres")>();
  return {
    ...actual,
    dbInsertBattleResult: async (record: import("../lib/postgres").BattleResultRecord) => {
      if (neonDown) throw new Error("connection terminated unexpectedly");
      return actual.dbInsertBattleResult(record);
    },
  };
});

const { connectPostgres, dbInsertBattleResult } = await import("../lib/postgres");
const {
  addBattleScore,
  claimBattleSeat,
  confirmBattleParticipantPresence,
  ensureBattleForHost,
  finalizeBattle,
  flushPendingBattleResults,
  getBattleFromStore,
  startBattleIfReady,
} = await import("./battle");

const ROOM = "db-battle-room";
/** Mirrors the outbox keys in `battle.ts`. */
const OUTBOX_KEY = "battles:result_outbox";
const OUTBOX_PAYLOAD_PREFIX = "battle:result_pending:";

describe.skipIf(!RUN)("Battle result durability (real Neon)", () => {
  let pool: pg.Pool;

  beforeAll(async () => {
    assertSafeTestDatabase(TEST_URL);
    pool = createTestPool(TEST_URL, 4);
    await applyRepoMigrations(pool);
    process.env.DATABASE_URL = TEST_URL;
    await connectPostgres();
  }, 180_000);

  afterAll(async () => {
    await pool?.end();
  });

  beforeEach(async () => {
    resetValkeyFake();
    neonDown = false;
    await pool.query(`DELETE FROM battle_results WHERE room_id LIKE 'db-battle-room%'`);
  });

  async function storedResult(battleId: string) {
    const { rows } = await pool.query(
      `SELECT battle_id, room_id, battle_type, winner, team_a_score, team_b_score,
              finalize_reason, started_at, ended_at
         FROM battle_results WHERE battle_id = $1`,
      [battleId],
    );
    return rows[0] ?? null;
  }

  async function storedParticipants(battleId: string) {
    const { rows } = await pool.query(
      `SELECT seat, creator_user_id, team_id, score
         FROM battle_result_participants WHERE battle_id = $1 ORDER BY seat`,
      [battleId],
    );
    return rows;
  }

  async function outboxIds(): Promise<string[]> {
    return valkeyFake.valkeySmembers(OUTBOX_KEY);
  }

  /** Score a seat, failing the test rather than silently storing nothing. */
  async function score(room: string, seat: "host" | "opponent", points: number) {
    const added = await addBattleScore({ roomId: room, seat, points, source: "paid_gift" });
    expect(added.ok).toBe(true);
  }

  /** A started 1×1 with a decided score. */
  async function playedBattle(room = ROOM): Promise<string> {
    await ensureBattleForHost({ roomId: room, hostUserId: "c1", hostName: "C1" });
    await confirmBattleParticipantPresence(room, "c1");
    await claimBattleSeat(room, "c2", "C2", "c2-room");
    await confirmBattleParticipantPresence(room, "c2");
    const started = await startBattleIfReady(room);
    expect(started.ok).toBe(true);
    await score(room, "host", 70);
    await score(room, "opponent", 25);
    const session = await getBattleFromStore(room);
    return session?.id ?? "";
  }

  it("a finalized battle is written to Neon with its participants", async () => {
    const battleId = await playedBattle();
    const finalized = await finalizeBattle(ROOM, "timer");
    expect(finalized?.status).toBe("ENDED");

    const row = await storedResult(battleId);
    expect(row).toMatchObject({
      battle_id: battleId,
      room_id: ROOM,
      battle_type: "1x1",
      winner: "teamA",
      team_a_score: 70,
      team_b_score: 25,
      finalize_reason: "timer",
    });
    expect(row.started_at).toBeInstanceOf(Date);
    expect(row.ended_at).toBeInstanceOf(Date);

    expect(await storedParticipants(battleId)).toEqual([
      { seat: "host", creator_user_id: "c1", team_id: "teamA", score: 70 },
      { seat: "opponent", creator_user_id: "c2", team_id: "teamB", score: 25 },
    ]);

    // Stored means owed no longer: the outbox is empty.
    expect(await outboxIds()).toEqual([]);
  });

  it("a second finalizer cannot store a second result for the same battle", async () => {
    const battleId = await playedBattle();
    await finalizeBattle(ROOM, "timer");

    // A duplicate finalizer arriving late with a different score.
    await dbInsertBattleResult({
      battleId,
      roomId: ROOM,
      battleType: "1x1",
      winner: "teamB",
      teamAScore: 0,
      teamBScore: 999,
      startedAt: Date.now(),
      endedAt: Date.now(),
      finalizeReason: "duplicate",
      participants: [
        { seat: "host", creatorUserId: "c1", teamId: "teamA", score: 0 },
        { seat: "opponent", creatorUserId: "c2", teamId: "teamB", score: 999 },
      ],
    });

    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM battle_results WHERE battle_id = $1`,
      [battleId],
    );
    expect(rows[0].n).toBe(1);
    // The first result is the record; the duplicate changed nothing.
    expect(await storedResult(battleId)).toMatchObject({
      winner: "teamA",
      team_a_score: 70,
      team_b_score: 25,
      finalize_reason: "timer",
    });
    expect(await storedParticipants(battleId)).toEqual([
      { seat: "host", creator_user_id: "c1", team_id: "teamA", score: 70 },
      { seat: "opponent", creator_user_id: "c2", team_id: "teamB", score: 25 },
    ]);
  });

  it("retrying the same result is idempotent", async () => {
    const battleId = await playedBattle();
    const finalized = await finalizeBattle(ROOM, "timer");
    const record = {
      battleId,
      roomId: ROOM,
      battleType: "1x1" as const,
      winner: "teamA" as const,
      teamAScore: 70,
      teamBScore: 25,
      startedAt: finalized?.startedAt ?? 0,
      endedAt: finalized?.finalizedAt ?? Date.now(),
      finalizeReason: "timer",
      participants: [
        { seat: "host" as const, creatorUserId: "c1", teamId: "teamA" as const, score: 70 },
        { seat: "opponent" as const, creatorUserId: "c2", teamId: "teamB" as const, score: 25 },
      ],
    };
    await dbInsertBattleResult(record);
    await dbInsertBattleResult(record);

    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM battle_results WHERE battle_id = $1`,
      [battleId],
    );
    expect(rows[0].n).toBe(1);
    expect(await storedParticipants(battleId)).toHaveLength(2);
  });

  it("a Neon outage leaves the result queued, and recovery stores the real score", async () => {
    neonDown = true;
    const battleId = await playedBattle();
    const finalized = await finalizeBattle(ROOM, "timer");

    // Clients were told the truth even though Neon refused it.
    expect(finalized?.status).toBe("ENDED");
    expect(await storedResult(battleId)).toBeNull();
    expect(await outboxIds()).toEqual([battleId]);

    // A retry pass while it is still down keeps the record queued.
    await flushPendingBattleResults();
    expect(await storedResult(battleId)).toBeNull();
    expect(await outboxIds()).toEqual([battleId]);

    neonDown = false;
    await flushPendingBattleResults();

    expect(await storedResult(battleId)).toMatchObject({
      winner: "teamA",
      team_a_score: 70,
      team_b_score: 25,
    });
    expect(await storedParticipants(battleId)).toEqual([
      { seat: "host", creator_user_id: "c1", team_id: "teamA", score: 70 },
      { seat: "opponent", creator_user_id: "c2", team_id: "teamB", score: 25 },
    ]);
    // The outbox clears only now that Neon has it.
    expect(await outboxIds()).toEqual([]);
  });

  it("a rematch is a separate permanent row", async () => {
    const firstId = await playedBattle();
    await finalizeBattle(ROOM, "timer");

    await ensureBattleForHost({ roomId: ROOM, hostUserId: "c1", hostName: "C1" });
    await confirmBattleParticipantPresence(ROOM, "c1");
    await claimBattleSeat(ROOM, "c2", "C2", "c2-room");
    await confirmBattleParticipantPresence(ROOM, "c2");
    expect((await startBattleIfReady(ROOM)).ok).toBe(true);
    await score(ROOM, "opponent", 40);
    const rematchId = (await getBattleFromStore(ROOM))?.id ?? "";
    expect(rematchId).not.toBe(firstId);
    await finalizeBattle(ROOM, "timer");

    expect(await storedResult(firstId)).toMatchObject({
      winner: "teamA",
      team_a_score: 70,
      team_b_score: 25,
    });
    // The rematch starts from 0 and is stored on its own row.
    expect(await storedResult(rematchId)).toMatchObject({
      winner: "teamB",
      team_a_score: 0,
      team_b_score: 40,
    });
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM battle_results WHERE room_id = $1`,
      [ROOM],
    );
    expect(rows[0].n).toBe(2);
  });

  it("a battle still being played is never stored, however its result was queued", async () => {
    // A worker that queued its write-ahead record and then died before freezing:
    // the battle is still ACTIVE and still scoring.
    const battleId = await playedBattle();
    await valkeyFake.valkeyTrySet(
      OUTBOX_PAYLOAD_PREFIX + battleId,
      JSON.stringify({
        battleId,
        roomId: ROOM,
        battleType: "1x1",
        winner: "draw",
        teamAScore: 0,
        teamBScore: 0,
        startedAt: 0,
        endedAt: Date.now(),
        finalizeReason: "timer",
        participants: [],
        pendingFreeze: true,
      }),
      60_000,
    );
    await valkeyFake.valkeyTrySadd(OUTBOX_KEY, battleId);

    await flushPendingBattleResults();

    // Nothing permanent for a match that had not finished — no fabricated 0–0.
    expect(await storedResult(battleId)).toBeNull();
    expect(await outboxIds()).toEqual([battleId]);

    // When it really ends, the real score is what gets stored.
    await finalizeBattle(ROOM, "timer");
    await flushPendingBattleResults();
    expect(await storedResult(battleId)).toMatchObject({
      winner: "teamA",
      team_a_score: 70,
      team_b_score: 25,
    });
  });
});
