import React, { useId } from 'react';
import { AvatarRing } from './AvatarRing';
import { resolveUiAvatarUrl, ROYCE_DEFAULT_AVATAR } from '../lib/royceAssets';
import {
  clampUserLevel,
  getLevelAccentStyle,
  isDiamondPrestigeLevel,
} from '../lib/levelColors';

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

/** Royal pink + white diamond — solid strokes so it stays visible at small chip sizes. */
function NeonLevelDiamond({
  size,
  stroke: _stroke,
  rainbow,
}: {
  size: number;
  stroke: string;
  rainbow: boolean;
}) {
  const uid = useId().replace(/:/g, '');
  const fillId = `lvl-dia-fill-${uid}`;
  const royalPink = '#FF4FA3';
  const softPink = '#FFB6D9';
  const white = '#FFFFFF';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden
      style={{ display: 'block', flexShrink: 0, overflow: 'visible' }}
    >
      <defs>
        <linearGradient id={fillId} x1="18%" y1="8%" x2="82%" y2="92%">
          {rainbow ? (
            <>
              <stop offset="0%" stopColor="#FF8AD4" />
              <stop offset="45%" stopColor="#FF4FA3" />
              <stop offset="100%" stopColor="#FFFFFF" />
            </>
          ) : (
            <>
              <stop offset="0%" stopColor={white} />
              <stop offset="42%" stopColor={softPink} />
              <stop offset="100%" stopColor={royalPink} />
            </>
          )}
        </linearGradient>
      </defs>
      {/* Soft fill so the gem never reads as empty */}
      <path
        d="M22 10 H42 L54 26 L32 54 L10 26 Z"
        fill={`url(#${fillId})`}
        opacity={0.95}
      />
      {/* White outer frame */}
      <g stroke={white} strokeLinejoin="round" strokeLinecap="round" fill="none">
        <path d="M22 10 H42 L54 26 L32 54 L10 26 Z" strokeWidth="3.2" />
      </g>
      {/* Royal pink facets */}
      <g stroke={royalPink} strokeLinejoin="round" strokeLinecap="round" fill="none">
        <path d="M22 10 H42 L54 26 L32 54 L10 26 Z" strokeWidth="2.1" />
        <path d="M10 26 H54" strokeWidth="2" />
        <path d="M22 10 L32 26" strokeWidth="1.9" />
        <path d="M42 10 L32 26" strokeWidth="1.9" />
        <path d="M32 10 L10 26" strokeWidth="1.8" />
        <path d="M32 10 L54 26" strokeWidth="1.8" />
        <path d="M21 26 L32 54" strokeWidth="1.9" />
        <path d="M43 26 L32 54" strokeWidth="1.9" />
      </g>
      {/* White sparkle line */}
      <path d="M26 14 L38 14" stroke={white} strokeWidth="1.6" strokeLinecap="round" opacity={0.95} />
    </svg>
  );
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
  const safeLevel = clampUserLevel(level);
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

  const { accent, background, border, glow, fillSoft } = getLevelAccentStyle(safeLevel);
  const prestige = isDiamondPrestigeLevel(safeLevel);

  /** Chip height — keep short; diamond + number only. */
  const chipH = Math.max(20, Math.round(circleSize * 0.78));
  const numberPx = Math.max(10, Math.round(chipH * 0.58));
  /** Diamond must stay large enough to read at MVP list sizes. */
  const diamondSize = Math.max(16, Math.round(chipH * 0.95));

  const levelChip = (
    <div
      style={{
        position: 'relative',
        zIndex: 1,
        height: chipH,
        minWidth: Math.round(diamondSize + numberPx * 1.35 + 10),
        borderRadius: 6,
        background,
        border: `1px solid ${border}`,
        boxShadow: `0 0 10px 2px ${glow}, 0 0 18px 4px ${fillSoft}`,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'flex-start',
        gap: 0,
        paddingLeft: 2,
        paddingRight: 8,
        flexShrink: 0,
        overflow: 'visible',
      }}
    >
      {/* Diamond LEFT — neon tier colour (rainbow for 281–300) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: diamondSize,
          height: diamondSize,
          flexShrink: 0,
        }}
      >
        <NeonLevelDiamond size={diamondSize} stroke={accent} rainbow={prestige} />
      </div>

      {/* Number OTHER SIDE (right) — same neon colour as diamond */}
      <span
        style={{
          color: accent,
          fontWeight: 900,
          letterSpacing: '0.01em',
          fontSize: numberPx,
          textShadow: `0 0 8px ${glow}, 0 0 14px ${fillSoft}`,
          lineHeight: 1,
          whiteSpace: 'nowrap',
          fontVariantNumeric: 'tabular-nums',
          paddingLeft: 4,
          ...(prestige
            ? {
                backgroundImage:
                  'linear-gradient(90deg,#C77DFF,#3399FF,#33CCFF,#4ADE80,#FFD700,#FF7A3D,#FF4D4D,#FF69B4)',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                color: 'transparent',
                textShadow: 'none',
              }
            : null),
        }}
      >
        {safeLevel}
      </span>
    </div>
  );

  const chatAvatarSrc = resolveUiAvatarUrl(
    isUsableAvatarUrl(avatarUrl) ? avatarUrl.trim() : '',
    displayName || 'User',
    circleSize * 2,
  );

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
        height: Math.max(circleSize, chipH),
        flexShrink: 0,
        verticalAlign: 'middle',
        position: 'relative',
      }}
    >
      <div style={{ position: 'relative', zIndex: 2, flexShrink: 0 }}>
        <AvatarRing src={chatAvatarSrc} alt={displayName || ''} size={circleSize} />
      </div>
      {levelChip}
    </div>
  );
};
