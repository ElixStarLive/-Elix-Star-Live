import type { CohostLayoutId } from './cohostLayoutPresets';

/** Whether this layout uses the classic left-host + right 2×4 stack. */
export function isClassicStackLayout(layoutId: CohostLayoutId): boolean {
  return layoutId === 'big_left_stack' || layoutId === 'solo_big';
}
