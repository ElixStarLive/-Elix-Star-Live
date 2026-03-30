import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { request } from '../lib/apiClient';

type SafetyStore = {
  blockedUserIds: string[];
  blockUser: (userId: string) => void;
  unblockUser: (userId: string) => void;
  isBlocked: (userId: string) => boolean;
};

export const useSafetyStore = create<SafetyStore>()(
  persist(
    (set, get) => ({
      blockedUserIds: [],
      blockUser: (userId) => {
        const id = userId.trim();
        if (!id) return;
        const current = get().blockedUserIds;
        if (current.includes(id)) return;
        set({ blockedUserIds: [...current, id] });
        request('/api/block-user', {
          method: 'POST',
          body: JSON.stringify({ blockedUserId: id }),
        }).catch(() => {});
      },
      unblockUser: (userId) => {
        const id = userId.trim();
        if (!id) return;
        set({ blockedUserIds: get().blockedUserIds.filter((x) => x !== id) });
        request('/api/unblock-user', {
          method: 'POST',
          body: JSON.stringify({ blockedUserId: id }),
        }).catch(() => {});
      },
      isBlocked: (userId) => {
        const id = userId.trim();
        if (!id) return false;
        return get().blockedUserIds.includes(id);
      },
    }),
    { name: 'elix_safety_v1' }
  )
);

