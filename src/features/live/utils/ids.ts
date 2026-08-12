/** Identity helpers for Live rooms (auth ids / stream keys). */

function normalizeUserId(id: string | null | undefined): string {
  return typeof id === 'string' ? id.trim().toLowerCase() : '';
}

/**
 * LiveKit subscribe-only identities are `${userId}__v_<12 hex>`.
 * Publishers (host/co-host) use stable `userId`. Strip before compare.
 */
function userIdFromLiveKitIdentity(identity: string | null | undefined): string {
  const i = normalizeUserId(identity);
  const m = i.match(/^(.*)__v_[a-f0-9]{12}$/);
  return m?.[1] || i;
}

export function sameUserId(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const na = userIdFromLiveKitIdentity(a);
  const nb = userIdFromLiveKitIdentity(b);
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
