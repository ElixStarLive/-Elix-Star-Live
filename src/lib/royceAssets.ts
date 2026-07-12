/** New ROYCE-style assets — gold on black, not legacy /Icons/ PNGs. */
export const ROYCE_DEFAULT_AVATAR = '/royce/default-avatar.svg';
export const ROYCE_ELIX_MARK = '/royce/elix-mark.svg';
export const ROYCE_MEMBERSHIP = '/royce/membership.svg';

/** Colored initials avatar when no photo URL is available (ui-avatars). */
export function resolveUiAvatarUrl(
  avatar: string | null | undefined,
  name: string | null | undefined,
  sizePx = 128,
): string {
  const direct = typeof avatar === 'string' ? avatar.trim() : '';
  if (direct) return direct;
  const label = String(name || 'User').trim() || 'User';
  const size = Math.max(64, Math.round(sizePx));
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(label)}&background=random&color=ffffff&size=${size}`;
}
