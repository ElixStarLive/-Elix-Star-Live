/**
 * Batched presence reads must be able to say "I do not know".
 *
 * The live room's member set is authoritative, and its only reader prunes the
 * members this helper reports as absent. An unanswered read that came back as an
 * array of falses was indistinguishable from "everyone has left", so a Valkey
 * blip deleted the membership of every room it touched — including the host the
 * disconnect grace period looks for before it ends a live.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type PipelineResult = [Error | null, unknown][] | null;

const redisMock = vi.hoisted(() => {
  const state: { result: PipelineResult; throwOnExec: boolean; execCalls: number } = {
    result: [],
    throwOnExec: false,
    execCalls: 0,
  };

  class FakeRedis {
    on() {
      return this;
    }
    pipeline() {
      const queued: string[] = [];
      return {
        exists(key: string) {
          queued.push(key);
          return this;
        },
        async exec(): Promise<PipelineResult> {
          state.execCalls += 1;
          if (state.throwOnExec) throw new Error("valkey unreachable");
          return state.result;
        },
      };
    }
  }

  return { FakeRedis, state };
});

vi.mock("ioredis", () => ({ default: redisMock.FakeRedis }));
vi.mock("./logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

let valkeyExistsBatch: typeof import("./valkey")["valkeyExistsBatch"];

beforeAll(async () => {
  process.env.VALKEY_URL = "redis://localhost:6379";
  ({ valkeyExistsBatch } = await import("./valkey"));
});

beforeEach(() => {
  redisMock.state.result = [];
  redisMock.state.throwOnExec = false;
  redisMock.state.execCalls = 0;
});

describe("batched presence reads", () => {
  it("reports which keys are present", async () => {
    redisMock.state.result = [
      [null, 1],
      [null, 0],
      [null, 1],
    ];

    const read = await valkeyExistsBatch(["a", "b", "c"]);

    expect(read).toEqual({ status: "ok", present: [true, false, true] });
  });

  it("says unavailable when the read fails, never that the keys are gone", async () => {
    redisMock.state.throwOnExec = true;

    expect(await valkeyExistsBatch(["a", "b"])).toEqual({ status: "unavailable" });
  });

  it("says unavailable when the pipeline returns nothing", async () => {
    redisMock.state.result = null;

    expect(await valkeyExistsBatch(["a"])).toEqual({ status: "unavailable" });
  });

  it("says unavailable when even one key in the batch could not be read", async () => {
    // The dangerous shape: most of the room answers, one command errors. Reading
    // that error as "absent" prunes a member who never left.
    redisMock.state.result = [
      [null, 1],
      [new Error("timeout"), null],
      [null, 1],
    ];

    expect(await valkeyExistsBatch(["a", "b", "c"])).toEqual({ status: "unavailable" });
  });

  it("answers an empty batch without a round trip", async () => {
    expect(await valkeyExistsBatch([])).toEqual({ status: "ok", present: [] });
    expect(redisMock.state.execCalls).toBe(0);
  });
});
