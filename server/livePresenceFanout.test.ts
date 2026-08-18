/**
 * Live presence fan-out.
 *
 * Presence is a global server event stream: `stream_started` / `stream_ended` are
 * the same fact for every authenticated connection, whether it is sitting on For
 * You or is itself inside a live room. These tests hold that contract, plus the
 * two properties an open surface depends on — one delivery per socket, and a
 * payload that names the creator rather than only the room.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { WebSocket } from "ws";

/** Whatever the Valkey subscriber handed to `initFeedPubSub`. */
let crossInstance: ((payload: unknown) => void) | null = null;
const published: Array<{ channel: string; payload: unknown }> = [];

vi.mock("./lib/valkey", () => ({
  isValkeyConfigured: () => true,
  valkeyPublish: (channel: string, payload: unknown) => {
    published.push({ channel, payload });
  },
  valkeySubscribe: (channel: string, handler: (payload: unknown) => void) => {
    if (channel === "feed:global") crossInstance = handler;
  },
}));

const {
  addFeedSubscriber,
  broadcastStreamEnded,
  broadcastToFeedSubscribers,
  initFeedPubSub,
  removeFeedSubscriber,
} = await import("./feedBroadcast");

type FakeSocket = { readyState: number; sent: string[]; send: (m: string) => void };

function socket(open = true): FakeSocket {
  const sent: string[] = [];
  return {
    readyState: open ? WebSocket.OPEN : WebSocket.CLOSED,
    sent,
    send(message: string) {
      sent.push(message);
    },
  };
}

/** Presence events a socket was actually delivered, without the send timestamp. */
function eventsOf(ws: FakeSocket): Array<{ event: string; data: Record<string, unknown> }> {
  return ws.sent.map((raw) => {
    const { event, data } = JSON.parse(raw) as {
      event: string;
      data: Record<string, unknown>;
    };
    return { event, data };
  });
}

describe("live presence fan-out", () => {
  let feedConnection: FakeSocket;
  let liveRoomConnection: FakeSocket;

  beforeEach(() => {
    published.length = 0;
    crossInstance = null;
    feedConnection = socket();
    liveRoomConnection = socket();
  });

  function subscribeBoth() {
    // The server registers presence for every authenticated connection, so both a
    // feed socket and a socket that owns a live room are in the same set.
    addFeedSubscriber(feedConnection as unknown as WebSocket);
    addFeedSubscriber(liveRoomConnection as unknown as WebSocket);
    return () => {
      removeFeedSubscriber(feedConnection as unknown as WebSocket);
      removeFeedSubscriber(liveRoomConnection as unknown as WebSocket);
    };
  }

  it("delivers to a connection that owns a live room, not only to the feed", () => {
    const done = subscribeBoth();
    try {
      broadcastStreamEnded("creator-a-room", "creator-a");

      expect(eventsOf(feedConnection)).toEqual([
        {
          event: "stream_ended",
          data: { stream_key: "creator-a-room", host_user_id: "creator-a" },
        },
      ]);
      // The live screen's own connection is what makes its share panel rings and
      // LIVE Popular rows correct without reopening them.
      expect(eventsOf(liveRoomConnection)).toEqual(eventsOf(feedConnection));
    } finally {
      done();
    }
  });

  it("names the creator on every end, so a room name cannot light up another user", () => {
    const done = subscribeBoth();
    try {
      // A stream key is a room name — `POST /api/live/start` accepts one — so it is
      // not an identity. Both are carried, separately.
      broadcastStreamEnded("shared-looking-room-name", "creator-b");
      const [ended] = eventsOf(liveRoomConnection);
      expect(ended.data.host_user_id).toBe("creator-b");
      expect(ended.data.stream_key).toBe("shared-looking-room-name");
    } finally {
      done();
    }
  });

  it("delivers once per socket, however many times it was registered", () => {
    const done = subscribeBoth();
    try {
      // A reconnect or a second registration pass must not double-deliver: two
      // copies of an end would be harmless, but two copies of a start followed by
      // one end must not leave a surface believing a creator is still live.
      addFeedSubscriber(liveRoomConnection as unknown as WebSocket);
      broadcastToFeedSubscribers("stream_started", { user_id: "creator-c" });

      expect(eventsOf(liveRoomConnection)).toHaveLength(1);
    } finally {
      done();
    }
  });

  it("stops delivering to a closed connection", () => {
    const done = subscribeBoth();
    try {
      removeFeedSubscriber(liveRoomConnection as unknown as WebSocket);
      broadcastStreamEnded("creator-a-room", "creator-a");

      expect(eventsOf(liveRoomConnection)).toEqual([]);
      expect(eventsOf(feedConnection)).toHaveLength(1);
    } finally {
      done();
    }
  });

  it("skips a socket that is no longer open instead of throwing", () => {
    const closing = socket(false);
    addFeedSubscriber(closing as unknown as WebSocket);
    addFeedSubscriber(feedConnection as unknown as WebSocket);
    try {
      broadcastStreamEnded("creator-a-room", "creator-a");
      expect(closing.sent).toEqual([]);
      expect(eventsOf(feedConnection)).toHaveLength(1);
    } finally {
      removeFeedSubscriber(closing as unknown as WebSocket);
      removeFeedSubscriber(feedConnection as unknown as WebSocket);
    }
  });

  it("publishes to Valkey so other instances reach their own connections", () => {
    const done = subscribeBoth();
    try {
      broadcastStreamEnded("creator-a-room", "creator-a");
      expect(published).toEqual([
        {
          channel: "feed:global",
          payload: expect.objectContaining({
            event: "stream_ended",
            data: { stream_key: "creator-a-room", host_user_id: "creator-a" },
          }),
        },
      ]);
    } finally {
      done();
    }
  });

  it("a live-room connection receives presence raised on another instance", () => {
    initFeedPubSub();
    expect(crossInstance).toBeTypeOf("function");
    const done = subscribeBoth();
    try {
      crossInstance?.({
        event: "stream_ended",
        data: { stream_key: "creator-d-room", host_user_id: "creator-d" },
        sourceInstance: "some-other-worker",
      });

      expect(eventsOf(liveRoomConnection)).toEqual([
        {
          event: "stream_ended",
          data: { stream_key: "creator-d-room", host_user_id: "creator-d" },
        },
      ]);
    } finally {
      done();
    }
  });

  it("ignores its own published event coming back, so nothing is delivered twice", () => {
    initFeedPubSub();
    const done = subscribeBoth();
    try {
      broadcastStreamEnded("creator-a-room", "creator-a");
      const echoed = published[0].payload as Record<string, unknown>;
      crossInstance?.(echoed);

      expect(eventsOf(liveRoomConnection)).toHaveLength(1);
    } finally {
      done();
    }
  });
});

