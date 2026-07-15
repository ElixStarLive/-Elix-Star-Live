import React, { useMemo } from 'react';

export type BattleMistSide = 'red' | 'blue' | null;

type GloveBurst = { id: number; side: 'red' | 'blue'; x: number; delay: number };

type Props = {
  /** Mist over video pane — hides that side of the frame (TikTok-style fog). */
  mistSide: BattleMistSide;
  /** Soft fog over PK score digits (end-game / hit suspense). */
  hideScores: boolean;
  /** Floating glove bursts. */
  gloves: GloveBurst[];
};

/** Boxing-glove silhouette (inline SVG — no new assets). */
function GloveIcon({ className, flip }: { className?: string; flip?: boolean }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      style={flip ? { transform: 'scaleX(-1)' } : undefined}
      aria-hidden
    >
      <path
        fill="currentColor"
        d="M18 28c-6 0-10 4-10 10v6c0 6 4 10 10 10h8c2 8 8 12 16 12 10 0 16-6 16-16V28c0-10-8-16-18-16h-4c-4-6-10-8-16-6-4 2-6 6-6 10v2c0 4 2 6 4 6z"
        opacity="0.95"
      />
      <path
        fill="rgba(255,255,255,0.35)"
        d="M22 30c2-4 6-6 10-6 2 0 4 1 5 3-8 1-12 4-15 9z"
      />
    </svg>
  );
}

/**
 * Live battle VFX: mist (hide pane / scores) + floating gloves.
 * Layers only — does not change battle grid structure.
 */
export function BattleVfxOverlays({ mistSide, hideScores, gloves }: Props) {
  const mistColor = mistSide === 'red'
    ? 'rgba(220,20,60,0.55)'
    : mistSide === 'blue'
      ? 'rgba(30,144,255,0.6)'
      : 'transparent';

  const glovesMemo = useMemo(() => gloves, [gloves]);

  return (
    <div className="absolute inset-0 z-[55] pointer-events-none overflow-hidden">
      {/* Pane mist */}
      {mistSide ? (
        <div
          className={`absolute top-0 bottom-0 w-1/2 overflow-hidden battle-mist-pane ${
            mistSide === 'red' ? 'left-0' : 'right-0'
          }`}
          style={{
            background: `
              radial-gradient(ellipse 90% 70% at ${mistSide === 'red' ? '30%' : '70%'} 45%, ${mistColor} 0%, transparent 70%),
              linear-gradient(${mistSide === 'red' ? '90deg' : '270deg'}, ${mistColor} 0%, transparent 85%)
            `,
            filter: 'blur(0.5px)',
          }}
        >
          <div className="absolute inset-0 battle-mist-swirl opacity-80" />
          <div className="absolute inset-0 battle-mist-swirl-2 opacity-60" />
        </div>
      ) : null}

      {/* Score digit veil (bar region is parent sibling — this covers mid video top strip too when hideScores) */}
      {hideScores ? (
        <div className="absolute left-0 right-0 top-0 h-10 battle-score-veil z-[60]" />
      ) : null}

      {glovesMemo.map((g) => (
        <div
          key={g.id}
          className="absolute battle-glove-float"
          style={{
            [g.side === 'red' ? 'left' : 'right']: `${8 + g.x}%`,
            bottom: '18%',
            animationDelay: `${g.delay}ms`,
            color: g.side === 'red' ? '#ff4d6d' : '#5dade2',
          }}
        >
          <GloveIcon className="w-10 h-10 drop-shadow-[0_4px_12px_rgba(0,0,0,0.65)]" flip={g.side === 'blue'} />
        </div>
      ))}
    </div>
  );
}

export type { GloveBurst };
