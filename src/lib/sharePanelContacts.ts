import { request } from './apiClient';
import { isGenuineAppUser } from './genuineUser';

/** Horizontal share strip — round avatar diameter (Create + users). +2mm vs prior 28px. */
export const SHARE_PANEL_AVATAR_PX = 36;
/** Column width for each Create / user chip. */
export const SHARE_PANEL_ITEM_WIDTH_PX = 48;
/** Plus overlay on the Create chip. */
export const SHARE_PANEL_PLUS_PX = 10;
/** Gold glow disc behind WhatsApp / Copy / etc. in share grids. +2mm vs prior 32px. */
export const SHARE_PANEL_ACTION_DISC_PX = 40;
/** Glyph size inside share action discs. */
export const SHARE_PANEL_ACTION_ICON_PX = 22;

/** One row for the horizontal “Share to” avatar strip (Create + users). */
export type SharePanelContact = {
  user_id: string;
  username: string;
  avatar_url: string | null;
};

/** @deprecated use isGenuineAppUser — kept for existing imports */
export function isRealShareContact(username: string, userId = ''): boolean {
  return isGenuineAppUser(username, userId);
}

/**
 * Share contacts — owner allowlist only (real named accounts).
 * See isGenuineAppUser.
 */
export async function fetchAllSharePanelContacts(
  excludeUserId: string | undefined,
): Promise<SharePanelContact[]> {
  try {
    const { data, error } = await request<{ profiles: Record<string, unknown>[] }>('/api/profiles');
    if (error) throw new Error('Failed to load profiles');
    const list = Array.isArray(data?.profiles) ? data.profiles : [];
    const dedup = new Map<string, SharePanelContact>();

    for (const p of list) {
      const user_id = String(p.user_id ?? p.id ?? '').trim();
      if (!user_id || user_id === excludeUserId) continue;

      const rawUsername = String(p.username ?? '').trim();
      const rawDisplay = String(p.display_name ?? p.displayName ?? '').trim();
      if (!isGenuineAppUser(rawUsername, user_id, rawDisplay)) continue;

      const label = rawDisplay || rawUsername;
      if (!label) continue;

      dedup.set(user_id, {
        user_id,
        username: label,
        avatar_url:
          p.avatar_url != null
            ? String(p.avatar_url)
            : p.avatarUrl != null
              ? String(p.avatarUrl)
              : null,
      });
    }

    return Array.from(dedup.values());
  } catch {
    return [];
  }
}
