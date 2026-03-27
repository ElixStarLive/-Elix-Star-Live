import React from 'react';
import { PROFILE_RING_INNER_RATIO, PROFILE_RING_IMAGE_LIFT_MM } from '../lib/profileFrame';

/**
 * Golden ring from public asset `/Icons/Profile icon.png`, centered content (e.g. + icon or avatar).
 * Matches feed/video player framing — no CSS faux ring.
 */
export function GoldProfileFrame({
  size = 34,
  className = '',
  children,
}: {
  size?: number;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={`relative flex flex-shrink-0 items-center justify-center ${className}`}
      style={{ width: size, height: size, isolation: 'isolate' }}
    >
      {children != null && (
        <div
          className="pointer-events-none absolute inset-0 z-[0] flex items-center justify-center overflow-hidden rounded-full"
          style={{
            width: `${PROFILE_RING_INNER_RATIO * 100}%`,
            height: `${PROFILE_RING_INNER_RATIO * 100}%`,
            top: `calc(50% - ${PROFILE_RING_IMAGE_LIFT_MM}mm)`,
            left: '50%',
            transform: 'translate(-50%, -50%)',
          }}
        >
          {children}
        </div>
      )}
      <img
        src="/Icons/Profile icon.png"
        alt=""
        className="pointer-events-none absolute inset-0 z-[1] h-full w-full object-contain"
      />
    </div>
  );
}
