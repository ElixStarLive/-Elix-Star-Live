/** App max level (matches Neon level curve). */
export const LEVEL_MAX = 300;

/**
 * ELIX STAR LIVE diamond tiers (every 20 levels).
 * Background + diamond glow from owner colour chart.
 */
const LEVEL_TIER_COLORS: readonly {
  max: number;
  background: string;
  glow: string;
  name: string;
}[] = [
  { max: 20, background: '#4A148C', glow: '#C77DFF', name: 'Purple' },
  { max: 40, background: '#0D47A1', glow: '#3399FF', name: 'Blue' },
  { max: 60, background: '#006C84', glow: '#33CCFF', name: 'Cyan' },
  { max: 80, background: '#00796B', glow: '#4EFFF7', name: 'Teal' },
  { max: 100, background: '#1B5E20', glow: '#4ADE80', name: 'Green' },
  { max: 120, background: '#558B2F', glow: '#BEF264', name: 'Lime' },
  { max: 140, background: '#827717', glow: '#D9FF4D', name: 'Chartreuse' },
  { max: 160, background: '#B8860B', glow: '#FFD700', name: 'Gold' },
  { max: 180, background: '#C96A00', glow: '#FFB347', name: 'Amber' },
  { max: 200, background: '#BF360C', glow: '#FF7A3D', name: 'Orange' },
  { max: 220, background: '#B71C1C', glow: '#FF4D4D', name: 'Red' },
  { max: 240, background: '#880E4F', glow: '#FF5EC4', name: 'Crimson' },
  { max: 260, background: '#AD1457', glow: '#FF69B4', name: 'Pink' },
  { max: 280, background: '#6A1B9A', glow: '#FF8CC8', name: 'Rose' },
  { max: 300, background: 'rainbow', glow: 'rainbow', name: 'Diamond' },
];

/** Rainbow chip background for level 281–300. */
export const LEVEL_RAINBOW_BACKGROUND =
  'linear-gradient(90deg, #4A148C 0%, #0D47A1 16%, #006C84 28%, #1B5E20 42%, #B8860B 58%, #B71C1C 74%, #AD1457 88%, #6A1B9A 100%)';

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const h = hex.replace('#', '').trim();
  if (h.length !== 6) return null;
  const n = Number.parseInt(h, 16);
  if (!Number.isFinite(n)) return null;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgba(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${rgb.r},${rgb.g},${rgb.b},${a})`;
}

export function clampUserLevel(level: number): number {
  if (typeof level !== 'number' || !Number.isFinite(level) || level <= 0) return 1;
  return Math.min(LEVEL_MAX, Math.floor(level));
}

/** True for the final prestige tier (rainbow neon frame). */
export function isDiamondPrestigeLevel(level: number): boolean {
  return clampUserLevel(level) > 280;
}

/** 0-based tier index for the chart bands (every 20 levels). */
export function getLevelColorBand(level: number): number {
  const safe = clampUserLevel(level);
  const idx = LEVEL_TIER_COLORS.findIndex((t) => safe <= t.max);
  return idx < 0 ? LEVEL_TIER_COLORS.length - 1 : idx;
}

export function getLevelTierName(level: number): string {
  return LEVEL_TIER_COLORS[getLevelColorBand(level)]?.name ?? 'Purple';
}

/** Diamond / number neon glow colour for the level band. */
export function getLevelAccentColor(level: number): string {
  const tier = LEVEL_TIER_COLORS[getLevelColorBand(level)] ?? LEVEL_TIER_COLORS[0];
  return tier.glow === 'rainbow' ? '#FFD700' : tier.glow;
}

/** Solid (or rainbow) chip background for the level band. */
export function getLevelBackgroundColor(level: number): string {
  const tier = LEVEL_TIER_COLORS[getLevelColorBand(level)] ?? LEVEL_TIER_COLORS[0];
  return tier.background === 'rainbow' ? LEVEL_RAINBOW_BACKGROUND : tier.background;
}

/** Soft border / glow helpers for the neon diamond frame. */
export function getLevelAccentStyle(level: number): {
  accent: string;
  background: string;
  border: string;
  glow: string;
  fillSoft: string;
  gradient: string;
  prestige: boolean;
} {
  const prestige = isDiamondPrestigeLevel(level);
  const accent = getLevelAccentColor(level);
  const background = getLevelBackgroundColor(level);
  if (prestige) {
    return {
      accent,
      background: LEVEL_RAINBOW_BACKGROUND,
      border: rgba('#FFD700', 0.7),
      glow: rgba('#C77DFF', 0.55),
      fillSoft: rgba('#C77DFF', 0.28),
      gradient: LEVEL_RAINBOW_BACKGROUND,
      prestige: true,
    };
  }
  return {
    accent,
    background,
    border: rgba(accent, 0.75),
    glow: rgba(accent, 0.55),
    fillSoft: rgba(accent, 0.28),
    gradient: `linear-gradient(135deg, ${background} 0%, ${rgba(accent, 0.35)} 100%)`,
    prestige: false,
  };
}
