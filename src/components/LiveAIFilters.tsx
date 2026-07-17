import React, { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { FILTER_PRESETS } from '../lib/ai/filters';

interface LiveAIFiltersProps {
  onFilterChange: (css: string) => void;
  currentFilter: string;
}

const QUICK_FILTERS = FILTER_PRESETS.filter(f =>
  ['none', 'cinema-warm', 'cinema-cold', 'cinema-teal', 'port-soft', 'port-beauty', 'mood-dreamy', 'mood-neon', 'art-bw-high'].includes(f.id)
);

export default function LiveAIFilters({ onFilterChange, currentFilter }: LiveAIFiltersProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="w-9 h-9 rounded-full bg-[#111111] backdrop-blur-md flex items-center justify-center shadow-lg active:scale-95 transition-transform relative"
        title="AI Filters"
      >
        <Sparkles size={16} className={`relative z-[2] ${currentFilter !== 'none' ? 'text-[#D4AF37]' : 'text-white/70'}`} />
</button>
    );
  }

  return (
    <>
      <div className="fixed inset-0 z-[34] pointer-events-auto" onClick={() => setIsOpen(false)} aria-hidden />
      <div className="absolute bottom-[120px] left-0 right-0 z-[35] px-2 pointer-events-auto">
        <div className="bg-black/60 backdrop-blur-md rounded-2xl p-2" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-center px-2 mb-2">
            <span className="text-white text-xs font-bold flex items-center gap-1">
              <Sparkles size={12} className="text-[#D4AF37]" /> AI Filters
            </span>
          </div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {QUICK_FILTERS.map(filter => (
              <button
                key={filter.id}
                onClick={() => onFilterChange(filter.css)}
                className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl min-w-[56px] transition-all ${
                  currentFilter === filter.css
                    ? 'bg-[#C9A227]/20 opacity-100'
                    : 'bg-white/5'
                }`}
              >
                <span className="text-lg">{filter.preview}</span>
                <span className="text-[8px] text-white/60 whitespace-nowrap">{filter.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
