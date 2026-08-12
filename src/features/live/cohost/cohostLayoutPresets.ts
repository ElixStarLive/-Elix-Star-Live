/**
 * Co-host stage layout presets — square frame tiles, host-chosen, synced via cohost_layout_sync.
 */

const COHOST_LAYOUT_IDS = [
  'solo_big',
  'big_left_stack',
  'two_top_eight',
  'banner_eight',
  'grid_3x3',
  'columns_center',
] as const;

export type CohostLayoutId = (typeof COHOST_LAYOUT_IDS)[number];

export const DEFAULT_COHOST_LAYOUT_ID: CohostLayoutId = 'big_left_stack';

export type CohostLayoutPreset = {
  id: CohostLayoutId;
  label: string;
  /** Guest seat slots (Add / co-host), excluding the main host pane where applicable. */
  guestSlots: number;
};

export const COHOST_LAYOUT_PRESETS: CohostLayoutPreset[] = [
  { id: 'solo_big', label: 'Solo', guestSlots: 0 },
  /** Classic 1 big + 8 seats — default co-host stage. */
  { id: 'big_left_stack', label: 'Normal', guestSlots: 8 },
  { id: 'two_top_eight', label: 'Two + eight', guestSlots: 9 },
  { id: 'banner_eight', label: 'Banner + eight', guestSlots: 8 },
  { id: 'grid_3x3', label: '3×3', guestSlots: 8 },
  { id: 'columns_center', label: 'Columns', guestSlots: 8 },
];

export function parseCohostLayoutId(raw: unknown): CohostLayoutId | null {
  if (typeof raw !== 'string') return null;
  return (COHOST_LAYOUT_IDS as readonly string[]).includes(raw)
    ? (raw as CohostLayoutId)
    : null;
}

/** Mini wireframe cells for the chooser thumbnails (host pane = 'h', seat = 's'). */
export type CohostLayoutThumbCell =
  | { kind: 'h'; area: string }
  | { kind: 's'; area: string };

function seatGridCells(
  rowStart: number,
  rows: number,
  cols: number,
): CohostLayoutThumbCell[] {
  const cells: CohostLayoutThumbCell[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const rs = rowStart + r;
      const cs = c + 1;
      cells.push({ kind: 's', area: `${rs} / ${cs} / ${rs + 1} / ${cs + 1}` });
    }
  }
  return cells;
}

export const COHOST_LAYOUT_THUMBS: Record<
  CohostLayoutId,
  { grid: string; cells: CohostLayoutThumbCell[] }
> = {
  solo_big: {
    grid: '1fr / 1fr',
    cells: [{ kind: 'h', area: '1 / 1 / 2 / 2' }],
  },
  big_left_stack: {
    grid: 'repeat(4, 1fr) / 1.2fr 0.55fr 0.55fr',
    cells: [
      { kind: 'h', area: '1 / 1 / 5 / 2' },
      { kind: 's', area: '1 / 2 / 2 / 3' },
      { kind: 's', area: '1 / 3 / 2 / 4' },
      { kind: 's', area: '2 / 2 / 3 / 3' },
      { kind: 's', area: '2 / 3 / 3 / 4' },
      { kind: 's', area: '3 / 2 / 4 / 3' },
      { kind: 's', area: '3 / 3 / 4 / 4' },
      { kind: 's', area: '4 / 2 / 5 / 3' },
      { kind: 's', area: '4 / 3 / 5 / 4' },
    ],
  },
  two_top_eight: {
    grid: '1.1fr repeat(2, 0.7fr) / repeat(4, 1fr)',
    cells: [
      { kind: 'h', area: '1 / 1 / 2 / 3' },
      { kind: 's', area: '1 / 3 / 2 / 5' },
      ...seatGridCells(2, 2, 4),
    ],
  },
  banner_eight: {
    grid: '1fr repeat(2, 0.75fr) / repeat(4, 1fr)',
    cells: [
      { kind: 'h', area: '1 / 1 / 2 / 5' },
      ...seatGridCells(2, 2, 4),
    ],
  },
  grid_3x3: {
    grid: 'repeat(3, 1fr) / repeat(3, 1fr)',
    cells: [
      { kind: 's', area: '1 / 1 / 2 / 2' },
      { kind: 's', area: '1 / 2 / 2 / 3' },
      { kind: 's', area: '1 / 3 / 2 / 4' },
      { kind: 's', area: '2 / 1 / 3 / 2' },
      { kind: 'h', area: '2 / 2 / 3 / 3' },
      { kind: 's', area: '2 / 3 / 3 / 4' },
      { kind: 's', area: '3 / 1 / 4 / 2' },
      { kind: 's', area: '3 / 2 / 4 / 3' },
      { kind: 's', area: '3 / 3 / 4 / 4' },
    ],
  },
  columns_center: {
    grid: 'repeat(4, 1fr) / 0.7fr 1.2fr 0.7fr',
    cells: [
      { kind: 's', area: '1 / 1 / 2 / 2' },
      { kind: 's', area: '2 / 1 / 3 / 2' },
      { kind: 's', area: '3 / 1 / 4 / 2' },
      { kind: 's', area: '4 / 1 / 5 / 2' },
      { kind: 'h', area: '1 / 2 / 5 / 3' },
      { kind: 's', area: '1 / 3 / 2 / 4' },
      { kind: 's', area: '2 / 3 / 3 / 4' },
      { kind: 's', area: '3 / 3 / 4 / 4' },
      { kind: 's', area: '4 / 3 / 5 / 4' },
    ],
  },
};

