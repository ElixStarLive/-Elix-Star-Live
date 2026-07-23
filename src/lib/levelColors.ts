/** App max level (matches Neon level curve). */
export const LEVEL_MAX = 300;

/**
 * Accent color for a user level.
 * Bands of 10: 1–10, 11–20, …, 291–300 — a new colour every 10 levels.
 */
const LEVEL_BAND_COLORS: readonly string[] = [
  '#3B82F6', // 1–10 blue
  '#22C55E', // 11–20
  '#06B6D4', // 21–30
  '#A855F7', // 31–40
  '#E0AAFF', // 41–50
  '#EC4899', // 51–60
  '#F43F5E', // 61–70
  '#F97316', // 71–80
  '#EAB308', // 81–90
  '#C9A227', // 91–100
  '#14B8A6', // 101–110
  '#6366F1', // 111–120
  '#8B5CF6', // 121–130
  '#D946EF', // 131–140
  '#FB7185', // 141–150
  '#FBBF24', // 151–160
  '#84CC16', // 161–170
  '#10B981', // 171–180
  '#0EA5E9', // 181–190
  '#F472B6', // 191–200
  '#A78BFA', // 201–210
  '#FCD34D', // 211–220
  '#34D399', // 221–230
  '#60A5FA', // 231–240
  '#C084FC', // 241–250
  '#FB923C', // 251–260
  '#FACC15', // 261–270
  '#E879F9', // 271–280
  '#818CF8', // 281–290
  '#FFD700', // 291–300
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

/** 0-based band index: levels 1–10 → 0, 11–20 → 1, … */
export function getLevelColorBand(level: number): number {
  const safe = clampUserLevel(level);
  return Math.min(LEVEL_BAND_COLORS.length - 1, Math.floor((safe - 1) / 10));
}

export function getLevelAccentColor(level: number): string {
  return LEVEL_BAND_COLORS[getLevelColorBand(level)] ?? LEVEL_BAND_COLORS[0];
}

/** Soft border / glow helpers for chips that use the level accent. */
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
    /** Match royce-glow-disc intensity, tinted to the level colour (blue for Lv 1–10). */
    glow: rgba(accent, 0.55),
    fillSoft: rgba(accent, 0.28),
    gradient: `linear-gradient(135deg, ${accent} 0%, ${rgba(accent, 0.82)} 55%, ${rgba(accent, 0.65)} 100%)`,
  };
}
