import React from 'react';

/** Avatar / icon slot — sized crop only, no decorative ring or background circle. */
export function GoldProfileFrame({
  size = 34,
  className = '',
  children,
}: {
  size?: number;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <span
      className={`relative inline-flex flex-shrink-0 items-center justify-center overflow-hidden rounded-full ${className}`}
      style={{ width: size, height: size }}
    >
      {children}
    </span>
  );
}
