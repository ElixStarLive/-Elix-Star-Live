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

const SILVER_RING = '#E6E9EE';

/**
 * User avatar circle — silver ring flush on the photo (same as story circles).
 * Do not remove the circle.
 */
export function AvatarRing({ src, alt = '', size, className = '', onClick }: AvatarRingProps) {
  const safeAlt = typeof alt === 'string' ? alt : '';
  const safeSize = typeof size === 'number' && Number.isFinite(size) && size > 0 ? Math.floor(size) : 40;
  const imgSrc = resolveUiAvatarUrl(src, safeAlt, safeSize * 2);

  return (
    <div
      className={`elix-profile-ring relative flex-shrink-0 rounded-full overflow-hidden ${onClick ? 'cursor-pointer' : ''} ${className}`}
      style={{
        width: safeSize,
        height: safeSize,
        boxSizing: 'border-box',
        border: `2px solid ${SILVER_RING}`,
        background: '#121419',
      }}
      onClick={onClick}
    >
      <img
        src={imgSrc}
        alt={safeAlt}
        className="block w-full h-full object-cover object-center"
        draggable={false}
      />
    </div>
  );
}
