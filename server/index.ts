import "./config";
import { validateProductionEnvironment } from "./lib/envValidate";
import { initSentry } from "./lib/sentryInit";
import { httpMetricsMiddleware } from "./middleware/httpMetrics";
import {
  getMetricsSnapshot,
  verifyMetricsSecret,
  snapshotDependencyLatencies,
} from "./lib/metrics";
import { startJobWorker, stopJobWorker, enqueueJob } from "./lib/jobQueue";
import { processJob } from "./jobs/backgroundWorker";
import { postAlertWebhook } from "./lib/alerting";
import express from "express";
import cors from "cors";
import compression from "compression";
import { createServer } from "http";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import fs from "fs";

import { stripeWebhookRouter, livekitWebhookRouter } from "./routes/webhooks.router";
import { videoUploadRouter } from "./routes/media.router";
import { mountRoutes } from "./routes/index";
import { attachWebSocket, initWsPubSub } from "./websocket/index";
import { initBattleTickLoop, stopBattleTickLoop } from "./websocket/battle";
import { initFeedPubSub } from "./feedBroadcast";
import crypto from "crypto";
import cluster from "node:cluster";
import { apiLimiter } from "./middleware/rateLimit";
import { errorHandler } from "./middleware/errorHandler";

import { isLiveKitConfigured } from "./services/livekit";
import { isBunnyConfigured } from "./services/bunny";
import { isValkeyConfigured, valkeyHealthCheck } from "./lib/valkey";
import { connectPostgres, getPool } from "./lib/postgres";
import { getVideoCountAsync } from "./lib/videoStore";
import { logger } from "./lib/logger";
import { loadGiftValuesFromDb } from "./websocket/giftRegistry";
import { validateAuthSecretOrDie } from "./routes/auth";
import helmet from "helmet";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

process.setMaxListeners(0);

const app = express();
const server = createServer(app);
server.maxConnections = 0;
const PORT = Number(process.env.PORT) || 8080;
const BUILD_VERSION = "2026-03-26T20:00-modular-rebuild";

// ── Critical startup checks ─────────────────────────────────────
validateAuthSecretOrDie();
validateProductionEnvironment();
initSentry();

if (process.env.NODE_ENV === "production") {
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    logger.warn("STRIPE_WEBHOOK_SECRET is not set — Stripe webhooks will be rejected in production.");
  }
}

// ── CORS allowlist ───────────────────────────────────────────────
const ALLOWED_ORIGINS: string[] = (() => {
  const origins: string[] = [];
  if (process.env.CLIENT_URL) origins.push(process.env.CLIENT_URL);
  if (process.env.VITE_API_URL) origins.push(process.env.VITE_API_URL);
  if (process.env.ALLOWED_ORIGINS) {
    origins.push(...process.env.ALLOWED_ORIGINS.split(",").map(s => s.trim()).filter(Boolean));
  }
  if (process.env.NODE_ENV !== "production") {
    origins.push("http://localhost:5173", "http://localhost:8080", "http://localhost:3000", "https://localhost:5173", "capacitor://localhost", "http://localhost");
  }
  return [...new Set(origins)];
})();

// ── Global middleware ────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));
app.use(cors({
  credentials: true,
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin) || process.env.NODE_ENV !== "production") {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
}));
app.use(compression({
  level: 1,
  filter: (req, res) => {
    if (req.path.startsWith("/api/")) return false;
    return compression.filter(req, res);
  },
}));

const LOADTEST_SECRET = process.env.LOADTEST_BYPASS_SECRET || "";
const LOG_SAMPLE = Math.max(1, Number(process.env.LOG_SAMPLE_RATE) || 1);
let _logCounter = 0;

app.use(httpMetricsMiddleware);

app.use((req, res, next) => {
  const isLoadTest = LOADTEST_SECRET && req.headers["x-loadtest-key"] === LOADTEST_SECRET;

  if (!isLoadTest) {
    req.requestId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    res.setHeader("X-Request-Id", req.requestId);
  }

  if (isLoadTest || (++_logCounter % LOG_SAMPLE) !== 0) {
    next();
    return;
  }

  const start = Date.now();
  res.on("finish", () => {
    logger.info({
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      ms: Date.now() - start,
    });
  });
  next();
});

// ── Raw-body routes (must come BEFORE express.json()) ────────────
app.use("/api/stripe-webhook", stripeWebhookRouter);
app.post("/api/livekit/webhook", livekitWebhookRouter);
app.use("/api/upload/video", videoUploadRouter);

