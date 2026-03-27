import { profileRingInnerPx, PROFILE_RING_IMAGE_LIFT_MM } from '../lib/profileFrame';

interface AvatarRingProps {
  src: string;
  alt?: string;
  size: number;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
  /** One flat circular avatar (no inner disc + ring PNG stack) — use for dense rows like MVP / top viewers. */
  simple?: boolean;
}

export function AvatarRing({ src, alt = '', size, className = '', onClick, simple = false }: AvatarRingProps) {
  const innerSize = profileRingInnerPx(size);
  const safeSrc = (typeof src === 'string' && src.length > 0) ? src : '/Icons/Profile icon.png';
  const safeAlt = typeof alt === 'string' ? alt : '';

  if (simple) {
    return (
      <div
        className={`relative flex-shrink-0 rounded-full overflow-hidden border-2 border-[#C9A96E]/70 bg-[#13151A] ${onClick ? 'cursor-pointer' : ''} ${className}`}
        style={{ width: size, height: size }}
        onClick={onClick}
      >
        <img
          src={safeSrc}
          alt={safeAlt}
          className="h-full w-full object-cover object-center"
          style={{ objectPosition: 'center center', transform: `translateY(-${PROFILE_RING_IMAGE_LIFT_MM}mm)` }}
        />
      </div>
    );
  }

  return (
    <div
      className={`relative flex flex-shrink-0 items-center justify-center rounded-full ${onClick ? 'cursor-pointer' : ''} ${className}`}
      style={{ width: size, height: size, isolation: 'isolate' }}
      onClick={onClick}
    >
      <div
        className="absolute overflow-hidden rounded-full bg-[#1a1c22]"
        style={{
          width: innerSize,
          height: innerSize,
          top: `calc(50% - ${PROFILE_RING_IMAGE_LIFT_MM}mm)`,
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 1,
        }}
      >
        <img
          src={safeSrc}
          alt={safeAlt}
          className="h-full w-full object-cover object-center"
          style={{ objectPosition: 'center center' }}
        />
      </div>
      <img
        src="/Icons/Profile icon.png"
        alt=""
        className="pointer-events-none absolute inset-0 z-[2] h-full w-full object-contain"
      />
    </div>
  );
}
