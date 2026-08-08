import React, { useState } from 'react';
import { X } from 'lucide-react';

export type EditorTab = 'filters' | 'effects' | 'text' | 'stickers';

/** Optional canvas / preview FX layer baked with the grade. */
export type StoryFxKind =
  | 'beauty'
  | 'glow'
  | 'golden'
  | 'cinematic'
  | 'neon'
  | 'clarity'
  | 'blush'
  | 'frost'
  | 'aura';

export type FilterPreset = {
  id: string;
  label: string;
  css: string;
  fx?: StoryFxKind | null;
};

/** Modern color grades (Filters tab) — creator-app looks, not vintage camera kits. */
export const FILTER_PRESETS: FilterPreset[] = [
  { id: 'none', label: 'Original', css: '' },
  { id: 'clean', label: 'Clean', css: 'contrast(1.08) brightness(1.04) saturate(1.06)' },
  { id: 'vivid', label: 'Vivid', css: 'saturate(1.45) contrast(1.12) brightness(1.03)' },
  { id: 'golden', label: 'Golden', css: 'saturate(1.28) contrast(1.08) brightness(1.06) sepia(0.08)' },
  { id: 'cool', label: 'Ice', css: 'saturate(1.05) contrast(1.12) brightness(1.03) hue-rotate(-14deg)' },
  { id: 'bold', label: 'Bold', css: 'contrast(1.22) saturate(1.25) brightness(0.98)' },
  { id: 'soft', label: 'Soft', css: 'brightness(1.1) contrast(0.94) saturate(1.12)' },
  { id: 'night', label: 'Night', css: 'brightness(0.88) contrast(1.2) saturate(1.15) hue-rotate(8deg)' },
];

/**
 * Story Effects — modern Reels/TikTok-style looks.
 * CSS grade + optional FX layer (glow / wash / vignette) previewed and baked.
 */
export const EFFECT_PRESETS: FilterPreset[] = [
  { id: 'none', label: 'None', css: '', fx: null },
  {
    id: 'beauty',
    label: 'Beauty',
    css: 'brightness(1.1) contrast(0.92) saturate(1.14)',
    fx: 'beauty',
  },
  {
    id: 'glow',
    label: 'Soft Glow',
    css: 'brightness(1.12) contrast(0.94) saturate(1.18)',
    fx: 'glow',
  },
  {
    id: 'blush',
    label: 'Blush',
    css: 'brightness(1.08) contrast(0.95) saturate(1.2)',
    fx: 'blush',
  },
  {
    id: 'golden-hour',
    label: 'Golden Hour',
    css: 'saturate(1.32) contrast(1.08) brightness(1.06)',
    fx: 'golden',
  },
  {
    id: 'cinema',
    label: 'Cinema',
    css: 'saturate(1.35) contrast(1.18) brightness(0.96) hue-rotate(-8deg)',
    fx: 'cinematic',
  },
  {
    id: 'clarity',
    label: 'Clarity',
    css: 'contrast(1.18) brightness(1.03) saturate(1.08)',
    fx: 'clarity',
  },
  {
    id: 'frost',
    label: 'Frost',
    css: 'saturate(0.92) contrast(1.12) brightness(1.05) hue-rotate(-18deg)',
    fx: 'frost',
  },
  {
    id: 'neon-night',
    label: 'Neon Night',
    css: 'saturate(1.55) contrast(1.2) brightness(0.92) hue-rotate(16deg)',
    fx: 'neon',
  },
  {
    id: 'aura',
    label: 'Aura',
    css: 'saturate(1.4) contrast(1.1) brightness(1.02) hue-rotate(22deg)',
    fx: 'aura',
  },
];

const TEXT_COLORS = ['#FFFFFF', '#000000', '#F12C56', '#D8D9DD', '#00C2BE', '#7B5CFF', '#22C55E', '#F59E0B'];

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

