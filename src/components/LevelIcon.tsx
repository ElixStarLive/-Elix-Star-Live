import React from 'react';
import { PROFILE_RING_IMAGE_LIFT_MM, profileRingInnerPx } from '../lib/profileFrame';
import { ROYCE_DEFAULT_AVATAR } from '../lib/royceAssets';

/** Royal Purple diamond — chart Diamond #E0AAFF */
function LevelDiamondIcon({ size = 12 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      className="flex-shrink-0"
      aria-hidden
      style={{ filter: 'drop-shadow(0 0 4px rgba(224,170,255,0.95))' }}
    >
      <path
        d="M8 1.2 L14.2 6.1 L8 14.8 L1.8 6.1 Z"
        fill="#E0AAFF"
        fillOpacity="0.22"
        stroke="#E0AAFF"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M8 1.2 L14.2 6.1 L8 7.2 L1.8 6.1 Z" fill="#E0AAFF" opacity="0.65" />
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

  /** Longer rounded level chip: larger diamond + number (no LV), beside chat circle. */
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
        background: 'rgba(8, 10, 22, 0.45)',
        border: '1px solid rgba(224, 170, 255, 0.45)',
        boxShadow: '0 1px 4px rgba(0,0,0,0.35)',
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
