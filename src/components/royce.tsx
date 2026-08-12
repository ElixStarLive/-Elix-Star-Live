import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { ChevronLeft, ShoppingBasket } from 'lucide-react';

/** One disc size for RoyceIcon — matches right-side 32px discs. */
const DISC = 'royce-glow-disc';
const ICON_IN_DISC = 18;

type RoyceIconProps = {
  icon: LucideIcon;
  size?: number;
  tile?: boolean;
  className?: string;
};

export function RoyceIcon({ icon: Icon, size = ICON_IN_DISC, tile = true, className = '' }: RoyceIconProps) {
  const glyph = typeof size === 'number' && size > 0 ? Math.min(size, ICON_IN_DISC) : ICON_IN_DISC;
  const iconEl = (
    <Icon
      size={glyph}
      strokeWidth={2.25}
      className="royce-icon-gold"
      aria-hidden
    />
  );

  if (tile) {
    return (
      <span className={`${DISC} ${className}`} aria-hidden>
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

export function RoyceBackIcon({ size: _size = 18, className = '' }: RoyceNavIconProps) {
  return (
    <span className={`${DISC} ${className}`} aria-hidden>
      <ChevronLeft size={ICON_IN_DISC} strokeWidth={2.35} className="royce-icon-gold block" />
    </span>
  );
}

export function RoyceCloseIcon(props: RoyceNavIconProps) {
  return <RoyceBackIcon {...props} />;
}

type ShopBasketIconProps = {
  size?: number;
  /** Filled basket — item already in cart. */
  active?: boolean;
  className?: string;
};

/** Wire shopping-basket glyph — readable on small shop card corners. */
export function ShopBasketIcon({ size = 16, active = false, className = '' }: ShopBasketIconProps) {
  return (
    <ShoppingBasket
      size={size}
      strokeWidth={2.25}
      className={className}
      fill={active ? 'currentColor' : 'none'}
      fillOpacity={active ? 0.22 : 0}
      aria-hidden
    />
  );
}