/** Live preview wash / glow layer — matches baked FX (no layout chrome). */
export function StoryFxOverlay({ fx }: { fx?: StoryFxKind | null }) {
  if (!fx) return null;

  if (fx === 'beauty' || fx === 'glow') {
    return (
      <div className="absolute inset-0 pointer-events-none z-[9]" aria-hidden>
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse at 50% 32%, rgba(255,236,225,0.28) 0%, rgba(255,210,200,0.1) 42%, transparent 72%)',
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse at center, transparent 40%, rgba(18,10,16,0.32) 100%)',
          }}
        />
      </div>
    );
  }

  if (fx === 'blush') {
    return (
      <div className="absolute inset-0 pointer-events-none z-[9]" aria-hidden>
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse at 50% 45%, rgba(255,140,160,0.22) 0%, rgba(255,180,190,0.08) 50%, transparent 75%)',
            mixBlendMode: 'soft-light',
          }}
        />
      </div>
    );
  }

  if (fx === 'golden') {
    return (
      <div className="absolute inset-0 pointer-events-none z-[9]" aria-hidden>
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(145deg, rgba(255,176,80,0.22) 0%, rgba(255,140,50,0.06) 48%, rgba(255,90,40,0.18) 100%)',
            mixBlendMode: 'soft-light',
          }}
        />
      </div>
    );
  }

  if (fx === 'cinematic') {
    return (
      <div className="absolute inset-0 pointer-events-none z-[9]" aria-hidden>
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, rgba(0,40,55,0.18) 0%, transparent 35%, transparent 65%, rgba(40,15,0,0.22) 100%)',
            mixBlendMode: 'soft-light',
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,0.35) 100%)',
          }}
        />
      </div>
    );
  }

  if (fx === 'clarity') {
    return (
      <div className="absolute inset-0 pointer-events-none z-[9]" aria-hidden>
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse at center, rgba(255,255,255,0.06) 0%, transparent 55%)',
            mixBlendMode: 'overlay',
          }}
        />
      </div>
    );
  }

  if (fx === 'frost') {
    return (
      <div className="absolute inset-0 pointer-events-none z-[9]" aria-hidden>
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(160deg, rgba(160,210,255,0.2) 0%, rgba(120,180,230,0.06) 50%, rgba(200,230,255,0.14) 100%)',
            mixBlendMode: 'soft-light',
          }}
        />
      </div>
    );
  }

  if (fx === 'neon') {
    return (
      <div className="absolute inset-0 pointer-events-none z-[9]" aria-hidden>
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(135deg, rgba(0,220,255,0.16) 0%, transparent 40%, rgba(255,40,160,0.18) 100%)',
            mixBlendMode: 'screen',
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse at center, transparent 42%, rgba(10,0,30,0.4) 100%)',
          }}
        />
      </div>
    );
  }

  if (fx === 'aura') {
    return (
      <div className="absolute inset-0 pointer-events-none z-[9]" aria-hidden>
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse at 50% 40%, rgba(180,120,255,0.2) 0%, rgba(255,80,180,0.1) 45%, transparent 70%)',
            mixBlendMode: 'screen',
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            boxShadow: 'inset 0 0 80px rgba(160,80,255,0.28), inset 0 0 160px rgba(255,60,160,0.12)',
          }}
        />
      </div>
    );
  }

  return null;
}

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
      <div className="mx-auto w-full max-w-md rounded-t-2xl elix-panel backdrop-blur-md border border-black px-4 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+14px)]">
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
                className={`shrink-0 px-3 py-2 rounded-xl text-xs font-semibold border ${activeFilterId === p.id ? 'bg-[#E6E9EE] text-white elix-accent border-[#D8D9DD]' : 'bg-white/5 text-white/80 border-white/10'}`}
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
                className={`shrink-0 px-3 py-2 rounded-xl text-xs font-semibold border ${activeEffectId === p.id ? 'bg-[#E6E9EE] text-white elix-accent border-[#D8D9DD]' : 'bg-white/5 text-white/80 border-white/10'}`}
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
              className="w-full bg-white/10 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-[#D8D9DD]/60 placeholder:text-white/30"
            />
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              {TEXT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setTextColor(c)}
                  aria-label={`Color ${c}`}
                  className={`w-7 h-7 rounded-full border-2 ${textColor === c ? 'border-[#D8D9DD]' : 'border-white/20'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
              <button
                type="button"
                onClick={submitText}
                className="ml-auto px-4 py-2 rounded-full bg-[#E6E9EE] text-white elix-accent text-xs font-bold active:scale-95 transition-transform"
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
