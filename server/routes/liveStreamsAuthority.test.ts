import { beforeEach, describe, expect, it, vi } from "vitest";

const livekit = {
  isLiveKitConfigured: vi.fn(() => true),
  listActiveRoomsFromLiveKit: vi.fn(async () => [] as Array<{ name: string; numParticipants: number }>),
  getRoomOccupancy: vi.fn(async () => "empty" as "occupied" | "empty" | "unknown"),
  roomHasActivePublisher: vi.fn(async () => false),
  isUserPublishingInRoom: vi.fn(async () => false),
  createLiveToken: vi.fn(async () => "token"),
  getLiveKitUrl: vi.fn(() => "wss://example.livekit.cloud"),
};

const postgres = {
  dbGetLiveStreams: vi.fn(async () => [] as Array<{
    stream_key: string;
    user_id: string;
    display_name: string | null;
    started_at: string;
    viewer_count: number;
  }>),
  dbEndLiveStream: vi.fn(async () => {}),
  dbInsertLiveStream: vi.fn(async () => {}),
  dbGetStreamOwnerUserId: vi.fn(async () => null),
};

const feed = { broadcastToFeedSubscribers: vi.fn() };

vi.mock("../services/livekit", () => livekit);
vi.mock("../lib/postgres", () => postgres);
vi.mock("../feedBroadcast", () => feed);
vi.mock("../routes/auth", () => ({
  getTokenFromRequest: vi.fn(() => null),
  verifyAuthToken: vi.fn(() => null),
}));
vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../lib/valkey", () => ({
  isValkeyConfigured: vi.fn(() => true),
  valkeyHset: vi.fn(async () => {}),
  valkeyHget: vi.fn(async () => null),
  valkeyHdel: vi.fn(async () => {}),
  valkeyHgetall: vi.fn(async () => ({})),
  valkeyHgetallBatch: vi.fn(async (keys: string[]) => keys.map(() => ({}))),
  valkeyExpire: vi.fn(async () => {}),
  valkeyGet: vi.fn(async () => null),
  valkeySet: vi.fn(async () => {}),
  valkeyDel: vi.fn(async () => {}),
  acquireCacheBuildLock: vi.fn(async () => true),
  waitForCachePopulate: vi.fn(async () => null),
}));
vi.mock("../lib/cacheLayerMetrics", () => ({ bumpCacheLayer: vi.fn() }));
vi.mock("../websocket/index", () => ({
  hasBattlePublishGrant: vi.fn(async () => false),
  hasCohostPublishGrant: vi.fn(async () => false),
  getCohostLayout: vi.fn(async () => null),
}));
vi.mock("../lib/notifications", () => ({
  insertNotification: vi.fn(async () => {}),
  deleteLiveStartedNotificationsForRoom: vi.fn(async () => {}),
}));
vi.mock("./profiles", () => ({ getFollowerIdsAsync: vi.fn(async () => []) }));

const { listActiveLiveStreams } = await import("./livestream");

const HOURS_AGO = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();

function liveRow(overrides: Partial<{ stream_key: string; started_at: string }> = {}) {
  return {
    stream_key: "stale-room",
    user_id: "creator-1",
    display_name: "Stale Creator",
    started_at: HOURS_AGO,
    viewer_count: 3,
    ...overrides,
  };
}

describe("live streams authority", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    livekit.isLiveKitConfigured.mockReturnValue(true);
    livekit.listActiveRoomsFromLiveKit.mockResolvedValue([]);
    livekit.getRoomOccupancy.mockResolvedValue("empty");
    postgres.dbGetLiveStreams.mockResolvedValue([]);
  });

  it("ends a stale is_live row whose LiveKit room is gone", async () => {
    postgres.dbGetLiveStreams.mockResolvedValue([liveRow()]);

    const result = await listActiveLiveStreams();

    expect(result.streams).toEqual([]);
    expect(postgres.dbEndLiveStream).toHaveBeenCalledWith("stale-room");
    expect(feed.broadcastToFeedSubscribers).toHaveBeenCalledWith("stream_ended", {
      stream_key: "stale-room",
    });
  });

  it("keeps a just-started stream that has not finished connecting to LiveKit", async () => {
    postgres.dbGetLiveStreams.mockResolvedValue([
      liveRow({ stream_key: "starting-room", started_at: new Date().toISOString() }),
    ]);

    await listActiveLiveStreams();

    expect(postgres.dbEndLiveStream).not.toHaveBeenCalled();
    expect(feed.broadcastToFeedSubscribers).not.toHaveBeenCalled();
  });

  it("never ends a stream when LiveKit cannot confirm the room is empty", async () => {
    postgres.dbGetLiveStreams.mockResolvedValue([liveRow()]);
    livekit.getRoomOccupancy.mockResolvedValue("unknown");

    await listActiveLiveStreams();

    expect(postgres.dbEndLiveStream).not.toHaveBeenCalled();
  });

  it("does not end a stream whose room still has participants", async () => {
    postgres.dbGetLiveStreams.mockResolvedValue([liveRow()]);
    livekit.getRoomOccupancy.mockResolvedValue("occupied");

    await listActiveLiveStreams();

    expect(postgres.dbEndLiveStream).not.toHaveBeenCalled();
  });

  it("fails instead of reporting unverified DB rows as live when LiveKit listing fails", async () => {
    postgres.dbGetLiveStreams.mockResolvedValue([liveRow()]);
    livekit.listActiveRoomsFromLiveKit.mockRejectedValue(new Error("connection minutes limit exceeded"));

    await expect(listActiveLiveStreams()).rejects.toThrow("LIVE_STATE_UNAVAILABLE");
    expect(postgres.dbEndLiveStream).not.toHaveBeenCalled();
  });

  it("lists a real live room and leaves its row alone", async () => {
    postgres.dbGetLiveStreams.mockResolvedValue([
      liveRow({ stream_key: "real-room" }),
    ]);
    livekit.listActiveRoomsFromLiveKit.mockResolvedValue([{ name: "real-room", numParticipants: 2 }]);

    const result = await listActiveLiveStreams();

    expect(result.streams).toEqual([
      { stream_key: "real-room", user_id: "creator-1", display_name: "Stale Creator" },
    ]);
    expect(postgres.dbEndLiveStream).not.toHaveBeenCalled();
  });
});
