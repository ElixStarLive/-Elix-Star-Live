/**
 * Valkey-backed job queue for async work (multi-instance safe).
 */
import { getValkey, isValkeyConfigured } from "./valkey";
import { logger } from "./logger";

const QUEUE_KEY = "elix:jobs";

export type JobPayload =
  | { type: "cleanup_retention" }
  | { type: "push_notify"; userId: string; title: string; body: string; data?: Record<string, string> }
  | { type: "email_send"; to: string; subject: string; html: string };

export async function enqueueJob(job: JobPayload): Promise<boolean> {
  if (!isValkeyConfigured()) return false;
  const v = getValkey();
  if (!v) return false;
  try {
    await v.lpush(QUEUE_KEY, JSON.stringify({ ...job, enqueuedAt: Date.now() }));
    return true;
  } catch (e) {
    logger.error({ err: e }, "enqueueJob failed");
    return false;
  }
}

export type JobHandler = (job: JobPayload) => Promise<void>;

let workerTimer: ReturnType<typeof setInterval> | null = null;

export function startJobWorker(handler: JobHandler, intervalMs = 2000): void {
  if (!isValkeyConfigured()) {
    logger.warn("Job worker not started — Valkey not configured");
    return;
  }
  if (workerTimer) return;

  const tick = async () => {
    const v = getValkey();
    if (!v) return;
    try {
      const raw = await v.brpop(QUEUE_KEY, 1);
      if (!raw || raw.length < 2) return;
      const item = JSON.parse(raw[1]) as JobPayload;
      await handler(item);
    } catch (e) {
      logger.error({ err: e }, "job worker tick failed");
    }
  };

  workerTimer = setInterval(() => {
    void tick();
  }, intervalMs);
  if (typeof workerTimer.unref === "function") workerTimer.unref();
  logger.info({ intervalMs }, "Background job worker started");
}

export function stopJobWorker(): void {
  if (workerTimer) {
    clearInterval(workerTimer);
    workerTimer = null;
  }
}
