/**
 * Live presence authority for discovery surfaces (For You, live lobby).
 *
 * The server owns who is live: `/api/live/streams` verifies the Neon registry
 * against real LiveKit rooms and fails closed with LIVE_STATE_UNAVAILABLE when
 * it cannot check. So the client treats a successful response as authoritative
 * — including an empty one — and only keeps a previous card when the snapshot
 * provably could not have known about it yet:
 *
 *   - a card learned from `stream_started` AFTER the snapshot was requested
 *     survives, because the server built its list before that room registered;
 *   - a card learned BEFORE the snapshot was requested and absent from it is
 *     gone, because the server had the chance to list it and did not.
 *
 * That ordering rule replaces "empty response means keep the old cards", which
 * let ended streams stay on For You as ghost live creators.
 *
 * A failed or unchanged (304) response is not a snapshot at all: callers keep
 * their current list and do not call this.
 */
export function reconcileLivePresence<T>(args: {
  /** Cards from the authoritative response body. */
  snapshot: T[];
  /** Cards currently on screen. */
  previous: T[];
  keyOf: (item: T) => string;
  /** When the client learned this room was live (epoch ms). */
  discoveredAtOf: (item: T) => number;
  /** When the snapshot request was sent (epoch ms). */
  requestedAt: number;
  /** Rooms whose `stream_ended` arrived, by event time (epoch ms). */
  endedAt: ReadonlyMap<string, number>;
}): T[] {
  const { snapshot, previous, keyOf, discoveredAtOf, requestedAt, endedAt } = args;

  // A room that ended after this snapshot was requested may still be listed in
  // it; the newer end event wins.
  const accepted = snapshot.filter((item) => {
    const key = keyOf(item);
    if (!key) return false;
    const ended = endedAt.get(key);
    return ended === undefined || ended < requestedAt;
  });

  const inSnapshot = new Set(accepted.map(keyOf));
  const keptFromPrevious = previous.filter((item) => {
    const key = keyOf(item);
    if (!key || inSnapshot.has(key)) return false;
    const ended = endedAt.get(key);
    if (ended !== undefined && ended >= discoveredAtOf(item)) return false;
    return discoveredAtOf(item) >= requestedAt;
  });

  const seen = new Set<string>();
  return [...accepted, ...keptFromPrevious].filter((item) => {
    const key = keyOf(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Ordering gate for authoritative snapshots.
 *
 * Both discovery surfaces refresh from several independent triggers (mount,
 * returning to the route, visibilitychange, window focus), so two requests are
 * regularly in flight at once and can resolve out of order. Applying the older
 * answer rolls presence backwards: `pruneEndedBefore` has already dropped the
 * end record that would have vetoed it, so the stale list re-adds a creator who
 * has ended. Sequencing the responses fixes that at the source — only the
 * newest request may write state, which is what "the newest authoritative
 * answer wins" means.
 *
 * This is not a debounce: no request is delayed, coalesced or cancelled. A
 * superseded response is simply not authoritative any more.
 */
export function createLiveSnapshotGate(): {
  /** Claim a ticket for a request about to be sent. */
  begin: () => number;
  /** False once a later request has been sent: this answer must not be applied. */
  isCurrent: (ticket: number) => boolean;
} {
  let latest = 0;
  return {
    begin: () => ++latest,
    isCurrent: (ticket: number) => ticket === latest,
  };
}

/**
 * Drop end-event records the server has already accounted for: once a snapshot
 * requested after the end has been applied, its list reflects the end and the
 * record can go. This is what keeps the record set bounded without a timer.
 */
export function pruneEndedBefore(
  endedAt: Map<string, number>,
  requestedAt: number,
): void {
  for (const [key, ended] of endedAt) {
    if (ended < requestedAt) endedAt.delete(key);
  }
}
