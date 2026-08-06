import React from 'react';

type CaptureShutterButtonProps = {
  size?: number;
  recording?: boolean;
  /** Bottom nav create — thicker ring, larger accent fill */
  nav?: boolean;
  className?: string;
};

/**
 * Capture / create shutter — outer half-silver / half-violet ring + violet center.
 * Structure locked; theme only changes red → Royal Violet.
 */
export function CaptureShutterButton({
  size = 72,
  recording = false,
  nav = false,
  className = '',
}: CaptureShutterButtonProps) {
  const ringPx = nav
    ? Math.max(4, Math.round(size * 0.09))
    : Math.max(3, Math.round(size * 0.06));
  const inner = recording
    ? Math.round(size * 0.34)
    : nav
      ? Math.round(size * 0.74)
      : Math.round(size * 0.7);

  return (
    <span
      className={`capture-shutter-ring relative inline-flex items-center justify-center rounded-full box-border flex-shrink-0 ${className}`}
      style={{
        width: size,
        height: size,
        border: 'none',
        background: 'transparent',
        ['--shutter-ring' as string]: `${ringPx}px`,
        boxShadow: nav ? '0 0 0 1px rgba(0,0,0,0.35)' : undefined,
      }}
      aria-hidden
    >
      <span
        className={recording ? 'rounded-[4px] bg-[#6F3FF5]' : 'rounded-full bg-[#6F3FF5]'}
        style={{ width: inner, height: inner, position: 'relative', zIndex: 1 }}
      />
    </span>
  );
}
