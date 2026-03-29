/**
 * In-process HTTP metrics (per worker). Exposed via GET with METRICS_SECRET.
 */
import { performance } from "node:perf_hooks";
import { getPool, getPgPoolStats } from "./postgres";
import { valkeyHealthCheck, isValkeyConfigured } from "./valkey";
import { logger } from "./logger";
import { getCacheLayerMetrics } from "./cacheLayerMetrics";

const buckets = {
  le10: 0,
  le50: 0,
  le100: 0,
  le250: 0,
  le500: 0,
  le1000: 0,
  le2500: 0,
  le5000: 0,
  leInf: 0,
};

let requestCount = 0;
let status2xx = 0;
let status4xx = 0;
let status5xx = 0;

/** Normalized path for saturation debugging (caps cardinality). */
export function routeMetricBucket(originalUrl: string): string {
  const path = (originalUrl || "/").split("?")[0] || "/";
  const segs = path.split("/").filter(Boolean);
  if (segs[0] === "api") {
    const depth = Math.min(segs.length, 5);
    return `/${segs.slice(0, depth).join("/")}`;
  }
  if (segs.length === 0) return "/";
  return `/${segs.slice(0, 3).join("/")}`;
}

type RouteClass = { "2xx": number; "4xx": number; "5xx": number };
const byRoute = new Map<string, RouteClass>();
const MAX_ROUTE_KEYS = 120;

function bumpRoute(pathKey: string, status: number): void {
  if (!pathKey.startsWith("/api")) return;
  let row = byRoute.get(pathKey);
  if (!row) {
    if (byRoute.size >= MAX_ROUTE_KEYS && !byRoute.has(pathKey)) {
      pathKey = "/api/_other";
      row = byRoute.get(pathKey);
    }
    if (!row) {
      row = { "2xx": 0, "4xx": 0, "5xx": 0 };
      byRoute.set(pathKey, row);
    }
  }
  if (status >= 500) row["5xx"]++;
  else if (status >= 400) row["4xx"]++;
  else if (status >= 200 && status < 400) row["2xx"]++;
}

function observeLatencyMs(ms: number): void {
  requestCount++;
  if (ms <= 10) buckets.le10++;
  else if (ms <= 50) buckets.le50++;
  else if (ms <= 100) buckets.le100++;
  else if (ms <= 250) buckets.le250++;
  else if (ms <= 500) buckets.le500++;
  else if (ms <= 1000) buckets.le1000++;
  else if (ms <= 2500) buckets.le2500++;
  else if (ms <= 5000) buckets.le5000++;
  else buckets.leInf++;
}

export function recordHttpRequest(status: number, durationMs: number, originalUrl?: string): void {
  observeLatencyMs(durationMs);
  if (status >= 200 && status < 300) status2xx++;
  else if (status >= 400 && status < 500) status4xx++;
  else if (status >= 500) status5xx++;
  if (originalUrl) {
    bumpRoute(routeMetricBucket(originalUrl), status);
  }
}

/** For /api/metrics — status class counts per route bucket (since process start, per worker). */
export function getHttpStatusByRoute(): Record<string, RouteClass> {
  const out: Record<string, RouteClass> = {};
  for (const [k, v] of byRoute) out[k] = { ...v };
  return out;
}

let dbPingMsLast: number | null = null;
let valkeyPingMsLast: number | null = null;

let slowWallMsCount = 0;
let slowDbMsCount = 0;

/** Counted when response finishes over latency thresholds (see index middleware). */
export function bumpSlowRequest(kind: "wall_ms" | "db_ms"): void {
  if (kind === "wall_ms") slowWallMsCount++;
  else slowDbMsCount++;
}

export async function snapshotDependencyLatencies(): Promise<{
  db_ping_ms: number | null;
  valkey_ping_ms: number | null;
  valkey_configured: boolean;
}> {
  const pool = getPool();
  if (pool) {
    const t0 = performance.now();
    try {
      await pool.query("SELECT 1");
      dbPingMsLast = Math.round(performance.now() - t0);
    } catch (e) {
      logger.warn({ err: e }, "metrics DB ping failed");
      dbPingMsLast = null;
    }
  } else dbPingMsLast = null;

  if (isValkeyConfigured()) {
    const t0 = performance.now();
    try {
      const ok = await valkeyHealthCheck();
      valkeyPingMsLast = ok ? Math.round(performance.now() - t0) : null;
    } catch {
      valkeyPingMsLast = null;
    }
  } else valkeyPingMsLast = null;

  return {
    db_ping_ms: dbPingMsLast,
    valkey_ping_ms: valkeyPingMsLast,
    valkey_configured: isValkeyConfigured(),
  };
}

/** Cheap snapshot: no extra DB/Valkey pings — safe to poll every few seconds under load. */
export function getMetricsSnapshotLight(): Record<string, unknown> {
  return {
    pg_pool: getPgPoolStats(),
    http_status_by_route: getHttpStatusByRoute(),
    ...getCacheLayerMetrics(),
    slow_requests: { wall_ms_threshold: slowWallMsCount, db_ms_threshold: slowDbMsCount },
    pid: process.pid,
    uptime_s: Math.round(process.uptime()),
  };
}

export function getMetricsSnapshot(): Record<string, unknown> {
  return {
    ...getMetricsSnapshotLight(),
    requests_total: requestCount,
    responses_by_class: { "2xx": status2xx, "4xx": status4xx, "5xx": status5xx },
    latency_histogram_ms: { ...buckets },
    last_db_ping_ms: dbPingMsLast,
    last_valkey_ping_ms: valkeyPingMsLast,
  };
}

export function verifyMetricsSecret(req: { headers: Record<string, string | string[] | undefined> }): boolean {
  const secret = process.env.METRICS_SECRET;
  if (!secret) return false;
  const h = req.headers["authorization"];
  const bearer = typeof h === "string" && h.startsWith("Bearer ") ? h.slice(7) : "";
  return bearer === secret;
}
