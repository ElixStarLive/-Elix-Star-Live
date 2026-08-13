import React from 'react';
import { isPlaceholderLiveAvatar } from '../lib/liveCreatorDisplay';

/** Live badge + live ring (red) when on-air; silver ring otherwise. */
const SILVER_RING = '#E6E9EE';
const LIVE_RING = '#FF2D55';

/**
 * User avatar circle — silver ring flush on the photo (no gap).
 * Live: red live ring + LIVE badge below.
 * Real profile photo only — empty dark circle when no photo (no initials/icons).
 */
export function StoryGoldRingAvatar({
  size = 56,
  src,
  alt = '',
  live = false,
  className = '',
  innerDiameterAddMm: _innerDiameterAddMm = 0,
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
  const safeSize = typeof size === 'number' && Number.isFinite(size) && size > 0 ? Math.floor(size) : 56;
  const liveBadgeFont = Math.max(5, Math.round(safeSize * 0.11));
  const liveBadgePadX = Math.max(3, Math.round(safeSize * 0.08));
  const liveBadgePadY = Math.max(1, Math.round(safeSize * 0.02));
  const liveBadgeRadius = Math.max(2, Math.round(safeSize * 0.055));
  const rawSrc = typeof src === 'string' ? src.trim() : '';
  const showPhoto = Boolean(rawSrc) && !isPlaceholderLiveAvatar(rawSrc);
  const ringColor = live ? LIVE_RING : SILVER_RING;

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
        className={`elix-profile-ring absolute inset-0 rounded-full overflow-hidden ${live ? 'elix-story-live-ring' : ''}`}
        style={{
          boxSizing: 'border-box',
          border: `2.5px solid ${ringColor}`,
          background: '#121419',
        }}
      >
        {showPhoto ? (
          <img
            src={rawSrc}
            alt={alt}
            className="block w-full h-full object-cover object-center"
            style={{
              transform: innerTranslateYmm !== 0 ? `translateY(${innerTranslateYmm}mm)` : undefined,
            }}
            draggable={false}
          />
        ) : null}
      </div>
      {live ? (
        <div
          className="pointer-events-none absolute bottom-0 left-1/2 z-[20] -translate-x-1/2 translate-y-1/2 whitespace-nowrap font-bold leading-none"
          style={{
            backgroundColor: LIVE_RING,
            color: '#FFFFFF',
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
