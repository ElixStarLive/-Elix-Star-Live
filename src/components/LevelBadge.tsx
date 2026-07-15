import React from 'react';
import { LevelIcon } from './LevelIcon';

interface LevelBadgeProps {
  level: number;
  className?: string;
  /** LV pill size when provided; omit when only `circleSize` should size the circle/pill ratio */
  size?: number;
  /** Larger profile circle only; level pill uses `size` when set */
  circleSize?: number;
  layout?: 'fit' | 'fixed';
  variant?: 'clean' | 'default' | 'chat';
  avatar?: string;
}

export const LevelBadge: React.FC<LevelBadgeProps> = ({
  level,
  className = '',
  size,
  circleSize,
  layout: _layout = 'fit',
  variant: _variant = 'clean',
  avatar,
}) => {
  const safeLevel = typeof level === 'number' && Number.isFinite(level) && level > 0 ? Math.floor(level) : 1;
  const hasSize = typeof size === 'number' && Number.isFinite(size);
  const circleDim =
    typeof circleSize === 'number' && Number.isFinite(circleSize) ? Math.max(16, Math.floor(circleSize)) : undefined;

  return (
    <div className={className}>
      <LevelIcon
        level={safeLevel}
        {...(hasSize
          ? { size: Math.max(16, Math.floor(size)) }
          : circleDim == null
            ? { size: 40 }
            : {})}
        {...(circleDim != null ? { circleSize: circleDim } : {})}
        avatarUrl={typeof avatar === 'string' ? avatar : undefined}
      />
    </div>
  );
};
