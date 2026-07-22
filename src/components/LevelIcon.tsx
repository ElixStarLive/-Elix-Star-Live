import React from 'react';
import { Gem } from 'lucide-react';
import { PROFILE_RING_IMAGE_LIFT_MM, profileRingInnerPx } from '../lib/profileFrame';
import { ROYCE_DEFAULT_AVATAR } from '../lib/royceAssets';

/** Bright chip fundal per level — not black / not near-black. */
const LEVEL_CHIP_BACKGROUNDS = [
  '#FF4D6D', // hot pink
  '#3DA3FF', // neon blue
  '#00E5A8', // mint
  '#FF8A00', // orange
  '#A855F7', // purple
  '#22C55E', // green
  '#F43F5E', // rose
  '#06B6D4', // cyan
  '#EAB308', // yellow
  '#EC4899', // magenta
  '#6366F1', // indigo
  '#F97316', // vivid orange
] as const;

function levelChipBackground(level: number): string {
  const i = Math.max(0, (level - 1) % LEVEL_CHIP_BACKGROUNDS.length);
  return LEVEL_CHIP_BACKGROUNDS[i];
}

/**
 * Small Lucide Gem before level number.
 * Bright cyan gem + white frame — visible on every coloured fundal (no black, no gold).
 */
function LevelDiamondIcon({ size = 12 }: { size?: number }) {
  return (
    <span
      className="relative inline-flex flex-shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
      aria-hidden
    >
      {/* White frame — readable on any bright chip colour */}
      <Gem
        size={size}
        strokeWidth={2.8}
        fill="none"
        className="level-gem-icon-frame absolute inset-0"
        style={{ color: '#FFFFFF', stroke: '#FFFFFF', fill: 'none' }}
      />
      {/* Visible gem — accent cyan */}
      <Gem
        size={size}
        strokeWidth={1.7}
        fill="none"
        className="level-gem-icon relative"
        style={{ color: '#5EEAD4', stroke: '#5EEAD4', fill: 'none' }}
      />
    </span>
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

  /** Small gem + level number on a per-level coloured chip. */
  const chipH = Math.max(18, Math.round(circleSize * 0.78));
  const fontPx = Math.max(9, Math.round(chipH * 0.48));
  const diamondPx = Math.max(10, Math.min(14, Math.round(chipH * 0.55)));
  const chipBg = levelChipBackground(safeLevel);
  const levelChip = (
    <div
      style={{
        position: 'relative',
        zIndex: 1,
        height: chipH,
        minWidth: chipH,
        borderRadius: 6,
        background: chipBg,
        border: '1px solid rgba(255, 255, 255, 0.35)',
        boxShadow: '0 1px 4px rgba(0,0,0,0.35)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
        paddingLeft: 5,
        paddingRight: 5,
        flexShrink: 0,
      }}
    >
      <LevelDiamondIcon size={diamondPx} />
      <span
        style={{
          color: '#F2F2F2',
          fontWeight: 900,
          letterSpacing: '0.01em',
          fontSize: fontPx,
          textShadow: '0 1px 2px rgba(0,0,0,0.9)',
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
