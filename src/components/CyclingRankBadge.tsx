import React, { useEffect, useState } from 'react';
import { Trophy, Flame, Gift, Users, CalendarDays, type LucideIcon } from 'lucide-react';

export type LiveRankTab = 'weekly' | 'daily' | 'live' | 'gifters' | 'goal';

export type RankCycleSlot = {
  tab: LiveRankTab;
  label: string;
  Icon: LucideIcon;
};

export const LIVE_RANK_CYCLE_SLOTS: RankCycleSlot[] = [
  { tab: 'weekly', label: 'Weekly Ranking', Icon: Trophy },
  { tab: 'daily', label: 'Daily Ranking', Icon: CalendarDays },
  { tab: 'live', label: 'LIVE Popular', Icon: Flame },
  { tab: 'gifters', label: 'Top Gifters', Icon: Users },
  { tab: 'goal', label: 'Gift Goal', Icon: Gift },
];

const CYCLE_MS = 5000;

type Props = {
  onOpen: (tab: LiveRankTab) => void;
  /** Keep pill width stable while labels change */
  className?: string;
  showChevron?: boolean;
};

export function CyclingRankBadge({ onOpen, className = '', showChevron = true }: Props) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % LIVE_RANK_CYCLE_SLOTS.length);
    }, CYCLE_MS);
    return () => window.clearInterval(id);
  }, []);

  const slot = LIVE_RANK_CYCLE_SLOTS[index] ?? LIVE_RANK_CYCLE_SLOTS[0];

  return (
    <button
      type="button"
      className={`flex items-center gap-1 bg-black/75 rounded-full px-2.5 py-1 border border-[#D4AF37]/80 shadow-[0_0_8px_rgba(212,175,55,0.35)] cursor-pointer active:scale-95 transition-transform ${className}`}
      onClick={(e) => {
        e.stopPropagation();
        onOpen(slot.tab);
      }}
      aria-label={slot.label}
    >
      <span className="relative w-3.5 h-3.5 flex-shrink-0">
        {LIVE_RANK_CYCLE_SLOTS.map((s, i) => {
          const SlotIcon = s.Icon;
          const active = i === index;
          return (
            <SlotIcon
              key={s.tab}
              className={`absolute inset-0 w-3.5 h-3.5 text-[#D4AF37] transition-opacity duration-500 ${
                active ? 'opacity-100' : 'opacity-0'
              }`}
              strokeWidth={2.25}
              aria-hidden={!active}
            />
          );
        })}
      </span>
      <span className="text-[#F5E6A8] text-[11px] font-bold whitespace-nowrap drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)] min-w-[7.5rem] text-left">
        {slot.label}
      </span>
      {showChevron ? (
        <span className="text-[#F5E6A8]/90 text-[11px]">&gt;</span>
      ) : null}
    </button>
  );
}
