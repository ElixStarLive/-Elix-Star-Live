/**
 * Canonical exits for the Settings ↔ Engagement ↔ Profile tree.
 *
 * - Settings close → Profile (replace) so Settings is not left under Profile in history
 * - Engagement Hub close → Settings (replace)
 * - Profile close → For You (/feed) — never history.back()
 * - Settings subpages → Settings home
 * - Engagement subpages → Engagement home
 */
export const SETTINGS_HOME = '/settings';
export const SETTINGS_EXIT_TO = '/profile';
export const ENGAGEMENT_HOME = '/engagement';
export const PROFILE_EXIT_TO = '/feed';
