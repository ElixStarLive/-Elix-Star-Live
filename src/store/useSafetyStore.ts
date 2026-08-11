import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  apiBlockUser,
  apiListBlockedUsers,
  apiUnblockUser,
} from '../features/safety/safetyApi';
import { reportFailure } from '../lib/reportFailure';

type SafetyStore = {
  blockedUserIds: string[];
  blockUser: (userId: string) => void;
  unblockUser: (userId: string) => void;
  isBlocked: (userId: string) => boolean;
  /** Sync blocked ids from server (call after login). */
  hydrateBlockedFromServer: () => Promise<void>;
};

function purgeCreatorFromFeeds(userId: string) {
  // Lazy import avoids circular init with useVideoStore.
  void import('./useVideoStore').then(({ useVideoStore }) => {
    useVideoStore.getState().removeVideosByCreator(userId);
  });
}

export const useSafetyStore = create<SafetyStore>()(
  persist(
    (set, get) => ({
      blockedUserIds: [],
      blockUser: (userId) => {
        const id = userId.trim();
        if (!id) return;
        const current = get().blockedUserIds;
        if (current.includes(id)) {
          purgeCreatorFromFeeds(id);
          return;
        }
        set({ blockedUserIds: [...current, id] });
        purgeCreatorFromFeeds(id);
        apiBlockUser(id).then((res) => {
          if (!res.ok) {
            set({ blockedUserIds: get().blockedUserIds.filter((x) => x !== id) });
          }
        }).catch(() => {
          set({ blockedUserIds: get().blockedUserIds.filter((x) => x !== id) });
        });
      },
      unblockUser: (userId) => {
        const id = userId.trim();
        if (!id) return;
        const prev = get().blockedUserIds;
        set({ blockedUserIds: prev.filter((x) => x !== id) });
        apiUnblockUser(id).then((res) => {
          if (!res.ok) {
            set({ blockedUserIds: [...get().blockedUserIds, id] });
          }
        }).catch(() => {
          set({ blockedUserIds: [...get().blockedUserIds, id] });
        });
      },
      isBlocked: (userId) => {
        const id = userId.trim();
        if (!id) return false;
        return get().blockedUserIds.includes(id);
      },
      hydrateBlockedFromServer: async () => {
        try {
          const { rows, error } = await apiListBlockedUsers();
          if (error) {
            reportFailure('safety_hydrate_blocked', error);
            return;
          }
          const ids = rows
            .map((r) =>
              String(
                (r as { blocked_user_id?: string; blockedUserId?: string }).blocked_user_id ||
                  (r as { blockedUserId?: string }).blockedUserId ||
                  '',
              ).trim(),
            )
            .filter(Boolean);
          const unique = Array.from(new Set(ids));
          set({ blockedUserIds: unique });
          for (const id of unique) purgeCreatorFromFeeds(id);
        } catch (err) {
          reportFailure('safety_hydrate_blocked', err);
          /* keep persisted local list */
        }
      },
    }),
    { name: 'elix_safety_v1' }
  )
);
