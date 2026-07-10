import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { ChevronLeft, X } from 'lucide-react';

export { ROYCE_DEFAULT_AVATAR, ROYCE_ELIX_MARK, ROYCE_MEMBERSHIP } from '../lib/royceAssets';

type RoyceIconProps = {
  icon: LucideIcon;
  size?: number;
  active?: boolean;
  tile?: boolean;
  className?: string;
};

export function RoyceIcon({ icon: Icon, size = 22, active = false, tile = false, className = '' }: RoyceIconProps) {
  const iconEl = (
    <Icon
      size={size}
      strokeWidth={2.25}
      className={active ? 'royce-icon-gold' : 'royce-icon-muted'}
      aria-hidden
    />
  );

  if (tile) {
    return (
      <span className={`royce-tile inline-flex items-center justify-center rounded-sm p-1 ${className}`} aria-hidden>
        {iconEl}
      </span>
    );
  }

  return <span className={`inline-flex items-center justify-center ${className}`}>{iconEl}</span>;
}

type RoyceNavIconProps = {
  size?: number;
  className?: string;
};

export function RoyceBackIcon({ size = 18, className = '' }: RoyceNavIconProps) {
  return (
    <span className={`royce-tile inline-flex items-center justify-center rounded-sm p-1 ${className}`} aria-hidden>
      <ChevronLeft size={size} strokeWidth={2.35} className="royce-icon-gold block" />
    </span>
  );
}

export function RoyceCloseIcon({ size = 18, className = '' }: RoyceNavIconProps) {
  return (
    <span className={`royce-tile inline-flex items-center justify-center rounded-sm p-1 ${className}`} aria-hidden>
      <X size={size} strokeWidth={2.35} className="royce-icon-gold block" />
    </span>
  );
}
