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
const joinRequests = new Map<string, Array<{ requesterUserId: string }>>();
/** Users with no open socket, so a per-user send reaches nobody. */
const offlineUsers = new Set<string>();
const sentToUser: Array<{ userId: string; event: string }> = [];
const sentToClient: Array<{ event: string; delivered: unknown }> = [];
const roomBroadcasts: Array<{ roomId: string; event: string; data: Record<string, unknown> }> = [];

vi.mock("./index", () => ({
  wsRateCheck: vi.fn(async () => true),
  getCohostLayout: vi.fn(async (roomId: string) => layouts.get(roomId) ?? null),
  tryGetCohostLayout: vi.fn(async (roomId: string) => ({
    status: "ok" as const,
    layout: layouts.get(roomId) ?? null,
  })),
  setCohostLayout: vi.fn(
    async (
      roomId: string,
      coHosts: Seat[],
      hostUserId: string,
      layoutId?: string | null,
      featuredUserId?: string | null,
    ) => {
      layouts.set(roomId, { coHosts, hostUserId, layoutId, featuredUserId });
      return "ok" as const;
    },
  ),
  deleteCohostLayout: vi.fn(async (roomId: string) => layouts.delete(roomId)),
  upsertCohostJoinRequest: vi.fn(async (roomId: string, requesterUserId: string) => {
    const queue = joinRequests.get(roomId) ?? [];
    if (!queue.some((r) => r.requesterUserId === requesterUserId)) {
      queue.push({ requesterUserId });
    }
    joinRequests.set(roomId, queue);
  }),
  deleteCohostJoinRequest: vi.fn(async (roomId: string, requesterUserId: string) => {
    const queue = joinRequests.get(roomId) ?? [];
    joinRequests.set(
      roomId,
      queue.filter((r) => r.requesterUserId !== requesterUserId),
    );
  }),
  listCohostJoinRequests: vi.fn(async (roomId: string) => joinRequests.get(roomId) ?? []),
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
  sendToClient: vi.fn(
    (_client: unknown, event: string, data?: Record<string, unknown>) => {
      sentToClient.push({ event, delivered: data?.delivered });
    },
  ),
  sendToUserGlobal: vi.fn((userId: string, event: string) => {
    // Delivery count of 0 is how the server learns nobody was listening.
    if (offlineUsers.has(userId)) return 0;
    sentToUser.push({ userId, event });
    return 1;
  }),
  incrementRoomLiveLikes: vi.fn(async () => 0),
  updateViewerCount: vi.fn(async () => {}),
  transferLiveAudienceToBattleRoom: vi.fn(async () => {}),
}));

/** What LiveKit answers when asked to upgrade a participant. */
let participantUpgradeResult: "granted" | "absent" | "unconfirmed" = "granted";

