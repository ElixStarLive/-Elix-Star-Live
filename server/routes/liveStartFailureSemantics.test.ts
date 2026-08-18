import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

/**
 * A partial start must not leave a live behind.
 *
 * POST /api/live/start writes a Valkey session, writes the durable Neon row,
 * announces stream_started to the feed, notifies followers and mints a publish
 * token. The Neon row is the registration /api/live/streams verifies and every
 * end path mutates, so a start that reports success without it produces a
 * creator who is broadcasting but cannot be listed or ended — and a start that
 * fails after announcing leaves followers with a notification for a live that
 * never happened.
 */

const livekit = {
  isLiveKitConfigured: vi.fn(() => true),
  listActiveRoomsFromLiveKit: vi.fn(async () => [] as Array<{ name: string; numParticipants: number }>),
  getRoomOccupancy: vi.fn(async () => "empty" as "occupied" | "empty" | "unknown"),
  roomHasActivePublisher: vi.fn(async () => false),
  isUserPublishingInRoom: vi.fn(async () => false),
  createLiveToken: vi.fn(async () => "publish-token"),
  getLiveKitUrl: vi.fn(() => "wss://example.livekit.cloud"),
};

const postgres = {
  dbGetLiveStreams: vi.fn(async () => []),
  dbEndLiveStream: vi.fn(async () => {}),
  dbInsertLiveStream: vi.fn(async () => {}),
  dbGetStreamOwnerUserId: vi.fn(async () => null),
};

const feed = { broadcastToFeedSubscribers: vi.fn() };
const notifications = {
  insertNotification: vi.fn(async () => {}),
  deleteLiveStartedNotificationsForRoom: vi.fn(async () => {}),
};

/** Valkey hash for `stream:<room>`, so the session state is observable. */
let streamHash: Record<string, Record<string, string>> = {};

const valkey = {
  isValkeyConfigured: vi.fn(() => true),
  valkeyHset: vi.fn(async (key: string, field: string, value: string) => {
    (streamHash[key] ??= {})[field] = value;
  }),
  valkeyHget: vi.fn(async (key: string, field: string) => streamHash[key]?.[field] ?? null),
  valkeyHdel: vi.fn(async (key: string, ...fields: string[]) => {
    for (const f of fields) delete streamHash[key]?.[f];
  }),
  valkeyHgetall: vi.fn(async (key: string) => streamHash[key] ?? {}),
  valkeyHgetallBatch: vi.fn(async (keys: string[]) => keys.map((k) => streamHash[k] ?? {})),
  valkeyExpire: vi.fn(async () => {}),
  valkeyGet: vi.fn(async () => null),
  valkeySet: vi.fn(async () => {}),
  valkeyDel: vi.fn(async () => {}),
  acquireCacheBuildLock: vi.fn(async () => true),
  waitForCachePopulate: vi.fn(async () => null),
};

vi.mock("../services/livekit", () => livekit);
vi.mock("../lib/postgres", () => postgres);
vi.mock("../feedBroadcast", () => feed);
vi.mock("../lib/notifications", () => notifications);
vi.mock("../lib/valkey", () => valkey);
vi.mock("../routes/auth", () => ({
  getTokenFromRequest: vi.fn(() => "session-token"),
  verifyAuthToken: vi.fn(() => ({ sub: "creator-1" })),
}));
vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../lib/cacheLayerMetrics", () => ({ bumpCacheLayer: vi.fn() }));
vi.mock("../websocket/index", () => ({
  hasBattlePublishGrant: vi.fn(async () => false),
  hasCohostPublishGrant: vi.fn(async () => false),
  getCohostLayout: vi.fn(async () => null),
}));
vi.mock("../websocket/liveCreatorRole", () => ({
  getCreatorLiveRoleRoom: vi.fn(async () => null),
}));
vi.mock("./profiles", () => ({ getFollowerIdsAsync: vi.fn(async () => ["follower-1"]) }));

const { handleLiveStart } = await import("./livestream");

const STREAM_HASH_KEY = "stream:room-1";

function startRequest(): Request {
  return { body: { room: "room-1", displayName: "Creator One" }, headers: {} } as unknown as Request;
}

