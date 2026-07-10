import React from 'react';

/** Black & white circular frame for + icon / small content (no PNG ring). */
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
    <div
      className={`relative flex flex-shrink-0 items-center justify-center rounded-full border-2 border-white bg-black ${className}`}
      style={{ width: size, height: size }}
    >
      {children}
    </div>
  );
}
