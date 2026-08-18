import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const handlers = readFileSync(resolve(__dirname, "handlers.ts"), "utf8");

function block(from: string, to: string): string {
  const start = handlers.indexOf(from);
  const end = handlers.indexOf(to, start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return handlers.slice(start, end);
}

/**
 * Battle invite eligibility.
 *
 * Both ends are validated server-side, and the accept NEVER treats the earlier
 * invite as proof — state changes between send and accept (the target goes
 * offline, gets blocked, joins another battle, or the seats fill up), so every
 * gate runs again on acceptance. The invite/accept path is Valkey + DB driven,
 * so the gates are asserted at the source-contract level like the other
 * *Contract.test.ts suites in this repo; the seat claim itself is covered
 * behaviourally in battle.test.ts.
 */
describe("battle invite eligibility", () => {
  const send = block('case "battle_invite_send"', 'case "battle_invite_decline"');
  const accept = block('case "battle_invite_accept"', 'case "battle_invite_roster_get"');

  it("only the room owner or a seated battle creator may invite", () => {
    expect(send).toContain("const ownerId = await resolveStreamOwnerUserId(client.roomId)");
    expect(send).toContain("if (!ownerId) break");
    expect(send).toContain("hasBattlePublishGrant(client.roomId, client.userId)");
    expect(send).toContain("if (!isOwner && !isBattleCreator) break");
  });

  it("refuses self-invite, blocks, battle conflicts, full seats and offline targets", () => {
    expect(send).toContain("if (!targetUserId || targetUserId === client.userId) break");
    expect(send).toContain("await dbIsBlockedEitherWay(client.userId, targetUserId)");
    expect(send).toContain('reason: "blocked"');
    expect(send).toContain('reason: "inviter_in_other_battle"');
    expect(send).toContain('reason: "already_in_battle"');
    expect(send).toContain('reason: "already_seated"');
    expect(send).toContain("battleOpenSeatCount(liveBattle) <= 0");
    expect(send).toContain('reason: "battle_full"');
    expect(send).toContain("isCreatorEligibleForBattle(targetUserId, targetRoomRaw)");
    expect(send).toContain('reason: "not_live"');
  });

  it("invites always target the host's battle room, not a client-named room", () => {
    expect(send).toContain("const streamKey = client.roomId");
    expect(send).toContain("hostUserId: ownerId");
  });

  it("accept requires a real server-issued invite for the authoritative host", () => {
    expect(accept).toContain("const accepterStreamKey = client.roomId");
    expect(accept).toContain(
      "if (!authoritativeHostUserId || authoritativeHostUserId !== hostUserId)",
    );
    expect(accept).toContain("await hasBattleInvite(hostRoomForInvite, client.userId)");
    expect(accept).toContain("if (!invitedKey)");
  });

  it("accept revalidates blocks, battle conflicts and live status", () => {
    expect(accept).toContain(
      "await dbIsBlockedEitherWay(client.userId, authoritativeHostUserId)",
    );
    expect(accept).toContain('reason: "blocked"');
    expect(accept).toContain("const accepterBattleRoom = await getUserBattleRoom(client.userId)");
    expect(accept).toContain('reason: "already_in_battle"');
    expect(accept).toContain(
      "isCreatorEligibleForBattle(client.userId, accepterStreamKey)",
    );
    expect(accept).toContain('reason: "not_live"');
    // A battle needs two live creators, so the inviter is re-checked as well.
    expect(accept).toContain("authoritativeHostUserId,");
    expect(accept).toContain('reason: "host_not_live"');
    // And there must still be a match to be seated in.
    expect(accept).toContain('reason: "battle_over"');
  });

  it("accept claims a real seat before any publish grant", () => {
    const claimAt = accept.indexOf("await claimBattleSeat(");
    const grantAt = accept.indexOf("await grantBattlePublish(");
    expect(claimAt).toBeGreaterThan(-1);
    expect(grantAt).toBeGreaterThan(claimAt);
    // A refused claim is a visible failure, never a silent fake join.
    expect(accept).toContain('reason: "battle_full"');
    expect(accept).toContain('reason: "grant_failed"');
  });

  it("accepting a battle never starts the clock", () => {
    expect(accept).not.toContain("startBattleIfReady");
    expect(accept).not.toContain("endsAt");
  });
});
