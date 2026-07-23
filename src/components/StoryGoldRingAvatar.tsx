import React from 'react';
import { USER_CIRCLE_GLOW } from '../lib/userCircleGlow';

/** TikTok-style live red (ring + badge). */
const LIVE_RING_COLOR = '#FE2C55';

/**
 * User avatar circle — always shown, with same gold light as the close button.
 * Live adds red ring + LIVE badge; never removes the circle.
 */
export function StoryGoldRingAvatar({
  size = 56,
  src,
  alt = '',
  live = false,
  className = '',
  glow = true,
  innerDiameterAddMm: _innerDiameterAddMm = 0,
  innerTranslateYmm = 0,
  'data-avatar-circle': dataAvatarCircle,
}: {
  size?: number;
  src: string;
  alt?: string;
  live?: boolean;
  className?: string;
  /** Soft gold light (default on). */
  glow?: boolean;
  innerDiameterAddMm?: number;
  innerTranslateYmm?: number;
  'data-avatar-circle'?: string;
}) {
  const safeSize = typeof size === 'number' && Number.isFinite(size) && size > 0 ? Math.floor(size) : 56;
  const ringPx = live ? Math.max(2, Math.min(3, Math.round(safeSize * 0.05))) : 0;
  const photoSize = Math.max(2, safeSize - ringPx * 2);
  const liveBadgeFont = Math.max(5, Math.round(safeSize * 0.11));
  const liveBadgePadX = Math.max(3, Math.round(safeSize * 0.08));
  const liveBadgePadY = Math.max(1, Math.round(safeSize * 0.02));
  const liveBadgeRadius = Math.max(2, Math.round(safeSize * 0.055));
  const safeSrc = typeof src === 'string' && src.trim() ? src.trim() : '';
  const initial = (alt || '?').trim().charAt(0).toUpperCase() || '?';

  return (
    <div
      className={`relative flex-shrink-0 flex items-center justify-center rounded-full ${className}`}
      style={{
        width: safeSize,
        height: safeSize,
        boxShadow: glow ? USER_CIRCLE_GLOW : undefined,
      }}
      {...(dataAvatarCircle ? { 'data-avatar-circle': dataAvatarCircle } : {})}
    >
      <div
        className="rounded-full overflow-hidden bg-[#13151A] flex-shrink-0"
        style={{
          width: photoSize,
          height: photoSize,
          transform: innerTranslateYmm !== 0 ? `translateY(${innerTranslateYmm}mm)` : undefined,
          zIndex: 1,
        }}
      >
        {safeSrc ? (
          <img
            src={safeSrc}
            alt={alt}
            className="block w-full h-full object-cover object-center"
            draggable={false}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white/70 font-bold text-lg">
            {initial}
          </div>
        )}
      </div>
      {live ? (
        <>
          <div
            className="pointer-events-none absolute inset-0 rounded-full"
            style={{
              boxSizing: 'border-box',
              border: `${ringPx}px solid ${LIVE_RING_COLOR}`,
              zIndex: 2,
            }}
            aria-hidden
          />
          <div
            className="pointer-events-none absolute bottom-0 left-1/2 z-[20] -translate-x-1/2 translate-y-1/2 whitespace-nowrap font-bold leading-none text-white"
            style={{
              backgroundColor: LIVE_RING_COLOR,
              fontSize: liveBadgeFont,
              padding: `${liveBadgePadY}px ${liveBadgePadX}px`,
              borderRadius: liveBadgeRadius,
            }}
          >
            LIVE
          </div>
        </>
      ) : null}
    </div>
  );
}
