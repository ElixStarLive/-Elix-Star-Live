import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (relative: string) =>
  readFileSync(resolve(__dirname, relative), "utf8");

/**
 * A battle slot is a fixed position: slot 0 is the opponent (P2), slot 1 is P3,
 * slot 2 is P4. The pane a creator was invited into must be the slot they play,
 * so neither side may re-derive a slot from a filtered list or array order.
 */
describe("battle slot mapping contracts", () => {
  const handlers = read("./handlers.ts");
  const battle = read("./battle.ts");
  const hostController = read(
    "../../src/features/live/host/useLiveHostController.tsx",
  );

  it("host starts a match from fixed pane indexes, not a filtered list", () => {
    const start = hostController.indexOf(
      "const startBattleWithAcceptedCreators = useCallback",
    );
    expect(start).toBeGreaterThan(-1);
    const block = hostController.slice(start, start + 1600);
    expect(block).toContain("const acceptedAt = (index: number) =>");
    expect(block).toContain("const opp = acceptedAt(0)");
    expect(block).toContain("const p3 = acceptedAt(1)");
    expect(block).toContain("const p4 = acceptedAt(2)");
    // The old shape took accepted[0..2] off a filtered array.
    expect(block).not.toContain("battleSlots.filter(");
  });

  it("host only starts a 1v1 or a full 2v2", () => {
    const start = hostController.indexOf(
      "const startBattleWithAcceptedCreators = useCallback",
    );
    const block = hostController.slice(start, start + 1600);
    expect(block).toContain("if (Boolean(p3) !== Boolean(p4))");
  });

  it("server rejects a battle with players but no opponent side", () => {
    const start = handlers.indexOf('case "battle_create"');
    expect(start).toBeGreaterThan(-1);
    const block = handlers.slice(start, start + 3000);
    expect(block).toContain("if ((player3UserId || player4UserId) && !opponentUserId)");
    expect(block).toContain("if (Boolean(player3UserId) !== Boolean(player4UserId))");
    expect(block).toContain('sendToClient(client, "battle_error"');
  });

  it("host surfaces a rejected start instead of failing silently", () => {
    expect(hostController).toContain("const handleBattleError = (");
    expect(hostController).toContain("onError: handleBattleError");
  });

  it("removing one battle participant clears only that named slot", () => {
    const start = battle.indexOf("export async function removeBattleParticipant");
    expect(start).toBeGreaterThan(-1);
    const block = battle.slice(start, start + 1400);
    expect(block).toContain('session.opponentUserId = ""');
    expect(block).toContain('session.player3UserId = ""');
    expect(block).toContain('session.player4UserId = ""');
    // Positions are cleared in place — never compacted onto another slot.
    expect(block).not.toContain("filter(");
    expect(block).not.toContain("splice(");
  });

  it("battle removal is per-seat, host-or-self, and enforced in LiveKit", () => {
    const start = handlers.indexOf('case "battle_remove_participant"');
    const end = handlers.indexOf('case "battle_get_state"', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const block = handlers.slice(start, end);
    expect(block).toContain("if (!isBattleHost && !isSelf) break");
    expect(block).toContain("await revokeBattlePublish(client.roomId, targetUserId)");
    expect(block).toContain("await revokeParticipantPublish(client.roomId, targetUserId)");
    expect(block).toContain('sendToUserGlobal(targetUserId, "battle_participant_removed"');
  });
});
