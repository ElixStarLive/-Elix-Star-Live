import { resolveUiAvatarUrl } from '../lib/royceAssets';

/** Same soft gold light as close / royce-glow-disc. */
export const USER_CIRCLE_GLOW =
  '0 0 10px 2px rgba(212, 175, 55, 0.42), 0 0 22px 5px rgba(212, 175, 55, 0.18)';

interface AvatarRingProps {
  src: string;
  alt?: string;
  size: number;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
  /** @deprecated All avatars use flat B&W ring now; kept for call-site compatibility. */
  simple?: boolean;
}

/** Avatar — round crop + same gold light as close button. */
export function AvatarRing({ src, alt = '', size, className = '', onClick }: AvatarRingProps) {
  const safeAlt = typeof alt === 'string' ? alt : '';
  const imgSrc = resolveUiAvatarUrl(src, safeAlt, size * 2);

  return (
    <div
      className={`relative flex-shrink-0 rounded-full overflow-visible ${onClick ? 'cursor-pointer' : ''} ${className}`}
      style={{ width: size, height: size, boxShadow: USER_CIRCLE_GLOW }}
      onClick={onClick}
    >
      <div className="absolute inset-0 rounded-full overflow-hidden bg-[#13151A]">
        <img
          src={imgSrc}
          alt={safeAlt}
          className="h-full w-full object-cover object-center"
          draggable={false}
        />
      </div>
    </div>
  );
}
