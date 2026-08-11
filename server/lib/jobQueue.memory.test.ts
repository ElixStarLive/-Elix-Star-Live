import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

describe("jobQueue memory fallback + DLQ", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.VALKEY_URL;
    delete process.env.REDIS_URL;
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("enqueues to memory when Valkey is unavailable", async () => {
    const jq = await import("./jobQueue");
    jq.stopJobWorker();
    jq._clearMemoryQueuesForTests();
    const ok = await jq.enqueueJob({ type: "cleanup_retention" });
    expect(ok).toBe(true);
    expect(jq._memoryQueueLengthForTests()).toBeGreaterThanOrEqual(1);
    jq.stopJobWorker();
    jq._clearMemoryQueuesForTests();
  });

  it("pushes failed jobs to memory DLQ", async () => {
    const jq = await import("./jobQueue");
    jq.stopJobWorker();
    jq._clearMemoryQueuesForTests();
    await jq.enqueueJob({ type: "cleanup_retention" });
    jq.startJobWorker(async () => {
      throw new Error("forced failure");
    }, 40);
    await new Promise((r) => setTimeout(r, 250));
    jq.stopJobWorker();
    expect(jq._memoryDlqLengthForTests()).toBeGreaterThanOrEqual(1);
    jq._clearMemoryQueuesForTests();
  });
});
