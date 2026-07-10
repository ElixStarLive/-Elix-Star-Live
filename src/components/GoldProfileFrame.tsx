import React from 'react';

/** Small circular frame for icons — no border ring. */
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
      className={`relative flex flex-shrink-0 items-center justify-center rounded-full bg-black ${className}`}
      style={{ width: size, height: size }}
    >
      {children}
    </div>
  );
}
