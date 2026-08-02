import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { apiBlockUser, apiUnblockUser } from '../features/safety/safetyApi';

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
    }),
    { name: 'elix_safety_v1' }
  )
);

