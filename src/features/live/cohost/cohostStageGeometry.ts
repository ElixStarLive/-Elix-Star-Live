/**
 * Co-host video stage geometry.
 *
 * HEIGHT + host|cohost split are shared everywhere (same half-screen presentation).
 * TOP differs by chrome that owns the surface:
 * - /watch Live: clears the live profile top chrome
 * - For You preview: clears the feed TopNav (`--topbar-total`) so nothing sits under it
 */
export const LIVE_COHOST_STAGE_HEIGHT = 'calc(30dvh + 6mm)' as const;

/** Bottom edge of spectator /watch co-host video stage (top + height). */
export const LIVE_COHOST_STAGE_BOTTOM =
  'calc(var(--safe-top) + 90px + 9mm + 30dvh + 6mm)' as const;

/**
 * Bottom edge of host live co-host video stage.
 * Matches LiveHostScreen inline stage: top `90px + 9mm`, height `36dvh + 10mm`.
 */
export const LIVE_HOST_COHOST_STAGE_BOTTOM = 'calc(90px + 9mm + 36dvh + 10mm)' as const;

/**
 * For You feed card: first pixel below the fixed TopNav column.
 * Uses the same tokens TopNav is built from — no ad-hoc mm offsets.
 */
export const FOR_YOU_COHOST_STAGE_TOP = 'var(--topbar-total)' as const;
