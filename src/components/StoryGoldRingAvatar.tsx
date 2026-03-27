import React from 'react';
import { storyRingInnerPx, PROFILE_RING_IMAGE_LIFT_MM } from '../lib/profileFrame';

/** CSS px per mm (1in = 96px, 1in = 25.4mm). */
const MM_TO_PX = 96 / 25.4;

const FRAME_SRC = '/Icons/Profile icon.png';

const LIVE_RING_STYLE: React.CSSProperties = {
  background: 'conic-gradient(#ff0040, #ff6a00, #ff0040, #ff6a00, #ff0040)',
  WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 4px))',
  mask: 'radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 4px))',
};

/**
 * Gold `Profile icon.png` on top; avatar clipped to the inner circle behind it (and behind the live gradient ring when live).
 */
export function StoryGoldRingAvatar({
  size = 56,
  src,
  alt = '',
  live = false,
  className = '',
  /** Extra inner photo diameter in mm (positive = larger). */
  innerDiameterAddMm = 0,
  /** Nudge inner photo vertically in mm (positive = down). */
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
  const safeSrc = src?.length ? src : FRAME_SRC;

  return (
    <div
      className={`relative flex items-center justify-center ${className}`}
      style={{ width: size, height: size, isolation: 'isolate' }}
      {...(dataAvatarCircle ? { 'data-avatar-circle': dataAvatarCircle } : {})}
    >
      <div
        className="absolute rounded-full overflow-hidden bg-[#13151A]"
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
        <img src={safeSrc} alt={alt} className="h-full w-full object-cover object-center" draggable={false} />
      </div>

      {live && (
        <div
          className="pointer-events-none absolute rounded-full"
          style={{
            ...LIVE_RING_STYLE,
            zIndex: 2,
            inset: '0.5mm',
            top: '0mm',
          }}
        />
      )}

      {!live && (
        <img
          src={FRAME_SRC}
          alt=""
          className="pointer-events-none absolute inset-0 h-full w-full object-contain"
          style={{ zIndex: 3 }}
          draggable={false}
        />
      )}

      {live && (
        <div className="pointer-events-none absolute bottom-[calc(2px+0.5mm)] left-1/2 z-[20] -translate-x-1/2 translate-y-[35%] whitespace-nowrap rounded-full bg-red-500 px-[0.7mm] py-[0.1mm] text-[6px] font-bold leading-none text-white">
          LIVE
        </div>
      )}
    </div>
  );
}
