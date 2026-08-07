import { resolveUiAvatarUrl } from '../lib/royceAssets';
import { USER_CIRCLE_GLOW } from '../lib/userCircleGlow';

export { USER_CIRCLE_GLOW };

interface AvatarRingProps {
  src: string;
  alt?: string;
  size: number;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
}

/**
 * User avatar circle — half silver / half red ring (same as icon discs).
 * Do not remove the circle.
 */
export function AvatarRing({ src, alt = '', size, className = '', onClick }: AvatarRingProps) {
  const safeAlt = typeof alt === 'string' ? alt : '';
  const safeSize = typeof size === 'number' && Number.isFinite(size) && size > 0 ? Math.floor(size) : 40;
  const imgSrc = resolveUiAvatarUrl(src, safeAlt, safeSize * 2);

  return (
    <div
      className={`elix-profile-ring relative flex-shrink-0 rounded-full ${onClick ? 'cursor-pointer' : ''} ${className}`}
      style={{
        width: safeSize,
        height: safeSize,
      }}
      onClick={onClick}
    >
      <div
        className="w-full h-full rounded-full overflow-hidden bg-[#1A1A1F]"
        style={{ width: '100%', height: '100%' }}
      >
        <img
          src={imgSrc}
          alt={safeAlt}
          className="block w-full h-full object-cover object-center"
          draggable={false}
        />
      </div>
    </div>
  );
}
