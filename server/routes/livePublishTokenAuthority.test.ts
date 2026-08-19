import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import type { CreateTokenOptions } from "../services/livekit";

/**
 * Who may publish is decided by the server, on the token.
 *
 * `canPublish` is baked into the LiveKit JWT, so this endpoint is the only place
 * publishing rights are handed out for a live room. A caller asking to publish
 * is a request, never an authorization: the answer has to come from host
 * ownership, a battle grant, or a co-host seat the host actually accepted.
 *
 * An INVITE is not an acceptance. A user who has only been offered a seat — or
 * who was offered one and never answered — must not be able to publish into that
 * creator's live.
 */

const livekit = {
  isLiveKitConfigured: vi.fn(() => true),
  listActiveRoomsFromLiveKit: vi.fn(async () => [] as Array<{ name: string; numParticipants: number }>),
  getRoomOccupancy: vi.fn(async () => "occupied" as "occupied" | "empty" | "unknown"),
  roomHasActivePublisher: vi.fn(async () => true),
  isUserPublishingInRoom: vi.fn(async () => true),
  // The route rejects anything too short to be a real JWT, so this stands in for
  // one at plausible length. Typed with the real options so the assertions below
  // read the grants the route actually asked for.
  createLiveToken: vi.fn(
    async (_options: CreateTokenOptions) => `signed.${"x".repeat(80)}.jwt`,
  ),
  getLiveKitUrl: vi.fn(() => "wss://example.livekit.cloud"),
};

const postgres = {
  dbGetLiveStreams: vi.fn(async () => [{ stream_key: "room-1", user_id: "host-1" }]),
  dbEndLiveStream: vi.fn(async () => {}),
  dbInsertLiveStream: vi.fn(async () => {}),
  dbGetStreamOwnerUserId: vi.fn(async () => "host-1"),
  dbIsBlockedEitherWay: vi.fn(async () => false),
};

type CohostSeat = { userId: string; status: string };
let layout: { hostUserId: string; coHosts: CohostSeat[] } | null = null;
let cohostGrants = new Set<string>();
let battleGrants = new Set<string>();

const wsIndex = {
  hasBattlePublishGrant: vi.fn(async (room: string, userId: string) =>
    battleGrants.has(`${room}:${userId}`),
  ),
  hasCohostPublishGrant: vi.fn(async (room: string, userId: string) =>
    cohostGrants.has(`${room}:${userId}`),
  ),
  getCohostLayout: vi.fn(async () => layout),
};

/** Whoever is calling the endpoint. */
let caller = "host-1";

vi.mock("../services/livekit", () => livekit);
vi.mock("../lib/postgres", () => postgres);
vi.mock("../feedBroadcast", () => ({ broadcastToFeedSubscribers: vi.fn() }));
vi.mock("../lib/notifications", () => ({
  insertNotification: vi.fn(async () => {}),
  deleteLiveStartedNotificationsForRoom: vi.fn(async () => {}),
}));
vi.mock("../lib/valkey", () => ({
  // Valkey off: host ownership resolves from the DB, and grants come from the
  // mocked websocket module, so every authority in this test is explicit.
  isValkeyConfigured: vi.fn(() => false),
  valkeyHset: vi.fn(async () => {}),
  valkeyHget: vi.fn(async () => null),
  valkeyHdel: vi.fn(async () => {}),
  valkeyHgetall: vi.fn(async () => ({})),
  valkeyHgetallBatch: vi.fn(async () => []),
  valkeyExpire: vi.fn(async () => {}),
  valkeyGet: vi.fn(async () => null),
  valkeySet: vi.fn(async () => {}),
  valkeyDel: vi.fn(async () => {}),
  acquireCacheBuildLock: vi.fn(async () => true),
  waitForCachePopulate: vi.fn(async () => null),
}));
vi.mock("../routes/auth", () => ({
  getTokenFromRequest: vi.fn(() => "session-token"),
  verifyAuthToken: vi.fn(() => ({ sub: caller })),
}));
vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../lib/cacheLayerMetrics", () => ({ bumpCacheLayer: vi.fn() }));
vi.mock("../websocket/index", () => wsIndex);
vi.mock("../websocket/liveCreatorRole", () => ({
  getCreatorLiveRoleRoom: vi.fn(async () => null),
}));
vi.mock("./profiles", () => ({ getFollowerIdsAsync: vi.fn(async () => []) }));

const { handleGetLiveToken, resolveLivePublishAuthority } = await import("./livestream");

function tokenRequest(query: Record<string, string>): Request {
  return { query, headers: {}, body: {} } as unknown as Request;
}

