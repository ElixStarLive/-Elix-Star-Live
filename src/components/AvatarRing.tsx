import { isPlaceholderLiveAvatar } from '../lib/liveCreatorDisplay';

interface AvatarRingProps {
  src: string;
  alt?: string;
  size: number;
  className?: string;
  /** Ring stroke colour. Default silver; pass MVP gold only for #1 MVP circles. */
  ringColor?: string;
  onClick?: (e: React.MouseEvent) => void;
}

const SILVER_RING = '#D8D9DD';

/**
 * User avatar circle — silver ring flush on the photo (same as story circles).
 * Real profile photo only. No initials, logo, or generated icons inside the circle.
 */
export function AvatarRing({
  src,
  alt = '',
  size,
  className = '',
  ringColor = SILVER_RING,
  onClick,
}: AvatarRingProps) {
  const safeAlt = typeof alt === 'string' ? alt : '';
  const safeSize = typeof size === 'number' && Number.isFinite(size) && size > 0 ? Math.floor(size) : 40;
  const photo = typeof src === 'string' ? src.trim() : '';
  const showPhoto = Boolean(photo) && !isPlaceholderLiveAvatar(photo);
  const stroke = typeof ringColor === 'string' && ringColor.trim() ? ringColor.trim() : SILVER_RING;

  return (
    <div
      className={`elix-profile-ring relative flex-shrink-0 rounded-full overflow-hidden ${onClick ? 'cursor-pointer' : ''} ${className}`}
      style={{
        width: safeSize,
        height: safeSize,
        boxSizing: 'border-box',
        border: `1px solid ${stroke}`,
        background: '#121419',
      }}
      onClick={onClick}
    >
      {showPhoto ? (
        <img
          src={photo}
          alt={safeAlt}
          className="block w-full h-full object-cover object-center"
          draggable={false}
        />
      ) : null}
    </div>
  );
}
