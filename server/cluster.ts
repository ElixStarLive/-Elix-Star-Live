/**
 * Cluster wrapper for production — spawns one worker per CPU core.
 *
 * Requires sticky sessions on the load balancer for WebSocket connections.
 * Hetzner LB: enable cookie-based sticky sessions on the HTTPS service.
 * Traefik (Coolify): handled automatically via Docker service routing.
 *
 * All shared state (rooms, battles, streams, profiles, videos) is in
 * Valkey + PostgreSQL, NOT in worker memory.
 *
 * This process owns migrations. Workers refuse to boot against a schema that is
 * missing a migration (`assertMigrationsApplied`), so if nothing applied them the
 * whole container crash-loops — which is what it did whenever a deploy shipped a
 * migration and no separate release step had been run. The primary applies them
 * here, once, before the first fork, so the deploy carries its own schema instead
 * of depending on an external step someone has to remember.
 *
 * Usage: npx tsx server/cluster.ts
 * Falls back to single-process mode if WEB_CONCURRENCY=1.
 */

import "./config";
import cluster from "node:cluster";
import os from "node:os";
import { logger } from "./lib/logger";
import { applyPendingMigrations } from "./lib/applyMigrations";

cluster.schedulingPolicy = cluster.SCHED_RR;

const CONCURRENCY = Number(process.env.WEB_CONCURRENCY) || os.cpus().length;

const MAX_CRASH_RESTART_DELAY = 30_000;
const crashTimestamps = new Map<number, number[]>();

function getRestartDelay(workerId: number): number {
  const now = Date.now();
  const history = crashTimestamps.get(workerId) ?? [];
  const recent = history.filter((t) => now - t < 60_000);
  recent.push(now);
  crashTimestamps.set(workerId, recent);
  const crashes = recent.length;
  if (crashes <= 1) return 1_000;
  return Math.min(1_000 * Math.pow(2, crashes - 1), MAX_CRASH_RESTART_DELAY);
}

/**
 * Bring the schema up to date before anything serves traffic. Rejecting means the
 * deploy is broken, so this exits non-zero rather than forking workers that would
 * only crash-loop against the wrong schema: the platform then keeps the previous
 * container and the failure is visible in the deploy log.
 */
async function migrateBeforeWorkers(): Promise<void> {
  const applied = await applyPendingMigrations();
  if (applied.length > 0) {
    logger.info({ count: applied.length, migrations: applied }, "Applied pending migrations before starting workers");
  }
}

function exitOnMigrationFailure(err: unknown): never {
  logger.fatal({ err }, "Migrations failed — not starting workers");
  process.exit(1);
}

if (cluster.isPrimary && CONCURRENCY > 1) {
  let shuttingDown = false;

  cluster.on("exit", (worker, code, signal) => {
    if (shuttingDown) return;
    const delay = getRestartDelay(worker.id);
    logger.warn({ workerId: worker.id, pid: worker.process.pid, code, signal, restartIn: delay }, "Worker exited, restarting...");
    setTimeout(() => {
      if (!shuttingDown) cluster.fork();
    }, delay);
  });

  process.on("SIGTERM", () => {
    shuttingDown = true;
    logger.info("Primary received SIGTERM, shutting down workers...");
    for (const id in cluster.workers) {
      cluster.workers[id]?.process.kill("SIGTERM");
    }
    setTimeout(() => process.exit(0), 10_000);
  });

  process.on("SIGINT", () => {
    shuttingDown = true;
    logger.info("Primary received SIGINT, shutting down workers...");
    for (const id in cluster.workers) {
      cluster.workers[id]?.process.kill("SIGTERM");
    }
    setTimeout(() => process.exit(0), 10_000);
  });

  // Signal handlers are already live, so a stop requested while migrations are
  // still running is honoured instead of racing the first fork.
  void migrateBeforeWorkers()
    .then(() => {
      if (shuttingDown) return;
      logger.info({ workers: CONCURRENCY, pid: process.pid, scheduling: "round-robin" }, "Primary process starting workers");
      for (let i = 0; i < CONCURRENCY; i++) {
        cluster.fork();
      }
    })
    .catch(exitOnMigrationFailure);
} else {
  // A boot failure used to surface as a bare unhandled rejection. Log it and exit
  // non-zero so the primary's crash-restart backoff sees a real worker exit.
  const startApp = (): void => {
    void import("./index.js").catch((err) => {
      logger.error({ err }, "Worker failed to start");
      process.exit(1);
    });
  };

  // Reached two ways: as a forked worker, or as the whole app when
  // WEB_CONCURRENCY=1. Only the second is a primary, and only it owns migrations —
  // a worker must never run them, because every sibling would run them too.
  if (cluster.isPrimary) {
    void migrateBeforeWorkers().then(startApp).catch(exitOnMigrationFailure);
  } else {
    startApp();
  }
}
