/** New ROYCE-style assets — gold on black, not legacy /Icons/ PNGs. */
/** Owner brand mark — use instead of yellow/random ui-avatars. */
export const ELIX_LOGO = '/elix-logo.png';

/** Avatar URL, or Elix logo when no photo (never yellow ui-avatars). */
export function resolveUiAvatarUrl(
  avatar: string | null | undefined,
  _name?: string | null | undefined,
  _sizePx = 128,
): string {
  const direct = typeof avatar === 'string' ? avatar.trim() : '';
  if (direct) return direct;
  return ELIX_LOGO;
}
