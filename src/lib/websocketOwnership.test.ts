/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { websocket } from "./websocket";

const { auth } = vi.hoisted(() => ({
  auth: { token: "fresh-jwt" as string | null },
}));

vi.mock("../store/useAuthStore", () => ({
  useAuthStore: {
    getState: () => ({
      session: auth.token ? { access_token: auth.token } : null,
    }),
  },
}));

const constructedUrls: string[] = [];
const instances: MockWebSocket[] = [];

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  onopen: ((ev?: unknown) => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onerror: ((ev?: unknown) => void) | null = null;
  onclose: ((ev?: { code?: number }) => void) | null = null;
  sent: string[] = [];

  constructor(url: string) {
    constructedUrls.push(url);
    instances.push(this);
    queueMicrotask(() => {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.({});
    });
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code: 1000 });
  }

  /** Transport loss the client did not ask for (mobile blip), code 1006. */
  drop() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code: 1006 });
  }

  emit(event: string, data: unknown) {
    this.onmessage?.({
      data: JSON.stringify({ event, data, timestamp: new Date().toISOString() }),
    });
  }
}

const lastSocket = () => instances[instances.length - 1];

(globalThis as unknown as { WebSocket: typeof MockWebSocket }).WebSocket =
  MockWebSocket;

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe("websocket singleton owner handoff", () => {
  beforeEach(() => {
    constructedUrls.length = 0;
    instances.length = 0;
    auth.token = "fresh-jwt";
    websocket.disconnect();
  });

  it("old owner cannot disconnect newer same-room owner", async () => {
    const inlineOwner = "inline-A";
    const watchOwner = "watch-A";
    websocket.connect("123", "t1", { ownerId: inlineOwner });
    await flush();
    expect(websocket.isConnected()).toBe(true);

    websocket.connect("123", "t2", { ownerId: watchOwner });
    await flush();
    expect(websocket.isConnected()).toBe(true);

    websocket.disconnectIfOwner(inlineOwner);
    expect(websocket.isConnected()).toBe(true);

    websocket.disconnectIfOwner(watchOwner);
    expect(websocket.isConnected()).toBe(false);
  });

  it("A cleanup cannot disconnect room owned by B", async () => {
    const ownerA = "inline-A";
    const ownerB = "inline-B";
    websocket.connect("A-room", "tA", { ownerId: ownerA });
    await flush();
    expect(websocket.getCurrentRoomId()).toBe("A-room");

    websocket.connect("B-room", "tB", { ownerId: ownerB });
    await flush();
    expect(websocket.getCurrentRoomId()).toBe("B-room");
    expect(websocket.isConnected()).toBe(true);

    websocket.disconnectIfOwner(ownerA);
    expect(websocket.getCurrentRoomId()).toBe("B-room");
    expect(websocket.isConnected()).toBe(true);
  });

  it("inline to watch handoff keeps newer owner connected", async () => {
    const inlineOwner = "inline-123";
    const watchOwner = "watch-123";
    websocket.connect("123", "tA", { ownerId: inlineOwner });
    await flush();
    websocket.connect("123", "tB", { ownerId: watchOwner });
    await flush();

    websocket.disconnectIfOwner(inlineOwner);
    expect(websocket.getCurrentRoomId()).toBe("123");
    expect(websocket.isConnected()).toBe(true);
  });

  it("reconnect same stream rejects late previous cleanup owner", async () => {
    const owner1 = "inline-old";
    const owner2 = "inline-new";
    websocket.connect("same-room", "t1", { ownerId: owner1 });
    await flush();
    websocket.connect("same-room", "t2", { ownerId: owner2 });
    await flush();

    websocket.disconnectIfOwner(owner1);
    expect(websocket.isConnected()).toBe(true);
    expect(websocket.getCurrentRoomId()).toBe("same-room");

    websocket.disconnectIfOwner(owner2);
    expect(websocket.isConnected()).toBe(false);
  });

  it("room switch transfers ownership without wiping the new room owner", async () => {
    websocket.connect("room-a", "tA", { ownerId: "owner-a" });
    await flush();
    websocket.connect("room-b", "tB", { ownerId: "owner-b" });
    await flush();
    expect(websocket.getCurrentRoomId()).toBe("room-b");
    websocket.disconnectIfOwner("owner-a");
    expect(websocket.isConnected()).toBe(true);
    expect(websocket.getCurrentRoomId()).toBe("room-b");
  });

  it("the new room owner can still release the socket after a room switch", async () => {
    // The switch tears the old transport down internally. If that teardown also
    // wipes owner bookkeeping, the incoming owner loses its claim and its own
    // cleanup becomes a no-op, leaving the room connected after the user left.
    websocket.connect("room-a", "tA", { ownerId: "owner-a" });
    await flush();
    websocket.connect("room-b", "tB", { ownerId: "owner-b" });
    await flush();

    websocket.disconnectIfOwner("owner-b");

    expect(websocket.isConnected()).toBe(false);
    expect(websocket.getCurrentRoomId()).toBe(null);
  });

  it("does not keep owners from the room it just left", async () => {
    websocket.connect("room-a", "tA", { ownerId: "owner-a" });
    await flush();
    websocket.connect("room-b", "tB", { ownerId: "owner-b" });
    await flush();

    // owner-a belonged to room-a only. Releasing owner-b must end the socket even
    // though owner-a never called its own cleanup.
    websocket.disconnectIfOwner("owner-b");
    expect(websocket.isConnected()).toBe(false);
  });

  it("releases a stale claim from the room it left instead of keeping it forever", async () => {
    websocket.connect("room-a", "tA", { ownerId: "owner-a" });
    await flush();
    websocket.connect("room-b", "tB", { ownerId: "owner-b" });
    await flush();
    // Back to room-a with a new owner. If owner-a were still registered from the
    // first visit it would silently co-own this room and block owner-c's release.
    websocket.connect("room-a", "tA2", { ownerId: "owner-c" });
    await flush();

    websocket.disconnectIfOwner("owner-c");
    expect(websocket.isConnected()).toBe(false);
  });

  it("foreground reconnect uses the current token, not the one it connected with", async () => {
    vi.useFakeTimers();
    try {
      websocket.connect("room-x", "stale-jwt", { ownerId: "owner-x" });
      await flush();
      expect(constructedUrls[0]).toContain("stale-jwt");

      auth.token = "rotated-jwt";
      lastSocket().drop();

      websocket.reconnectOnForeground();
      await flush();

      expect(constructedUrls[constructedUrls.length - 1]).toContain("rotated-jwt");
      expect(constructedUrls[constructedUrls.length - 1]).not.toContain("stale-jwt");
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });
});

describe("websocket lifecycle", () => {
  beforeEach(() => {
    constructedUrls.length = 0;
    instances.length = 0;
    auth.token = "fresh-jwt";
    websocket.disconnect();
  });

  it("a role change on the same room does not replace the socket", async () => {
    websocket.connect("stream-9", "t", { ownerId: "spectator-1" });
    await flush();

    // Spectator promoted to co-host: a second owner claims the same room and asks
    // for persistent reconnect. Publish permission is a LiveKit concern, so the
    // realtime room must not be torn down and rebuilt for it.
    websocket.connect("stream-9", "t", { ownerId: "cohost-1", persistent: true });
    await flush();

    expect(instances).toHaveLength(1);
    expect(websocket.isConnected()).toBe(true);

    websocket.disconnectIfOwner("spectator-1");
    expect(websocket.isConnected()).toBe(true);
    expect(websocket.getCurrentRoomId()).toBe("stream-9");
  });

  it("does not multiply listeners across a reconnect", async () => {
    vi.useFakeTimers();
    try {
      const seen: unknown[] = [];
      const handler = (d: unknown) => seen.push(d);
      websocket.connect("room-1", "t", { ownerId: "o1" });
      await flush();
      websocket.on("chat_message", handler);

      lastSocket().drop();
      await vi.advanceTimersByTimeAsync(2000);
      await flush();
      expect(instances).toHaveLength(2);

      lastSocket().emit("chat_message", { id: 1 });
      expect(seen).toHaveLength(1);

      websocket.off("chat_message", handler);
      lastSocket().emit("chat_message", { id: 2 });
      expect(seen).toHaveLength(1);
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it("never reconnects after an intentional disconnect", async () => {
    vi.useFakeTimers();
    try {
      websocket.connect("room-1", "t", { ownerId: "o1" });
      await flush();
      websocket.disconnect();

      await vi.advanceTimersByTimeAsync(120_000);
      await flush();

      expect(instances).toHaveLength(1);
      expect(websocket.getCurrentRoomId()).toBe(null);
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it("cannot be revived by a backoff timer armed before the user left", async () => {
    vi.useFakeTimers();
    try {
      websocket.connect("room-1", "t", { ownerId: "o1" });
      await flush();
      lastSocket().drop(); // arms a backoff attempt
      websocket.disconnectIfOwner("o1"); // user leaves before it fires

      await vi.advanceTimersByTimeAsync(120_000);
      await flush();

      expect(instances).toHaveLength(1);
      expect(websocket.getCurrentRoomId()).toBe(null);
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it("foregrounding reconnects exactly once with a backoff already pending", async () => {
    vi.useFakeTimers();
    try {
      websocket.connect("room-1", "t", { ownerId: "o1" });
      await flush();
      lastSocket().drop();

      websocket.reconnectOnForeground();
      await flush();
      await vi.advanceTimersByTimeAsync(120_000);
      await flush();

      expect(instances).toHaveLength(2);
      expect(websocket.isConnected()).toBe(true);
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it("does not replay a queued message into a different room", async () => {
    vi.useFakeTimers();
    try {
      websocket.connect("room-a", "t", { ownerId: "o-a" });
      await flush();
      lastSocket().drop();

      // Queued while room-a had no transport.
      websocket.send("chat_message", { text: "belongs-to-room-a" });

      websocket.connect("room-b", "t", { ownerId: "o-b" });
      await flush();

      expect(lastSocket().sent.join("|")).not.toContain("belongs-to-room-a");
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it("still flushes a queued message after reconnecting to the same room", async () => {
    vi.useFakeTimers();
    try {
      websocket.connect("room-a", "t", { ownerId: "o-a" });
      await flush();
      lastSocket().drop();

      websocket.send("chat_message", { text: "same-room-retry" });
      await vi.advanceTimersByTimeAsync(2000);
      await flush();

      expect(lastSocket().sent.join("|")).toContain("same-room-retry");
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it("bounds the pending queue", async () => {
    websocket.connect("room-a", "t", { ownerId: "o-a" });
    // No flush: the transport is still CONNECTING, so sends queue.
    for (let i = 0; i < 80; i++) websocket.send("chat_message", { i });
    await flush();

    // Cap is 50; the rest are dropped rather than growing without bound.
    expect(lastSocket().sent.length).toBe(50);
  });

  it("keeps dispatching when one consumer throws, and does not swallow the failure", async () => {
    vi.useFakeTimers();
    const bad = () => {
      throw new Error("consumer blew up");
    };
    const seen: string[] = [];
    const good = () => seen.push("good");
    try {
      websocket.connect("room-1", "t", { ownerId: "o1" });
      await flush();
      websocket.on("chat_message", bad);
      websocket.on("chat_message", good);

      lastSocket().emit("chat_message", {});

      // The later consumer still received the event.
      expect(seen).toEqual(["good"]);
      // And the failure is rethrown out of band rather than disappearing into the
      // frame-parse catch, where it used to look like a malformed frame.
      expect(() => vi.advanceTimersByTime(1)).toThrow("consumer blew up");
    } finally {
      websocket.off("chat_message", bad);
      websocket.off("chat_message", good);
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it("ignores a malformed frame without killing the socket", async () => {
    websocket.connect("room-1", "t", { ownerId: "o1" });
    await flush();

    const seen: string[] = [];
    const handler = () => seen.push("hit");
    websocket.on("chat_message", handler);

    lastSocket().onmessage?.({ data: "{not json" });
    expect(seen).toHaveLength(0);
    expect(websocket.isConnected()).toBe(true);

    lastSocket().emit("chat_message", {});
    expect(seen).toHaveLength(1);
    websocket.off("chat_message", handler);
  });
});

