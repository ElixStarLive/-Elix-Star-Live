import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The stage is host + at most 8 co-hosts, and a seat is publish permission
 * inside someone else's live. Both of those are decided by a read-modify-write
 * of one Valkey value, so the dangerous cases are the ones where two of those
 * writes overlap or where Valkey does not answer at all.
 *
 * What is pinned here:
 *
 * - Two accepts racing for the last free seat: exactly one is seated and exactly
 *   one is granted publish. Before the seat lock both read "7 seated", both
 *   passed the capacity check, both were granted, and the table kept whichever
 *   write landed second — a ninth publisher with no seat behind them.
 * - A stale accept (seat cancelled, room ended) is refused rather than
 *   re-seating someone from a snapshot that is already gone.
 * - One account is one seat, however many devices it accepts from.
 * - Valkey unavailable is never reported as a seat: no grant, no broadcast.
 */

type Seat = { userId: string; name: string; avatar: string; status: string };
type Layout = {
  coHosts: Seat[];
  hostUserId: string;
  layoutId?: string | null;
  featuredUserId?: string | null;
};

const layouts = new Map<string, Layout>();
const roomOwners = new Map<string, string>();
const locks = new Map<string, string>();
const cohostGrants: Array<{ roomId: string; userId: string }> = [];
const participantUpgrades: Array<{ roomId: string; userId: string }> = [];
const released: Array<{ roomId: string; userId: string }> = [];
const roomBroadcasts: Array<{ roomId: string; event: string; data: Record<string, unknown> }> = [];
const sentToUser: Array<{ userId: string; event: string; data: Record<string, unknown> }> = [];

/** Flipped by the failure tests: Valkey answers nothing. */
const valkey = { readable: true, writable: true };

vi.mock("./index", () => ({
  wsRateCheck: vi.fn(async () => true),
  getCohostLayout: vi.fn(async (roomId: string) => layouts.get(roomId) ?? null),
  tryGetCohostLayout: vi.fn(async (roomId: string) =>
    valkey.readable
      ? { status: "ok" as const, layout: layouts.get(roomId) ?? null }
      : { status: "unavailable" as const },
  ),
  setCohostLayout: vi.fn(
    async (
      roomId: string,
      coHosts: Seat[],
      hostUserId: string,
      layoutId?: string | null,
      featuredUserId?: string | null,
    ) => {
      if (!valkey.writable) return "unavailable" as const;
      // A real Valkey round trip is not instant: yielding here is what lets two
      // overlapping mutations interleave, which is the whole point of the lock.
      await new Promise((resolve) => setTimeout(resolve, 1));
      layouts.set(roomId, { coHosts, hostUserId, layoutId, featuredUserId });
      return "ok" as const;
    },
  ),
  deleteCohostLayout: vi.fn(async (roomId: string) => {
    layouts.delete(roomId);
  }),
  upsertCohostJoinRequest: vi.fn(async () => {}),
  deleteCohostJoinRequest: vi.fn(async () => {}),
  listCohostJoinRequests: vi.fn(async () => []),
  grantCohostPublish: vi.fn(async (roomId: string, userId: string) => {
    cohostGrants.push({ roomId, userId });
  }),
  releaseCohostPublish: vi.fn(async (roomId: string, userId: string) => {
    released.push({ roomId, userId });
    return "revoked" as const;
  }),
  grantBattlePublish: vi.fn(async () => {}),
  hasBattlePublishGrant: vi.fn(async () => false),
  revokeBattlePublish: vi.fn(async () => {}),
  broadcastToRoom: vi.fn((roomId: string, event: string, data: Record<string, unknown>) => {
    roomBroadcasts.push({ roomId, event, data });
  }),
  sendToClient: vi.fn(),
  sendToUserGlobal: vi.fn((userId: string, event: string, data: Record<string, unknown>) => {
    sentToUser.push({ userId, event, data });
    return 1;
  }),
  incrementRoomLiveLikes: vi.fn(async () => 0),
  updateViewerCount: vi.fn(async () => {}),
  transferLiveAudienceToBattleRoom: vi.fn(async () => {}),
}));

vi.mock("../services/livekit", () => ({
  grantParticipantPublish: vi.fn(async (roomId: string, userId: string) => {
    participantUpgrades.push({ roomId, userId });
    return true;
  }),
  revokeParticipantPublish: vi.fn(async () => "revoked" as const),
  isLiveKitConfigured: vi.fn(() => true),
  isUserPublishingInRoom: vi.fn(async () => true),
}));

