/**
 * Readers for API rows that arrive as `Record<string, unknown>`.
 *
 * Screens used to assert a whole response array into their local row interface
 * (`rows as unknown as BlockedUser[]`), which claimed a shape nothing had checked
 * and hid the cases the same screens already defended against downstream. Reading
 * each field keeps the row contract explicit at the boundary.
 */

/** Rows from a response that is either an array or `{ data: [...] }`-style body. */
export function rowRecords(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is Record<string, unknown> =>
      typeof entry === 'object' && entry !== null && !Array.isArray(entry),
  );
}

/** A present, non-empty string, or `null`. */
export function rowString(row: Record<string, unknown>, key: string): string | null {
  const value = row[key];
  return typeof value === 'string' && value !== '' ? value : null;
}

/** A finite number, accepting the numeric strings Postgres/JSON can return. */
export function rowNumber(row: Record<string, unknown>, key: string, fallback = 0): number {
  const value = row[key];
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

export function rowBoolean(row: Record<string, unknown>, key: string): boolean {
  return row[key] === true;
}

/** Narrow an object-shaped body (single record responses). */
export function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
