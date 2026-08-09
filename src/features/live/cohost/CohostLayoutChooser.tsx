import React from 'react';
import {
  COHOST_LAYOUT_PRESETS,
  COHOST_LAYOUT_THUMBS,
  type CohostLayoutId,
} from './cohostLayoutPresets';

type Props = {
  value: CohostLayoutId;
  onChange: (id: CohostLayoutId) => void;
};

/** Horizontal wireframe picker — host chooses co-host stage layout. */
export function CohostLayoutChooser({ value, onChange }: Props) {
  return (
    <div className="mb-3 flex-shrink-0">
      <p className="text-white/50 text-[10px] font-bold uppercase tracking-wider mb-1.5 px-0.5">
        Layout
      </p>
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
        {COHOST_LAYOUT_PRESETS.map((preset) => {
          const thumb = COHOST_LAYOUT_THUMBS[preset.id];
          const selected = value === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              title={preset.label}
              aria-label={preset.label}
              aria-pressed={selected}
              onClick={() => onChange(preset.id)}
              className={`flex-shrink-0 w-[52px] h-[78px] rounded-[14px] p-1.5 flex flex-col items-stretch justify-center transition-transform active:scale-95 ${
                selected
                  ? 'bg-white/10 ring-2 ring-[#F5F5F7] ring-offset-1 ring-offset-black/40'
                  : 'bg-white/[0.04] ring-1 ring-white/15'
              }`}
            >
              <div
                className="flex-1 w-full min-h-0 grid"
                style={{ gridTemplate: thumb.grid, gap: '2px' }}
                aria-hidden
              >
                {thumb.cells.map((cell, i) => (
                  <div
                    key={`${preset.id}-${i}`}
                    className={`elix-cohost-pill min-h-0 ${
                      cell.kind === 'h' ? 'bg-[#C8CDD5]/70' : 'bg-[#C8CDD5]/35'
                    }`}
                    style={{ gridArea: cell.area }}
                  />
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
