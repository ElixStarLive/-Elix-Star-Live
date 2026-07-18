/**
 * Per-key trailing-debounce writer.
 *
 * Collapses a burst of writes for the same key into a single trailing write that
 * carries the latest value. Used to keep high-frequency, eventually-consistent
 * side effects (e.g. persisting live viewer counts) off the hot path without
 * dropping the final value.
 */
export interface CoalescedWriter<T> {
  /** Queue the latest value for `key`; the write fires once the debounce elapses. */
  schedule(key: string, value: T): void;
  /** Write any pending value for `key` immediately (e.g. resource being torn down). */
  flush(key: string): void;
  /** Number of keys with a write still pending (for tests / metrics). */
  pendingCount(): number;
}

export function createCoalescedWriter<T>(
  writer: (key: string, value: T) => void,
  delayMs: number,
): CoalescedWriter<T> {
  const pending = new Map<string, { value: T; timer: ReturnType<typeof setTimeout> }>();

  function fire(key: string): void {
    const entry = pending.get(key);
    pending.delete(key);
    if (entry) writer(key, entry.value);
  }

  return {
    schedule(key, value) {
      const existing = pending.get(key);
      if (existing) {
        // A trailing write is already scheduled — just keep the newest value.
        existing.value = value;
        return;
      }
      const timer = setTimeout(() => fire(key), delayMs);
      timer.unref?.();
      pending.set(key, { value, timer });
    },
    flush(key) {
      const entry = pending.get(key);
      if (!entry) return;
      clearTimeout(entry.timer);
      pending.delete(key);
      writer(key, entry.value);
    },
    pendingCount() {
      return pending.size;
    },
  };
}
