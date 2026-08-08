import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const MAX_QTY = 99;

/** A shop line in the basket — same listing can have quantity > 1. */
export interface CartItem {
  id: string;
  title: string;
  price: number;
  image_url: string | null;
  quantity: number;
}

interface CartState {
  items: CartItem[];
  add: (item: Omit<CartItem, 'quantity'> & { quantity?: number }) => void;
  remove: (id: string) => void;
  setQuantity: (id: string, quantity: number) => void;
  clear: () => void;
  has: (id: string) => boolean;
  totalUnits: () => number;
}

function clampQty(n: unknown): number {
  const q = Math.floor(Number(n));
  if (!Number.isFinite(q) || q < 1) return 1;
  return Math.min(MAX_QTY, q);
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      add: (item) =>
        set((state) => {
          const addQty = clampQty(item.quantity ?? 1);
          const existing = state.items.find((i) => i.id === item.id);
          if (existing) {
            return {
              items: state.items.map((i) =>
                i.id === item.id
                  ? { ...i, quantity: clampQty(i.quantity + addQty) }
                  : i,
              ),
            };
          }
          return {
            items: [
              ...state.items,
              {
                id: item.id,
                title: item.title,
                price: item.price,
                image_url: item.image_url,
                quantity: addQty,
              },
            ],
          };
        }),
      remove: (id) => set((state) => ({ items: state.items.filter((i) => i.id !== id) })),
      setQuantity: (id, quantity) =>
        set((state) => {
          const q = Math.floor(Number(quantity));
          if (!Number.isFinite(q) || q < 1) {
            return { items: state.items.filter((i) => i.id !== id) };
          }
          const next = Math.min(MAX_QTY, q);
          return {
            items: state.items.map((i) => (i.id === id ? { ...i, quantity: next } : i)),
          };
        }),
      clear: () => set({ items: [] }),
      has: (id) => get().items.some((i) => i.id === id),
      totalUnits: () => get().items.reduce((sum, i) => sum + clampQty(i.quantity), 0),
    }),
    {
      name: 'elix_cart_v1',
      version: 2,
      migrate: (persisted, version) => {
        const raw = (persisted && typeof persisted === 'object'
          ? (persisted as { items?: unknown }).items
          : null) as Array<Record<string, unknown>> | null;
        if (!Array.isArray(raw)) return { items: [] };
        if (version >= 2) {
          return {
            items: raw.map((i) => ({
              id: String(i.id ?? ''),
              title: String(i.title ?? ''),
              price: Number(i.price) || 0,
              image_url: (i.image_url as string | null) ?? null,
              quantity: clampQty(i.quantity),
            })).filter((i) => i.id),
          };
        }
        return {
          items: raw.map((i) => ({
            id: String(i.id ?? ''),
            title: String(i.title ?? ''),
            price: Number(i.price) || 0,
            image_url: (i.image_url as string | null) ?? null,
            quantity: 1,
          })).filter((i) => i.id),
        };
      },
    },
  ),
);
