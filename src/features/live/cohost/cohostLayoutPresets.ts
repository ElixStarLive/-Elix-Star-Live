/**
 * Co-host stage is locked to host on the big pane + 8 seats on the right.
 * layoutId is still sent on cohost_layout_sync for seat/featured presentation.
 */
export const DEFAULT_COHOST_LAYOUT_ID = 'big_left_stack' as const;
export type CohostLayoutId = typeof DEFAULT_COHOST_LAYOUT_ID;
