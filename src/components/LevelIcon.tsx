import React, { useId } from 'react';
import { AvatarRing } from './AvatarRing';
import { resolveUiAvatarUrl, ROYCE_DEFAULT_AVATAR } from '../lib/royceAssets';
import { getLevelAccentStyle, isDiamondPrestigeLevel } from '../lib/levelColors';

/**
 * Premium neon diamond frame (chart): 3 crown facets + open pavilion,
 * white level number inside. Colour from every-20 tier (all 1–300).
 */
function LevelDiamondBadge({
  level,
  width,
  height,
  color,
  prestige,
}: {
  level: number;
  width: number;
  height: number;
  color: string;
  prestige: boolean;
}) {
  const uid = useId().replace(/:/g, '');
  const gradId = `lvlRainbow-${uid}`;
  const stroke = prestige ? `url(#${gradId})` : color;
  const glowColor = prestige ? '#A78BFA' : color;
  const fontPx = Math.max(8, Math.round(Math.min(width, height) * (level >= 100 ? 0.3 : 0.36)));

  return (
    <div
      style={{
        position: 'relative',
        width,
        height,
        flexShrink: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <svg
        width={width}
        height={height}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
        preserveAspectRatio="xMidYMid meet"
        style={{
          position: 'absolute',
          inset: 0,
          display: 'block',
          filter: `drop-shadow(0 0 2px ${glowColor}) drop-shadow(0 0 6px ${glowColor}) drop-shadow(0 0 11px ${glowColor})`,
        }}
      >
        {prestige ? (
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#F97316" />
              <stop offset="25%" stopColor="#EAB308" />
              <stop offset="50%" stopColor="#22C55E" />
              <stop offset="75%" stopColor="#3B82F6" />
              <stop offset="100%" stopColor="#C77DFF" />
            </linearGradient>
          </defs>
        ) : null}
        {/* Outer diamond — flat top, pointed tip */}
        <path
          d="M22 11 H42 L53 27 L32 54 L11 27 Z"
          stroke={stroke}
          strokeWidth="2.8"
          strokeLinejoin="round"
          strokeLinecap="round"
          fill="none"
        />
        {/* Girdle */}
        <path d="M11 27 H53" stroke={stroke} strokeWidth="2.4" strokeLinecap="round" />
        {/* Three crown facets (chart style) */}
        <path d="M22 11 L32 27" stroke={stroke} strokeWidth="2.15" strokeLinecap="round" />
        <path d="M42 11 L32 27" stroke={stroke} strokeWidth="2.15" strokeLinecap="round" />
        <path d="M32 11 L32 27" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
      </svg>
      <span
        style={{
          position: 'relative',
          zIndex: 1,
          color: '#FFFFFF',
          fontWeight: 900,
          fontSize: fontPx,
          lineHeight: 1,
          letterSpacing: '-0.02em',
          textShadow: '0 1px 3px rgba(0,0,0,0.95)',
          fontVariantNumeric: 'tabular-nums',
          pointerEvents: 'none',
          marginTop: Math.round(height * 0.14),
        }}
      >
        {level}
      </span>
    </div>
  );
}

export interface LevelIconProps {
  level: number;
  size?: number;
  circleSize?: number;
  className?: string;
  avatarUrl?: string;
  displayName?: string;
  barColor?: string;
  text?: 'lv' | 'level';
  hideCircle?: boolean;
}

function isUsableAvatarUrl(url: string | undefined): url is string {
  const t = typeof url === 'string' ? url.trim() : '';
  return Boolean(t) && t !== ROYCE_DEFAULT_AVATAR && !t.includes('/royce/default-avatar');
}

export const LevelIcon: React.FC<LevelIconProps> = ({
  level,
  size,
  circleSize: circleSizeProp,
  className = '',
  avatarUrl,
  displayName,
  hideCircle = false,
}) => {
  const safeLevel = typeof level === 'number' && Number.isFinite(level) && level > 0 ? Math.floor(level) : 1;
  const levelStyle = getLevelAccentStyle(safeLevel);
  const prestige = isDiamondPrestigeLevel(safeLevel);
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

  const diamondH = Math.max(22, Math.round(circleSize * 0.95));
  const diamondW = Math.max(26, Math.round(diamondH * 1.15));

  const diamond = (
    <LevelDiamondBadge
      level={safeLevel}
      width={diamondW}
      height={diamondH}
      color={levelStyle.accent}
      prestige={prestige}
    />
  );

  const chatAvatarSrc = resolveUiAvatarUrl(
    isUsableAvatarUrl(avatarUrl) ? avatarUrl.trim() : '',
    displayName || 'User',
    circleSize * 2,
  );

  if (hideCircle) {
    return (
      <div className={className} style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
        {diamond}
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
        height: Math.max(circleSize, diamondH),
        flexShrink: 0,
        verticalAlign: 'middle',
        position: 'relative',
      }}
    >
      <div style={{ position: 'relative', zIndex: 2, flexShrink: 0 }}>
        <AvatarRing src={chatAvatarSrc} alt={displayName || ''} size={circleSize} />
      </div>
      {diamond}
    </div>
  );
};
