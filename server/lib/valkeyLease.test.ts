/**
 * Distributed lease ownership, from two instances' point of view.
 *
 * The background money jobs — earning maturation, the creator rewards period,
 * ledger reconciliation, the job consumer — must run in exactly one process at a
 * time, and must move to another process when that one dies. That is only true
 * if the lease can say three different things apart: "you have it", "you lost
 * it", and "I cannot answer". This exercises the failure the pair was written
 * for: instance A stalls past its TTL, B takes the work over, and A must not be
 * able to renew or delete what it no longer owns.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const redisMock = vi.hoisted(() => {
  const store = new Map<string, { value: string; expiresAt: number }>();
  const clock = { now: 1_000_000 };

  function live(key: string): { value: string; expiresAt: number } | undefined {
    const entry = store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= clock.now) {
      store.delete(key);
      return undefined;
    }
    return entry;
  }

  class FakeRedis {
    on() {
      return this;
    }
    async set(key: string, value: string, _px: string, ttlMs: string | number, nx?: string) {
      const existing = live(key);
      if (nx === "NX" && existing) return null;
      store.set(key, { value, expiresAt: clock.now + Number(ttlMs) });
      return "OK";
    }
    async eval(script: string, _numKeys: number, key: string, token: string, ttlMs?: string) {
      const existing = live(key);
      if (!existing || existing.value !== token) return 0;
      if (script.includes("pexpire")) {
        store.set(key, { value: existing.value, expiresAt: clock.now + Number(ttlMs) });
        return 1;
      }
      store.delete(key);
      return 1;
    }
  }

  return { FakeRedis, store, clock };
});

vi.mock("ioredis", () => ({ default: redisMock.FakeRedis }));
vi.mock("./logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

let valkeyTrySetNx: typeof import("./valkey")["valkeyTrySetNx"];
let valkeyRenewLock: typeof import("./valkey")["valkeyRenewLock"];
let valkeyReleaseLock: typeof import("./valkey")["valkeyReleaseLock"];

const KEY = "elix:jobs:leader";
const TTL_MS = 45_000;
const A = "instance-a-token";
const B = "instance-b-token";

beforeAll(async () => {
  process.env.VALKEY_URL = "redis://localhost:6379";
  ({ valkeyTrySetNx, valkeyRenewLock, valkeyReleaseLock } = await import("./valkey"));
});

beforeEach(() => {
  redisMock.store.clear();
  redisMock.clock.now = 1_000_000;
});

describe("the background job lease", () => {
  it("is held by one instance at a time", async () => {
    expect(await valkeyTrySetNx(KEY, A, TTL_MS)).toBe("set");
    expect(await valkeyTrySetNx(KEY, B, TTL_MS)).toBe("exists");
  });

  it("stays with the holder as long as it keeps renewing", async () => {
    await valkeyTrySetNx(KEY, A, TTL_MS);

    for (let i = 0; i < 5; i++) {
      redisMock.clock.now += 15_000;
      expect(await valkeyRenewLock(KEY, A, TTL_MS)).toBe("renewed");
      expect(await valkeyTrySetNx(KEY, B, TTL_MS)).toBe("exists");
    }
  });

  it("moves to another instance after the holder stops renewing", async () => {
    await valkeyTrySetNx(KEY, A, TTL_MS);

    // A is gone: killed mid-deploy, or the container was cut off.
    redisMock.clock.now += TTL_MS + 1;

    expect(await valkeyTrySetNx(KEY, B, TTL_MS)).toBe("set");
  });

  it("tells the stalled holder it lost the lease instead of letting it renew", async () => {
    await valkeyTrySetNx(KEY, A, TTL_MS);
    redisMock.clock.now += TTL_MS + 1;
    await valkeyTrySetNx(KEY, B, TTL_MS);

    // A wakes up from a long GC pause or a blocked event loop and tries to
    // continue. If this renewed, both processes would be maturing earnings and
    // consuming the queue while each believed it was alone.
    expect(await valkeyRenewLock(KEY, A, TTL_MS)).toBe("lost");
    expect(redisMock.store.get(KEY)?.value).toBe(B);
  });

  it("cannot be released by an instance that no longer owns it", async () => {
    await valkeyTrySetNx(KEY, A, TTL_MS);
    redisMock.clock.now += TTL_MS + 1;
    await valkeyTrySetNx(KEY, B, TTL_MS);

    await valkeyReleaseLock(KEY, A);

    // A shutting down late must not strip B of the work it is already doing.
    expect(redisMock.store.get(KEY)?.value).toBe(B);
  });

  it("is free again immediately when the owner hands it back", async () => {
    await valkeyTrySetNx(KEY, A, TTL_MS);

    await valkeyReleaseLock(KEY, A);

    // A clean shutdown should not leave the jobs unowned for a whole TTL.
    expect(await valkeyTrySetNx(KEY, B, TTL_MS)).toBe("set");
  });

  it("reports unavailable rather than guessing when Valkey cannot answer", async () => {
    await valkeyTrySetNx(KEY, A, TTL_MS);
    const failing = vi
      .spyOn(redisMock.FakeRedis.prototype, "eval")
      .mockRejectedValue(new Error("connection reset"));

    // The caller must not read this as "lost": stopping the jobs on an
    // unreadable lease leaves nobody maturing earnings during a Valkey blip.
    expect(await valkeyRenewLock(KEY, A, TTL_MS)).toBe("unavailable");

    failing.mockRestore();
  });
});
