/** New ROYCE-style assets — gold on black, not legacy /Icons/ PNGs. */
export const ROYCE_DEFAULT_AVATAR = '/royce/default-avatar.svg';
export const ROYCE_ELIX_MARK = '/royce/elix-mark.svg';
export const ROYCE_MEMBERSHIP = '/royce/membership.svg';
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
