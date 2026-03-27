import { create } from 'zustand';

export type LivePromoType = 'live' | 'battle';

export type LivePromo = {
  type: LivePromoType;
  streamId: string;
  likes: number;
  createdAt: number;
};

type LivePromoState = {
  promoLive: LivePromo | null;
  promoBattle: LivePromo | null;
  setPromo: (promo: LivePromo) => void;
  clearPromo: (type: LivePromoType) => void;
};

export const useLivePromoStore = create<LivePromoState>((set) => ({
  promoLive: null,
  promoBattle: null,
  setPromo: (promo) =>
    set((state) => {
      if (promo.type === 'battle') {
        const prev = state.promoBattle;
        if (prev && prev.streamId === promo.streamId && prev.likes >= promo.likes) return state;
        return { ...state, promoBattle: promo };
      }
      const prev = state.promoLive;
      if (prev && prev.streamId === promo.streamId && prev.likes >= promo.likes) return state;
      return { ...state, promoLive: promo };
    }),
  clearPromo: (type) =>
    set((state) => (type === 'battle' ? { ...state, promoBattle: null } : { ...state, promoLive: null })),
}));