app.use(
  "/api/media/upload-file",
  express.raw({
    type: [
      "application/octet-stream",
      "video/mp4",
      "video/webm",
      "image/jpeg",
      "image/png",
      "image/webp",
    ],
    limit: "600mb",
  }),
);

// ── JSON body parser ─────────────────────────────────────────────
app.use(express.json({ limit: "50kb" }));

// ── Health (before rate limiter — must be exempt for LB/monitoring) ──
let healthCache: { data: any; code: number; ts: number } | null = null;
const HEALTH_CACHE_TTL = 12_000;

async function healthCheck(_req: express.Request, res: express.Response) {
  const now = Date.now();
  if (healthCache && now - healthCache.ts < HEALTH_CACHE_TTL) {
    res.setHeader("Cache-Control", "public, s-maxage=12, max-age=8");
    return res.status(healthCache.code).json(healthCache.data);
  }

  const pool = getPool();
  const [dbPing, valkeyOk, videoCount] = await Promise.all([
    pool
      ? pool.query("SELECT 1").then(
          () => true,
          (err: unknown) => {
            logger.warn({ err: err instanceof Error ? err.message : err }, "Health check DB ping failed");
            return false;
          },
        )
      : Promise.resolve(false),
    valkeyHealthCheck(),
    getVideoCountAsync(),
  ]);

  const dbOk = Boolean(dbPing);
  const allCritical = dbOk && (valkeyOk || !isValkeyConfigured());
  const status = allCritical ? "ok" : "degraded";
  const code = allCritical ? 200 : 503;

  const data = {
    status,
    version: BUILD_VERSION,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    port: PORT,
    videoCount,
    services: {
      database: dbOk,
      valkey: isValkeyConfigured() ? valkeyOk : "not_configured",
      livekit: isLiveKitConfigured(),
      bunnyStorage: isBunnyConfigured(),
    },
  };
  healthCache = { data, code, ts: now };
  res.setHeader("Cache-Control", "public, s-maxage=12, max-age=8");
  res.status(code).json(data);
}
app.get("/health", healthCheck);
app.get("/api/health", healthCheck);

