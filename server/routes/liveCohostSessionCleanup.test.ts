import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A live room is named after its creator, so every live that creator starts
 * reuses the same room id — and co-host state (seats, pending invites, the
 * request queue, publish grants) is keyed by that id with a six hour TTL.
 *
 * That makes session ownership the thing to prove: the stage must die with the
 * live that built it, and a new live must never inherit the previous one's
 * seats or a pending invite that could still be accepted into it.
 *
 * Both ends are pinned here:
 *
 * - Removing the stream registration cleans the stage. Every end path funnels
 *   through removeActiveStream (creator ends, WS stream_end, host disconnect
 *   grace, LiveKit room_finished), so one cleanup covers them all.
 * - Going live fresh cleans first, which covers the ends that never ran at all
 *   (crashed worker, missed webhook) — TTL alone would leave an old invite
 *   acceptable inside the new live.
 * - A reconnect is the same live continuing, so it must not touch the stage.
 */

const deleteCohostLayout = vi.fn(async () => {});
const activeStreams = new Map<string, { userId: string; startedAt: string }>();

vi.mock("../websocket/index", () => ({
  hasBattlePublishGrant: vi.fn(async () => false),
  hasCohostPublishGrant: vi.fn(async () => false),
  getCohostLayout: vi.fn(async () => null),
  deleteCohostLayout,
}));

vi.mock("../lib/valkey", () => ({
  isValkeyConfigured: vi.fn(() => true),
  valkeyHset: vi.fn(async () => {}),
  valkeyHget: vi.fn(async (key: string, field: string) => {
    const room = key.replace("stream:", "");
    const row = activeStreams.get(room);
    if (!row) return null;
    return field === "userId" ? row.userId : row.startedAt;
  }),
  valkeyHgetall: vi.fn(async (key: string) => {
    const row = activeStreams.get(key.replace("stream:", ""));
    return row ? { userId: row.userId, startedAt: row.startedAt } : {};
  }),
  valkeyHgetallBatch: vi.fn(async () => []),
  valkeyHdel: vi.fn(async (key: string) => {
    activeStreams.delete(key.replace("stream:", ""));
  }),
  valkeyExpire: vi.fn(async () => {}),
  valkeyDel: vi.fn(async () => {}),
  valkeyGet: vi.fn(async () => null),
  valkeySet: vi.fn(async () => {}),
  valkeyTryGet: vi.fn(async () => ({ status: "ok" as const, value: null })),
  valkeyTrySet: vi.fn(async () => "ok" as const),
  acquireCacheBuildLock: vi.fn(async () => true),
  waitForCachePopulate: vi.fn(async () => null),
}));

vi.mock("../lib/postgres", () => ({
  dbGetLiveStreams: vi.fn(async () => []),
  dbInsertLiveStream: vi.fn(async () => {}),
  dbEndLiveStream: vi.fn(async () => {}),
  dbGetStreamOwnerUserId: vi.fn(async () => null),
  getPool: vi.fn(() => null),
}));

vi.mock("../services/livekit", () => ({
  createLiveToken: vi.fn(async () => `signed.${"x".repeat(80)}.jwt`),
  getLiveKitUrl: vi.fn(() => "wss://livekit.test"),
  isLiveKitConfigured: vi.fn(() => true),
  listActiveRoomsFromLiveKit: vi.fn(async () => []),
  isUserPublishingInRoom: vi.fn(async () => false),
  roomHasActivePublisher: vi.fn(async () => false),
  getRoomOccupancy: vi.fn(async () => ({ participants: 0, publishers: 0 })),
}));

vi.mock("../feedBroadcast", () => ({ broadcastToFeedSubscribers: vi.fn() }));
vi.mock("../lib/notifications", () => ({
  insertNotification: vi.fn(async () => {}),
  deleteLiveStartedNotificationsForRoom: vi.fn(async () => {}),
}));
vi.mock("./profiles", () => ({ getFollowerIdsAsync: vi.fn(async () => []) }));
vi.mock("../websocket/liveCreatorRole", () => ({
  getCreatorLiveRoleRoom: vi.fn(async () => null),
}));
vi.mock("./auth", () => ({
  verifyAuthToken: vi.fn(() => ({ sub: "creator-1" })),
  getTokenFromRequest: vi.fn(() => "token"),
  checkSessionState: vi.fn(async () => ({ valid: true })),
}));
vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../lib/cacheLayerMetrics", () => ({ bumpCacheLayer: vi.fn() }));

const livestream = await import("./livestream");

function res() {
  const out = { status: 0, body: null as unknown };
  return {
    setHeader: vi.fn(),
    status(code: number) {
      out.status = code;
      return this;
    },
    json(body: unknown) {
      out.body = body;
      return this;
    },
    out,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  activeStreams.clear();
});

describe("co-host state lifecycle across a live session", () => {
  it("cleans the stage when the stream registration is removed", async () => {
    activeStreams.set("creator-1", { userId: "creator-1", startedAt: "now" });

    const removed = await livestream.removeActiveStream("creator-1", "creator-1");

    expect(removed).toBe(true);
    expect(deleteCohostLayout).toHaveBeenCalledWith("creator-1");
  });

  it("does not clean another host's stage when ownership does not match", async () => {
    activeStreams.set("creator-1", { userId: "creator-1", startedAt: "now" });

    const removed = await livestream.removeActiveStream("creator-1", "someone-else");

    expect(removed).toBe(false);
    expect(deleteCohostLayout).not.toHaveBeenCalled();
  });

  it("cleans the stage when the creator ends the live over REST", async () => {
    activeStreams.set("creator-1", { userId: "creator-1", startedAt: "now" });
    const response = res();

    await livestream.handleLiveEnd(
      { body: { room: "creator-1" } } as never,
      response as never,
    );

    expect(response.out.status).toBe(200);
    expect(deleteCohostLayout).toHaveBeenCalledWith("creator-1");
  });

  it("clears leftover co-host state before a new live starts", async () => {
    const response = res();

    await livestream.handleLiveStart(
      { body: { room: "creator-1", displayName: "Creator" } } as never,
      response as never,
    );

    expect(response.out.status).toBe(200);
    expect(deleteCohostLayout).toHaveBeenCalledWith("creator-1");
  });

  it("leaves the stage alone when the same live reconnects", async () => {
    activeStreams.set("creator-1", { userId: "creator-1", startedAt: "earlier" });
    const response = res();

    await livestream.handleLiveStart(
      { body: { room: "creator-1", displayName: "Creator" } } as never,
      response as never,
    );

    expect(response.out.status).toBe(200);
    // Seats and grants of the live currently on air must survive a reconnect.
    expect(deleteCohostLayout).not.toHaveBeenCalled();
  });
});
