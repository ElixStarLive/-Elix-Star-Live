import { Coins } from 'lucide-react';

/**
 * Individual creator battle contribution — bottom of that creator's video tile only.
 * Does NOT replace the main team Battle score (Team A = host+P3, Team B = opponent+P4).
 */
export function BattleCreatorTileScore({
  score,
  format,
}: {
  score: number;
  format: (n: number) => string;
}) {
  const safe = typeof score === 'number' && Number.isFinite(score) ? Math.max(0, score) : 0;
  return (
    <div className="absolute bottom-1 left-1/2 -translate-x-1/2 z-[15] pointer-events-none">
      <span className="inline-flex h-4 items-center justify-center gap-0.5 rounded-full bg-black/45 border border-[#2A2D33] px-1.5 text-[8px] font-black tabular-nums text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]">
        <Coins size={8} className="text-[#D9A62E] flex-shrink-0" strokeWidth={2.2} aria-hidden />
        <span>{format(safe)}</span>
      </span>
    </div>
  );
}
