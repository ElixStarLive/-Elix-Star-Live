import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (relative: string) => readFileSync(resolve(__dirname, relative), "utf8");

describe("cohost server authority contracts", () => {
  const handlers = read("./handlers.ts");
  const slots = read("./cohostSlots.ts");

  it("enforces max 8 cohost seats in shared slot logic", () => {
    expect(slots).toContain("export const MAX_COHOST_SLOTS = 8");
    expect(slots).toContain("if (slots.length >= limit)");
  });

  it("rejects accept/invite when cohost seats are full", () => {
    expect(handlers).toContain("if (upserted.full)");
    expect(handlers).toContain('reason: "cohost_full"');
    expect(handlers).toContain("max: MAX_COHOST_SLOTS");
  });

  it("accepting one request removes only that requester and pushes the next queued user", () => {
    const start = handlers.indexOf('case "cohost_request_accept"');
    const end = handlers.indexOf('case "cohost_request_decline"', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const block = handlers.slice(start, end);
    expect(block).toContain("await deleteCohostJoinRequest(client.roomId, requesterUserId)");
    expect(block).toContain("const queued = await listCohostJoinRequests(client.roomId)");
    expect(block).toContain("const next = queued.find((r) => r.requesterUserId !== requesterUserId)");
    expect(block).toContain('sendToUserGlobal(client.userId, "cohost_request"');
  });

  it("layout sync is presentation only — it cannot replace seats or revoke publish", () => {
    const start = handlers.indexOf('case "cohost_layout_sync"');
    const end = handlers.indexOf('case "cohost_seat_release"', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const block = handlers.slice(start, end);
    // Seats are read back from server state, never taken from the host payload.
    expect(block).toContain("const current = await getCohostLayout(roomId)");
    expect(block).toContain("normalizeCohostSlots(");
    expect(block).not.toContain("data.coHosts");
    expect(block).not.toContain("releaseCohostPublish");
    expect(block).not.toContain("grantCohostPublish");
  });

  it("seat release frees one seat and revokes publish for that user only", () => {
    const start = handlers.indexOf('case "cohost_seat_release"');
    const end = handlers.indexOf('case "cohost_seat_leave"', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const block = handlers.slice(start, end);
    expect(block).toContain("removeCohostSlot(seats, targetUserId)");
    // One authority for both halves of a release: the stored grant that
    // authorizes the next token AND the permission on the open connection.
    expect(block).toContain("await releaseCohostPublish(roomId, targetUserId)");
    expect(block).toContain('sendToUserGlobal(targetUserId, "cohost_seat_released"');
    expect(block).toContain('broadcastToRoom(roomId, "cohost_layout_sync"');
    // Host-only, and never a room-wide grant sweep.
    expect(block).toContain("if (!ownerId || ownerId !== client.userId) break");
    expect(block).not.toContain("clearCohostPublishGrants");
  });

  it("co-host self-leave frees exactly one seat and keeps the spectator connected", () => {
    const start = handlers.indexOf('case "cohost_seat_leave"');
    const end = handlers.indexOf('case "cohost_seats_clear"', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const block = handlers.slice(start, end);
    expect(block).toContain("if (ownerId === client.userId) break");
    expect(block).toContain("const targetUserId = client.userId");
    expect(block).toContain("removeCohostSlot(seats, targetUserId)");
    expect(block).toContain("await releaseCohostPublish(roomId, targetUserId)");
    expect(block).toContain('sendToUserGlobal(targetUserId, "cohost_seat_released"');
    expect(block).toContain('broadcastToRoom(roomId, "cohost_layout_sync"');
    expect(block).not.toContain("removeActiveStream");
    expect(block).not.toContain("stream_ended");
    expect(block).not.toContain("clearCohostPublishGrants");
    expect(block).not.toContain("for (const seat of seats)");
  });

  it("only the explicit seats_clear intent stands every seat down", () => {
    const start = handlers.indexOf('case "cohost_seats_clear"');
    expect(start).toBeGreaterThan(-1);
    const block = handlers.slice(start, start + 1600);
    expect(block).toContain("if (!ownerId || ownerId !== client.userId) break");
    expect(block).toContain("for (const seat of seats)");
    expect(block).toContain("await releaseCohostPublish(roomId, seat.userId)");
    expect(block).toContain("await setCohostLayout(roomId, [], client.userId");
  });

  it("declining one request removes only that requester and preserves queue progression", () => {
    const start = handlers.indexOf('case "cohost_request_decline"');
    const end = handlers.indexOf('case "cohost_layout_sync"', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const block = handlers.slice(start, end);
    expect(block).toContain("await deleteCohostJoinRequest(client.roomId, requesterUserId)");
    expect(block).toContain("const queued = await listCohostJoinRequests(client.roomId)");
    expect(block).toContain("const next = queued.find((r) => r.requesterUserId !== requesterUserId)");
  });
});
