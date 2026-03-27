import "./config";
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
import { initFeedPubSub } from "./feedBroadcast";
import { apiLimiter } from "./middleware/rateLimit";
import { requestIdMiddleware } from "./middleware/requestId";
import { errorHandler } from "./middleware/errorHandler";

import { isLiveKitConfigured } from "./services/livekit";
import { isBunnyConfigured } from "./services/bunny";
import { isValkeyConfigured, valkeyHealthCheck } from "./lib/valkey";
import { initPostgres, loadVideosFromDb, getPool } from "./lib/postgres";
import { getAllVideosAsync, getVideoCountAsync, replaceVideos, deleteVideoFromCache } from "./lib/videoStore";
import { loadFollowsFromDb } from "./routes/profiles";
import { logger } from "./lib/logger";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = createServer(app);
const PORT = Number(process.env.PORT) || 8080;
const BUILD_VERSION = "2026-03-26T20:00-modular-rebuild";

// ── Global middleware ────────────────────────────────────────────
app.use((_req, res, next) => {
  res.setHeader(
    "Strict-Transport-Security",
    "max-age=63072000; includeSubDomains",
  );
  next();
});
app.use(cors({ credentials: true, origin: true }));
app.use(compression());
app.use(requestIdMiddleware);

app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    logger.info({
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      ms: Date.now() - start,
      requestId: req.requestId,
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
app.use(express.json());

// ── Rate limiter on API routes ───────────────────────────────────
app.use("/api", apiLimiter);

// ── Health (with DB check) ────────────────────────────────────────
async function healthCheck(_req: express.Request, res: express.Response) {
  let dbOk = false;
  try {
    const pool = getPool();
    if (pool) {
      await pool.query("SELECT 1");
      dbOk = true;
    }
  } catch { /* db down */ }

  const valkeyOk = await valkeyHealthCheck();
  const allCritical = dbOk && (valkeyOk || !isValkeyConfigured());
  const status = allCritical ? "ok" : "degraded";
  const code = allCritical ? 200 : 503;

  res.status(code).json({
    status,
    version: BUILD_VERSION,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    port: PORT,
    videoCount: await getVideoCountAsync(),
    services: {
      database: dbOk,
      valkey: isValkeyConfigured() ? valkeyOk : "not_configured",
      livekit: isLiveKitConfigured(),
      bunnyStorage: isBunnyConfigured(),
    },
  });
}
app.get("/health", healthCheck);
app.get("/api/health", healthCheck);

// ── Mount all API routes ─────────────────────────────────────────
mountRoutes(app);

// ── Runtime env.js ───────────────────────────────────────────────
app.get("/env.js", (_req, res) => {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (!k.startsWith("VITE_") || typeof v !== "string") continue;
    env[k] = v;
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
    maxAge: process.env.NODE_ENV === "production" ? "1h" : 0,
  }),
);

// ── SPA fallback ─────────────────────────────────────────────────
app.use((req, res) => {
  if (process.env.NODE_ENV !== "production")
    console.log(`Serving fallback for ${req.url}`);
  if (fs.existsSync(indexPath)) {
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
  const msg = "VALKEY_URL / REDIS_URL is not set — rate limiting, pub/sub, battle coordination, and gift dedup will use local memory only. This is NOT safe for multi-instance production.";
  if (process.env.NODE_ENV === "production") {
    logger.error(msg);
  } else {
    logger.warn(msg);
  }
}

try {
  server.listen(PORT, "0.0.0.0", async () => {
    await initPostgres();
    const dbVideos = await loadVideosFromDb();
    if (dbVideos.length > 0) {
      replaceVideos(dbVideos);
      logger.info({ count: dbVideos.length }, "Videos loaded from database");
    }
    await loadFollowsFromDb();

    const allVids = await getAllVideosAsync();
    for (const v of allVids) {
      if (v.userId?.startsWith("demo_user_") || v.id?.startsWith("seed_")) {
        deleteVideoFromCache(v.id);
      }
    }

    logger.info(
      { port: PORT, version: BUILD_VERSION },
      "Server running successfully",
    );
  });
} catch (error) {
  logger.fatal({ err: error }, "Failed to start server");
  process.exit(1);
}

process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "Unhandled Promise Rejection");
});
process.on("uncaughtException", (error) => {
  logger.error({ err: error }, "Uncaught Exception");
});
process.on("SIGTERM", () => {
  logger.info("Shutting down...");
  server.close(() => {
    logger.info("Server closed");
    process.exit(0);
  });
});
