/**
 * Shared host↔spectator heart spawn position from a client tap on a chat heart layer.
 */

export type HeartSpawnPoint = {
  x: number;
  y: number;
  /** True when the tap was inside the layer bounds. */
  inside: boolean;
};

/**
 * Map client coordinates → layer-local spawn point.
 * Outside taps fall back to the shared right-side band used by both roles.
 */
export function resolveHeartSpawnFromClient(
  layer: HTMLElement,
  clientX: number,
  clientY: number,
  opts?: { clampInside?: boolean; outsideColorDefault?: boolean },
): HeartSpawnPoint {
  const rect = layer.getBoundingClientRect();
  const inside =
    clientX >= rect.left &&
    clientX <= rect.right &&
    clientY >= rect.top &&
    clientY <= rect.bottom;
  if (inside) {
    let x = clientX - rect.left;
    let y = clientY - rect.top;
    if (opts?.clampInside !== false && rect.width > 0 && rect.height > 0) {
      x = Math.max(8, Math.min(rect.width - 8, x));
      y = Math.max(8, Math.min(rect.height - 8, y));
    }
    return { x, y, inside: true };
  }
  const w = rect.width;
  const h = rect.height;
  return {
    x: w * (0.58 + Math.random() * 0.35),
    y: h * (0.12 + Math.random() * 0.68),
    inside: false,
  };
}
