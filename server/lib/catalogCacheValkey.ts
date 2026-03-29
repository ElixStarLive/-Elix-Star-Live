/**
 * Shared HTTP response caches (Valkey) — gifts catalog, coin packages, profiles list.
 * Invalidation: profiles list uses an epoch key; gifts/packages rely on TTL (rare admin edits).
 */

import { getValkey, isValkeyConfigured, valkeyGet } from "./valkey";
import { logger } from "./logger";

export const GIFTS_CATALOG_KEY = "elix:http:gifts_catalog";
export const COIN_PACKAGES_KEY = "elix:http:coin_packages";
export const PROFILES_LIST_EPOCH_KEY = "elix:profiles:list:epoch";

/** Gifts / coin packages JSON blobs — short TTL; reduces DB under concurrent GETs. */
export const CATALOG_HTTP_CACHE_TTL_MS = Math.min(
  600_000,
  Math.max(30_000, Number(process.env.CATALOG_VALKEY_TTL_MS) || 120_000),
);

export function profilesListDataKey(epoch: string): string {
  return `elix:profiles:list:${epoch}`;
}

export async function getProfilesListEpoch(): Promise<string> {
  if (!isValkeyConfigured()) return "0";
  const e = await valkeyGet(PROFILES_LIST_EPOCH_KEY);
  return e ?? "0";
}

export async function bumpProfilesListEpoch(): Promise<void> {
  if (!isValkeyConfigured()) return;
  const v = getValkey();
  if (!v) return;
  try {
    await v.incr(PROFILES_LIST_EPOCH_KEY);
  } catch (err: unknown) {
    logger.warn(
      { err: err instanceof Error ? err.message : err },
      "bumpProfilesListEpoch failed",
    );
  }
}
