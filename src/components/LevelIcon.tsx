import React from 'react';
import { AvatarRing } from './AvatarRing';
import { resolveUiAvatarUrl, ROYCE_DEFAULT_AVATAR } from '../lib/royceAssets';

/** Proper blue fundal + blue light for the level chip (as instructed). */
const LEVEL_FUNDAL = '#3B82F6';
const LEVEL_FUNDAL_EDGE = 'rgba(59, 130, 246, 0.85)';
const LEVEL_BLUE_GLOW = 'rgba(59, 130, 246, 0.55)';
const LEVEL_BLUE_SOFT = 'rgba(59, 130, 246, 0.28)';

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

  const chipH = Math.max(20, Math.round(circleSize * 0.82));
  const fontPx = Math.max(9, Math.round(chipH * 0.48));
  /** Diamond: full chip height, max width on the left — purple asset, not blue. */
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
        background: `linear-gradient(135deg, ${LEVEL_FUNDAL} 0%, ${LEVEL_FUNDAL_EDGE} 100%)`,
        border: `1px solid ${LEVEL_FUNDAL_EDGE}`,
        boxShadow: `0 0 10px 2px ${LEVEL_BLUE_GLOW}, 0 0 18px 4px ${LEVEL_BLUE_SOFT}`,
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
      <img
        src="/purple-diamond.svg"
        alt=""
        width={diamondW}
        height={diamondH}
        draggable={false}
        style={{
          display: 'block',
          flexShrink: 0,
          width: diamondW,
          height: diamondH,
          objectFit: 'contain',
          /* Same diamond frame shape; black lines on blue fundal */
          filter: 'brightness(0)',
        }}
      />
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
          paddingRight: 2,
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
