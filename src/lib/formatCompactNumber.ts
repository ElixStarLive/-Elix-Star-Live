/** Compact count: 999, then 1k / 1.1k / 1.2k … then 1m / 1.1m … (no upper cap). */

function trimOneDecimal(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(Math.trunc(rounded)) : String(rounded);
}

export function formatCompactNumber(num: number): string {
  const n = typeof num === 'number' && Number.isFinite(num) ? Math.max(0, num) : 0;
  if (n >= 1_000_000_000) return `${trimOneDecimal(n / 1_000_000_000)}b`;
  if (n >= 1_000_000) return `${trimOneDecimal(n / 1_000_000)}m`;
  if (n >= 1_000) return `${trimOneDecimal(n / 1_000)}k`;
  return String(Math.trunc(n));
}
