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
