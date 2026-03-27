import React from 'react';
import { LevelIcon } from './LevelIcon';

interface LevelBadgeProps {
  level: number;
  className?: string;
  size?: number;
  /** Larger profile circle only; level pill uses `size` */
  circleSize?: number;
  layout?: 'fit' | 'fixed';
  variant?: 'clean' | 'default' | 'chat';
  avatar?: string;
}

export const LevelBadge: React.FC<LevelBadgeProps> = ({
  level,
  className = '',
  size = 40,
  circleSize,
  layout: _layout = 'fit',
  variant: _variant = 'clean',
  avatar,
}) => {
  const safeLevel = typeof level === 'number' && Number.isFinite(level) && level > 0 ? Math.floor(level) : 1;
  const dim = typeof size === 'number' && Number.isFinite(size) ? Math.max(16, Math.floor(size)) : 40;
  const circleDim =
    typeof circleSize === 'number' && Number.isFinite(circleSize) ? Math.max(16, Math.floor(circleSize)) : undefined;

  return (
    <div className={className}>
      <LevelIcon
        level={safeLevel}
        size={dim}
        {...(circleDim != null ? { circleSize: circleDim } : {})}
        avatarUrl={typeof avatar === 'string' ? avatar : undefined}
      />
    </div>
  );
};