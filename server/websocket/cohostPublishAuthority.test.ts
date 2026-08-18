import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A co-host seat is publish permission inside someone else's live, so the server
 * has to own every step of granting it.
 *
 * Two rules are pinned here:
 *
 * 1. An invite is an offer. Sending one must not authorize publishing — the grant
 *    is what the token endpoint trusts, so writing it on send let an invited user
 *    publish before answering, and keep that right if they never answered.
 * 2. An accept is a claim, not proof. This case is not host-gated (the invitee is
 *    the actor) and it takes the room from the payload, so without checking the
 *    invite the host actually issued, anyone could name any live room and be
 *    seated in it as a publisher.
 */

type Seat = { userId: string; name: string; avatar: string; status: string };
type Layout = {
  coHosts: Seat[];
  hostUserId: string;
  layoutId?: string | null;
  featuredUserId?: string | null;
};

/** Server state the handlers read and write, observable to the tests. */
const layouts = new Map<string, Layout>();
const roomOwners = new Map<string, string>();
const cohostGrants: Array<{ roomId: string; userId: string }> = [];
const released: Array<{ roomId: string; userId: string }> = [];
const participantUpgrades: Array<{ roomId: string; userId: string }> = [];
const sentToUser: Array<{ userId: string; event: string }> = [];
const roomBroadcasts: Array<{ roomId: string; event: string; data: Record<string, unknown> }> = [];

