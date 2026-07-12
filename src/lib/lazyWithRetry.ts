import { lazy as reactLazy } from "react";
import type { ComponentType, LazyExoticComponent } from "react";

/**
 * Wrapper around React.lazy that recovers from stale-chunk failures.
 *
 * After a new deployment, an already-loaded client references old chunk
 * filenames (content-hashed). When it tries to lazy-load a route whose
 * hashed file no longer exists on the server, the dynamic import rejects
 * with "Failed to fetch dynamically imported module".
 *
 * On that failure we force a single full-page reload so the browser pulls
 * the fresh index.html + current chunk hashes. A sessionStorage guard
 * prevents an infinite reload loop if the chunk is genuinely broken.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return reactLazy(async () => {
    const RELOAD_GUARD_KEY = "elix_chunk_reload_guard";
    try {
      const mod = await factory();
      try {
        window.sessionStorage.removeItem(RELOAD_GUARD_KEY);
      } catch {
        /* sessionStorage unavailable — non-fatal */
      }
      return mod;
    } catch (err) {
      let alreadyReloaded = false;
      try {
        alreadyReloaded =
          window.sessionStorage.getItem(RELOAD_GUARD_KEY) === "1";
      } catch {
        /* sessionStorage unavailable — fall through and rethrow */
      }

      if (!alreadyReloaded) {
        try {
          window.sessionStorage.setItem(RELOAD_GUARD_KEY, "1");
        } catch {
          /* ignore */
        }
        window.location.reload();
        // Keep Suspense pending while the reload happens.
        return new Promise<{ default: T }>(() => {});
      }

      throw err;
    }
  });
}
