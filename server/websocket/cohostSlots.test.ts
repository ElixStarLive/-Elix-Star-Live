import { describe, expect, it } from "vitest";
import {
  MAX_COHOST_SLOTS,
  normalizeCohostSlots,
  upsertCohostSlot,
  type CohostSlot,
} from "./cohostSlots";

describe("cohost slot normalization", () => {
  it("keeps unique non-host users and caps at 8", () => {
    const raw = [
      { userId: "host-1", name: "Host" },
      { userId: "u1", name: "One", status: "live" },
      { userId: "u1", name: "One dup", status: "accepted" },
      { userId: "u2", name: "Two", status: "accepted" },
      { userId: "u3", name: "Three", status: "pending_accept" },
      { userId: "u4", name: "Four", status: "invited" },
      { userId: "u5", name: "Five" },
      { userId: "u6", name: "Six" },
      { userId: "u7", name: "Seven" },
      { userId: "u8", name: "Eight" },
      { userId: "u9", name: "Nine" },
    ];
    const slots = normalizeCohostSlots(raw, "host-1");
    expect(slots).toHaveLength(MAX_COHOST_SLOTS);
    expect(slots.map((s) => s.userId)).toEqual([
      "u1",
      "u2",
      "u3",
      "u4",
      "u5",
      "u6",
      "u7",
      "u8",
    ]);
  });
});

describe("cohost slot upsert", () => {
  const base: CohostSlot[] = Array.from({ length: MAX_COHOST_SLOTS }, (_, i) => ({
    id: `cohost-u${i + 1}`,
    userId: `u${i + 1}`,
    name: `User ${i + 1}`,
    avatar: "",
    status: "live",
  }));

  it("rejects 9th co-host when full", () => {
    const result = upsertCohostSlot(base, {
      userId: "u9",
      name: "User 9",
      avatar: "",
      status: "invited",
    });
    expect(result.full).toBe(true);
    expect(result.changed).toBe(false);
    expect(result.slots).toHaveLength(MAX_COHOST_SLOTS);
  });

  it("updates existing slot instead of duplicating", () => {
    const result = upsertCohostSlot(base, {
      userId: "u3",
      name: "User 3 live",
      avatar: "a3",
      status: "live",
    });
    expect(result.full).toBe(false);
    expect(result.changed).toBe(true);
    expect(result.slots).toHaveLength(MAX_COHOST_SLOTS);
    expect(result.slots.filter((s) => s.userId === "u3")).toHaveLength(1);
    expect(result.slots.find((s) => s.userId === "u3")?.avatar).toBe("a3");
  });
});

