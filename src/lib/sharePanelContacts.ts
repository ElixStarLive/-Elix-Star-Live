import { request } from './apiClient';

/** One row for the horizontal “Share to” avatar strip (Create + users). */
export type SharePanelContact = {
  user_id: string;
  username: string;
  avatar_url: string | null;
};

/**
 * All platform profiles for share panels (same source as Spectator watch share).
 * Excludes the current user when `excludeUserId` is set.
 */
export async function fetchAllSharePanelContacts(excludeUserId: string | undefined): Promise<SharePanelContact[]> {
  try {
    const { data, error } = await request<{ profiles: Record<string, unknown>[] }>('/api/profiles');
    if (error) throw new Error('Failed to load profiles');
    const list = Array.isArray(data?.profiles) ? data.profiles : [];
    const mapped = list
      .map((p: Record<string, unknown>) => ({
        user_id: String(p.user_id ?? p.id ?? ''),
        username: String(p.display_name ?? p.username ?? 'User'),
        avatar_url: p.avatar_url != null ? String(p.avatar_url) : null,
      }))
      .filter((p: SharePanelContact) => !!p.user_id && p.user_id !== excludeUserId);
    const dedup = new Map<string, SharePanelContact>();
    for (const p of mapped) dedup.set(p.user_id, p);
    return Array.from(dedup.values());
  } catch {
    return [];
  }
}
