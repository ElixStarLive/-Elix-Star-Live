/** Identity helpers for Live rooms (auth ids / stream keys). */

export function normalizeUserId(id: string | null | undefined): string {
  return typeof id === 'string' ? id.trim().toLowerCase() : '';
}

export function sameUserId(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const na = normalizeUserId(a);
  const nb = normalizeUserId(b);
  return !!na && !!nb && na === nb;
}

export function isSelfUser(
  candidateId: string | null | undefined,
  userId: string | null | undefined,
  streamId: string | null | undefined,
): boolean {
  if (sameUserId(candidateId, userId)) return true;
  if (streamId && sameUserId(candidateId, streamId)) return true;
  return false;
}
