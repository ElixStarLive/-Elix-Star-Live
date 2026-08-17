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

  constructor(url: string) {
    constructedUrls.push(url);
    queueMicrotask(() => {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.({});
    });
  }

  send(_data: string) {}

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code: 1000 });
  }
}

(globalThis as unknown as { WebSocket: typeof MockWebSocket }).WebSocket =
  MockWebSocket;

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe("websocket singleton owner handoff", () => {
  beforeEach(() => {
    constructedUrls.length = 0;
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

  it("foreground reconnect uses the current authenticated JWT", async () => {
    auth.token = "stale-jwt";
    websocket.connect("live-1", "stale-jwt", { ownerId: "watch-1" });
    await flush();
    auth.token = "rotated-jwt";
    const sock = (websocket as unknown as { ws: { readyState: number } }).ws;
    sock.readyState = MockWebSocket.CLOSED;
    websocket.reconnectOnForeground();
    const last = constructedUrls[constructedUrls.length - 1] || "";
    expect(last).toContain("token=rotated-jwt");
    expect(last).not.toContain("token=stale-jwt");
  });
});

