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
 * Usage: npx tsx server/cluster.ts
 * Falls back to single-process mode if WEB_CONCURRENCY=1.
 */

import cluster from "node:cluster";
import os from "node:os";
import { logger } from "./lib/logger";

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

if (cluster.isPrimary && CONCURRENCY > 1) {
  logger.info({ workers: CONCURRENCY, pid: process.pid, scheduling: "round-robin" }, "Primary process starting workers");

  for (let i = 0; i < CONCURRENCY; i++) {
    cluster.fork();
  }

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
} else {
  import("./index.js");
}
