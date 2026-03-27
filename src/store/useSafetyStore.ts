import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
      },
      unblockUser: (userId) => {
        const id = userId.trim();
        if (!id) return;
        set({ blockedUserIds: get().blockedUserIds.filter((x) => x !== id) });
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

