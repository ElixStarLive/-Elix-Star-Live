import { lazy as reactLazy } from "react";
import type { ComponentType, LazyExoticComponent } from "react";

/**
 * Sole stale-chunk recovery for Vite (web + Capacitor WebView).
 *
 * After a deploy, an already-open client may request old content-hashed chunks.
 * Dynamic import then fails with "Failed to fetch dynamically imported module".
 *
 * Mechanism (exactly once per session):
 * 1. On chunk-load failure, set a sessionStorage guard and `location.reload()`
 *    so the shell pulls fresh index.html + current hashes.
 * 2. If the same session fails again, rethrow — no stacked retries, no Cap-specific
 *    second path (Capacitor loads the same Vite assets).
 */
const RELOAD_GUARD_KEY = "elix_chunk_reload_guard";

function readGuard(): boolean {
  try {
    return window.sessionStorage.getItem(RELOAD_GUARD_KEY) === "1";
  } catch {
    return false;
  }
}

function writeGuard(): void {
  try {
    window.sessionStorage.setItem(RELOAD_GUARD_KEY, "1");
  } catch {
    /* sessionStorage unavailable — reload still attempted once */
  }
}

function clearGuard(): void {
  try {
    window.sessionStorage.removeItem(RELOAD_GUARD_KEY);
  } catch {
    /* non-fatal */
  }
}

export function lazyWithRetry<T extends ComponentType<never>>(
  factory: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return reactLazy(async () => {
    try {
      const mod = await factory();
      clearGuard();
      return mod;
    } catch (err) {
      if (!readGuard()) {
        writeGuard();
        window.location.reload();
        // Keep Suspense pending while the reload runs.
        return new Promise<{ default: T }>(() => {});
      }
      throw err;
    }
  });
}
