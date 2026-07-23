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

/** Neon wireframe diamond — matches ELIX STAR LIVE diamond chart look. */
function NeonLevelDiamond({
  size,
  stroke,
  rainbow,
}: {
  size: number;
  stroke: string;
  rainbow: boolean;
}) {
  const uid = useId().replace(/:/g, '');
  const gradId = `lvl-dia-grad-${uid}`;
  const glowId = `lvl-dia-glow-${uid}`;
  const strokePaint = rainbow ? `url(#${gradId})` : stroke;

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
        {rainbow ? (
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#C77DFF" />
            <stop offset="16%" stopColor="#3399FF" />
            <stop offset="28%" stopColor="#33CCFF" />
            <stop offset="40%" stopColor="#4EFFF7" />
            <stop offset="52%" stopColor="#4ADE80" />
            <stop offset="64%" stopColor="#FFD700" />
            <stop offset="76%" stopColor="#FF7A3D" />
            <stop offset="88%" stopColor="#FF4D4D" />
            <stop offset="100%" stopColor="#FF69B4" />
          </linearGradient>
        ) : null}
        <filter id={glowId} x="-60%" y="-60%" width="220%" height="220%" colorInterpolationFilters="sRGB">
          <feGaussianBlur in="SourceGraphic" stdDeviation="1.4" result="soft" />
          <feGaussianBlur in="SourceGraphic" stdDeviation="3.2" result="bloom" />
          <feMerge>
            <feMergeNode in="bloom" />
            <feMergeNode in="soft" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g
        filter={`url(#${glowId})`}
        stroke={strokePaint}
        strokeLinejoin="round"
        strokeLinecap="round"
        fill="none"
      >
        <path d="M22 10 H42 L54 26 L32 54 L10 26 Z" strokeWidth="2.75" />
        <path d="M10 26 H54" strokeWidth="2.4" />
        <path d="M22 10 L32 26" strokeWidth="2.2" />
        <path d="M42 10 L32 26" strokeWidth="2.2" />
        <path d="M32 10 L10 26" strokeWidth="2.1" />
        <path d="M32 10 L54 26" strokeWidth="2.1" />
        <path d="M21 26 L32 54" strokeWidth="2.2" />
        <path d="M43 26 L32 54" strokeWidth="2.2" />
      </g>
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

  /** Chart-style chip: taller so the diamond reads clearly. */
  const chipH = Math.max(24, Math.round(circleSize * 0.95));
  const numberPx = Math.max(11, Math.round(chipH * 0.52));
  const labelPx = Math.max(6, Math.round(chipH * 0.28));
  /** Bigger diamond on the LEFT — chart ~1/3 of badge. */
  const diamondSize = Math.round(chipH * 1.05);

  const levelChip = (
    <div
      style={{
        position: 'relative',
        zIndex: 1,
        height: chipH,
        minWidth: Math.round(diamondSize + numberPx * 2.4 + 14),
        borderRadius: 6,
        background,
        border: `1px solid ${border}`,
        boxShadow: `0 0 10px 2px ${glow}, 0 0 18px 4px ${fillSoft}`,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'flex-start',
        gap: 0,
        paddingLeft: 2,
        paddingRight: 7,
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
          marginTop: -1,
          marginBottom: -1,
          flexShrink: 0,
        }}
      >
        <NeonLevelDiamond size={diamondSize} stroke={accent} rainbow={prestige} />
      </div>

      {/* Chart divider */}
      <span
        aria-hidden
        style={{
          width: 1,
          alignSelf: 'stretch',
          marginTop: 4,
          marginBottom: 4,
          marginLeft: 1,
          marginRight: 5,
          background: accent,
          boxShadow: `0 0 6px ${glow}`,
          opacity: 0.9,
          flexShrink: 0,
        }}
      />

      {/* Number OTHER SIDE (right) — same neon colour as diamond */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'center',
          lineHeight: 1,
          minWidth: 0,
          paddingRight: 1,
        }}
      >
        <span
          style={{
            color: accent,
            fontWeight: 800,
            fontSize: labelPx,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            textShadow: `0 0 6px ${glow}, 0 0 12px ${fillSoft}`,
            lineHeight: 1,
            whiteSpace: 'nowrap',
          }}
        >
          LEVEL
        </span>
        <span
          style={{
            color: accent,
            fontWeight: 900,
            letterSpacing: '0.01em',
            fontSize: numberPx,
            textShadow: `0 0 8px ${glow}, 0 0 14px ${fillSoft}`,
            lineHeight: 1.05,
            whiteSpace: 'nowrap',
            fontVariantNumeric: 'tabular-nums',
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
