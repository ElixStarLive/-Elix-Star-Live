import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (relative: string) =>
  readFileSync(resolve(__dirname, relative), "utf8");

/**
 * Contract tests for the LIVE + battle server state machine and its two client
 * surfaces. These lock in the release-audit fixes:
 *  - viewer count is server-authoritative (Valkey SCARD), not client-reported
 *  - a normal viewer leaving never ends the stream (only the host does, w/ grace)
 *  - host AND non-host battle-creator disconnects are both resolved after a grace
 *  - the battle clock is server-authoritative and both clients consume battle_tick
 * battle.ts is Valkey-driven, so behaviour is asserted at the source contract
 * level (same style as the other *Contract.test.ts suites in this repo).
 */
describe("LIVE + battle server state-machine contracts", () => {
  const wsIndex = read("./index.ts");
  const battle = read("./battle.ts");
  const liveStream = read("../../src/pages/LiveStream.tsx");
  const spectator = read("../../src/pages/SpectatorPage.tsx");

  it("viewer count is derived from Valkey SCARD and broadcast to the room", () => {
    expect(wsIndex).toContain("valkeyScard(`room:members:${roomId}`)");
    expect(wsIndex).toContain('broadcastToRoom(roomId, "viewer_count", { count })');
  });

  it("a normal viewer leaving only ends the stream when they are the host", () => {
    // On disconnect the room membership is trimmed, but stream-end is gated on
    // isStreamHost — one spectator leaving must not end the live for others.
    expect(wsIndex).toContain("checkAndBroadcastStreamEnd");
    const fn = wsIndex.slice(wsIndex.indexOf("async function checkAndBroadcastStreamEnd"));
    expect(fn).toContain("const isHost = await isStreamHost(roomId, userId)");
    expect(fn).toContain("if (!isHost) return");
    expect(fn).toContain("scheduleHostDisconnectStreamEnd");
  });

  it("host WS blips get a grace window before the stream is ended", () => {
    expect(wsIndex).toContain("HOST_DISCONNECT_GRACE_MS");
    expect(wsIndex).toContain("scheduleHostDisconnectStreamEnd");
  });

  it("non-host battle creator disconnect is resolved after a grace (never stuck)", () => {
    expect(wsIndex).toContain("scheduleBattleParticipantDisconnectEnd");
    const fn = wsIndex.slice(
      wsIndex.indexOf("function scheduleBattleParticipantDisconnectEnd"),
    );
    // 2-player battle → end and compute winner; multi-creator → drop just them.
    expect(fn).toContain("await endBattle(battleRoomId)");
    expect(fn).toContain("await removeBattleParticipant(battleRoomId, userId)");
    expect(fn).toContain("BATTLE_DISCONNECT_GRACE_MS");
    // The disconnect handler must actually route non-host creators here.
    expect(wsIndex).toContain(
      "scheduleBattleParticipantDisconnectEnd(battleRoomId, client.userId)",
    );
  });

  it("battle participant reconnect within grace cancels the pending resolution", () => {
    // Both host + participant timers live in battleDisconnectTimers keyed by
    // roomId:userId, so the rejoin path cancels either one.
    expect(wsIndex).toContain("cancelBattleDisconnectGrace(roomId, userId)");
  });

  it("removeBattleParticipant drops a non-host creator without ending the match", () => {
    const fn = battle.slice(battle.indexOf("export async function removeBattleParticipant"));
    expect(fn).toContain("if (session.hostUserId === userId) return false");
    expect(fn).toContain("broadcastBattleState");
  });

  it("battle clock is server-authoritative and broadcast via battle_tick", () => {
    // endsAt/timeLeft come from the server tick under a per-room distributed lock.
    expect(battle).toContain('broadcastToRoom(roomId, "battle_tick"');
    expect(battle).toContain("s.timeLeft = Math.max(0, Math.round((s.endsAt - Date.now()) / 1000))");
    expect(battle).toContain("valkeySetNx(BATTLE_TICK_LOCK_KEY_PREFIX + roomId");
  });

  it("battle score increments are atomic (HINCRBY, no read-modify-write race)", () => {
    expect(battle).toContain("valkeyHincrby(scoreKey, target, points)");
  });

  it("both live clients consume battle_tick to stay time-synced with the server", () => {
    expect(liveStream).toContain("websocket.on('battle_tick', handleBattleTick)");
    expect(liveStream).toContain("websocket.off('battle_tick', handleBattleTick)");
    expect(spectator).toContain("websocket.on('battle_tick', handleBattleTick)");
    expect(spectator).toContain("websocket.off('battle_tick', handleBattleTick)");
  });
});
