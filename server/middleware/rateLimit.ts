import { Request, Response, NextFunction } from "express";
import { valkeyRateCheck, isValkeyConfigured } from "../lib/valkey";
import { logger } from "../lib/logger";
// #region agent log
function _dbgRL(loc:string,msg:string,data:Record<string,unknown>={}){fetch('http://127.0.0.1:7684/ingest/8c32b730-3e4a-4f4c-9502-6b305be695c7',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'6f8791'},body:JSON.stringify({sessionId:'6f8791',location:loc,message:msg,data,timestamp:Date.now()})}).catch(()=>{});}
// #endregion

// ── Fallback: local in-memory (used only when Valkey is unavailable) ──

interface WindowEntry {
  timestamps: number[];
}

const localWindows = new Map<string, WindowEntry>();
const MAX_LOCAL_WINDOWS = 50_000;

const CLEANUP_INTERVAL = 60_000;
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of localWindows) {
    entry.timestamps = entry.timestamps.filter((t) => now - t < 120_000);
    if (entry.timestamps.length === 0) localWindows.delete(key);
  }
}, CLEANUP_INTERVAL).unref();

function localRateCheck(
  key: string,
  windowMs: number,
  max: number,
): boolean {
  const now = Date.now();
  let entry = localWindows.get(key);
  if (!entry) {
    if (localWindows.size >= MAX_LOCAL_WINDOWS) {
      const oldest = localWindows.keys().next().value;
      if (oldest) localWindows.delete(oldest);
    }
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

const LOADTEST_SECRET = process.env.LOADTEST_BYPASS_SECRET || "";

export function rateLimit(opts: {
  windowMs: number;
  max: number;
  keyPrefix?: string;
}) {
  const { windowMs, max, keyPrefix = "rl" } = opts;

  return (req: Request, res: Response, next: NextFunction): void => {
    if (LOADTEST_SECRET && req.headers["x-loadtest-key"] === LOADTEST_SECRET) {
      next();
      return;
    }

    const ip = getClientIp(req);
    const key = `${keyPrefix}:${ip}`;

    if (isValkeyConfigured()) {
      valkeyRateCheck(key, windowMs, max)
        .then((allowed) => {
          if (!allowed) {
            // #region agent log
            _dbgRL('rateLimit.ts:blocked','RATE_LIMIT_429',{url:req.originalUrl,ip,key,max,hypothesisId:'B'});
            // #endregion
            logger.warn({ url: req.originalUrl, ip, key, max }, 'Rate limit 429');
            res
              .status(429)
              .json({ error: "Too many requests. Please try again later." });
            return;
          }
          next();
        })
        .catch((err) => {
          logger.warn({ err: err?.message, key }, "Valkey rate-limit unavailable, falling back to local");
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

export const giftSendLimiter = rateLimit({
  windowMs: 60_000,
  max: 40,
  keyPrefix: "gift_send",
});

export const walletReadLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  keyPrefix: "wallet_read",
});

export const shopCheckoutLimiter = rateLimit({
  windowMs: 60_000,
  max: 15,
  keyPrefix: "shop_checkout",
});

export const verifyPurchaseLimiter = rateLimit({
  windowMs: 60 * 60_000,
  max: 40,
  keyPrefix: "iap_verify",
});

export const analyticsPostLimiter = rateLimit({
  windowMs: 60_000,
  max: 300,
  keyPrefix: "analytics",
});
