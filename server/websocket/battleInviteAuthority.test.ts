import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A 1×1 battle is two live creators agreeing to compete, and the server is the
 * only party that can confirm either half of that.
 *
 * Three rules are pinned here behaviourally:
 *
 * 1. An invite outlives the live that sent it. Accepting one has to re-prove that
 *    BOTH creators are still live, or a host who has already ended can be
 *    accepted into — seating the accepter against nobody and granting them
 *    publish rights in a room with no stream.
 * 2. Declining is only meaningful for an invite that exists. The room comes from
 *    the payload, so an unchecked decline let any client make the server announce
 *    a decline from them into any live and rebuild that live's invite roster.
 * 3. Nothing about a battle may be done without a rate limit, including the
 *    read paths — a state request does Valkey work and can trigger finalization.
 */

/** Creators who are currently publishing their own live. */
const liveCreators = new Set<string>();
/** Outstanding invites, keyed room→invitee, exactly as the accept path reads. */
const invites = new Set<string>();
const inviteKey = (roomId: string, userId: string) => `${roomId}|${userId}`;
const roomOwners = new Map<string, string>();
/** The battle a room is currently running, as the store would answer. */
const battleSessions = new Map<string, { id: string; status: string }>();
const blockedPairs = new Set<string>();
const blockKey = (a: string, b: string) => [a, b].sort().join("|");

const battleGrants: Array<{ roomId: string; userId: string }> = [];
const seatClaims: Array<{ roomId: string; userId: string }> = [];
const clearedInvites: Array<{ roomId: string; userId: string }> = [];
const sentToClient: Array<{ event: string; data: Record<string, unknown> }> = [];
const roomBroadcasts: Array<{ roomId: string; event: string }> = [];
const rosterPublishes: string[] = [];
/** Events the rate limiter was asked about, in order. */
const rateChecks: string[] = [];
let rateLimitAllows = true;

vi.mock("./index", () => ({
  wsRateCheck: vi.fn(async (_userId: string, event: string) => {
    rateChecks.push(event);
    return rateLimitAllows;
  }),
  broadcastToRoom: vi.fn((roomId: string, event: string) => {
    roomBroadcasts.push({ roomId, event });
  }),
  sendToClient: vi.fn(
    (_client: unknown, event: string, data?: Record<string, unknown>) => {
      sentToClient.push({ event, data: data ?? {} });
    },
  ),
  sendToUserGlobal: vi.fn(() => 1),
  grantBattlePublish: vi.fn(async (roomId: string, userId: string) => {
    battleGrants.push({ roomId, userId });
  }),
  hasBattlePublishGrant: vi.fn(async () => false),
  revokeBattlePublish: vi.fn(async () => {}),
  grantCohostPublish: vi.fn(async () => true),
  releaseCohostPublish: vi.fn(async () => "revoked" as const),
  upsertCohostJoinRequest: vi.fn(async () => {}),
  deleteCohostJoinRequest: vi.fn(async () => {}),
  listCohostJoinRequests: vi.fn(async () => []),
  getCohostLayout: vi.fn(async () => null),
  tryGetCohostLayout: vi.fn(async () => ({ status: "ok" as const, layout: null })),
  setCohostLayout: vi.fn(async () => "ok" as const),
  deleteCohostLayout: vi.fn(async () => {}),
  incrementRoomLiveLikes: vi.fn(async () => 0),
  updateViewerCount: vi.fn(async () => {}),
  transferLiveAudienceToBattleRoom: vi.fn(async () => {}),
}));