vi.mock("./index", () => ({
  wsRateCheck: vi.fn(async () => true),
  getCohostLayout: vi.fn(async (roomId: string) => layouts.get(roomId) ?? null),
  setCohostLayout: vi.fn(
    async (
      roomId: string,
      coHosts: Seat[],
      hostUserId: string,
      layoutId?: string | null,
      featuredUserId?: string | null,
    ) => {
      layouts.set(roomId, { coHosts, hostUserId, layoutId, featuredUserId });
    },
  ),
  deleteCohostLayout: vi.fn(async (roomId: string) => layouts.delete(roomId)),
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
  sendToUserGlobal: vi.fn((userId: string, event: string) => {
    sentToUser.push({ userId, event });
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
vi.mock("../lib/valkey", () => ({ isValkeyConfigured: vi.fn(() => true) }));
vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { handleMessage } = await import("./handlers");

const HOST_ROOM = "host-room";

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

const host: Actor = { userId: "host-1", roomId: HOST_ROOM };
const invitee: Actor = { userId: "viewer-1", roomId: HOST_ROOM };

const seats = (roomId = HOST_ROOM) => layouts.get(roomId)?.coHosts ?? [];
const seatOf = (userId: string, roomId = HOST_ROOM) =>
  seats(roomId).find((s) => s.userId === userId);

/** Host offers a seat to `targetUserId`. */
const invite = (targetUserId: string) =>
  send(host, "cohost_invite_send", { targetUserId, targetName: "Viewer One" });

/** `actor` claims the seat they say they were offered. */
const accept = (actor: Actor, streamKey = HOST_ROOM, hostUserId = "host-1") =>
  send(actor, "cohost_invite_accept", { hostUserId, streamKey, cohostName: actor.userId });

describe("co-host publish authority", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    layouts.clear();
    roomOwners.clear();
    roomOwners.set(HOST_ROOM, "host-1");
    cohostGrants.length = 0;
    released.length = 0;
    participantUpgrades.length = 0;
    sentToUser.length = 0;
    roomBroadcasts.length = 0;
  });

  describe("invite is an offer, not a grant", () => {
    it("seats the invite without authorizing publishing", async () => {
      await invite("viewer-1");

      expect(seatOf("viewer-1")?.status).toBe("invited");
      // Neither half of publish authority: not the stored grant the token
      // endpoint trusts, and not the permission on an open connection.
      expect(cohostGrants).toEqual([]);
      expect(participantUpgrades).toEqual([]);
      expect(sentToUser).toContainEqual({ userId: "viewer-1", event: "cohost_invite" });
    });

    it("still grants nothing when the invite is never answered", async () => {
      await invite("viewer-1");
      await invite("viewer-1");

      expect(cohostGrants).toEqual([]);
      expect(seats()).toHaveLength(1);
    });

    it("only the host of the room may offer a seat", async () => {
      await send({ userId: "stranger-1", roomId: HOST_ROOM }, "cohost_invite_send", {
        targetUserId: "viewer-1",
      });

      expect(seats()).toEqual([]);
      expect(cohostGrants).toEqual([]);
    });
  });

  describe("acceptance is what authorizes publishing", () => {
    it("grants publish and upgrades the open connection on accept", async () => {
      await invite("viewer-1");
      await accept(invitee);

      expect(cohostGrants).toEqual([{ roomId: HOST_ROOM, userId: "viewer-1" }]);
      expect(participantUpgrades).toEqual([{ roomId: HOST_ROOM, userId: "viewer-1" }]);
      expect(seatOf("viewer-1")?.status).toBe("live");
      expect(sentToUser).toContainEqual({ userId: "host-1", event: "cohost_invite_accepted" });
    });

    it("keeps a repeated accept idempotent", async () => {
      await invite("viewer-1");
      await accept(invitee);
      await accept(invitee);

      expect(seats()).toHaveLength(1);
      expect(seatOf("viewer-1")?.status).toBe("live");
    });

    it("announces the seat to the room so the stage matches server state", async () => {
      await invite("viewer-1");
      roomBroadcasts.length = 0;
      await accept(invitee);

      const sync = roomBroadcasts.find((b) => b.event === "cohost_layout_sync");
      expect(sync?.roomId).toBe(HOST_ROOM);
      expect(sync?.data.hostUserId).toBe("host-1");
    });
  });

  describe("an accept with no invite behind it is refused", () => {
    it("refuses a user who was never offered a seat", async () => {
      await invite("viewer-1");

      await accept({ userId: "attacker-1", roomId: HOST_ROOM });

      expect(cohostGrants).toEqual([]);
      expect(participantUpgrades).toEqual([]);
      expect(seatOf("attacker-1")).toBeUndefined();
      // The host must not be told someone joined their stage either.
      expect(sentToUser.some((s) => s.event === "cohost_invite_accepted")).toBe(false);
    });

    it("refuses a room the sender is not even watching", async () => {
      await invite("viewer-1");

      // Not in the room, naming it in the payload: the old path took the room
      // from exactly this field.
      await accept({ userId: "attacker-1", roomId: "some-other-room" });

      expect(cohostGrants).toEqual([]);
      expect(participantUpgrades).toEqual([]);
      expect(seats()).toHaveLength(1);
      expect(seatOf("viewer-1")?.status).toBe("invited");
    });

    it("refuses an accept for a live with no co-host stage at all", async () => {
      roomOwners.set("solo-room", "solo-host");

      await accept({ userId: "attacker-1", roomId: "solo-room" }, "solo-room", "solo-host");

      expect(cohostGrants).toEqual([]);
      expect(participantUpgrades).toEqual([]);
      expect(layouts.get("solo-room")).toBeUndefined();
    });

    it("refuses when the claimed host is not the host of that stage", async () => {
      await invite("viewer-1");

      // Seat exists for this user, but the claimed host does not match the
      // server-written layout, so the claim is not about this stage.
      await accept(invitee, HOST_ROOM, "attacker-1");

      expect(cohostGrants).toEqual([]);
      expect(participantUpgrades).toEqual([]);
    });

    it("refuses an accept aimed at a different room than the invite", async () => {
      await invite("viewer-1");
      roomOwners.set("other-room", "other-host");
      layouts.set("other-room", { coHosts: [], hostUserId: "other-host" });

      await accept(invitee, "other-room", "other-host");

      expect(cohostGrants).toEqual([]);
      expect(seats("other-room")).toEqual([]);
    });

    it("refuses an accept with no room named", async () => {
      await invite("viewer-1");

      await send(invitee, "cohost_invite_accept", { hostUserId: "host-1" });

      expect(cohostGrants).toEqual([]);
      expect(participantUpgrades).toEqual([]);
      // No half-completed accept: the host is not told this seat is live.
      expect(sentToUser.some((s) => s.event === "cohost_invite_accepted")).toBe(false);
    });

    it("refuses a seat released before the accept arrived", async () => {
      await invite("viewer-1");
      await send(host, "cohost_seat_release", { targetUserId: "viewer-1" });
      cohostGrants.length = 0;

      await accept(invitee);

      expect(cohostGrants).toEqual([]);
      expect(participantUpgrades).toEqual([]);
      expect(seatOf("viewer-1")).toBeUndefined();
    });
  });

  describe("release frees exactly one seat", () => {
    it("host removal revokes that co-host and leaves the others seated", async () => {
      await invite("viewer-1");
      await accept(invitee);
      await invite("viewer-2");
      await accept({ userId: "viewer-2", roomId: HOST_ROOM });

      await send(host, "cohost_seat_release", { targetUserId: "viewer-1" });

      expect(released).toEqual([{ roomId: HOST_ROOM, userId: "viewer-1" }]);
      expect(seatOf("viewer-1")).toBeUndefined();
      expect(seatOf("viewer-2")?.status).toBe("live");
      expect(sentToUser).toContainEqual({ userId: "viewer-1", event: "cohost_seat_released" });
    });

    it("a co-host may stand down from their own seat", async () => {
      await invite("viewer-1");
      await accept(invitee);

      await send(invitee, "cohost_seat_leave", {});

      expect(released).toEqual([{ roomId: HOST_ROOM, userId: "viewer-1" }]);
      expect(seats()).toEqual([]);
    });

    it("a viewer cannot release someone else's seat", async () => {
      await invite("viewer-1");
      await accept(invitee);

      await send({ userId: "attacker-1", roomId: HOST_ROOM }, "cohost_seat_release", {
        targetUserId: "viewer-1",
      });
      await send({ userId: "attacker-1", roomId: HOST_ROOM }, "cohost_seat_leave", {});

      expect(released).toEqual([]);
      expect(seatOf("viewer-1")?.status).toBe("live");
    });

    it("ending co-host mode stands every seat down individually", async () => {
      await invite("viewer-1");
      await accept(invitee);
      await invite("viewer-2");
      await accept({ userId: "viewer-2", roomId: HOST_ROOM });

      await send(host, "cohost_seats_clear", {});

      expect(released).toEqual([
        { roomId: HOST_ROOM, userId: "viewer-1" },
        { roomId: HOST_ROOM, userId: "viewer-2" },
      ]);
      expect(seats()).toEqual([]);
    });
  });
});
