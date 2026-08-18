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
  const wsHandlers = read("./handlers.ts");
  const battle = read("./battle.ts");
  const liveStream = read("../../src/features/live/host/useLiveHostController.tsx");
  const spectator = read("../../src/features/live/spectator/useLiveSpectatorController.tsx");

  it("viewer count is derived from Valkey SCARD and broadcast to the room", () => {
    expect(wsIndex).toContain("valkeySmembers(`room:members:${roomId}`)");
    expect(wsIndex).toContain('broadcastToRoom(roomId, "viewer_count", { count })');
    expect(wsIndex).toContain("computeSpectatorViewerCount");
  });

  it("live clients consume authoritative viewer_count from the server", () => {
    expect(liveStream).toContain("onViewerCount");
    expect(spectator).toContain("onViewerCount");
    // Controllers bind via shared helper; apply lives in one owner module.
    expect(liveStream).toContain("createLiveGiftGoalAndViewerCountHandlers");
    expect(spectator).toContain("createLiveGiftGoalAndViewerCountHandlers");
    const viewerCountHelper = read(
      "../../src/features/live/chat/createLiveGiftGoalAndViewerCountHandlers.ts",
    );
    expect(viewerCountHelper).toContain("applyServerViewerCount");
  });

  it("stale room members are swept so the count matches the spectator list", () => {
    // Membership alone survives dead sockets (instance restart / killed app),
    // which showed the host a phantom viewer with an empty spectator list.
    expect(wsIndex).toContain("ROOM_PRESENCE_TTL_MS");
    expect(wsIndex).toContain("async function markRoomPresence");
    expect(wsIndex).toContain("async function spectatorExcludeUserIds");
    const listFn = wsIndex.slice(
      wsIndex.indexOf("async function listRoomMemberUserIds"),
      wsIndex.indexOf("async function spectatorExcludeUserIds"),
    );
    expect(listFn).toContain("valkeyExistsBatch");
    expect(listFn).toContain("valkeySrem(`room:members:${roomId}`, ...stale)");
    // Only a read that answered may prune. Pruning on an unreadable presence
    // check deleted the whole room's membership whenever Valkey blipped.
    expect(listFn).toContain('if (read.status === "unavailable") return ids;');
    expect(listFn.indexOf('read.status === "unavailable"')).toBeLessThan(
      listFn.indexOf("valkeySrem(`room:members:${roomId}`"),
    );
    // Count and list read the same pruned membership + same exclude set.
    const viewerListFn = wsIndex.slice(wsIndex.indexOf("async function buildViewerList"));
    expect(viewerListFn).toContain("await listRoomMemberUserIds(roomId)");
    expect(viewerListFn).toContain("await spectatorExcludeUserIds(roomId)");
    const excludeFn = wsIndex.slice(
      wsIndex.indexOf("async function spectatorExcludeUserIds"),
      wsIndex.indexOf("async function computeSpectatorViewerCount"),
    );
    expect(excludeFn).toContain("if (roomId) exclude.add(roomId)");
  });

  it("recounts spectators after a connected user becomes a battle creator", () => {
    expect(wsIndex).toContain("export async function updateViewerCount");
    const battleStart = wsHandlers.slice(
      wsHandlers.indexOf('case "battle_create"'),
      wsHandlers.indexOf('case "battle_join"'),
    );
    const battleJoin = wsHandlers.slice(
      wsHandlers.indexOf('case "battle_join"'),
      wsHandlers.indexOf('case "battle_spectator_vote"'),
    );
    expect(battleStart).toContain("await updateViewerCount(client.roomId)");
    expect(battleJoin).toContain("await updateViewerCount(client.roomId)");
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
    expect(wsIndex).toContain("isUserPublishingInRoom(roomId, userId)");
    expect(wsIndex).toContain("roomHasActivePublisher(roomId)");
  });

  it("non-host battle creator disconnect is resolved after a grace (never stuck)", () => {
    expect(wsIndex).toContain("scheduleBattleParticipantDisconnectEnd");
    const fn = wsIndex.slice(
      wsIndex.indexOf("function scheduleBattleParticipantDisconnectEnd"),
    );
    // 2-player battle → end through the one authoritative (idempotent)
    // finalizer; multi-creator → drop just that seat. Both name the battle this
    // grace period was scheduled for, so a rematch started inside the window is
    // never ended or unseated by the previous match's disconnect.
    expect(fn).toContain(
      'await finalizeBattle(battleRoomId, "participant_disconnect", battleId)',
    );
    expect(fn).toContain(
      "await removeBattleParticipant(battleRoomId, userId, battleId)",
    );
    expect(fn).toContain("if (battle.id !== battleId) return;");
    expect(fn).toContain("BATTLE_DISCONNECT_GRACE_MS");
    // The disconnect handler must actually route non-host creators here, with the
    // battle it read at disconnect time.
    expect(wsIndex).toContain("scheduleBattleParticipantDisconnectEnd(");
    expect(wsIndex).toContain("scheduleBattleDisconnectEnd(battleRoomId, client.userId, battle.id)");
  });

  it("battle participant reconnect within grace cancels the pending resolution", () => {
    // Both host + participant timers live in battleDisconnectTimers keyed by
    // roomId:userId, so the rejoin path cancels either one.
    expect(wsIndex).toContain("cancelBattleDisconnectGrace(roomId, userId)");
  });

  it("removeBattleParticipant drops a non-host creator without ending the match", () => {
    const fn = battle.slice(battle.indexOf("export async function removeBattleParticipant"));
    // The host seat is not removable through this path: refusing inside the
    // guarded mutator leaves the session untouched and returns false.
    expect(fn).toContain("if (isBattleHost(session, userId)) return null");
    expect(fn).toContain("broadcastBattleState");
  });

  it("claimBattleSeat assigns an empty rival seat without starting the timer", () => {
    expect(battle).toContain("export async function claimBattleSeat");
    const start = battle.indexOf("export async function claimBattleSeat");
    const end = battle.indexOf("export async function confirmBattleParticipantPresence", start);
    const fn = battle.slice(start, end > start ? end : start + 2600);
    expect(fn).toContain("nextOpenRivalSeat");
    // Seating never stamps the clock — only startBattleIfReady does.
    expect(fn).not.toContain("session.endsAt =");
    expect(fn).not.toContain('session.status = "ACTIVE"');
  });

  it("handlers expose battle_remove_participant and battle_invite_roster_get", () => {
    const handlers = read("./handlers.ts");
    expect(handlers).toContain('case "battle_remove_participant"');
    expect(handlers).toContain('case "battle_invite_roster_get"');
    expect(handlers).toContain("claimBattleSeat");
    expect(handlers).toContain("battle_full");
    expect(handlers).toContain("publishBattleInviteRoster");
  });

  it("host removePlayerFromSlot removes one seat instead of ending the whole battle", () => {
    const start = liveStream.indexOf("const removePlayerFromSlot");
    const fn = liveStream.slice(start, start + 900);
    expect(fn).toContain("battleRemoveParticipant");
    expect(fn).not.toContain("exitBattleMode()");
  });

  it("battle clock is server-authoritative and broadcast via battle_tick", () => {
    // endsAt/timeLeft come from the server tick under a per-room distributed lock.
    expect(battle).toContain('broadcastToRoom(roomId, "battle_tick"');
    expect(battle).toContain(
      "timeLeft: Math.max(0, Math.round((session.endsAt - Date.now()) / 1000))",
    );
    expect(battle).toContain("valkeySetNx(BATTLE_TICK_LOCK_KEY_PREFIX + roomId");
  });

  it("battle score increments are atomic (HINCRBY, no read-modify-write race)", () => {
    expect(battle).toContain("await valkeyTryHincrby(");
    expect(battle).toContain("SCORE_KEY_PREFIX + req.roomId,");
    // A write that did not land must not be acknowledged as points scored.
    expect(battle).toContain('return { ok: false, reason: "unavailable" }');
  });

  it("both live clients consume battle_tick to stay time-synced with the server", () => {
    const battleBind = read("../../src/features/live/ws/bindLiveBattleWs.ts");
    const wsPairs = read("../../src/features/live/ws/bindLiveWsEventPairs.ts");
    // Bind owner registers battle_tick; host + spectator both pass handleBattleTick.
    expect(battleBind).toContain("LIVE_WS_IN.battle_tick");
    expect(battleBind).toContain("bindLiveWsEventPairs");
    expect(wsPairs).toContain("websocket.on(type, fn)");
    expect(wsPairs).toContain("websocket.off(type, fn)");
    expect(liveStream).toContain("bindLiveBattleWs");
    expect(liveStream).toContain("onTick: handleBattleTick");
    expect(spectator).toContain("bindLiveBattleWs");
    expect(spectator).toContain("onTick: handleBattleTick");
  });

  it("battle gifts route by targetCreatorId, not team-wide room broadcast", () => {
    const giftDelivery = read("./giftDelivery.ts");
    const handlers = read("./handlers.ts");
    const wsIndex = read("./index.ts");
    expect(giftDelivery).toContain("emitGiftSentToTargetAudience");
    expect(giftDelivery).toContain("broadcastToCreatorAudience");
    // The recipient is decided once, upstream, by the shared validated resolver
    // — delivery never re-derives who was supported.
    expect(giftDelivery).toContain('import type { GiftRecipient } from "./giftRecipient"');
    expect(giftDelivery).toContain("const targetCreatorId = opts.recipient.creatorId");
    expect(giftDelivery).toContain(
      'broadcastToCreatorAudience(roomId, targetCreatorId, "gift_sent"',
    );
    expect(giftDelivery).toContain("seatedUserIds(battle)");
    expect(giftDelivery).toContain(
      'if (opts.recipient.origin === "battle_seat" && targetCreatorId)',
    );
    expect(handlers).toContain("emitGiftSentToTargetAudience");
    expect(handlers).toContain("resolveValidatedGiftRecipient");
    // Audience ownership follows the creator's ROLE transition, owned by the WS
    // layer (getCreatorLiveRoleRoom + battle room). What `stream_end` itself does
    // with that audience is owned by hostLiveLifecycleContract.test.ts.
    expect(wsIndex).toContain(
      "export async function transferLiveAudienceToBattleRoom",
    );
    expect(wsIndex).toContain(
      "await transferLiveAudienceToBattleRoom(roomId, userId, roleRoom)",
    );
    expect(wsIndex).toContain("export function broadcastToCreatorAudience");
    expect(wsIndex).toContain("targetCreatorId");
    expect(wsIndex).toContain("audienceCreatorId");
    // Score stays room-wide; gifts do not.
    expect(battle).toContain('broadcastToRoom(req.roomId, "battle_score"');
  });
});
