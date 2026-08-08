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

type ProfileRow = {
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
};

function toContact(row: ProfileRow): SharePanelContact | null {
  const user_id = String(row.user_id || '').trim();
  const username = String(row.username || '').trim();
  const display = String(row.display_name || '').trim();
  if (!isGenuineAppUser(username, user_id, display)) return null;
  const label = display && isGenuineAppUser(display, user_id, display) ? display : username;
  if (!label) return null;
  return {
    user_id,
    username: label,
    avatar_url: row.avatar_url != null ? String(row.avatar_url) : null,
  };
}

async function fetchFollowerProfiles(userId: string): Promise<ProfileRow[]> {
  const { data, error } = await request<{ follower_profiles?: ProfileRow[] }>(
    `/api/profiles/${encodeURIComponent(userId)}/followers`,
  );
  if (error) return [];
  return Array.isArray(data?.follower_profiles) ? data.follower_profiles : [];
}

async function fetchFollowingProfiles(userId: string): Promise<ProfileRow[]> {
  const { data, error } = await request<{ following?: string[] }>(
    `/api/profiles/${encodeURIComponent(userId)}/following`,
  );
  if (error) return [];
  const ids = Array.isArray(data?.following) ? data.following.map(String) : [];
  if (ids.length === 0) return [];

  // Resolve from directory once, then keep only following ids (never dump whole directory to UI).
  const { data: dir, error: dirErr } = await request<{ profiles?: Record<string, unknown>[] }>(
    '/api/profiles',
  );
  if (dirErr) return [];
  const list = Array.isArray(dir?.profiles) ? dir.profiles : [];
  const byId = new Map<string, ProfileRow>();
  for (const p of list) {
    const id = String(p.user_id ?? p.id ?? '');
    if (!id) continue;
    byId.set(id, {
      user_id: id,
      username: String(p.username ?? ''),
      display_name:
        p.display_name != null
          ? String(p.display_name)
          : p.displayName != null
            ? String(p.displayName)
            : null,
      avatar_url:
        p.avatar_url != null
          ? String(p.avatar_url)
          : p.avatarUrl != null
            ? String(p.avatarUrl)
            : null,
    });
  }
  return ids.slice(0, 200).map((id) => {
    const hit = byId.get(id);
    if (hit) return hit;
    return { user_id: id, username: '', display_name: null, avatar_url: null };
  });
}

/**
 * Share strip contacts = people you follow + people who follow you.
 * Never the full /api/profiles dump (that was filling Share with explore/John Doe/test junk).
 */
export async function fetchAllSharePanelContacts(
  excludeUserId: string | undefined,
): Promise<SharePanelContact[]> {
  if (!excludeUserId) return [];
  try {
    const [followers, following] = await Promise.all([
      fetchFollowerProfiles(excludeUserId),
      fetchFollowingProfiles(excludeUserId),
    ]);
    const dedup = new Map<string, SharePanelContact>();
    for (const row of [...followers, ...following]) {
      if (!row?.user_id || row.user_id === excludeUserId) continue;
      const contact = toContact(row);
      if (contact) dedup.set(contact.user_id, contact);
    }
    return Array.from(dedup.values());
  } catch {
    return [];
  }
}
