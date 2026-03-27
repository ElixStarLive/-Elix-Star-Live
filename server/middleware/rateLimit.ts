import { Request, Response, NextFunction } from "express";
import { valkeyRateCheck, isValkeyConfigured } from "../lib/valkey";
import { logger } from "../lib/logger";

// ── Fallback: local in-memory (used only when Valkey is unavailable) ──

interface WindowEntry {
  timestamps: number[];
}

const localWindows = new Map<string, WindowEntry>();

const CLEANUP_INTERVAL = 60_000;
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of localWindows) {
    entry.timestamps = entry.timestamps.filter((t) => now - t < 120_000);
    if (entry.timestamps.length === 0) localWindows.delete(key);
  }
}, CLEANUP_INTERVAL);

function localRateCheck(
  key: string,
  windowMs: number,
  max: number,
): boolean {
  const now = Date.now();
  let entry = localWindows.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    localWindows.set(key, entry);
  }
  entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);
  if (entry.timestamps.length >= max) return false;
  entry.timestamps.push(now);
  return true;
}

// ── Main rate limit factory ──────────────────────────────────────

function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
  return req.ip || req.socket.remoteAddress || "unknown";
}

export function rateLimit(opts: {
  windowMs: number;
  max: number;
  keyPrefix?: string;
}) {
  const { windowMs, max, keyPrefix = "rl" } = opts;

  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = getClientIp(req);
    const key = `${keyPrefix}:${ip}`;

    if (isValkeyConfigured()) {
      valkeyRateCheck(key, windowMs, max)
        .then((allowed) => {
          if (!allowed) {
            res
              .status(429)
              .json({ error: "Too many requests. Please try again later." });
            return;
          }
          next();
        })
        .catch((err) => {
          logger.warn({ err: err?.message, key }, "Valkey rate-limit check failed, falling back to local");
          if (!localRateCheck(key, windowMs, max)) {
            res.status(429).json({ error: "Too many requests. Please try again later." });
            return;
          }
          next();
        });
    } else {
      if (!localRateCheck(key, windowMs, max)) {
        res
          .status(429)
          .json({ error: "Too many requests. Please try again later." });
        return;
      }
      next();
    }
  };
}

export const apiLimiter = rateLimit({
  windowMs: 60_000,
  max: 200,
  keyPrefix: "api",
});

export const authLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  keyPrefix: "auth",
});

export const uploadLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  keyPrefix: "upload",
});