app.get("/api/metrics", async (req, res) => {
  if (!verifyMetricsSecret(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  res.setHeader("Cache-Control", "private, no-store");
  const deps = await snapshotDependencyLatencies();
  return res.json({ ...getMetricsSnapshot(), dependencies: deps });
});

// ── Rate limiter on API routes ───────────────────────────────────
app.use("/api", apiLimiter);

// ── Mount all API routes ─────────────────────────────────────────
mountRoutes(app);

// ── Runtime env.js (explicit allowlist — no prefix-matching) ─────
const ENV_JS_ALLOWED_KEYS = [
  "VITE_API_URL",
  "VITE_WS_URL",
  "VITE_LIVEKIT_URL",
  "VITE_BUNNY_CDN_HOSTNAME",
  "VITE_BUNNY_STORAGE_ZONE",
  "VITE_STRIPE_PUBLISHABLE_KEY",
  "VITE_APP_NAME",
  "VITE_CDN_URL",
  "VITE_GIFT_ASSET_BASE_URL",
  "VITE_ADMIN_USER_IDS",
  "VITE_ENABLE_CRASH_REPORTING",
];

app.get("/env.js", (_req, res) => {
  const env: Record<string, string> = {};
  for (const k of ENV_JS_ALLOWED_KEYS) {
    const v = process.env[k];
    if (typeof v === "string" && v.length > 0) env[k] = v;
  }
  if (process.env.LIVEKIT_URL && typeof process.env.LIVEKIT_URL === "string") {
    env.VITE_LIVEKIT_URL = process.env.LIVEKIT_URL;
  }
  if (!env.VITE_GIFT_ASSET_BASE_URL && process.env.BUNNY_STORAGE_HOSTNAME) {
    env.VITE_GIFT_ASSET_BASE_URL = `https://${process.env.BUNNY_STORAGE_HOSTNAME}`;
  }
  if (!env.VITE_BUNNY_CDN_HOSTNAME && process.env.BUNNY_STORAGE_HOSTNAME) {
    env.VITE_BUNNY_CDN_HOSTNAME = process.env.BUNNY_STORAGE_HOSTNAME;
  }
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res
    .status(200)
    .send(
      "window.__ENV = Object.assign({}, window.__ENV || {}, " +
        JSON.stringify(env) +
        ");",
    );
});

// ── Static files ─────────────────────────────────────────────────
const distPath = join(__dirname, "..", "dist");
const indexPath = join(distPath, "index.html");

if (!fs.existsSync(indexPath)) {
  console.error(`ERROR: index.html not found at ${indexPath}`);
  console.error(
    "Available files:",
    fs.existsSync(distPath)
      ? fs.readdirSync(distPath).join(", ")
      : "dist folder missing",
  );
}

app.use(
  express.static(distPath, {
    maxAge: process.env.NODE_ENV === "production" ? "1d" : 0,
    immutable: process.env.NODE_ENV === "production",
    etag: true,
  }),
);

// ── SPA fallback ─────────────────────────────────────────────────
const indexExists = fs.existsSync(indexPath);
app.use((req, res) => {
  if (process.env.NODE_ENV !== "production")
    console.log(`Serving fallback for ${req.url}`);
  if (indexExists) {
    res.sendFile(indexPath);
  } else {
    res
      .status(200)
      .send(
        "<h1>App build not found</h1><p>dist/index.html is missing. Check build logs.</p>",
      );
  }
});

// ── Error handler ────────────────────────────────────────────────
app.use(errorHandler);

// ── WebSocket + cross-instance pub/sub ───────────────────────────
attachWebSocket(server);
initWsPubSub();
initFeedPubSub();

// ── Start server ─────────────────────────────────────────────────
logger.info(
  { port: PORT, nodeEnv: process.env.NODE_ENV },
  "Starting server...",
);

if (!isValkeyConfigured()) {
  const msg = "VALKEY_URL / REDIS_URL is not set — room membership, battles, streams, rate limiting, pub/sub, and gift dedup require Valkey for horizontal scaling. Single-instance dev mode only.";
  if (process.env.NODE_ENV === "production") {
    logger.fatal(msg);
    logger.fatal("Cannot run in production without Valkey. Exiting.");
    process.exit(1);
  } else {
    logger.warn(msg);
  }
}

const jobWorkerEnv = process.env.ELIX_JOB_WORKER;
/** Cluster children must not each run the job consumer / startup enqueue — only `ELIX_JOB_WORKER=1` on one leader. */
const isClusterChild = cluster.isWorker;
const runBackgroundJobs =
  jobWorkerEnv === "1" ||
  jobWorkerEnv === "true" ||
  (jobWorkerEnv !== "0" &&
    jobWorkerEnv !== "false" &&
    (!isClusterChild || process.env.NODE_ENV !== "production"));

try {
  await connectPostgres();
  await loadGiftValuesFromDb();
  initBattleTickLoop();
  server.listen(PORT, "0.0.0.0", 8192, () => {
    logger.info(
      { port: PORT, version: BUILD_VERSION },
      "Server running successfully — no startup bulk loads (DB is source of truth)",
    );
    if (runBackgroundJobs) {
      startJobWorker(processJob, 1500);
      void enqueueJob({ type: "cleanup_retention" });
      setInterval(() => {
        void enqueueJob({ type: "cleanup_retention" });
      }, 24 * 60 * 60 * 1000).unref();
      logger.info("Background job consumer enabled on this process (non-production or ELIX_JOB_WORKER=1)");
    } else {
      logger.info(
        "Background job consumer disabled — set ELIX_JOB_WORKER=1 on exactly one instance to process the Valkey job queue",
      );
    }
  });
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;
} catch (error) {
  logger.fatal({ err: error }, "Failed to start server");
  process.exit(1);
}

process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "Unhandled Promise Rejection");
  void postAlertWebhook({ text: "Unhandled promise rejection", severity: "critical", context: { reason: String(reason) } });
});
process.on("uncaughtException", (error) => {
  logger.fatal({ err: error }, "Uncaught Exception — shutting down");
  void postAlertWebhook({ text: "Uncaught exception", severity: "critical", context: { message: error.message } });
  server.close(() => process.exit(1));
  setTimeout(() => process.exit(1), 5000);
});
function gracefulShutdown(signal: string) {
  logger.info({ signal }, "Shutting down...");
  stopJobWorker();
  stopBattleTickLoop();
  server.close(async () => {
    try {
      const pool = getPool();
      if (pool) await pool.end().catch(() => {});
    } catch { /* ignore */ }
    logger.info("Server closed");
    process.exit(0);
  });
  const legacyConns = (server as import("http").Server & { connections?: import("net").Socket[] })
    .connections;
  if (Array.isArray(legacyConns)) {
    for (const socket of legacyConns) {
      try {
        socket.destroy();
      } catch {
        /* ignore */
      }
    }
  }
  setTimeout(() => process.exit(0), 10_000);
}
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