vi.mock("./battle", () => ({
  hasBattleInvite: vi.fn(async (roomId: string, userId: string) =>
    invites.has(inviteKey(roomId, userId)),
  ),
  setBattleInvite: vi.fn(async (roomId: string, userId: string) => {
    invites.add(inviteKey(roomId, userId));
  }),
  clearBattleInvite: vi.fn(async (roomId: string, userId: string) => {
    invites.delete(inviteKey(roomId, userId));
    clearedInvites.push({ roomId, userId });
  }),
  clearPendingBattleInvites: vi.fn(async () => []),
  hasBattleAcceptedGrant: vi.fn(async () => false),
  setBattleAcceptedGrant: vi.fn(async () => {}),
  getUserBattleRoom: vi.fn(async () => null),
  setUserBattleRoom: vi.fn(async () => {}),
  claimBattleSeat: vi.fn(async (roomId: string, userId: string) => {
    seatClaims.push({ roomId, userId });
    return { id: "battle-1", roomId, status: "WAITING", participants: [] };
  }),
  getBattleFromStore: vi.fn(async (roomId: string) =>
    battleSessions.get(roomId) ?? null,
  ),
  buildBattleStateForRoom: vi.fn(async () => ({ state: null, unreadable: false })),
  broadcastBattleState: vi.fn(async () => {}),
  confirmBattleParticipantPresence: vi.fn(async () => null),
  ensureBattleForHost: vi.fn(async () => null),
  finalizeBattle: vi.fn(async () => null),
  removeBattleParticipant: vi.fn(async () => false),
  startBattleIfReady: vi.fn(async () => ({ ok: false, reason: "no_rivals", notReady: [] })),
  addBattleScore: vi.fn(async () => ({ ok: false, reason: "no_battle" })),
  claimBattleVoteOnce: vi.fn(async () => true),
}));

vi.mock("../services/livekit", () => ({
  isLiveKitConfigured: vi.fn(() => true),
  // Authoritative liveness: only a creator actually publishing counts.
  isUserPublishingInRoom: vi.fn(async (_room: string, userId: string) =>
    liveCreators.has(userId),
  ),
  grantParticipantPublish: vi.fn(async () => "granted" as const),
  revokeParticipantPublish: vi.fn(async () => "revoked" as const),
}));

vi.mock("../routes/livestream", () => ({
  resolveStreamOwnerUserId: vi.fn(async (room: string) => roomOwners.get(room) ?? room),
  isStreamHost: vi.fn(async (room: string, userId: string) => roomOwners.get(room) === userId),
  removeActiveStream: vi.fn(async () => true),
  listActiveLiveStreams: vi.fn(async () => []),
}));

vi.mock("../lib/postgres", () => ({
  dbIsBlockedEitherWay: vi.fn(async (a: string, b: string) =>
    blockedPairs.has(blockKey(a, b)),
  ),
  dbGetLiveStreams: vi.fn(async () => []),
  getPool: vi.fn(() => null),
}));

vi.mock("./liveCreatorRole", () => ({ setCreatorCohostRoom: vi.fn(async () => {}) }));
vi.mock("../lib/valkey", () => ({ isValkeyConfigured: vi.fn(() => true) }));
vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { handleMessage } = await import("./handlers");

const HOST_ROOM = "host-room";
const HOST = "creator-a";
const RIVAL = "creator-b";

function client(userId: string, roomId: string) {
  return {
    userId,
    roomId,
    displayName: userId,
    avatarUrl: "",
    username: userId,
    level: 1,
  } as unknown as Parameters<typeof handleMessage>[0];
}

/** The rival, watching from their own live, accepts the host's invite. */
function acceptInvite() {
  return handleMessage(client(RIVAL, RIVAL), "battle_invite_accept", {
    hostUserId: HOST,
    hostStreamKey: HOST_ROOM,
  });
}

function errorReasons() {
  return sentToClient
    .filter((s) => s.event === "battle_error")
    .map((s) => s.data.reason);
}

