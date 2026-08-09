import type { CohostLayoutId } from './cohostLayoutPresets';
import { COHOST_LAYOUT_THUMBS } from './cohostLayoutPresets';

export type CohostSeatSlot =
  | { type: 'live' | 'invited' | 'pending' | 'empty'; host?: { id: string; userId: string; name: string; avatar: string; status: string; isMuted?: boolean } }
  | { type: 'self' }
  | { type: 'host_main' };

/** Build up to 8 guest slots (live → invited/pending → empty). */
export function buildGuestSlots<T extends { userId: string; status: string }>(
  list: T[],
  max = 8,
): Array<{ type: 'live' | 'invited' | 'pending' | 'empty'; host?: T }> {
  const live = list.filter((h) => h.status === 'live' || h.status === 'accepted');
  const invitedPending = list.filter((h) => h.status === 'invited' || h.status === 'pending_accept');
  const slots: Array<{ type: 'live' | 'invited' | 'pending' | 'empty'; host?: T }> = [];
  live.forEach((h) => slots.push({ type: 'live', host: h }));
  invitedPending.forEach((h) =>
    slots.push({ type: h.status === 'invited' ? 'invited' : 'pending', host: h }),
  );
  while (slots.length < max) slots.push({ type: 'empty' });
  return slots.slice(0, max);
}

/** Whether this layout uses the classic left-host + right 2×4 stack. */
export function isClassicStackLayout(layoutId: CohostLayoutId): boolean {
  return layoutId === 'big_left_stack' || layoutId === 'solo_big';
}

export function cohostLayoutThumb(layoutId: CohostLayoutId) {
  return COHOST_LAYOUT_THUMBS[layoutId];
}