function fakeRes() {
  const sent: { status?: number; body?: Record<string, unknown> } = {};
  const res = {
    setHeader() {
      return res;
    },
    status(code: number) {
      sent.status = code;
      return res;
    },
    json(body: Record<string, unknown>) {
      sent.body = body;
      return res;
    },
  };
  return { res: res as unknown as Response, sent };
}

/** The grants the JWT would actually carry. */
function mintedToken(): CreateTokenOptions | undefined {
  return livekit.createLiveToken.mock.calls.at(-1)?.[0];
}

async function requestToken(as: string, query: Record<string, string>) {
  caller = as;
  const { res, sent } = fakeRes();
  await handleGetLiveToken(tokenRequest(query), res);
  return sent;
}

describe("GET /api/live/token publish authority", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    layout = null;
    cohostGrants = new Set();
    battleGrants = new Set();
    livekit.createLiveToken.mockResolvedValue(`signed.${"x".repeat(80)}.jwt`);
    postgres.dbGetLiveStreams.mockResolvedValue([{ stream_key: "room-1", user_id: "host-1" }]);
    postgres.dbGetStreamOwnerUserId.mockResolvedValue("host-1");
    postgres.dbIsBlockedEitherWay.mockResolvedValue(false);
  });

  it("gives the host a publish token for their own room", async () => {
    const sent = await requestToken("host-1", { room: "room-1", publish: "1" });

    expect(sent.status).toBe(200);
    expect(mintedToken()).toMatchObject({ userId: "host-1", roomName: "room-1", canPublish: true });
  });

  it("gives a plain spectator a subscribe-only token", async () => {
    const sent = await requestToken("viewer-1", { room: "room-1" });

    expect(sent.status).toBe(200);
    expect(mintedToken()?.canPublish).toBe(false);
  });

  it("refuses publish to a spectator who simply asks for it", async () => {
    const sent = await requestToken("viewer-1", { room: "room-1", publish: "1" });

    expect(sent.status).toBe(403);
    // Nothing may be signed at all: a refused publish request must not fall back
    // to quietly issuing a watch token that the caller believes can publish.
    expect(livekit.createLiveToken).not.toHaveBeenCalled();
  });

  it("refuses publish to a user who was only invited", async () => {
    // The seat exists because the host offered it, and nothing has been accepted.
    layout = { hostUserId: "host-1", coHosts: [{ userId: "viewer-1", status: "invited" }] };

    const sent = await requestToken("viewer-1", { room: "room-1", publish: "1" });

    expect(sent.status).toBe(403);
    expect(livekit.createLiveToken).not.toHaveBeenCalled();
  });

  it("refuses publish on an invite the user never answered, however long it sits", async () => {
    // An unanswered invite must not decay into publishing rights: the grant that
    // authorizes a token is written on acceptance, so there is none here.
    layout = { hostUserId: "host-1", coHosts: [{ userId: "viewer-1", status: "invited" }] };

    for (let attempt = 0; attempt < 3; attempt++) {
      const sent = await requestToken("viewer-1", { room: "room-1", publish: "1" });
      expect(sent.status).toBe(403);
    }
  });

  it("allows publish once the seat is accepted", async () => {
    layout = { hostUserId: "host-1", coHosts: [{ userId: "viewer-1", status: "accepted" }] };

    const sent = await requestToken("viewer-1", { room: "room-1", publish: "1" });

    expect(sent.status).toBe(200);
    expect(mintedToken()).toMatchObject({ userId: "viewer-1", canPublish: true });
  });

  it("allows publish for a live seat, and for the grant written on acceptance", async () => {
    layout = { hostUserId: "host-1", coHosts: [{ userId: "viewer-1", status: "live" }] };
    expect((await requestToken("viewer-1", { room: "room-1", publish: "1" })).status).toBe(200);

    // Grant path alone (seat table not consulted): this is what a reconnecting
    // co-host relies on.
    layout = null;
    cohostGrants.add("room-1:viewer-1");
    expect((await requestToken("viewer-1", { room: "room-1", publish: "1" })).status).toBe(200);
    expect(mintedToken()?.canPublish).toBe(true);
  });

  it("returns subscribe-only after the seat was released, even on retry", async () => {
    // Released mid-live: grant deleted and seat gone. A stale client that keeps
    // asking to publish gets refused, and can still watch.
    layout = { hostUserId: "host-1", coHosts: [] };

    expect((await requestToken("viewer-1", { room: "room-1", publish: "1" })).status).toBe(403);
    expect((await requestToken("viewer-1", { room: "room-1", publish: "1" })).status).toBe(403);

    const watching = await requestToken("viewer-1", { room: "room-1" });
    expect(watching.status).toBe(200);
    expect(mintedToken()?.canPublish).toBe(false);
  });

  it("ignores a seat table that does not belong to this room's host", async () => {
    // A layout whose host is not the room owner proves nothing about this room.
    layout = { hostUserId: "someone-else", coHosts: [{ userId: "viewer-1", status: "live" }] };

    const sent = await requestToken("viewer-1", { room: "room-1", publish: "1" });

    expect(sent.status).toBe(403);
  });

  it("ignores another user's accepted seat", async () => {
    layout = { hostUserId: "host-1", coHosts: [{ userId: "other-viewer", status: "live" }] };

    const sent = await requestToken("viewer-1", { room: "room-1", publish: "1" });

    expect(sent.status).toBe(403);
  });

  it("allows publish for an accepted battle rival", async () => {
    battleGrants.add("room-1:rival-1");

    const sent = await requestToken("rival-1", { room: "room-1", publish: "1" });

    expect(sent.status).toBe(200);
    expect(mintedToken()?.canPublish).toBe(true);
  });

  it("scopes the token to the requested room only", async () => {
    cohostGrants.add("room-1:viewer-1");

    // Grant is for room-1; asking to publish in another live must not inherit it.
    const sent = await requestToken("viewer-1", { room: "room-2", publish: "1" });

    expect(sent.status).toBe(403);
  });

  it("derives identity from the session, never from the request", async () => {
    const sent = await requestToken("host-1", {
      room: "room-1",
      publish: "1",
      userId: "victim-1",
      identity: "victim-1",
    });

    expect(sent.status).toBe(200);
    expect(mintedToken()?.userId).toBe("host-1");
  });

  it("keeps a blocked viewer out of the media room entirely", async () => {
    postgres.dbIsBlockedEitherWay.mockResolvedValue(true);

    const sent = await requestToken("viewer-1", { room: "room-1" });

    expect(sent.status).toBe(403);
    expect(livekit.createLiveToken).not.toHaveBeenCalled();
  });
});