vi.mock("../services/livekit", () => ({
  grantParticipantPublish: vi.fn(async (roomId: string, userId: string) => {
    participantUpgrades.push({ roomId, userId });
    return participantUpgradeResult;
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
/** Pairs who have blocked each other, in either direction. */
const blockedPairs = new Set<string>();
const blockKey = (a: string, b: string) => [a, b].sort().join("|");
vi.mock("../lib/postgres", () => ({
  dbIsBlockedEitherWay: vi.fn(async (a: string, b: string) =>
    blockedPairs.has(blockKey(a, b)),
  ),
  dbGetLiveStreams: vi.fn(async () => []),
  getPool: vi.fn(() => null),
}));
/**
 * The seat lock is real here (single holder, owner-checked release), so these
 * tests run the same mutual exclusion production does.
 */
const locks = new Map<string, string>();
vi.mock("../lib/valkey", () => ({
  isValkeyConfigured: vi.fn(() => true),
  valkeyTrySetNx: vi.fn(async (key: string, token: string) => {
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
    locks.clear();
    joinRequests.clear();
    offlineUsers.clear();
    sentToClient.length = 0;
    roomOwners.clear();
    roomOwners.set(HOST_ROOM, "host-1");
    cohostGrants.length = 0;
    released.length = 0;
    participantUpgrades.length = 0;
    sentToUser.length = 0;
    roomBroadcasts.length = 0;
    participantUpgradeResult = "granted";
    blockedPairs.clear();
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

    it("gives the seat back when the invite reached nobody", async () => {
      offlineUsers.add("viewer-1");

      await invite("viewer-1");

      // The seat is written before delivery is attempted, so an invite nobody
      // received must not hold one of the eight slots for the rest of the live.
      expect(seats()).toEqual([]);
      expect(sentToClient).toContainEqual({
        event: "cohost_invite_ack",
        delivered: false,
      });
    });

    it("keeps a seated co-host when re-inviting them fails to deliver", async () => {
      await invite("viewer-1");
      await accept(invitee);
      offlineUsers.add("viewer-1");

      await invite("viewer-1");

      expect(seatOf("viewer-1")?.status).toBe("live");
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

    it("a declined invite gives the seat back to the stage", async () => {
      await invite("viewer-1");
      roomBroadcasts.length = 0;

      await send(invitee, "cohost_invite_decline", { streamKey: HOST_ROOM });

      // Without this the seat stayed "invited" for the rest of the live: it held
      // one of the eight slots, showed on the stage, and blocked a re-invite.
      expect(seats()).toEqual([]);
      expect(cohostGrants).toEqual([]);
      const sync = roomBroadcasts.find((b) => b.event === "cohost_layout_sync");
      expect(sync?.data.coHosts).toEqual([]);
      expect(sync?.data.hostUserId).toBe("host-1");
    });

    it("lets the host offer the freed seat to the same viewer again", async () => {
      await invite("viewer-1");
      await send(invitee, "cohost_invite_decline", { streamKey: HOST_ROOM });

      await invite("viewer-1");
      await accept(invitee);

      expect(seatOf("viewer-1")?.status).toBe("live");
      expect(cohostGrants).toEqual([{ roomId: HOST_ROOM, userId: "viewer-1" }]);
    });

    it("cannot take a seated co-host off the stage", async () => {
      await invite("viewer-1");
      await accept(invitee);
      released.length = 0;

      // A decline arriving after the same user accepted (stale banner, second
      // device) must not read as standing down — that is cohost_seat_leave.
      await send(invitee, "cohost_invite_decline", { streamKey: HOST_ROOM });

      expect(seatOf("viewer-1")?.status).toBe("live");
      expect(released).toEqual([]);
    });

    it("does nothing for a sender who holds no seat", async () => {
      await invite("viewer-1");

      await send({ userId: "attacker-1", roomId: HOST_ROOM }, "cohost_invite_decline", {
        streamKey: HOST_ROOM,
      });

      expect(seatOf("viewer-1")?.status).toBe("invited");
    });

    it("cannot clear a seat in a live it names but has no invite from", async () => {
      roomOwners.set("other-room", "other-host");
      layouts.set("other-room", {
        coHosts: [{ userId: "viewer-9", name: "Nine", avatar: "", status: "live" }],
        hostUserId: "other-host",
      });

      await send(invitee, "cohost_invite_decline", { streamKey: "other-room" });

      expect(seats("other-room")).toHaveLength(1);
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

  /**
   * The request queue is host state: it is what the host answers from. A viewer
   * who can delete another viewer's request can keep anyone off the stage, and a
   * decline notice carries the sender's id as the host's, so the queue has to be
   * gated on room ownership like every other host action.
   */
  describe("only the host answers the request queue", () => {
    const requester: Actor = { userId: "viewer-3", roomId: HOST_ROOM };
    const queued = (roomId = HOST_ROOM) => joinRequests.get(roomId) ?? [];

    it("keeps a stranger from declining another viewer's request", async () => {
      await send(requester, "cohost_request_send", { hostUserId: HOST_ROOM });
      expect(queued()).toHaveLength(1);

      await send({ userId: "attacker-1", roomId: HOST_ROOM }, "cohost_request_decline", {
        requesterUserId: "viewer-3",
      });

      expect(queued()).toHaveLength(1);
      expect(sentToUser.some((s) => s.event === "cohost_request_declined")).toBe(false);
    });

    it("lets the host decline and tells the requester once", async () => {
      await send(requester, "cohost_request_send", { hostUserId: HOST_ROOM });

      await send(host, "cohost_request_decline", { requesterUserId: "viewer-3" });

      expect(queued()).toEqual([]);
      expect(sentToUser).toContainEqual({
        userId: "viewer-3",
        event: "cohost_request_declined",
      });
    });

    it("keeps a stranger from accepting a request into a seat", async () => {
      await send(requester, "cohost_request_send", { hostUserId: HOST_ROOM });

      await send({ userId: "attacker-1", roomId: HOST_ROOM }, "cohost_request_accept", {
        requesterUserId: "viewer-3",
      });

      expect(seats()).toEqual([]);
      expect(cohostGrants).toEqual([]);
    });
  });

  /**
   * An invite banner outlives the thing it points at. It sits on screen while
   * the host ends the live or someone hits block, and tapping Join then would
   * seat a publisher on a stage that no longer exists — or one of the two
   * people has just said they want nothing to do with the other.
   */
  describe("the offer is rechecked at the moment it is taken", () => {
    it("refuses an invite accepted after the host's live ended", async () => {
      await invite("viewer-1");
      roomOwners.delete(HOST_ROOM);

      await accept(invitee);

      expect(seatOf("viewer-1")?.status).toBe("invited");
      expect(cohostGrants).toEqual([]);
      expect(sentToUser.some((s) => s.event === "cohost_invite_accepted")).toBe(false);
    });

    it("refuses an invite when the two have blocked each other since", async () => {
      await invite("viewer-1");
      blockedPairs.add(blockKey("host-1", "viewer-1"));

      await accept(invitee);

      expect(seatOf("viewer-1")?.status).toBe("invited");
      expect(cohostGrants).toEqual([]);
    });

    it("refuses a queued request from someone the host has since blocked", async () => {
      await send({ userId: "viewer-3", roomId: HOST_ROOM }, "cohost_request_send", {
        hostUserId: HOST_ROOM,
      });
      blockedPairs.add(blockKey("host-1", "viewer-3"));

      await send(host, "cohost_request_accept", { requesterUserId: "viewer-3" });

      expect(seats()).toEqual([]);
      expect(cohostGrants).toEqual([]);
      // The stale request leaves the queue rather than sitting there unanswerable.
      expect(joinRequests.get(HOST_ROOM) ?? []).toEqual([]);
    });
  });

  /**
   * A seat and a publish permission are one decision written into two systems.
   * If LiveKit cannot confirm the upgrade, seating them anyway puts a co-host
   * tile on everyone's stage for someone who may be unable to speak — the seat
   * table would say co-host while the room says muted spectator.
   */
  describe("a seat is only kept when the media half is real", () => {
    it("withdraws an accepted seat when LiveKit does not confirm", async () => {
      await invite("viewer-1");
      participantUpgradeResult = "unconfirmed";

      await accept(invitee);

      expect(seats()).toEqual([]);
      // The grant that would authorize their next token goes back too.
      expect(released).toEqual([{ roomId: HOST_ROOM, userId: "viewer-1" }]);
      const sync = roomBroadcasts.filter((b) => b.event === "cohost_layout_sync").pop();
      expect(sync?.data.coHosts).toEqual([]);
      expect(sentToUser.some((s) => s.event === "cohost_invite_accepted")).toBe(false);
    });

    it("withdraws an accepted request and tells the viewer it did not happen", async () => {
      await send({ userId: "viewer-3", roomId: HOST_ROOM }, "cohost_request_send", {
        hostUserId: HOST_ROOM,
      });
      participantUpgradeResult = "unconfirmed";

      await send(host, "cohost_request_accept", { requesterUserId: "viewer-3" });

      expect(seats()).toEqual([]);
      expect(sentToUser.some((s) => s.event === "cohost_request_accepted")).toBe(false);
      expect(sentToUser).toContainEqual({
        userId: "viewer-3",
        event: "cohost_request_declined",
      });
    });

    it("keeps the seat when the co-host simply has not joined the room yet", async () => {
      await invite("viewer-1");
      // 'absent' is not a failure: the token they fetch on join carries the grant.
      participantUpgradeResult = "absent";

      await accept(invitee);

      expect(seatOf("viewer-1")?.status).toBe("live");
      expect(released).toEqual([]);
      expect(sentToUser).toContainEqual({
        userId: "host-1",
        event: "cohost_invite_accepted",
      });
    });
  });

  /**
   * Seats are held by an account, not by a connection. Accepting from a phone
   * and a tablet is one person walking onto the stage twice, and each extra row
   * would eat one of the eight slots.
   */
  describe("one account holds at most one seat", () => {
    it("does not add a second row when the same user accepts twice", async () => {
      await invite("viewer-1");

      await accept(invitee);
      await accept({ userId: "viewer-1", roomId: "second-device-room" });

      expect(seats().filter((s) => s.userId === "viewer-1")).toHaveLength(1);
      expect(seatOf("viewer-1")?.status).toBe("live");
    });

    it("does not spend a second slot when the host re-invites a seated co-host", async () => {
      await invite("viewer-1");
      await accept(invitee);

      await invite("viewer-1");

      expect(seats()).toHaveLength(1);
      // Re-inviting must not knock a publishing co-host back to "invited".
      expect(seatOf("viewer-1")?.status).toBe("live");
    });
  });
});