vi.mock("../routes/livestream", () => ({
  resolveStreamOwnerUserId: vi.fn(async (room: string) => roomOwners.get(room) ?? room),
  isStreamHost: vi.fn(async (room: string, userId: string) => roomOwners.get(room) === userId),
  removeActiveStream: vi.fn(async () => true),
  listActiveLiveStreams: vi.fn(async () => []),
}));

vi.mock("./liveCreatorRole", () => ({ setCreatorCohostRoom: vi.fn(async () => {}) }));
/** Single-holder lock with an owner-checked release — the production semantics. */
vi.mock("../lib/valkey", () => ({
  isValkeyConfigured: vi.fn(() => true),
  valkeyTrySetNx: vi.fn(async (key: string, token: string) => {
    if (!valkey.writable && !valkey.readable) return "unavailable" as const;
    if (locks.has(key)) return "exists" as const;
    locks.set(key, token);
    return "set" as const;
  }),
  valkeyReleaseLock: vi.fn(async (key: string, token: string) => {
    if (locks.get(key) === token) locks.delete(key);
  }),
}));
vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { handleMessage } = await import("./handlers");
const { MAX_COHOST_SLOTS } = await import("./cohostSlots");

const HOST_ROOM = "host-room";
const HOST = "host-1";

type Actor = { userId: string; roomId: string };

function client(actor: Actor) {
  return {
    userId: actor.userId,
    roomId: actor.roomId,
    displayName: actor.userId,
    avatarUrl: "",
    username: actor.userId,
    level: 1,
  } as unknown as Parameters<typeof handleMessage>[0];
}

const send = (actor: Actor, event: string, data: Record<string, unknown> = {}) =>
  handleMessage(client(actor), event, data);

const host: Actor = { userId: HOST, roomId: HOST_ROOM };
const viewer = (id: string): Actor => ({ userId: id, roomId: HOST_ROOM });

const seats = () => layouts.get(HOST_ROOM)?.coHosts ?? [];
const seatOf = (userId: string) => seats().find((s) => s.userId === userId);

/** Host accepts a spectator's co-host request — the seat-assigning path. */
const acceptRequest = (requesterUserId: string) =>
  send(host, "cohost_request_accept", { requesterUserId });

/** Seat `count` co-hosts through the real handler, one at a time. */
async function fillSeats(count: number): Promise<void> {
  for (let i = 1; i <= count; i++) {
    await acceptRequest(`viewer-${i}`);
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  layouts.clear();
  locks.clear();
  roomOwners.clear();
  roomOwners.set(HOST_ROOM, HOST);
  cohostGrants.length = 0;
  participantUpgrades.length = 0;
  released.length = 0;
  roomBroadcasts.length = 0;
  sentToUser.length = 0;
  valkey.readable = true;
  valkey.writable = true;
});

describe("co-host seat capacity", () => {
  it("seats eight co-hosts and refuses the ninth", async () => {
    await fillSeats(MAX_COHOST_SLOTS);
    expect(seats()).toHaveLength(MAX_COHOST_SLOTS);

    await acceptRequest("viewer-9");

    expect(seats()).toHaveLength(MAX_COHOST_SLOTS);
    expect(seatOf("viewer-9")).toBeUndefined();
    // The refused user is told why, and is never granted publish.
    const declined = sentToUser.find(
      (m) => m.userId === "viewer-9" && m.event === "cohost_request_declined",
    );
    expect(declined?.data.reason).toBe("cohost_full");
    expect(cohostGrants.some((g) => g.userId === "viewer-9")).toBe(false);
    expect(participantUpgrades.some((g) => g.userId === "viewer-9")).toBe(false);
  });

  it("keeps every seated co-host when the stage is full", async () => {
    await fillSeats(MAX_COHOST_SLOTS);
    await acceptRequest("viewer-9");

    for (let i = 1; i <= MAX_COHOST_SLOTS; i++) {
      expect(seatOf(`viewer-${i}`)?.status).toBe("accepted");
    }
  });

  it("frees the last seat for reuse when a co-host leaves", async () => {
    await fillSeats(MAX_COHOST_SLOTS);
    await send(viewer("viewer-8"), "cohost_seat_leave", {});
    expect(seats()).toHaveLength(MAX_COHOST_SLOTS - 1);

    await acceptRequest("viewer-9");

    expect(seats()).toHaveLength(MAX_COHOST_SLOTS);
    expect(seatOf("viewer-9")?.status).toBe("accepted");
  });
});