/**
 * The same predicate answers a second caller: the LiveKit join webhook, which
 * re-checks a participant who arrived already holding publish rights. That
 * caller takes permissions away, so it needs to tell "the server says no" apart
 * from "the server cannot answer" — a failed registry lookup must never read as
 * a refusal and silence a live host.
 */
describe("resolveLivePublishAuthority", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    layout = null;
    cohostGrants = new Set();
    battleGrants = new Set();
    postgres.dbGetStreamOwnerUserId.mockResolvedValue("host-1");
  });

  it("authorizes the room's host", async () => {
    expect(await resolveLivePublishAuthority("room-1", "host-1")).toBe("authorized");
  });

  it("authorizes an accepted seat and the grant written on acceptance", async () => {
    layout = { hostUserId: "host-1", coHosts: [{ userId: "viewer-1", status: "accepted" }] };
    expect(await resolveLivePublishAuthority("room-1", "viewer-1")).toBe("authorized");

    layout = null;
    cohostGrants.add("room-1:viewer-1");
    expect(await resolveLivePublishAuthority("room-1", "viewer-1")).toBe("authorized");

    cohostGrants = new Set();
    battleGrants.add("room-1:rival-1");
    expect(await resolveLivePublishAuthority("room-1", "rival-1")).toBe("authorized");
  });

  it("refuses a released seat once the room owner is known", async () => {
    layout = { hostUserId: "host-1", coHosts: [] };
    expect(await resolveLivePublishAuthority("room-1", "viewer-1")).toBe("unauthorized");
  });

  it("refuses an invite that was never accepted", async () => {
    layout = { hostUserId: "host-1", coHosts: [{ userId: "viewer-1", status: "invited" }] };
    expect(await resolveLivePublishAuthority("room-1", "viewer-1")).toBe("unauthorized");
  });

  it("answers 'unknown' when the room owner cannot be established", async () => {
    // Registry and DB both silent: nothing is proven either way.
    postgres.dbGetStreamOwnerUserId.mockResolvedValue(null as unknown as string);
    expect(await resolveLivePublishAuthority("room-1", "viewer-1")).toBe("unknown");

    postgres.dbGetStreamOwnerUserId.mockRejectedValue(new Error("db down"));
    expect(await resolveLivePublishAuthority("room-1", "viewer-1")).toBe("unknown");
  });

  it("answers 'unknown' rather than refusing when asked about nothing", async () => {
    expect(await resolveLivePublishAuthority("", "viewer-1")).toBe("unknown");
    expect(await resolveLivePublishAuthority("room-1", "")).toBe("unknown");
  });
});
