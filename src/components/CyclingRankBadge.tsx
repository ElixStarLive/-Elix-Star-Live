import React, { useEffect, useState } from 'react';
import { Trophy, Flame, Gift, Users, CalendarDays, type LucideIcon } from 'lucide-react';

/** Extra icons cycle inside the existing Weekly Ranking slot — label/layout stay fixed. */
const CYCLE_ICONS: LucideIcon[] = [Trophy, CalendarDays, Flame, Users, Gift];
const CYCLE_MS = 5000;

type Props = {
  onClick: (e: React.MouseEvent) => void;
  /** Match creator bar: "Weekly Ranking >" in one span */
  labelMode?: 'combined' | 'split';
  className?: string;
};

/**
 * Same Weekly Ranking pill layout as before — only the left icon swaps every 5s.
 */
export function CyclingRankBadge({
  onClick,
  labelMode = 'combined',
  className = '',
}: Props) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % CYCLE_ICONS.length);
    }, CYCLE_MS);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div
      className={`flex items-center gap-1 bg-black/75 rounded-full px-2.5 py-1 border border-[#D4AF37]/80 shadow-[0_0_8px_rgba(212,175,55,0.35)] cursor-pointer ${className}`}
      onClick={onClick}
    >
      <span className="relative w-3.5 h-3.5 flex-shrink-0">
        {CYCLE_ICONS.map((Icon, i) => (
          <Icon
            key={i}
            className={`absolute inset-0 w-3.5 h-3.5 text-[#D4AF37] transition-opacity duration-500 ${
              i === index ? 'opacity-100' : 'opacity-0'
            }`}
            strokeWidth={2.25}
            aria-hidden={i !== index}
          />
        ))}
      </span>
      {labelMode === 'split' ? (
        <>
          <span className="text-[#F5E6A8] text-[11px] font-bold drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">
            Weekly Ranking
          </span>
          <span className="text-[#F5E6A8]/90 text-[11px]">&gt;</span>
        </>
      ) : (
        <span className="text-[#F5E6A8] text-[11px] font-bold whitespace-nowrap drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">
          Weekly Ranking &gt;
        </span>
      )}
    </div>
  );
}
