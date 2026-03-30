/**
 * Shared For You feed cache (Valkey) — safe across clustered workers; no per-process Maps.
 * Invalidation: INCR epoch so old cache keys become unused (TTL cleans up).
 */

import { getValkey, isValkeyConfigured, valkeyGet } from "./valkey";
import { logger } from "./logger";

export const FEED_FORYOU_EPOCH_KEY = "elix:feed:foryou:epoch";
/** Longer TTL reduces DB load when Valkey is shared across workers; bump epoch invalidates. */
export const FEED_FORYOU_CACHE_TTL_MS = Math.min(
  600_000,
  Math.max(5_000, Number(process.env.FEED_FORYOU_CACHE_TTL_MS) || 120_000),
);

export function feedForyouDataKey(epoch: string, page: number, limit: number): string {
  return `elix:feed:foryou:${epoch}:${page}:${limit}`;
}

export async function getFeedForyouEpoch(): Promise<string> {
  if (!isValkeyConfigured()) return "0";
  const e = await valkeyGet(FEED_FORYOU_EPOCH_KEY);
  return e ?? "0";
}

/** Bump epoch so all For You cache keys miss (new epoch in key path). */
export async function bumpFeedForyouEpoch(): Promise<void> {
  if (!isValkeyConfigured()) return;
  const v = getValkey();
  if (!v) return;
  try {
    await v.incr(FEED_FORYOU_EPOCH_KEY);
  } catch (err: unknown) {
    logger.warn({ err: err instanceof Error ? err.message : err }, "bumpFeedForyouEpoch failed");
  }
}
