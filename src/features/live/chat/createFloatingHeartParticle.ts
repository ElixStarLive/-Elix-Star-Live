/**
 * Shared host↔spectator floating-heart particle geometry.
 */

export type FloatingHeartParticle = {
  id: string;
  x: number;
  y: number;
  dx: number;
  rot: number;
  size: number;
  color: string;
  username?: string;
  avatar?: string;
  isMembership?: boolean;
};

const HEART_COLORS = ['#FF0000', '#ffffff', '#E60026', '#E6E9EE', '#FF1744', '#CC0000'];

/** Build one floating-heart particle (geometry only — callers own state/timers). */
export function createFloatingHeartParticle(opts: {
  x: number;
  y: number;
  colorOverride?: string;
  username?: string;
  avatar?: string;
  isMembership?: boolean;
}): FloatingHeartParticle {
  const id = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const dx = Math.round((Math.random() * 2 - 1) * 120);
  const rot = Math.round((Math.random() * 2 - 1) * 45);
  const size = Math.round(24 + Math.random() * 12);
  const color =
    opts.colorOverride ?? HEART_COLORS[Math.floor(Math.random() * HEART_COLORS.length)];
  return {
    id,
    x: opts.x,
    y: opts.y,
    dx,
    rot,
    size,
    color,
    username: opts.username,
    avatar: opts.avatar,
    isMembership: opts.isMembership,
  };
}
