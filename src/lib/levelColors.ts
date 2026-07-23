/** App max level (matches Neon level curve). */
export const LEVEL_MAX = 300;

/**
 * Level diamond neon colours — ELIX STAR LIVE chart (every 20 levels).
 * 1–20 Purple · 21–40 Blue · 41–60 Cyan · 61–80 Teal · 81–100 Green ·
 * 101–120 Lime · 121–140 Chartreuse · 141–160 Gold · 161–180 Amber ·
 * 181–200 Orange · 201–220 Red · 221–240 Crimson · 241–260 Pink ·
 * 261–280 Rose · 281–300 Diamond (rainbow).
 */
const LEVEL_TIER_COLORS: readonly { max: number; color: string; name: string }[] = [
  { max: 20, color: '#C77DFF', name: 'Purple' },
  { max: 40, color: '#3B82F6', name: 'Blue' },
  { max: 60, color: '#22D3EE', name: 'Cyan' },
  { max: 80, color: '#14B8A6', name: 'Teal' },
  { max: 100, color: '#22C55E', name: 'Green' },
  { max: 120, color: '#A3E635', name: 'Lime' },
  { max: 140, color: '#BEF264', name: 'Chartreuse' },
  { max: 160, color: '#EAB308', name: 'Gold' },
  { max: 180, color: '#F59E0B', name: 'Amber' },
  { max: 200, color: '#F97316', name: 'Orange' },
  { max: 220, color: '#EF4444', name: 'Red' },
  { max: 240, color: '#E11D48', name: 'Crimson' },
  { max: 260, color: '#EC4899', name: 'Pink' },
  { max: 280, color: '#FB7185', name: 'Rose' },
  { max: 300, color: '#F8FAFC', name: 'Diamond' },
];

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

export function getLevelAccentColor(level: number): string {
  return LEVEL_TIER_COLORS[getLevelColorBand(level)]?.color ?? LEVEL_TIER_COLORS[0].color;
}

/** Soft border / glow helpers for the neon diamond frame. */
export function getLevelAccentStyle(level: number): {
  accent: string;
  border: string;
  glow: string;
  fillSoft: string;
  gradient: string;
} {
  const accent = getLevelAccentColor(level);
  return {
    accent,
    border: rgba(accent, 0.65),
    glow: rgba(accent, 0.55),
    fillSoft: rgba(accent, 0.28),
    gradient: `linear-gradient(135deg, ${accent} 0%, ${rgba(accent, 0.82)} 55%, ${rgba(accent, 0.65)} 100%)`,
  };
}
