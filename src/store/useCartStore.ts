import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** A single shop item in the basket. Shop listings are unique (single quantity), so each id appears once. */
export interface CartItem {
  id: string;
  title: string;
  price: number;
  image_url: string | null;
}

interface CartState {
  items: CartItem[];
  add: (item: CartItem) => void;
  remove: (id: string) => void;
  clear: () => void;
  has: (id: string) => boolean;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      add: (item) =>
        set((state) =>
          state.items.some((i) => i.id === item.id)
            ? state
            : { items: [...state.items, item] },
        ),
      remove: (id) => set((state) => ({ items: state.items.filter((i) => i.id !== id) })),
      clear: () => set({ items: [] }),
      has: (id) => get().items.some((i) => i.id === id),
    }),
    {
      name: 'elix_cart_v1',
      version: 1,
    },
  ),
);
