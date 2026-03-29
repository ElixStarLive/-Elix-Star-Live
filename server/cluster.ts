/**
 * Cluster wrapper for production — spawns one worker per CPU core.
 *
 * IMPORTANT: This requires sticky sessions for WebSocket connections.
 * Configure your reverse proxy (nginx/HAProxy) with one of:
 *
 *   nginx:  ip_hash;  (in upstream block)
 *   HAProxy: balance source / stick-table
 *
 * Without sticky sessions, WebSocket reconnections may land on different
 * workers, causing temporary state inconsistency until the client
 * re-establishes room membership.
 *
 * All shared state (rooms, battles, streams, profiles, videos) is stored
 * in Valkey + PostgreSQL, NOT in worker memory.
 *
 * Usage: npx tsx server/cluster.ts
 * Falls back to single-process mode if WEB_CONCURRENCY=1.
 */

import cluster from "node:cluster";
import os from "node:os";
import { logger } from "./lib/logger";

cluster.schedulingPolicy = cluster.SCHED_RR;

const CONCURRENCY = Number(process.env.WEB_CONCURRENCY) || Math.min(os.cpus().length, 8);

if (cluster.isPrimary && CONCURRENCY > 1) {
  logger.info({ workers: CONCURRENCY, pid: process.pid, scheduling: "round-robin" }, "Primary process starting workers");

  for (let i = 0; i < CONCURRENCY; i++) {
    cluster.fork();
  }

  cluster.on("exit", (worker, code, signal) => {
    logger.warn({ workerId: worker.id, pid: worker.process.pid, code, signal }, "Worker exited, restarting...");
    setTimeout(() => cluster.fork(), 1000);
  });

  process.on("SIGTERM", () => {
    logger.info("Primary received SIGTERM, shutting down workers...");
    for (const id in cluster.workers) {
      cluster.workers[id]?.process.kill("SIGTERM");
    }
    setTimeout(() => process.exit(0), 10000);
  });
} else {
  import("./index.js");
}
