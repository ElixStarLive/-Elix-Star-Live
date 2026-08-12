/**
 * Canonical exits for Settings ↔ Engagement ↔ Profile and primary app surfaces.
 *
 * - Settings close → Profile (replace) so Settings is not left under Profile in history
 * - Engagement Hub close → Settings (replace)
 * - Profile close → For You (/feed) — named exit only (no browser history pop)
 * - Settings subpages → Settings home
 * - Engagement subpages → Engagement home
 * - Edit Profile → Settings home
 * - Following / Friends / Stem / Music feeds → For You
 */
export const SETTINGS_HOME = '/settings';
export const SETTINGS_EXIT_TO = '/profile';
export const ENGAGEMENT_HOME = '/engagement';
export const PROFILE_EXIT_TO = '/feed';
export const FEED_HOME = '/feed';
export const EDIT_PROFILE_EXIT_TO = SETTINGS_HOME;
export const DISCOVER_HOME = '/discover';
export const SEARCH_EXIT_TO = FEED_HOME;
export const SHOP_EXIT_TO = FEED_HOME;
export const VIDEO_EXIT_TO = FEED_HOME;
export const RISING_STARS_EXIT_TO = FEED_HOME;
export const RISING_STARS_HOME = '/rising-stars';
export const AI_STUDIO_EXIT_TO = FEED_HOME;
export const FOLLOW_LIST_EXIT_TO = SETTINGS_EXIT_TO;

/**
 * Named parent for hardware/edge back — never pop browser history / relative back.
 * Maps the current path to the correct parent surface.
 */
export function namedExitForPath(pathname: string): string {
  const path = pathname.split('?')[0] || '/';
  if (path === '/' || path === '/feed' || path === '/friends' || path === '/inbox' || path === '/profile' || path === '/login') {
    return path;
  }
  if (path === SETTINGS_HOME || path.startsWith(`${SETTINGS_HOME}/`)) {
    if (path === SETTINGS_HOME) return SETTINGS_EXIT_TO;
    return SETTINGS_HOME;
  }
  if (path === ENGAGEMENT_HOME || path.startsWith(`${ENGAGEMENT_HOME}/`)) {
    if (path === ENGAGEMENT_HOME) return SETTINGS_HOME;
    return ENGAGEMENT_HOME;
  }
  if (path.startsWith('/profile/') || path === '/edit-profile') return PROFILE_EXIT_TO;
  if (/^\/watch\/[^/]+\/profile/.test(path)) {
    const streamId = path.match(/^\/watch\/([^/]+)/)?.[1];
    return streamId ? `/watch/${streamId}` : VIDEO_EXIT_TO;
  }
  if (path.startsWith('/shop')) return SHOP_EXIT_TO;
  if (path.startsWith('/video/') || path.startsWith('/watch/')) return VIDEO_EXIT_TO;
  if (path.startsWith('/rising-stars')) {
    if (path === RISING_STARS_HOME) return RISING_STARS_EXIT_TO;
    return RISING_STARS_HOME;
  }
  if (path.startsWith('/ai-studio')) return AI_STUDIO_EXIT_TO;
  if (path.startsWith('/search')) return SEARCH_EXIT_TO;
  if (path.startsWith('/discover')) return DISCOVER_HOME;
  if (path.startsWith('/inbox/') || path.startsWith('/chat/')) return '/inbox';
  if (path.startsWith('/live/') || path.startsWith('/go-live')) return FEED_HOME;
  if (path.startsWith('/create') || path.startsWith('/upload')) return FEED_HOME;
  return FEED_HOME;
}