describe("atomic seat claim", () => {
  it("gives the last free seat to exactly one of two simultaneous accepts", async () => {
    await fillSeats(MAX_COHOST_SLOTS - 1);

    await Promise.all([acceptRequest("racer-a"), acceptRequest("racer-b")]);

    expect(seats()).toHaveLength(MAX_COHOST_SLOTS);
    const seatedRacers = ["racer-a", "racer-b"].filter((id) => !!seatOf(id));
    expect(seatedRacers).toHaveLength(1);
    // The loser is never granted publish, so the stage cannot gain a ninth
    // publisher who holds authority without holding a seat.
    const winner = seatedRacers[0];
    const loser = winner === "racer-a" ? "racer-b" : "racer-a";
    expect(cohostGrants.filter((g) => g.userId === winner)).toHaveLength(1);
    expect(cohostGrants.filter((g) => g.userId === loser)).toHaveLength(0);
    expect(participantUpgrades.filter((g) => g.userId === loser)).toHaveLength(0);
    const declined = sentToUser.find(
      (m) => m.userId === loser && m.event === "cohost_request_declined",
    );
    expect(declined?.data.reason).toBe("cohost_full");
  });

  it("never exceeds eight seats when many accepts arrive at once", async () => {
    await Promise.all(
      Array.from({ length: 14 }, (_, i) => acceptRequest(`rush-${i + 1}`)),
    );

    expect(seats().length).toBeLessThanOrEqual(MAX_COHOST_SLOTS);
    // Every granted user holds a seat: grants and seats cannot disagree.
    const granted = new Set(cohostGrants.map((g) => g.userId));
    for (const userId of granted) {
      expect(seatOf(userId)).toBeDefined();
    }
    expect(granted.size).toBe(seats().length);
  });

  it("does not let a concurrent leave and accept undo each other", async () => {
    await fillSeats(3);

    await Promise.all([
      send(viewer("viewer-2"), "cohost_seat_leave", {}),
      acceptRequest("viewer-4"),
    ]);

    expect(seatOf("viewer-2")).toBeUndefined();
    expect(seatOf("viewer-1")).toBeDefined();
    expect(seatOf("viewer-3")).toBeDefined();
    expect(seatOf("viewer-4")).toBeDefined();
    expect(seats()).toHaveLength(3);
  });
});

describe("one account, one seat", () => {
  it("keeps a single seat when the same user accepts from two devices", async () => {
    await send(host, "cohost_invite_send", { targetUserId: "viewer-1" });

    await Promise.all([
      send({ userId: "viewer-1", roomId: HOST_ROOM }, "cohost_invite_accept", {
        hostUserId: HOST,
        streamKey: HOST_ROOM,
      }),
      send({ userId: "viewer-1", roomId: HOST_ROOM }, "cohost_invite_accept", {
        hostUserId: HOST,
        streamKey: HOST_ROOM,
      }),
    ]);

    expect(seats().filter((s) => s.userId === "viewer-1")).toHaveLength(1);
    expect(seats()).toHaveLength(1);
  });

  it("does not seat the host in their own stage", async () => {
    await acceptRequest(HOST);
    await send(host, "cohost_invite_send", { targetUserId: HOST });

    expect(seats()).toHaveLength(0);
    expect(cohostGrants).toEqual([]);
  });
});

describe("stale co-host state", () => {
  it("refuses an accept for a seat the host has already cancelled", async () => {
    await send(host, "cohost_invite_send", { targetUserId: "viewer-1" });
    await send(host, "cohost_seat_release", { targetUserId: "viewer-1" });

    await send(viewer("viewer-1"), "cohost_invite_accept", {
      hostUserId: HOST,
      streamKey: HOST_ROOM,
    });

    expect(seatOf("viewer-1")).toBeUndefined();
    expect(cohostGrants).toEqual([]);
    expect(participantUpgrades).toEqual([]);
  });

  it("refuses an accept once the live has ended and its stage was cleaned", async () => {
    await send(host, "cohost_invite_send", { targetUserId: "viewer-1" });
    // What ending a live does to co-host state: the table is gone.
    layouts.delete(HOST_ROOM);

    await send(viewer("viewer-1"), "cohost_invite_accept", {
      hostUserId: HOST,
      streamKey: HOST_ROOM,
    });

    expect(layouts.get(HOST_ROOM)).toBeUndefined();
    expect(cohostGrants).toEqual([]);
  });

  it("refuses an accept naming a host who does not own that room's stage", async () => {
    await send(host, "cohost_invite_send", { targetUserId: "viewer-1" });

    await send(viewer("viewer-1"), "cohost_invite_accept", {
      hostUserId: "impostor",
      streamKey: HOST_ROOM,
    });

    expect(seatOf("viewer-1")?.status).toBe("invited");
    expect(cohostGrants).toEqual([]);
  });

  it("ignores a repeated leave instead of disturbing the remaining seats", async () => {
    await fillSeats(2);
    await send(viewer("viewer-1"), "cohost_seat_leave", {});
    released.length = 0;

    await send(viewer("viewer-1"), "cohost_seat_leave", {});

    expect(released).toEqual([]);
    expect(seats()).toHaveLength(1);
    expect(seatOf("viewer-2")).toBeDefined();
  });
});

