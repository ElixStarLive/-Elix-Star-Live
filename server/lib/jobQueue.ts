/**
 * Valkey-backed job queue for async work (multi-instance safe).
 * In production, Valkey is required — no in-process memory fallback
 * (that would silently diverge across workers).
 * Non-production may use in-process memory when Valkey is off.
 */
import { getValkey, isValkeyConfigured } from "./valkey";
import { logger } from "./logger";

const QUEUE_KEY = "elix:jobs";
const DLQ_KEY = "elix:jobs:dlq";
const allowMemoryFallback = process.env.NODE_ENV !== "production";

export type JobPayload =
  | { type: "cleanup_retention" }
  | { type: "push_notify"; userId: string; title: string; body: string; data?: Record<string, string> }
  | { type: "email_send"; to: string; subject: string; html: string }
  | {
      type: "google_play_consume";
      productId: string;
      purchaseToken: string;
      externalPurchaseId: string;
    };

type QueuedJob = JobPayload & { enqueuedAt: number };

const memoryQueue: QueuedJob[] = [];
const memoryDlq: Array<QueuedJob & { error: string; failedAt: number }> = [];

async function pushDlq(job: QueuedJob, err: unknown): Promise<void> {
  const errorMsg = err instanceof Error ? err.message : String(err);
  const entry = { ...job, error: errorMsg, failedAt: Date.now() };
  logger.error({ job: job.type, err: errorMsg }, "job handler failed — pushed to DLQ");
  if (isValkeyConfigured()) {
    const v = getValkey();
    if (v) {
      try {
        await v.lpush(DLQ_KEY, JSON.stringify(entry));
        return;
      } catch (e) {
        logger.error({ err: e }, "DLQ Valkey push failed");
        if (!allowMemoryFallback) return;
      }
    }
  }
  if (allowMemoryFallback) memoryDlq.push(entry);
}

/** Returns false if enqueue fails. Production requires Valkey. */
export async function enqueueJob(job: JobPayload): Promise<boolean> {
  const payload: QueuedJob = { ...job, enqueuedAt: Date.now() };

  if (isValkeyConfigured()) {
    const v = getValkey();
    if (v) {
      try {
        await v.lpush(QUEUE_KEY, JSON.stringify(payload));
        return true;
      } catch (e) {
        logger.error({ err: e }, "enqueueJob Valkey failed");
        if (!allowMemoryFallback) return false;
      }
    } else if (!allowMemoryFallback) {
      logger.error({ type: job.type }, "enqueueJob: Valkey configured but client missing");
      return false;
    }
  } else if (!allowMemoryFallback) {
    logger.error({ type: job.type }, "enqueueJob: Valkey required in production");
    return false;
  }

  try {
    memoryQueue.push(payload);
    return true;
  } catch (e) {
    logger.error({ err: e, type: job.type }, "enqueueJob failed");
    return false;
  }
}

type JobHandler = (job: JobPayload) => Promise<void>;

let workerTimer: ReturnType<typeof setInterval> | null = null;

async function takeNextJob(): Promise<QueuedJob | null> {
  if (isValkeyConfigured()) {
    const v = getValkey();
    if (v) {
      try {
        const raw = await v.brpop(QUEUE_KEY, 1);
        if (raw && raw.length >= 2) {
          return JSON.parse(raw[1]) as QueuedJob;
        }
      } catch (e) {
        logger.error({ err: e }, "job worker Valkey brpop failed — draining memory queue");
      }
    }
  }
  if (memoryQueue.length > 0) {
    return memoryQueue.shift() ?? null;
  }
  return null;
}

export function startJobWorker(handler: JobHandler, intervalMs = 2000): void {
  if (workerTimer) return;

  if (!isValkeyConfigured()) {
    logger.warn("Job worker starting with in-process memory queue (Valkey not configured)");
  }

  const tick = async () => {
    const item = await takeNextJob();
    if (!item) return;
    const { enqueuedAt: _enqueuedAt, ...job } = item;
    try {
      await handler(job as JobPayload);
    } catch (e) {
      await pushDlq(item, e);
    }
  };

  workerTimer = setInterval(() => {
    void tick();
  }, intervalMs);
  if (typeof workerTimer.unref === "function") workerTimer.unref();
  logger.info({ intervalMs, valkey: isValkeyConfigured() }, "Background job worker started");
}

export function stopJobWorker(): void {
  if (workerTimer) {
    clearInterval(workerTimer);
    workerTimer = null;
  }
}

/** Test/introspection helpers */
export function _memoryQueueLengthForTests(): number {
  return memoryQueue.length;
}

export function _memoryDlqLengthForTests(): number {
  return memoryDlq.length;
}

export function _clearMemoryQueuesForTests(): void {
  memoryQueue.length = 0;
  memoryDlq.length = 0;
}
