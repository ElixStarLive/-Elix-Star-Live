import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (relative: string) => readFileSync(resolve(__dirname, relative), "utf8");

/**
 * Co-host is a permission upgrade inside the host's own LiveKit room. Seating a
 * spectator must raise `canPublish` on the connection they already hold, so the
 * live never has to be torn down and rebuilt to change someone's role.
 */
describe("cohost LiveKit permission upgrade contracts", () => {
  const handlers = read("./handlers.ts");
  const livekit = read("../services/livekit.ts");
  const livestream = read("../routes/livestream.ts");

  it("accepting a viewer's request upgrades their existing connection", () => {
    const start = handlers.indexOf('case "cohost_request_accept"');
    const end = handlers.indexOf('case "cohost_request_decline"', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const block = handlers.slice(start, end);
    expect(block).toContain("await seatCohostPublish(");
    expect(block).toContain("requesterUserId,");
  });

  it("accepting a host invite is the moment the invited seat may publish", () => {
    const start = handlers.indexOf('case "cohost_invite_accept"');
    const end = handlers.indexOf('case "cohost_request_send"', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const block = handlers.slice(start, end);
    expect(block).toContain("await seatCohostPublish(");
    expect(block).toContain("hostStreamKey,");
  });

  it("the seat and the publish permission are written by one shared step", () => {
    const start = handlers.indexOf("async function seatCohostPublish(");
    expect(start).toBeGreaterThan(-1);
    const block = handlers.slice(start, start + 1600);
    expect(block).toContain("await grantCohostPublish(roomId, cohostUserId)");
    expect(block).toContain("await grantParticipantPublish(roomId, cohostUserId)");
    // Neither half may be assumed: a grant that was not stored is treated the
    // same as an unconfirmed media upgrade, and both take the seat back rather
    // than leaving a co-host tile on stage for someone who cannot publish.
    expect(block).toContain(': "unconfirmed"');
    expect(block).toContain('if (upgrade !== "unconfirmed")');
    expect(block).toContain("await releaseCohostPublish(roomId, cohostUserId)");
    expect(block).toContain("removeCohostSlot(seats, cohostUserId)");
  });

  it("the upgrade targets exactly one participant, never the whole room", () => {
    const start = livekit.indexOf("export async function grantParticipantPublish(");
    expect(start).toBeGreaterThan(-1);
    const block = livekit.slice(start, start + 1500);
    expect(block).toContain("userIdFromLiveKitIdentity(identity) !== userId");
    expect(block).toContain("client.updateParticipant(roomName, identity, undefined, {");
    expect(block).toContain("canPublish: true");
  });

  it("the seat fallback in the publish token route only trusts a publishing seat", () => {
    expect(livestream).toContain("seat.status === 'live' || seat.status === 'accepted'");
  });
});
