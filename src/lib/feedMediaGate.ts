/**
 * For You / feed: only one slide may emit sound.
 * When another slide becomes active (or scroll leaves a slide), every other
 * registered player is hard-silenced immediately.
 */

type StopFn = () => void;

const stoppers = new Map<string, StopFn>();
let activePlayerId: string | null = null;

export function registerFeedMediaPlayer(playerId: string, hardStop: StopFn): () => void {
  const id = String(playerId || '').trim();
  if (!id) return () => {};
  stoppers.set(id, hardStop);
  // If something else is already active, stay silent.
  if (activePlayerId && activePlayerId !== id) {
    try {
      hardStop();
    } catch {
      /* ignore */
    }
  }
  return () => {
    stoppers.delete(id);
    if (activePlayerId === id) activePlayerId = null;
  };
}

/** Claim exclusive playback. All other feed players are silenced. */
export function claimFeedMediaPlayer(playerId: string): void {
  const id = String(playerId || '').trim();
  if (!id) return;
  activePlayerId = id;
  for (const [otherId, stop] of stoppers) {
    if (otherId === id) continue;
    try {
      stop();
    } catch {
      /* ignore */
    }
  }
}

export function releaseFeedMediaPlayer(playerId: string): void {
  const id = String(playerId || '').trim();
  if (!id) return;
  if (activePlayerId === id) activePlayerId = null;
  const stop = stoppers.get(id);
  if (stop) {
    try {
      stop();
    } catch {
      /* ignore */
    }
  }
}

export function isFeedMediaPlayerActive(playerId: string): boolean {
  return activePlayerId === String(playerId || '').trim();
}

/** Hard-stop every registered feed player (leave For You / nothing visible). */
export function silenceAllFeedMediaPlayers(): void {
  activePlayerId = null;
  for (const stop of stoppers.values()) {
    try {
      stop();
    } catch {
      /* ignore */
    }
  }
}
