import React from 'react';

type CaptureShutterButtonProps = {
  size?: number;
  recording?: boolean;
  /** Bottom nav create — thicker white ring, larger red fill */
  nav?: boolean;
  className?: string;
};

/** White ring + red center — TikTok-style capture / create button. */
export function CaptureShutterButton({
  size = 72,
  recording = false,
  nav = false,
  className = '',
}: CaptureShutterButtonProps) {
  const ring = nav
    ? Math.max(4, Math.round(size * 0.09))
    : Math.max(3, Math.round(size * 0.06));
  const inner = recording
    ? Math.round(size * 0.34)
    : nav
      ? Math.round(size * 0.74)
      : Math.round(size * 0.7);

  return (
    <span
      className={`inline-flex items-center justify-center rounded-full box-border flex-shrink-0 ${className}`}
      style={{
        width: size,
        height: size,
        border: `${ring}px solid #ffffff`,
        background: 'transparent',
        boxShadow: nav ? '0 0 0 1px rgba(0,0,0,0.35)' : undefined,
      }}
      aria-hidden
    >
      <span
        className={recording ? 'rounded-[4px] bg-[#FE2C55]' : 'rounded-full bg-[#FE2C55]'}
        style={{ width: inner, height: inner }}
      />
    </span>
  );
}
