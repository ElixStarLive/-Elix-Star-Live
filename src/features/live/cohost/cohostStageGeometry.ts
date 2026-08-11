/**
 * Shared co-host video stage geometry — source of truth for /watch Live and For You preview.
 * Must stay identical; do not fork a second stage size for the feed.
 */
export const LIVE_COHOST_STAGE_TOP = 'calc(var(--safe-top) + 90px + 9mm)' as const;
export const LIVE_COHOST_STAGE_HEIGHT = 'calc(30dvh + 6mm)' as const;