function fakeRes() {
  const sent: { status?: number; body?: Record<string, unknown> } = {};
  const res = {
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

const startedBroadcasts = () =>
  feed.broadcastToFeedSubscribers.mock.calls.filter(([event]) => event === "stream_started");

describe("POST /api/live/start failure semantics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    streamHash = {};
    livekit.isLiveKitConfigured.mockReturnValue(true);
    livekit.createLiveToken.mockResolvedValue("publish-token");
    postgres.dbInsertLiveStream.mockResolvedValue(undefined);
    valkey.isValkeyConfigured.mockReturnValue(true);
  });

  it("registers, announces and returns a token on a healthy start", async () => {
    const { res, sent } = fakeRes();

    await handleLiveStart(startRequest(), res);

    expect(sent.status).toBe(200);
    expect(sent.body).toMatchObject({ room: "room-1", token: "publish-token", stream_key: "room-1" });
    expect(postgres.dbInsertLiveStream).toHaveBeenCalledWith("room-1", "creator-1", "Creator One", false);
    expect(streamHash[STREAM_HASH_KEY]?.userId).toBe("creator-1");
    expect(startedBroadcasts()).toHaveLength(1);
    expect(notifications.insertNotification).toHaveBeenCalled();
  });

  it("fails the start when the durable registration cannot be written", async () => {
    postgres.dbInsertLiveStream.mockRejectedValue(new Error("neon unavailable"));
    const { res, sent } = fakeRes();

    await handleLiveStart(startRequest(), res);

    // No token: the creator must not go live against a registry that has no row
    // for them, because nothing could then list or end that stream.
    expect(sent.status).toBe(500);
    expect(sent.body?.token).toBeUndefined();
    expect(startedBroadcasts()).toHaveLength(0);
    expect(notifications.insertNotification).not.toHaveBeenCalled();
  });

  it("rolls the session back so the failed start leaves no registration", async () => {
    postgres.dbInsertLiveStream.mockRejectedValue(new Error("neon unavailable"));
    const { res } = fakeRes();

    await handleLiveStart(startRequest(), res);

    expect(streamHash[STREAM_HASH_KEY]?.userId).toBeUndefined();
    expect(postgres.dbEndLiveStream).toHaveBeenCalledWith("room-1");
  });

  it("does not tear down a live creator when a reconnect hits a DB blip", async () => {
    // Already broadcasting: /start is a reconnect here, so a transient write
    // failure must fail the call without ending a healthy stream.
    streamHash[STREAM_HASH_KEY] = {
      userId: "creator-1",
      startedAt: new Date(Date.now() - 60_000).toISOString(),
      displayName: "Creator One",
    };
    postgres.dbInsertLiveStream.mockRejectedValue(new Error("neon unavailable"));
    const { res, sent } = fakeRes();

    await handleLiveStart(startRequest(), res);

    expect(sent.status).toBe(500);
    expect(streamHash[STREAM_HASH_KEY]?.userId).toBe("creator-1");
    expect(postgres.dbEndLiveStream).not.toHaveBeenCalled();
  });

  it("announces nothing and registers nothing when the publish token fails", async () => {
    livekit.createLiveToken.mockRejectedValue(new Error("livekit key rejected"));
    const { res, sent } = fakeRes();

    await handleLiveStart(startRequest(), res);

    expect(sent.status).toBe(500);
    expect(valkey.valkeyHset).not.toHaveBeenCalled();
    expect(postgres.dbInsertLiveStream).not.toHaveBeenCalled();
    expect(feed.broadcastToFeedSubscribers).not.toHaveBeenCalled();
    expect(notifications.insertNotification).not.toHaveBeenCalled();
  });

  it("rejects a room another creator already holds", async () => {
    streamHash[STREAM_HASH_KEY] = {
      userId: "other-creator",
      startedAt: new Date().toISOString(),
      displayName: "Someone Else",
    };
    const { res, sent } = fakeRes();

    await handleLiveStart(startRequest(), res);

    expect(sent.status).toBe(409);
    expect(postgres.dbInsertLiveStream).not.toHaveBeenCalled();
    expect(livekit.createLiveToken).not.toHaveBeenCalled();
  });
});
