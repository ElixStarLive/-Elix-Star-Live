import React, { useEffect, useMemo, useState } from 'react';
import type { TauntBurst } from '../lib/battleTaunts';

type Props = {
  bursts: TauntBurst[];
  /** Which side is the opponent pane (blue/right for host). */
  opponentSide: 'host' | 'opponent';
};

/**
 * Battle taunt visuals — emoji bursts over host/opponent video panes.
 * Layer-only; does not change battle grid layout.
 */
export function BattleTauntOverlays({ bursts, opponentSide }: Props) {
  const [visible, setVisible] = useState<TauntBurst[]>([]);

  useEffect(() => {
    if (!bursts.length) return;
    setVisible((prev) => [...prev, ...bursts]);
    const timers = bursts.map((b) =>
      window.setTimeout(() => {
        setVisible((prev) => prev.filter((x) => x.id !== b.id));
      }, 2200 + b.delay),
    );
    return () => timers.forEach(clearTimeout);
  }, [bursts]);

  const items = useMemo(() => visible, [visible]);

  return (
    <div className="absolute inset-0 z-[56] pointer-events-none overflow-hidden">
      {items.map((b) => {
        const onOpponentPane = b.side === opponentSide;
        return (
          <div
            key={b.id}
            className="absolute battle-taunt-float text-3xl drop-shadow-[0_2px_8px_rgba(0,0,0,0.85)]"
            style={{
              [onOpponentPane ? 'right' : 'left']: `${b.x}%`,
              top: `${18 + (b.id % 5) * 4}%`,
              animationDelay: `${b.delay}ms`,
            }}
          >
            {b.emoji}
          </div>
        );
      })}
    </div>
  );
}

export type { TauntBurst };
