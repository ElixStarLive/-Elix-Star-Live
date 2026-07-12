import React from 'react';
import {
  storyRingInnerPx,
  PROFILE_RING_IMAGE_LIFT_MM,
  liveAvatarRingMaskStyle,
} from '../lib/profileFrame';

/** CSS px per mm (1in = 96px, 1in = 25.4mm). */
const MM_TO_PX = 96 / 25.4;

/**
 * Story / profile avatar — round crop; red ring when live.
 */
export function StoryGoldRingAvatar({
  size = 56,
  src,
  alt = '',
  live = false,
  className = '',
  innerDiameterAddMm = 0,
  innerTranslateYmm = 0,
  'data-avatar-circle': dataAvatarCircle,
}: {
  size?: number;
  src: string;
  alt?: string;
  live?: boolean;
  className?: string;
  innerDiameterAddMm?: number;
  innerTranslateYmm?: number;
  'data-avatar-circle'?: string;
}) {
  const inner = Math.max(2, Math.round(storyRingInnerPx(size) + innerDiameterAddMm * MM_TO_PX));
  const safeSrc = src?.length ? src : '';
  const initial = (alt || '?').trim().charAt(0).toUpperCase() || '?';

  return (
    <div
      className={`relative flex items-center justify-center ${className}`}
      style={{ width: size, height: size, isolation: 'isolate' }}
      {...(dataAvatarCircle ? { 'data-avatar-circle': dataAvatarCircle } : {})}
    >
      <div
        className={`absolute rounded-full overflow-hidden bg-black ${
          live ? '' : 'border border-white/80'
        }`}
        style={{
          width: inner,
          height: inner,
          top: `calc(50% - ${PROFILE_RING_IMAGE_LIFT_MM}mm)`,
          left: '50%',
          transform:
            innerTranslateYmm !== 0
              ? `translate(-50%, calc(-50% + ${innerTranslateYmm}mm))`
              : 'translate(-50%, -50%)',
          zIndex: 1,
        }}
      >
        {safeSrc ? (
          <img src={safeSrc} alt={alt} className="h-full w-full object-cover object-center" draggable={false} />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-white/70 font-bold text-lg">{initial}</div>
        )}
      </div>

      {live ? (
        <div
          className="pointer-events-none absolute rounded-full"
          style={{
            ...liveAvatarRingMaskStyle(),
            zIndex: 2,
            inset: 0,
          }}
          aria-hidden
        />
      ) : null}

      {live && (
        <div className="pointer-events-none absolute bottom-0 left-1/2 z-[20] -translate-x-1/2 translate-y-1/2 whitespace-nowrap rounded-full border border-white bg-black px-1.5 py-0.5 text-[7px] font-bold leading-none text-white">
          LIVE
        </div>
      )}
    </div>
  );
}
