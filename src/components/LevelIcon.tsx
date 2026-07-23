import React from 'react';
import { AvatarRing } from './AvatarRing';
import { resolveUiAvatarUrl, ROYCE_DEFAULT_AVATAR } from '../lib/royceAssets';
import { getLevelAccentStyle } from '../lib/levelColors';

/**
 * Identical badge diamond frame from the ELIX icon sheet (Ranking gem):
 * flat crown top, pointed pavilion. Dark gem so the coloured chip fundal reads as the light.
 */
function LevelDiamondIcon({ size = 12 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="flex-shrink-0"
      aria-hidden
      style={{ display: 'block' }}
    >
      {/* Outer gem silhouette — dark on coloured fundal */}
      <path d="M5 7.2 L7.2 3.2 H12.8 L15 7.2 L10 17.2 Z" fill="#0A0A12" />
      {/* Top crown facets */}
      <path d="M5 7.2 H15 L12.8 3.2 H7.2 Z" fill="#14141C" />
      <path d="M7.2 3.2 L10 7.2 L12.8 3.2 Z" fill="#0E0E16" />
      {/* Left / right pavilion */}
      <path d="M5 7.2 L10 7.2 L10 17.2 Z" fill="#12121A" />
      <path d="M15 7.2 L10 7.2 L10 17.2 Z" fill="#0C0C14" />
      {/* Center facet */}
      <path d="M8.2 7.2 L10 12.5 L11.8 7.2 Z" fill="#181822" />
      {/* Frame stroke — same gem outline as icon sheet */}
      <path
        d="M5 7.2 L7.2 3.2 H12.8 L15 7.2 L10 17.2 Z"
        stroke="rgba(0,0,0,0.85)"
        strokeWidth="0.85"
        strokeLinejoin="round"
        fill="none"
      />
      <path d="M5 7.2 H15" stroke="rgba(0,0,0,0.7)" strokeWidth="0.55" />
      <path d="M7.2 3.2 L10 7.2 L12.8 3.2" stroke="rgba(0,0,0,0.55)" strokeWidth="0.45" fill="none" />
      <path d="M10 7.2 L10 17.2" stroke="rgba(0,0,0,0.55)" strokeWidth="0.45" />
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

  /** Coloured fundal + glow; dark badge diamond frame sits on top. */
  const chipH = Math.max(20, Math.round(circleSize * 0.82));
  const fontPx = Math.max(9, Math.round(chipH * 0.48));
  const diamondPx = Math.max(12, Math.round(chipH * 0.62));
  const levelChip = (
    <div
      style={{
        position: 'relative',
        zIndex: 1,
        height: chipH,
        minWidth: Math.max(chipH + 14, Math.round(chipH * 1.7)),
        borderRadius: 6,
        background: levelStyle.gradient,
        border: `1px solid ${levelStyle.border}`,
        boxShadow: `0 0 10px 2px ${levelStyle.glow}, 0 0 18px 4px ${levelStyle.fillSoft}`,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        paddingLeft: 8,
        paddingRight: 8,
        flexShrink: 0,
      }}
    >
      <LevelDiamondIcon size={diamondPx} />
      <span
        style={{
          color: '#FFFFFF',
          fontWeight: 900,
          letterSpacing: '0.01em',
          fontSize: fontPx,
          textShadow: '0 1px 3px rgba(0,0,0,0.75)',
          lineHeight: 1,
          whiteSpace: 'nowrap',
          fontVariantNumeric: 'tabular-nums',
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
