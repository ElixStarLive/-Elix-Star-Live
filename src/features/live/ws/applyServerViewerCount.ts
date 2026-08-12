/**
 * Apply authoritative live viewer count from server WS payloads.
 * Single source: server `viewer_count` / `connected` — never local +/-.
 */
export function applyServerViewerCount(
  data: unknown,
  setViewerCount: (count: number) => void,
): boolean {
  if (data == null || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  const raw = d.count ?? d.viewer_count ?? d.user_count;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return false;
  setViewerCount(Math.floor(n));
  return true;
}