describe("presence subscription is not tied to room ownership", () => {
  const source = readFileSync(
    resolve(__dirname, "./websocket/index.ts"),
    "utf8",
  );

  it("registers presence for a live-room connection as well as a feed connection", () => {
    // Two registrations: the `__feed__` branch, and the room branch right after the
    // client is created. Presence used to be registered only in the first, which is
    // why every live indicator rendered on top of a live screen went stale.
    const feedBranch = source.indexOf('if (roomId === "__feed__" || roomId === "feed")');
    const roomRegistration = source.indexOf(
      "addFeedSubscriber(ws);",
      source.indexOf("audienceCreatorId: hostUserId || userId,"),
    );
    expect(feedBranch).toBeGreaterThan(-1);
    expect(roomRegistration).toBeGreaterThan(feedBranch);
  });

  it("removes presence for every connection on close, not just feed sockets", () => {
    const close = source.slice(source.indexOf('ws.on("close"'));
    const removal = close.indexOf("removeFeedSubscriber(ws);");
    const feedOnlyBranch = close.indexOf('if (client.roomId === "__feed__")');
    expect(removal).toBeGreaterThan(-1);
    // Before the feed-only early return, so a live-room socket is deregistered too.
    expect(removal).toBeLessThan(feedOnlyBranch);
  });

  it("keeps room-scoped events on the room", () => {
    // Widening presence must not turn room traffic into global traffic: chat,
    // gifts, co-host and battle all still address the room.
    expect(source).toContain('broadcastToRoom(roomId, "stream_ended"');
    expect(source).not.toContain('broadcastToFeedSubscribers("chat_message"');
    expect(source).not.toContain('broadcastToFeedSubscribers("gift_sent"');
    expect(source).not.toContain('broadcastToFeedSubscribers("cohost_layout_sync"');
    expect(source).not.toContain('broadcastToFeedSubscribers("battle_');
  });
});
