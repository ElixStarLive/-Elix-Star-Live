import type { CohostLayoutId } from './cohostLayoutPresets';

export type CohostSeatSlot =
  | { type: 'live' | 'invited' | 'pending' | 'empty'; host?: { id: string; userId: string; name: string; avatar: string; status: string; isMuted?: boolean } }
  | { type: 'self' }
  | { type: 'host_main' };

/** Whether this layout uses the classic left-host + right 2×4 stack. */
export function isClassicStackLayout(layoutId: CohostLayoutId): boolean {
  return layoutId === 'big_left_stack' || layoutId === 'solo_big';
}
