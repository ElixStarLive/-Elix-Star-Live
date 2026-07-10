import { PROFILE_RING_IMAGE_LIFT_MM } from '../lib/profileFrame';

interface AvatarRingProps {
  src: string;
  alt?: string;
  size: number;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
  /** @deprecated All avatars use flat B&W ring now; kept for call-site compatibility. */
  simple?: boolean;
}

/** Avatar — round crop only, no border ring. */
export function AvatarRing({ src, alt = '', size, className = '', onClick }: AvatarRingProps) {
  const safeSrc = typeof src === 'string' && src.length > 0 ? src : '';
  const safeAlt = typeof alt === 'string' ? alt : '';
  const initial = safeAlt.trim().charAt(0).toUpperCase() || '?';

  return (
    <div
      className={`relative flex-shrink-0 rounded-full overflow-hidden bg-black ${onClick ? 'cursor-pointer' : ''} ${className}`}
      style={{ width: size, height: size }}
      onClick={onClick}
    >
      {safeSrc ? (
        <img
          src={safeSrc}
          alt={safeAlt}
          className="h-full w-full object-cover object-center"
          style={{ objectPosition: 'center center', transform: `translateY(-${PROFILE_RING_IMAGE_LIFT_MM}mm)` }}
        />
      ) : (
        <div className="h-full w-full flex items-center justify-center text-white/70 text-sm font-bold">
          {initial}
        </div>
      )}
    </div>
  );
}
