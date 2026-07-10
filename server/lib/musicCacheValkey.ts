/**
 * Valkey cache for Epidemic Sound catalog + expiring preview/download URLs.
 * Client never calls Epidemic Sound directly — only these cached server routes.
 */

export const MUSIC_CACHE_TTL_MS = {
  collections: 6 * 60 * 60 * 1000,
  search: 60 * 60 * 1000,
  highlights: 24 * 60 * 60 * 1000,
  picker: 2 * 60 * 60 * 1000,
  metadata: 24 * 60 * 60 * 1000,
};

export function musicCacheKey(kind: string, id: string): string {
  return `elix:music:${kind}:${id}`;
}

export function previewCacheKey(trackId: string): string {
  return `elix:music:preview:${trackId}`;
}

/** TTL until shortly before Epidemic download URL expires. */
export function previewCacheTtlMs(expiresIso: string): number {
  const expiresMs = Date.parse(expiresIso);
  if (!Number.isFinite(expiresMs)) return 60 * 60 * 1000;
  const bufferMs = 5 * 60 * 1000;
  return Math.max(60_000, expiresMs - Date.now() - bufferMs);
}
