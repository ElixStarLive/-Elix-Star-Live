/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it } from "vitest";
import { websocket } from "./websocket";

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

  constructor(_url: string) {
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
});

