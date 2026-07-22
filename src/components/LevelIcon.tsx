import React from 'react';
import { PROFILE_RING_IMAGE_LIFT_MM, profileRingInnerPx } from '../lib/profileFrame';
import { ROYCE_DEFAULT_AVATAR } from '../lib/royceAssets';

/** TikTok-style level diamond colours — brighter tiers as level rises. */
function levelDiamondPalette(level: number): { top: string; mid: string; bot: string; edge: string } {
  if (level >= 40) return { top: '#E9D5FF', mid: '#A855F7', bot: '#6B21A8', edge: '#F3E8FF' };
  if (level >= 30) return { top: '#C4B5FD', mid: '#818CF8', bot: '#4338CA', edge: '#E0E7FF' };
  if (level >= 20) return { top: '#93C5FD', mid: '#3B82F6', bot: '#1D4ED8', edge: '#DBEAFE' };
  if (level >= 10) return { top: '#7DD3FC', mid: '#0EA5E9', bot: '#0369A1', edge: '#E0F2FE' };
  if (level >= 5) return { top: '#67E8F9', mid: '#22D3EE', bot: '#0E7490', edge: '#CFFAFE' };
  return { top: '#BFDBFE', mid: '#60A5FA', bot: '#2563EB', edge: '#EFF6FF' };
}

/**
 * TikTok Live level badge: faceted diamond with white number INSIDE.
 * Small, clear, high contrast on black chat.
 */
function LevelDiamondBadge({ level, height }: { level: number; height: number }) {
  const digits = String(level).length;
  const w = Math.round(height * (digits >= 3 ? 1.6 : digits === 2 ? 1.4 : 1.2));
  const h = Math.max(14, height);
  const p = levelDiamondPalette(level);
  const uid = `lvd${level}-${h}-${w}`;
  const fontPx = Math.max(8, Math.round(h * (digits >= 3 ? 0.42 : 0.5)));

  return (
    <div
      className="relative flex-shrink-0"
      style={{ width: w, height: h }}
      title={`Level ${level}`}
    >
      <svg
        width={w}
        height={h}
        viewBox="0 0 40 32"
        className="absolute inset-0"
        aria-hidden
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id={`${uid}g`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={p.top} />
            <stop offset="48%" stopColor={p.mid} />
            <stop offset="100%" stopColor={p.bot} />
          </linearGradient>
          <linearGradient id={`${uid}shine`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.55)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>
        </defs>
        {/* Outer faceted diamond */}
        <path
          d="M20 1.5 L37.5 16 L20 30.5 L2.5 16 Z"
          fill={`url(#${uid}g)`}
          stroke={p.edge}
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
        {/* Inner facets for crystal look */}
        <path d="M20 1.5 L29 16 L20 30.5 L11 16 Z" fill="rgba(255,255,255,0.12)" />
        <path d="M20 1.5 L37.5 16 L20 16 Z" fill={`url(#${uid}shine)`} />
        <path
          d="M20 1.5 L37.5 16 L20 30.5 L2.5 16 Z"
          fill="none"
          stroke="rgba(255,255,255,0.4)"
          strokeWidth="0.6"
        />
        <path d="M11 16 L29 16" stroke="rgba(255,255,255,0.35)" strokeWidth="0.55" />
      </svg>
      <span
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#FFFFFF',
          fontWeight: 900,
          fontSize: fontPx,
          letterSpacing: '-0.02em',
          textShadow: '0 1px 2px rgba(0,0,0,0.65)',
          lineHeight: 1,
          fontVariantNumeric: 'tabular-nums',
          pointerEvents: 'none',
        }}
      >
        {level}
      </span>
    </div>
  );
}

export interface LevelIconProps {
  level: number;
  /** Drives sizing when `circleSize` is set; otherwise drives circle + chip */
  size?: number;
  /** Optional larger avatar/profile circle only */
  circleSize?: number;
  className?: string;
  avatarUrl?: string;
  barColor?: string;
  text?: 'lv' | 'level';
  /** Hide the profile circle; show level chip only (e.g. mini profile already has AvatarRing). */
  hideCircle?: boolean;
}

export const LevelIcon: React.FC<LevelIconProps> = ({
  level,
  size,
  circleSize: circleSizeProp,
  className = '',
  avatarUrl,
  hideCircle = false,
}) => {
  const safeLevel = typeof level === 'number' && Number.isFinite(level) && level > 0 ? Math.floor(level) : 1;
  /** CSS px per mm (1in = 25.4mm, 1in = 96px). */
  const MM_TO_PX = 96 / 25.4;
  const shrinkMm = 3;
  const shrinkPx = shrinkMm * MM_TO_PX;
  const circleGrowMm = 4;
  const circleGrowPx = circleGrowMm * MM_TO_PX;
  const sizeProvided = typeof size === 'number' && Number.isFinite(size);
  const rawSize = sizeProvided ? (size as number) : 40;
  const maxShrink = Math.max(0, rawSize - 16);
  const circleSize =
    typeof circleSizeProp === 'number' && Number.isFinite(circleSizeProp)
      ? Math.max(16, Math.floor(circleSizeProp))
      : Math.max(16, Math.floor(rawSize - Math.min(shrinkPx, maxShrink) + circleGrowPx));
  const splitCircleSizing =
    typeof circleSizeProp === 'number' && Number.isFinite(circleSizeProp);

  const avatarDiameter = profileRingInnerPx(circleSize);

  /** TikTok-style diamond height — matches chat line, number sits inside. */
  const diamondH = Math.max(16, Math.min(22, Math.round(circleSize * 0.72)));
  const levelChip = (
    <div style={{ position: 'relative', zIndex: 1, flexShrink: 0, display: 'inline-flex' }}>
      <LevelDiamondBadge level={safeLevel} height={diamondH} />
    </div>
  );

  if (splitCircleSizing) {
    if (hideCircle) {
      return (
        <div className={className} style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
          {levelChip}
        </div>
      );
    }
    return (
      <div
        className={className}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          height: circleSize,
          flexShrink: 0,
          verticalAlign: 'middle',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'relative',
            zIndex: 2,
            width: circleSize,
            height: circleSize,
            borderRadius: 9999,
            overflow: 'hidden',
            flexShrink: 0,
            background: '#000',
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
          ) : (
            <img
              src={ROYCE_DEFAULT_AVATAR}
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
          )}
        </div>
        {levelChip}
      </div>
    );
  }

  return (
    <div className={className} style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0, gap: 4, marginLeft: 8 }}>
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
          ) : (
            <img
              src={ROYCE_DEFAULT_AVATAR}
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
          )}
        </div>
      </div>
      {levelChip}
    </div>
  );
};
