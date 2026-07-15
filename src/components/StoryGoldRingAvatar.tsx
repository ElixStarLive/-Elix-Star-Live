import React from 'react';

/** TikTok-style live red (ring + badge). */
const LIVE_RING_COLOR = '#FE2C55';

/** Live avatars: solid red ring + red LIVE badge. Non-live = same soft glow as AvatarRing (photo fills size). */
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
  /** @deprecated Photo fills `size` like AvatarRing; kept for call-site compatibility. */
  innerDiameterAddMm?: number;
  innerTranslateYmm?: number;
  'data-avatar-circle'?: string;
}) {
  /** Keep ring thin and inside the box so live avatar matches other icon sizes. */
  const ringPx = Math.max(2, Math.min(3, Math.round(size * 0.05)));
  const livePhoto = Math.max(2, size - ringPx * 2);
  const liveBadgeFont = Math.max(5, Math.round(size * 0.11));
  const liveBadgePadX = Math.max(3, Math.round(size * 0.08));
  const liveBadgePadY = Math.max(1, Math.round(size * 0.02));
  const liveBadgeRadius = Math.max(2, Math.round(size * 0.055));
  const safeSrc = src?.length ? src : '';
  const initial = (alt || '?').trim().charAt(0).toUpperCase() || '?';

  return (
    <div
      className={`relative flex-shrink-0 flex items-center justify-center rounded-full royce-avatar-glow ${live ? '' : 'overflow-hidden'} ${className}`}
      style={{ width: size, height: size, isolation: 'isolate', overflow: live ? 'visible' : undefined }}
      {...(dataAvatarCircle ? { 'data-avatar-circle': dataAvatarCircle } : {})}
    >
      {live ? (
        <>
          <div
            className="absolute rounded-full overflow-hidden bg-[#13151A]"
            style={{
              width: livePhoto,
              height: livePhoto,
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 1,
            }}
          >
            {safeSrc ? (
              <img src={safeSrc} alt={alt} className="h-full w-full object-cover object-center" draggable={false} />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-white/70 font-bold text-lg">{initial}</div>
            )}
          </div>
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
      ) : (
        <div
          className="absolute inset-0 rounded-full overflow-hidden bg-[#13151A]"
          style={{
            zIndex: 1,
            transform:
              innerTranslateYmm !== 0
                ? `translateY(${innerTranslateYmm}mm)`
                : undefined,
          }}
        >
          {safeSrc ? (
            <img src={safeSrc} alt={alt} className="h-full w-full object-cover object-center" draggable={false} />
          ) : (
            <div className="h-full w-full flex items-center justify-center text-white/70 font-bold text-lg">{initial}</div>
          )}
        </div>
      )}
    </div>
  );
}
