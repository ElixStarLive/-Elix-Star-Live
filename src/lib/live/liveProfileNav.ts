/**
 * Live-safe profile navigation — profile opens as a sub-route under /watch/:streamId
 * so the spectator session (WS + LiveKit) stays mounted.
 */

/** Open a user profile without leaving the active watch session. */
export function watchLiveProfilePath(streamId: string, profileUserId: string): string {
  const sk = String(streamId || '').trim();
  const uid = String(profileUserId || '').trim();
  if (!sk || !uid) return `/profile/${encodeURIComponent(uid)}`;
  return `/watch/${encodeURIComponent(sk)}/profile/${encodeURIComponent(uid)}`;
}

/** True when pathname is a live-nested profile overlay. */
export function isWatchLiveProfilePath(pathname: string): boolean {
  return /^\/watch\/[^/]+\/profile(?:\/|$)/.test(pathname.split('?')[0] || '');
}

/**
 * Return path to resume the same live watch session (preserves ?cohost= / ?battle= search).
 */
export function resolveLiveProfileReturnPath(pathname: string, search = ''): string | null {
  const path = (pathname.split('?')[0] || '').trim();
  const m = path.match(/^\/watch\/([^/]+)\/profile(?:\/[^/]+)?$/);
  if (!m?.[1]) return null;
  const streamId = decodeURIComponent(m[1]);
  return `/watch/${encodeURIComponent(streamId)}${search || ''}`;
}