describe("Valkey failure is never a seat", () => {
  it("does not grant publish when the seat table cannot be read", async () => {
    valkey.readable = false;

    await acceptRequest("viewer-1");

    expect(layouts.get(HOST_ROOM)).toBeUndefined();
    expect(cohostGrants).toEqual([]);
    expect(participantUpgrades).toEqual([]);
    expect(roomBroadcasts).toEqual([]);
  });

  it("does not grant publish when the seat write is not confirmed", async () => {
    valkey.writable = false;

    await acceptRequest("viewer-1");

    expect(cohostGrants).toEqual([]);
    expect(participantUpgrades).toEqual([]);
    expect(roomBroadcasts).toEqual([]);
    // The host's client is told the accept did not take, not that it did.
    const declined = sentToUser.find(
      (m) => m.userId === "viewer-1" && m.event === "cohost_request_declined",
    );
    expect(declined?.data.reason).toBe("cohost_state_unavailable");
    expect(
      sentToUser.some((m) => m.event === "cohost_request_accepted"),
    ).toBe(false);
  });

  it("does not stand a co-host down when the release cannot be written", async () => {
    await fillSeats(1);
    valkey.writable = false;

    await send(host, "cohost_seat_release", { targetUserId: "viewer-1" });

    // Still seated server-side, and publishing was not revoked — the host can
    // retry rather than the stage and the media permission disagreeing.
    expect(seatOf("viewer-1")).toBeDefined();
    expect(released).toEqual([]);
  });
});

/**
 * The app runs on more than one server process, and which one a socket lands on
 * is not something the room decides. If any part of the stage lived in process
 * memory, the eight-seat limit would be eight seats per instance and a co-host
 * seated on one box would be invisible on the other.
 *
 * A second copy of the handler module, sharing only Valkey, stands in for that
 * second instance.
 */
describe("the stage is shared between server instances", () => {
  /** A handler module that shares nothing with the first except Valkey. */
  async function otherInstance() {
    vi.resetModules();
    const mod = await import("./handlers");
    // Guard the premise: a cached re-import would share this process's memory
    // and prove nothing about two boxes.
    expect(mod.handleMessage).not.toBe(handleMessage);
    return (actor: Actor, event: string, data: Record<string, unknown> = {}) =>
      mod.handleMessage(client(actor), event, data);
  }

  it("sees a seat claimed on the other instance", async () => {
    await acceptRequest("viewer-1");
    const sendElsewhere = await otherInstance();

    await sendElsewhere(host, "cohost_request_accept", { requesterUserId: "viewer-2" });

    expect(seats().map((s) => s.userId).sort()).toEqual(["viewer-1", "viewer-2"]);
  });

  it("counts the eight seats once, not once per instance", async () => {
    await fillSeats(MAX_COHOST_SLOTS);
    const sendElsewhere = await otherInstance();

    await sendElsewhere(host, "cohost_request_accept", { requesterUserId: "viewer-9" });

    expect(seats()).toHaveLength(MAX_COHOST_SLOTS);
    expect(seatOf("viewer-9")).toBeUndefined();
  });

  it("lets a co-host leave through whichever instance holds their socket", async () => {
    await fillSeats(2);
    const sendElsewhere = await otherInstance();

    await sendElsewhere(viewer("viewer-1"), "cohost_seat_leave", {});

    expect(seatOf("viewer-1")).toBeUndefined();
    expect(seatOf("viewer-2")).toBeDefined();
  });
});
