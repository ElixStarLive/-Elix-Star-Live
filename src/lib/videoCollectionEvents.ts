/**
 * Cross-view save/like invalidation — Profile, /saved, and feed share one bus.
 * Pages subscribe and refetch canonical server lists; videoStore remains optimistic.
 */
type VideoCollectionEvent =
  | { type: "saved"; videoId: string; saved: boolean }
  | { type: "liked"; videoId: string; liked: boolean }
  | { type: "refresh"; collection: "saved" | "liked" | "all" };

type Listener = (event: VideoCollectionEvent) => void;

const listeners = new Set<Listener>();

export function subscribeVideoCollection(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function publishVideoCollection(event: VideoCollectionEvent): void {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      /* ignore subscriber errors */
    }
  }
}
