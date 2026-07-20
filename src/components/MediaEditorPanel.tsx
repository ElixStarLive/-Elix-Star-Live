import React, { useState } from 'react';
import { X } from 'lucide-react';

export type EditorTab = 'filters' | 'effects' | 'text' | 'stickers';

export type FilterPreset = { id: string; label: string; css: string };

/** Color-grade presets (Filters tab). */
export const FILTER_PRESETS: FilterPreset[] = [
  { id: 'none', label: 'Normal', css: '' },
  { id: 'vivid', label: 'Vivid', css: 'saturate(1.5) contrast(1.1)' },
  { id: 'warm', label: 'Warm', css: 'sepia(0.25) saturate(1.3) brightness(1.05)' },
  { id: 'cool', label: 'Cool', css: 'hue-rotate(-12deg) saturate(1.2) brightness(1.02)' },
  { id: 'mono', label: 'Mono', css: 'grayscale(1) contrast(1.05)' },
  { id: 'sepia', label: 'Sepia', css: 'sepia(0.75)' },
  { id: 'fade', label: 'Fade', css: 'contrast(0.9) brightness(1.1) saturate(0.85)' },
  { id: 'bright', label: 'Bright', css: 'brightness(1.15) saturate(1.1)' },
];

/** Stylized looks (Effects tab) — also implemented as CSS filter chains. */
export const EFFECT_PRESETS: FilterPreset[] = [
  { id: 'none', label: 'None', css: '' },
  { id: 'noir', label: 'Noir', css: 'grayscale(1) contrast(1.35) brightness(0.95)' },
  { id: 'dreamy', label: 'Dreamy', css: 'blur(0.6px) brightness(1.12) saturate(1.15)' },
  { id: 'glow', label: 'Glow', css: 'brightness(1.2) saturate(1.4) contrast(0.95)' },
  { id: 'vintage', label: 'Vintage', css: 'sepia(0.4) contrast(1.15) saturate(1.2)' },
  { id: 'cold', label: 'Cold', css: 'hue-rotate(-25deg) saturate(1.3) contrast(1.1)' },
  { id: 'sharp', label: 'Sharp', css: 'contrast(1.3) saturate(1.2)' },
  { id: 'invert', label: 'Invert', css: 'invert(1) hue-rotate(180deg)' },
];

const TEXT_COLORS = ['#FFFFFF', '#000000', '#F12C56', '#C9A227', '#00C2BE', '#7B5CFF', '#22C55E', '#F59E0B'];

const STICKERS = ['❤️', '🔥', '😂', '😍', '🎉', '⭐', '👑', '💎', '🌸', '✨', '💯', '🙌', '😎', '🥳', '💕', '🎶', '👀', '🤩', '💰', '🏆'];

type Props = {
  tab: EditorTab;
  activeFilterId: string;
  activeEffectId: string;
  onSelectFilter: (preset: FilterPreset) => void;
  onSelectEffect: (preset: FilterPreset) => void;
  onAddText: (text: string, color: string) => void;
  onAddSticker: (emoji: string) => void;
  onClose: () => void;
};

export default function MediaEditorPanel({
  tab,
  activeFilterId,
  activeEffectId,
  onSelectFilter,
  onSelectEffect,
  onAddText,
  onAddSticker,
  onClose,
}: Props) {
  const [textValue, setTextValue] = useState('');
  const [textColor, setTextColor] = useState(TEXT_COLORS[0]);

  const title =
    tab === 'filters' ? 'Filters' : tab === 'effects' ? 'Effects' : tab === 'text' ? 'Add text' : 'Stickers';

  const submitText = () => {
    const v = textValue.trim();
    if (!v) return;
    onAddText(v, textColor);
    setTextValue('');
    onClose();
  };

  return (
    <div className="absolute inset-x-0 bottom-0 z-[120] pointer-events-auto" role="dialog" aria-label={title}>
      <div className="mx-auto w-full max-w-md rounded-t-2xl bg-[#111111]/95 backdrop-blur-md border-t border-white/10 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+14px)]">
        <div className="flex items-center justify-between mb-3">
          <span className="text-white text-sm font-semibold">{title}</span>
          <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center" aria-label="Close">
            <X size={18} className="text-white/80" />
          </button>
        </div>

        {tab === 'filters' && (
          <div className="flex gap-2.5 overflow-x-auto pb-1">
            {FILTER_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onSelectFilter(p)}
                className={`shrink-0 px-3 py-2 rounded-xl text-xs font-semibold border ${activeFilterId === p.id ? 'bg-[#C9A227] text-black border-[#C9A227]' : 'bg-white/5 text-white/80 border-white/10'}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        )}

        {tab === 'effects' && (
          <div className="flex gap-2.5 overflow-x-auto pb-1">
            {EFFECT_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onSelectEffect(p)}
                className={`shrink-0 px-3 py-2 rounded-xl text-xs font-semibold border ${activeEffectId === p.id ? 'bg-[#C9A227] text-black border-[#C9A227]' : 'bg-white/5 text-white/80 border-white/10'}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        )}

        {tab === 'text' && (
          <div>
            <input
              value={textValue}
              onChange={(e) => setTextValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submitText(); }}
              placeholder="Type your text..."
              maxLength={120}
              autoFocus
              className="w-full bg-white/10 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-[#C9A227]/60 placeholder:text-white/30"
            />
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              {TEXT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setTextColor(c)}
                  aria-label={`Color ${c}`}
                  className={`w-7 h-7 rounded-full border-2 ${textColor === c ? 'border-[#C9A227]' : 'border-white/20'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
              <button
                type="button"
                onClick={submitText}
                className="ml-auto px-4 py-2 rounded-full bg-[#C9A227] text-black text-xs font-bold active:scale-95 transition-transform"
              >
                Add
              </button>
            </div>
          </div>
        )}

        {tab === 'stickers' && (
          <div className="grid grid-cols-6 gap-2 max-h-44 overflow-y-auto">
            {STICKERS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => { onAddSticker(s); onClose(); }}
                className="aspect-square rounded-xl bg-white/5 flex items-center justify-center text-2xl active:scale-90 transition-transform"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
