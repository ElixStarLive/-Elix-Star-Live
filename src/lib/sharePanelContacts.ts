import { request } from './apiClient';

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

const JUNK_EXACT = new Set([
  '',
  'user',
  'demo',
  'test',
  'testuser',
  'unknown',
  'anonymous',
  'guest',
  'viewer',
  'live',
]);

/** Drop LiveKit / test / ephemeral labels — share strip is real accounts only. */
export function isRealShareContact(username: string, userId = ''): boolean {
  const name = String(username || '').trim().toLowerCase();
  const id = String(userId || '').trim().toLowerCase();
  if (!id || name.length < 2) return false;
  if (JUNK_EXACT.has(name)) return false;
  // lt_1784… LiveKit-style junk, user_*, test*, guest*, live_*
  if (/^(lt|live|guest|viewer|test|user)[_-]/.test(name)) return false;
  if (/^testuser/.test(name)) return false;
  if (/^user[_-]/.test(name)) return false;
  // UUID / hex dump used as a display name
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-/.test(name)) return false;
  if (/^[0-9a-f]{16,}$/.test(name)) return false;
  return true;
}

function pickShareLabel(p: Record<string, unknown>): string {
  const username = String(p.username ?? '').trim();
  const display = String(p.display_name ?? p.displayName ?? '').trim();
  if (display && isRealShareContact(display, String(p.user_id ?? p.id ?? ''))) return display;
  if (username) return username;
  return display || 'User';
}

/**
 * Real platform profiles for share panels (Create + feed + live share).
 * Excludes current user, LiveKit junk (lt_*), test/guest/live aliases.
 */
export async function fetchAllSharePanelContacts(excludeUserId: string | undefined): Promise<SharePanelContact[]> {
  try {
    const { data, error } = await request<{ profiles: Record<string, unknown>[] }>('/api/profiles');
    if (error) throw new Error('Failed to load profiles');
    const list = Array.isArray(data?.profiles) ? data.profiles : [];
    const mapped = list
      .map((p: Record<string, unknown>) => {
        const user_id = String(p.user_id ?? p.id ?? '');
        const rawUsername = String(p.username ?? '').trim();
        const rawDisplay = String(p.display_name ?? p.displayName ?? '').trim();
        return {
          user_id,
          rawUsername,
          rawDisplay,
          username: pickShareLabel(p),
          avatar_url:
            p.avatar_url != null
              ? String(p.avatar_url)
              : p.avatarUrl != null
                ? String(p.avatarUrl)
                : null,
        };
      })
      .filter((p) => {
        if (!p.user_id || p.user_id === excludeUserId) return false;
        // Both handle and display must pass — blocks lt_* even if display looks fine.
        const handleOk = !p.rawUsername || isRealShareContact(p.rawUsername, p.user_id);
        const displayOk = !p.rawDisplay || isRealShareContact(p.rawDisplay, p.user_id);
        return handleOk && displayOk && isRealShareContact(p.username, p.user_id);
      })
      .map(({ user_id, username, avatar_url }) => ({ user_id, username, avatar_url }));
    const dedup = new Map<string, SharePanelContact>();
    for (const p of mapped) dedup.set(p.user_id, p);
    return Array.from(dedup.values());
  } catch {
    return [];
  }
}
