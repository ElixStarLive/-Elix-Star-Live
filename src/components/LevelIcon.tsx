import React from 'react';
import { AvatarRing } from './AvatarRing';
import { resolveUiAvatarUrl, ROYCE_DEFAULT_AVATAR } from '../lib/royceAssets';
import { getLevelAccentStyle } from '../lib/levelColors';

/**
 * Neon diamond FRAME only — identical line gem from your reference:
 * flat top, girdle, facet lines to the tip. Stroke + glow, no fill.
 * Colour = level accent so it stays clear on the dark chip.
 */
function LevelDiamondIcon({
  width = 12,
  height = 12,
  color,
}: {
  width?: number;
  height?: number;
  color: string;
}) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="flex-shrink-0"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
      style={{
        display: 'block',
        filter: `drop-shadow(0 0 2px ${color}) drop-shadow(0 0 5px ${color}) drop-shadow(0 0 9px ${color})`,
      }}
    >
      {/* Outer diamond frame */}
      <path
        d="M8 3.2 H16 L20.5 9.2 L12 21.2 L3.5 9.2 Z"
        stroke={color}
        strokeWidth="1.55"
        strokeLinejoin="round"
        strokeLinecap="round"
        fill="none"
      />
      {/* Girdle */}
      <path
        d="M3.5 9.2 H20.5"
        stroke={color}
        strokeWidth="1.35"
        strokeLinecap="round"
      />
      {/* Facet lines from top corners through girdle to tip */}
      <path
        d="M8 3.2 L12 21.2"
        stroke={color}
        strokeWidth="1.25"
        strokeLinecap="round"
      />
      <path
        d="M16 3.2 L12 21.2"
        stroke={color}
        strokeWidth="1.25"
        strokeLinecap="round"
      />
      {/* Crown mid to girdle (table facets) */}
      <path
        d="M12 3.2 L3.5 9.2"
        stroke={color}
        strokeWidth="1.15"
        strokeLinecap="round"
      />
      <path
        d="M12 3.2 L20.5 9.2"
        stroke={color}
        strokeWidth="1.15"
        strokeLinecap="round"
      />
    </svg>
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
  /** Used for initials fallback when avatar URL is missing */
  displayName?: string;
  barColor?: string;
  text?: 'lv' | 'level';
  /** Hide the profile circle; show level chip only (e.g. mini profile already has AvatarRing). */
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

  /** Dark chip; diamond fills chip height and max width on the left. */
  const chipH = Math.max(20, Math.round(circleSize * 0.82));
  const fontPx = Math.max(9, Math.round(chipH * 0.48));
  /** Height = full level-icon chip; width = max on the left (same as height). */
  const diamondH = chipH;
  const diamondW = chipH;
  const levelChip = (
    <div
      style={{
        position: 'relative',
        zIndex: 1,
        height: chipH,
        minWidth: Math.max(chipH + diamondW + 6, Math.round(chipH * 2.1)),
        borderRadius: 6,
        background: 'rgba(8, 10, 18, 0.92)',
        border: `1px solid ${levelStyle.border}`,
        boxShadow: `0 0 10px 2px ${levelStyle.glow}, 0 0 18px 4px ${levelStyle.fillSoft}`,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'flex-start',
        gap: 2,
        paddingLeft: 0,
        paddingRight: 8,
        flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      <LevelDiamondIcon width={diamondW} height={diamondH} color={levelStyle.accent} />
      <span
        style={{
          color: '#FFFFFF',
          fontWeight: 900,
          letterSpacing: '0.01em',
          fontSize: fontPx,
          textShadow: `0 0 6px ${levelStyle.glow}`,
          lineHeight: 1,
          whiteSpace: 'nowrap',
          fontVariantNumeric: 'tabular-nums',
          paddingRight: 2,
        }}
      >
        {safeLevel}
      </span>
    </div>
  );

  // Same gold-glow circle layout as LIVE top host avatar (AvatarRing + royce-avatar-glow).
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
        height: circleSize,
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
