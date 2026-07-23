import { resolveUiAvatarUrl } from '../lib/royceAssets';
import { USER_CIRCLE_GLOW } from '../lib/userCircleGlow';

export { USER_CIRCLE_GLOW };

interface AvatarRingProps {
  src: string;
  alt?: string;
  size: number;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
  /** @deprecated kept for call-site compatibility */
  simple?: boolean;
}

/**
 * User avatar circle — always shown, with same gold light as the close button.
 * Do not remove the circle; light is additive only.
 */
export function AvatarRing({ src, alt = '', size, className = '', onClick }: AvatarRingProps) {
  const safeAlt = typeof alt === 'string' ? alt : '';
  const safeSize = typeof size === 'number' && Number.isFinite(size) && size > 0 ? Math.floor(size) : 40;
  const imgSrc = resolveUiAvatarUrl(src, safeAlt, safeSize * 2);

  return (
    <div
      className={`relative flex-shrink-0 rounded-full ${onClick ? 'cursor-pointer' : ''} ${className}`}
      style={{
        width: safeSize,
        height: safeSize,
        boxShadow: USER_CIRCLE_GLOW,
      }}
      onClick={onClick}
    >
      <div
        className="w-full h-full rounded-full overflow-hidden bg-[#13151A]"
        style={{ width: safeSize, height: safeSize }}
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
