import React from 'react';

type CaptureShutterButtonProps = {
  size?: number;
  recording?: boolean;
  className?: string;
};

/** White ring + red center — TikTok-style capture / create button. */
export function CaptureShutterButton({
  size = 72,
  recording = false,
  className = '',
}: CaptureShutterButtonProps) {
  const ring = Math.max(3, Math.round(size * 0.06));
  const inner = recording ? Math.round(size * 0.34) : Math.round(size * 0.7);

  return (
    <span
      className={`inline-flex items-center justify-center rounded-full box-border flex-shrink-0 ${className}`}
      style={{
        width: size,
        height: size,
        border: `${ring}px solid #ffffff`,
        background: 'transparent',
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