describe("battle invite authority", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    liveCreators.clear();
    invites.clear();
    roomOwners.clear();
    battleSessions.clear();
    blockedPairs.clear();
    battleGrants.length = 0;
    seatClaims.length = 0;
    clearedInvites.length = 0;
    sentToClient.length = 0;
    roomBroadcasts.length = 0;
    rosterPublishes.length = 0;
    rateChecks.length = 0;
    rateLimitAllows = true;

    roomOwners.set(HOST_ROOM, HOST);
    roomOwners.set(RIVAL, RIVAL);
    liveCreators.add(HOST);
    liveCreators.add(RIVAL);
    invites.add(inviteKey(HOST_ROOM, RIVAL));
    // The host is in battle mode: entering it is what created this session.
    battleSessions.set(HOST_ROOM, { id: "battle-1", status: "WAITING" });
  });

  describe("both creators must still be live when the invite is accepted", () => {
    it("seats the rival while both are live", async () => {
      await acceptInvite();

      // Seat first, publish rights second — never the other way round.
      expect(seatClaims).toEqual([{ roomId: HOST_ROOM, userId: RIVAL }]);
      expect(battleGrants).toEqual([{ roomId: HOST_ROOM, userId: RIVAL }]);
      expect(errorReasons()).toEqual([]);
    });

    it("refuses when the match this invite belonged to is over", async () => {
      battleSessions.set(HOST_ROOM, { id: "battle-1", status: "ENDED" });

      await acceptInvite();

      expect(errorReasons()).toEqual(["battle_over"]);
      // No seat, and no publish rights in the host's live either.
      expect(seatClaims).toEqual([]);
      expect(battleGrants).toEqual([]);
      expect(invites.has(inviteKey(HOST_ROOM, RIVAL))).toBe(false);
    });

    it("refuses when there is no battle to join at all", async () => {
      battleSessions.delete(HOST_ROOM);

      await acceptInvite();

      expect(errorReasons()).toEqual(["battle_over"]);
      expect(battleGrants).toEqual([]);
    });

    it("refuses when the host's live has ended since inviting", async () => {
      liveCreators.delete(HOST);

      await acceptInvite();

      expect(errorReasons()).toEqual(["host_not_live"]);
      // No publish rights in a room with no stream, and the dead invite is gone.
      expect(battleGrants).toEqual([]);
      expect(invites.has(inviteKey(HOST_ROOM, RIVAL))).toBe(false);
    });

    it("refuses when the accepter is not live", async () => {
      liveCreators.delete(RIVAL);

      await acceptInvite();

      expect(errorReasons()).toEqual(["not_live"]);
      expect(battleGrants).toEqual([]);
    });

    it("refuses when either creator has blocked the other", async () => {
      blockedPairs.add(blockKey(HOST, RIVAL));

      await acceptInvite();

      expect(errorReasons()).toEqual(["blocked"]);
      expect(battleGrants).toEqual([]);
    });

    it("refuses an accept nobody was invited for", async () => {
      invites.clear();

      await acceptInvite();

      expect(battleGrants).toEqual([]);
      expect(
        sentToClient.some(
          (s) =>
            s.event === "battle_error" &&
            s.data.message === "Battle invite is no longer valid",
        ),
      ).toBe(true);
    });
  });

  describe("declining requires an invite to decline", () => {
    it("announces a real decline to the host's room", async () => {
      await handleMessage(client(RIVAL, RIVAL), "battle_invite_decline", {
        hostStreamKey: HOST_ROOM,
      });

      expect(roomBroadcasts).toEqual(
        expect.arrayContaining([
          { roomId: HOST_ROOM, event: "battle_invite_declined" },
        ]),
      );
      expect(invites.has(inviteKey(HOST_ROOM, RIVAL))).toBe(false);
    });

    it("says nothing to a live the sender was never invited to", async () => {
      const stranger = "random-viewer";

      await handleMessage(client(stranger, HOST_ROOM), "battle_invite_decline", {
        hostStreamKey: HOST_ROOM,
      });

      // No forged decline in that room, and no roster rebuild on demand.
      expect(roomBroadcasts).toEqual([]);
      expect(clearedInvites).toEqual([]);
    });
  });

  describe("every battle event is rate limited", () => {
    it("asks the limiter before doing the work", async () => {
      await handleMessage(client(RIVAL, HOST_ROOM), "battle_get_state", {});
      await handleMessage(client(HOST, HOST_ROOM), "battle_end", {});
      await handleMessage(client(RIVAL, RIVAL), "battle_invite_decline", {
        hostStreamKey: HOST_ROOM,
      });

      expect(rateChecks).toEqual([
        "battle_get_state",
        "battle_end",
        "battle_invite_decline",
      ]);
    });

    it("does no work once the limit is reached", async () => {
      rateLimitAllows = false;

      await handleMessage(client(RIVAL, RIVAL), "battle_invite_decline", {
        hostStreamKey: HOST_ROOM,
      });
      await acceptInvite();

      expect(roomBroadcasts).toEqual([]);
      expect(battleGrants).toEqual([]);
      expect(invites.has(inviteKey(HOST_ROOM, RIVAL))).toBe(true);
    });
  });
});
