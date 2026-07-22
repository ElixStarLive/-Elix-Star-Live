import React from 'react';
import { PROFILE_RING_IMAGE_LIFT_MM, profileRingInnerPx } from '../lib/profileFrame';
import { ROYCE_DEFAULT_AVATAR } from '../lib/royceAssets';

/** Chat level pill — deep purple matching the reference badge. */
const LEVEL_PILL_BG = '#5B2DB3';

/**
 * Faceted gem (flat top, point bottom) left of the level number — same layout as reference.
 */
function LevelDiamondIcon({ size = 12 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      style={{ display: 'block', flexShrink: 0 }}
    >
      {/* Outer gem silhouette */}
      <path d="M5 7.2 L7.2 3.2 H12.8 L15 7.2 L10 17.2 Z" fill="#F3E8FF" />
      {/* Top crown facets */}
      <path d="M5 7.2 H15 L12.8 3.2 H7.2 Z" fill="#FFFFFF" />
      <path d="M7.2 3.2 L10 7.2 L12.8 3.2 Z" fill="#E9D5FF" />
      {/* Left / right pavilion */}
      <path d="M5 7.2 L10 7.2 L10 17.2 Z" fill="#DDD6FE" />
      <path d="M15 7.2 L10 7.2 L10 17.2 Z" fill="#C4B5FD" />
      {/* Center shine */}
      <path d="M8.2 7.2 L10 12.5 L11.8 7.2 Z" fill="#FFFFFF" opacity="0.85" />
      <path
        d="M5 7.2 L7.2 3.2 H12.8 L15 7.2 L10 17.2 Z"
        stroke="rgba(255,255,255,0.95)"
        strokeWidth="0.7"
        strokeLinejoin="round"
        fill="none"
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

  /** Reference: purple pill — gem left, white level number right. */
  const chipH = Math.max(16, Math.min(20, Math.round(circleSize * 0.7)));
  const fontPx = Math.max(10, Math.round(chipH * 0.58));
  const diamondPx = Math.max(11, Math.min(13, Math.round(chipH * 0.68)));
  const levelChip = (
    <div
      style={{
        position: 'relative',
        zIndex: 1,
        height: chipH,
        borderRadius: 999,
        background: LEVEL_PILL_BG,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
        paddingLeft: 5,
        paddingRight: 7,
        flexShrink: 0,
      }}
    >
      <LevelDiamondIcon size={diamondPx} />
      <span
        style={{
          color: '#FFFFFF',
          fontWeight: 800,
          letterSpacing: '0.01em',
          fontSize: fontPx,
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
