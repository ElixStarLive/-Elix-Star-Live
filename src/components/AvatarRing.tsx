import { resolveUiAvatarUrl } from '../lib/royceAssets';

interface AvatarRingProps {
  src: string;
  alt?: string;
  size: number;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
  /** @deprecated All avatars use flat B&W ring now; kept for call-site compatibility. */
  simple?: boolean;
}

/** Avatar — round crop only, no border ring, no yellow glow. */
export function AvatarRing({ src, alt = '', size, className = '', onClick }: AvatarRingProps) {
  const safeAlt = typeof alt === 'string' ? alt : '';
  const imgSrc = resolveUiAvatarUrl(src, safeAlt, size * 2);

  return (
    <div
      className={`relative flex-shrink-0 rounded-full overflow-hidden bg-[#13151A] ${onClick ? 'cursor-pointer' : ''} ${className}`}
      style={{ width: size, height: size }}
      onClick={onClick}
    >
      <img
        src={imgSrc}
        alt={safeAlt}
        className="h-full w-full object-cover object-center"
        draggable={false}
      />
    </div>
  );
}
