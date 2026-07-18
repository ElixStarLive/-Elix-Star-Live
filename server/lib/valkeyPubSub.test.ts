import { beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Regression + behavior tests for the channel-routed Valkey pub/sub layer.
 *
 * These prove the scalability guarantees the WS layer relies on:
 *  - one shared "message" dispatcher (not one Node listener per subscribe),
 *  - SUBSCRIBE issued once per channel (ref-counted by handler),
 *  - UNSUBSCRIBE issued only when the last handler for a channel is removed,
 *  - messages routed strictly to the handlers of the matching channel.
 */

const redisMock = vi.hoisted(() => {
  const instances: FakeRedis[] = [];

  class FakeRedis {
    handlers: Record<string, ((...args: unknown[]) => void)[]> = {};
    subscribed = new Set<string>();
    subscribe = vi.fn(async (...channels: string[]) => {
      channels.forEach((c) => this.subscribed.add(c));
      return channels.length;
    });
    unsubscribe = vi.fn(async (...channels: string[]) => {
      channels.forEach((c) => this.subscribed.delete(c));
      return 0;
    });
    publish = vi.fn(async () => 1);

    constructor() {
      instances.push(this);
    }

    on(event: string, cb: (...args: unknown[]) => void) {
      (this.handlers[event] ||= []).push(cb);
      return this;
    }

    // Simulate Valkey delivering a message on a channel.
    deliver(channel: string, message: string) {
      (this.handlers["message"] || []).forEach((cb) => cb(channel, message));
    }
  }

  return { FakeRedis, instances };
});

vi.mock("ioredis", () => ({ default: redisMock.FakeRedis }));
vi.mock("./logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

type PubSub = typeof import("./valkey");
let valkeySubscribe: PubSub["valkeySubscribe"];
let valkeyUnsubscribe: PubSub["valkeyUnsubscribe"];

function sub() {
  // First constructed FakeRedis is the subscriber connection.
  return redisMock.instances[0];
}

beforeAll(async () => {
  process.env.VALKEY_URL = "redis://localhost:6379";
  const mod = await import("./valkey");
  valkeySubscribe = mod.valkeySubscribe;
  valkeyUnsubscribe = mod.valkeyUnsubscribe;
});

describe("valkey channel-routed pub/sub", () => {
  it("subscribes once per channel and routes to the handler", () => {
    const received: unknown[] = [];
    const handler = (d: unknown) => received.push(d);

    valkeySubscribe("room:alpha", handler);

    expect(sub().subscribe).toHaveBeenCalledWith("room:alpha");
    sub().deliver("room:alpha", JSON.stringify({ event: "hi", data: { n: 1 } }));
    expect(received).toEqual([{ event: "hi", data: { n: 1 } }]);
  });

  it("binds exactly one shared message dispatcher regardless of subscribe count", () => {
    valkeySubscribe("room:one", () => {});
    valkeySubscribe("room:two", () => {});
    valkeySubscribe("room:three", () => {});
    expect((sub().handlers["message"] || []).length).toBe(1);
  });

  it("fans a single channel out to multiple handlers without re-subscribing", () => {
    const a: unknown[] = [];
    const b: unknown[] = [];
    const ha = (d: unknown) => a.push(d);
    const hb = (d: unknown) => b.push(d);

    sub().subscribe.mockClear();
    valkeySubscribe("room:beta", ha);
    valkeySubscribe("room:beta", hb);

    // Only the first handler triggers an actual SUBSCRIBE.
    expect(sub().subscribe).toHaveBeenCalledTimes(1);

    sub().deliver("room:beta", JSON.stringify({ event: "x" }));
    expect(a).toEqual([{ event: "x" }]);
    expect(b).toEqual([{ event: "x" }]);
  });

  it("unsubscribes from Valkey only when the last handler is removed", () => {
    const ha = () => {};
    const hb = () => {};
    valkeySubscribe("room:gamma", ha);
    valkeySubscribe("room:gamma", hb);

    sub().unsubscribe.mockClear();
    valkeyUnsubscribe("room:gamma", ha);
    expect(sub().unsubscribe).not.toHaveBeenCalled();

    valkeyUnsubscribe("room:gamma", hb);
    expect(sub().unsubscribe).toHaveBeenCalledWith("room:gamma");
  });

  it("does not deliver a message to handlers of other channels", () => {
    const roomA: unknown[] = [];
    const roomB: unknown[] = [];
    valkeySubscribe("room:isolA", (d) => roomA.push(d));
    valkeySubscribe("room:isolB", (d) => roomB.push(d));

    sub().deliver("room:isolA", JSON.stringify({ event: "onlyA" }));
    expect(roomA).toEqual([{ event: "onlyA" }]);
    expect(roomB).toEqual([]);
  });

  it("ignores malformed JSON without throwing or calling handlers", () => {
    const received: unknown[] = [];
    valkeySubscribe("room:bad", (d) => received.push(d));
    expect(() => sub().deliver("room:bad", "not-json{")).not.toThrow();
    expect(received).toEqual([]);
  });

  it("isolates a thrown handler from other handlers on the same channel", () => {
    const good: unknown[] = [];
    valkeySubscribe("room:throw", () => {
      throw new Error("boom");
    });
    valkeySubscribe("room:throw", (d) => good.push(d));
    expect(() => sub().deliver("room:throw", JSON.stringify({ event: "ok" }))).not.toThrow();
    expect(good).toEqual([{ event: "ok" }]);
  });
});
