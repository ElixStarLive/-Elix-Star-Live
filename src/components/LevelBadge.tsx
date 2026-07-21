import React from 'react';
import { LevelIcon } from './LevelIcon';
import { LEVEL_BADGE_PILL_PX, LEVEL_BADGE_RING_PX } from '../lib/profileFrame';

interface LevelBadgeProps {
  level: number;
  className?: string;
  /** LV pill size when provided; defaults to {@link LEVEL_BADGE_PILL_PX} */
  size?: number;
  /** Profile circle diameter; defaults to {@link LEVEL_BADGE_RING_PX} */
  circleSize?: number;
  layout?: 'fit' | 'fixed';
  variant?: 'clean' | 'default' | 'chat';
  avatar?: string;
  hideCircle?: boolean;
}

export const LevelBadge: React.FC<LevelBadgeProps> = ({
  level,
  className = '',
  size,
  circleSize,
  layout: _layout = 'fit',
  variant: _variant = 'clean',
  avatar,
  hideCircle = false,
}) => {
  const safeLevel = typeof level === 'number' && Number.isFinite(level) && level > 0 ? Math.floor(level) : 1;
  const circleDim =
    typeof circleSize === 'number' && Number.isFinite(circleSize)
      ? Math.max(16, Math.floor(circleSize))
      : LEVEL_BADGE_RING_PX;
  const pillSize =
    typeof size === 'number' && Number.isFinite(size)
      ? Math.max(16, Math.floor(size))
      : LEVEL_BADGE_PILL_PX;

  return (
    <div className={className}>
      <LevelIcon
        level={safeLevel}
        size={pillSize}
        circleSize={circleDim}
        avatarUrl={typeof avatar === 'string' ? avatar : undefined}
        hideCircle={hideCircle}
      />
    </div>
  );
};
