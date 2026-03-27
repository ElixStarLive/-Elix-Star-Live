import React from 'react';
import { PROFILE_RING_IMAGE_LIFT_MM, profileRingInnerPx } from '../lib/profileFrame';

export interface LevelIconProps {
  level: number;
  /** Drives the LV pill (bar) size and typography when `circleSize` is set; otherwise drives both bar + circle */
  size?: number;
  /** Optional larger avatar/profile circle only; bar stays sized from `size` */
  circleSize?: number;
  className?: string;
  avatarUrl?: string;
  barColor?: string;
  text?: 'lv' | 'level';
}

export const LevelIcon: React.FC<LevelIconProps> = ({
  level,
  size = 40,
  circleSize: circleSizeProp,
  className = '',
  avatarUrl,
  barColor,
  text = 'lv',
}) => {
  const safeLevel = typeof level === 'number' && Number.isFinite(level) && level > 0 ? Math.floor(level) : 1;
  /** CSS px per mm (1in = 25.4mm, 1in = 96px). */
  const MM_TO_PX = 96 / 25.4;
  const shrinkMm = 3;
  const shrinkPx = shrinkMm * MM_TO_PX;
  const circleGrowMm = 4;
  const circleGrowPx = circleGrowMm * MM_TO_PX;
  const rawSize = typeof size === 'number' && Number.isFinite(size) ? size : 40;
  const barBaseSize = Math.max(16, Math.floor(rawSize));
  const maxShrink = Math.max(0, rawSize - 16);
  const circleSize =
    typeof circleSizeProp === 'number' && Number.isFinite(circleSizeProp)
      ? Math.max(16, Math.floor(circleSizeProp))
      : Math.max(16, Math.floor(rawSize - Math.min(shrinkPx, maxShrink) + circleGrowPx));
  const barHeight = Math.round(barBaseSize * 0.72);
  const barWidth = Math.round(barBaseSize * 1.75);
  const overlap = Math.round(circleSize * 0.52);

  const getBarGradient = () => {
    if (barColor) return barColor;
    if (safeLevel >= 90) return 'linear-gradient(180deg, #ff2d55 0%, #7a1027 55%, #ff2d55 100%)';
    if (safeLevel >= 60) return 'linear-gradient(180deg, #a855f7 0%, #4c1d95 55%, #a855f7 100%)';
    if (safeLevel >= 30) return 'linear-gradient(180deg, #3b82f6 0%, #1e3a8a 55%, #3b82f6 100%)';
    return 'linear-gradient(180deg, #22c55e 0%, #14532d 55%, #22c55e 100%)';
  };

  const goldScale = (circleSize + 28) / circleSize;
  /** Same inner-hole geometry as `GoldProfileFrame` so chat level avatars match MVP gold circles. */
  const avatarDiameter = profileRingInnerPx(circleSize);

  return (
    <div className={className} style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0, marginLeft: 8 }}>
      <div
        style={{
          position: 'relative',
          zIndex: 2,
          width: circleSize,
          height: circleSize,
          borderRadius: 999,
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: `calc(50% - ${PROFILE_RING_IMAGE_LIFT_MM}mm)`,
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: avatarDiameter,
            height: avatarDiameter,
            borderRadius: 999,
            overflow: 'hidden',
          }}
        >
          {typeof avatarUrl === 'string' && avatarUrl ? (
            <img
              src={avatarUrl}
              alt=""
              draggable={false}
              style={{
                width: '100%',
                height: '100%',
                display: 'block',
                objectFit: 'cover',
                objectPosition: 'center center',
              }}
            />
          ) : null}
        </div>
        <img
          src="/Icons/Profile icon.png"
          alt=""
          className="pointer-events-none absolute object-contain"
          style={{
            top: '50%',
            left: '50%',
            width: circleSize * goldScale,
            height: circleSize * goldScale,
            transform: 'translate(-50%, -50%)',
            zIndex: 3,
          }}
        />
      </div>

      <div
        style={{
          position: 'relative',
          zIndex: 1,
          height: barHeight,
          width: barWidth,
          marginLeft: -overlap + 8,
          borderRadius: barHeight / 2,
          background: getBarGradient(),
          border: '1px solid rgba(255,255,255,0.22)',
          boxShadow: '0 6px 14px rgba(0,0,0,0.55), inset 0 1px 1px rgba(255,255,255,0.35)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          paddingRight: Math.round(barHeight * 0.35),
          paddingLeft: Math.round(barHeight * 0.9),
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: barHeight / 2,
            background: 'linear-gradient(180deg, rgba(255,255,255,0.28) 0%, transparent 58%, rgba(0,0,0,0.18) 100%)',
            pointerEvents: 'none',
            opacity: 0.75,
          }}
        />
        <span
          style={{
            position: 'relative',
            color: 'white',
            fontWeight: 900,
            fontStyle: 'italic',
            letterSpacing: '0.02em',
            fontSize: Math.max(10, Math.round(barHeight * 0.52)),
            textShadow: '0 2px 6px rgba(0,0,0,0.75)',
            lineHeight: 1,
            whiteSpace: 'nowrap',
          }}
        >
          {text === 'level' ? `Level ${safeLevel}` : `LV ${safeLevel}`}
        </span>
      </div>
    </div>
  );
};