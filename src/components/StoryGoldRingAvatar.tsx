import React from 'react';

/** Live badge + ring — silver accent (exact theme). */
const SILVER_RING = '#E6E9EE';

/**
 * User avatar circle — silver ring flush on the photo (no gap).
 * Live adds LIVE badge below; ring stays the same tight silver border.
 */
export function StoryGoldRingAvatar({
  size = 56,
  src,
  alt = '',
  live = false,
  className = '',
  glow: _glow = true,
  innerDiameterAddMm: _innerDiameterAddMm = 0,
  innerTranslateYmm = 0,
  'data-avatar-circle': dataAvatarCircle,
}: {
  size?: number;
  src: string;
  alt?: string;
  live?: boolean;
  className?: string;
  /** Kept for call-site compatibility. */
  glow?: boolean;
  innerDiameterAddMm?: number;
  innerTranslateYmm?: number;
  'data-avatar-circle'?: string;
}) {
  const safeSize = typeof size === 'number' && Number.isFinite(size) && size > 0 ? Math.floor(size) : 56;
  const liveBadgeFont = Math.max(5, Math.round(safeSize * 0.11));
  const liveBadgePadX = Math.max(3, Math.round(safeSize * 0.08));
  const liveBadgePadY = Math.max(1, Math.round(safeSize * 0.02));
  const liveBadgeRadius = Math.max(2, Math.round(safeSize * 0.055));
  const safeSrc = typeof src === 'string' && src.trim() ? src.trim() : '';
  const initial = (alt || '?').trim().charAt(0).toUpperCase() || '?';

  return (
    <div
      className={`relative flex-shrink-0 ${className}`}
      style={{
        width: safeSize,
        height: safeSize,
      }}
      {...(dataAvatarCircle ? { 'data-avatar-circle': dataAvatarCircle } : {})}
    >
      <div
        className="elix-profile-ring absolute inset-0 rounded-full overflow-hidden"
        style={{
          boxSizing: 'border-box',
          border: `2px solid ${SILVER_RING}`,
          background: '#1A1A1F',
        }}
      >
        {safeSrc ? (
          <img
            src={safeSrc}
            alt={alt}
            className="block w-full h-full object-cover object-center"
            style={{
              transform: innerTranslateYmm !== 0 ? `translateY(${innerTranslateYmm}mm)` : undefined,
            }}
            draggable={false}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white/70 font-bold text-lg">
            {initial}
          </div>
        )}
      </div>
      {live ? (
        <div
          className="pointer-events-none absolute bottom-0 left-1/2 z-[20] -translate-x-1/2 translate-y-1/2 whitespace-nowrap font-bold leading-none"
          style={{
            backgroundColor: SILVER_RING,
            color: '#080A0E',
            fontSize: liveBadgeFont,
            padding: `${liveBadgePadY}px ${liveBadgePadX}px`,
            borderRadius: liveBadgeRadius,
          }}
        >
          LIVE
        </div>
      ) : null}
    </div>
  );
}
