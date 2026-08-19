/**
 * In-memory stand-in for the Valkey helpers, for battle authority tests.
 *
 * It reproduces the three properties the battle lifecycle actually relies on:
 *   - SET NX is a real atomic claim (used by the finalize + seat locks)
 *   - HINCRBY returns the value AFTER the increment (used by scores)
 *   - the score hash can refuse to answer, so tests can tell the difference
 *     between a battle scored 0–0 and one whose scores could not be read
 */

const strings = new Map<string, string>();
const sets = new Map<string, Set<string>>();
const hashes = new Map<string, Map<string, number>>();
let hashesReachable = true;
let hashesWritable = true;
let stringsWritable = true;
let stringsReadable = true;
let setsWritable = true;
let locksAvailable = true;

export function resetValkeyFake(): void {
  strings.clear();
  sets.clear();
  hashes.clear();
  hashesReachable = true;
  hashesWritable = true;
  stringsWritable = true;
  stringsReadable = true;
  setsWritable = true;
  locksAvailable = true;
}

/** Simulate Valkey being unable to serve the score hash. */
export function setValkeyFakeHashesReachable(reachable: boolean): void {
  hashesReachable = reachable;
}

/**
 * Simulate a hash counter that can be READ but not incremented, so a test can
 * reach the "this failure was not counted" path on its own.
 */
export function setValkeyFakeHashesWritable(writable: boolean): void {
  hashesWritable = writable;
}

/** Simulate a confirmed-write helper failing (the session value itself). */
export function setValkeyFakeStringsWritable(writable: boolean): void {
  stringsWritable = writable;
}

/** Simulate a confirmed read failing (the queued result payload). */
export function setValkeyFakeStringsReadable(readable: boolean): void {
  stringsReadable = readable;
}

/** Simulate a confirmed set write failing (the durability outbox membership). */
export function setValkeyFakeSetsWritable(writable: boolean): void {
  setsWritable = writable;
}

/** Simulate the lock helper being unable to answer. */
export function setValkeyFakeLocksAvailable(available: boolean): void {
  locksAvailable = available;
}

/** Take a lock out of band, so a test can make the next mutation contend. */
export function holdValkeyFakeLock(key: string, token = "other-writer"): void {
  strings.set(key, token);
}

export const valkeyFake = {
  isValkeyConfigured: () => true,
  valkeySet: async (
    key: string,
    value: string | Record<string, unknown>,
  ): Promise<void> => {
    strings.set(key, typeof value === "string" ? value : JSON.stringify(value));
  },
  valkeyGet: async (key: string): Promise<string | null> =>
    strings.has(key) ? (strings.get(key) as string) : null,
  valkeyTryGet: async (
    key: string,
  ): Promise<{ status: "ok"; value: string | null } | { status: "unavailable" }> =>
    stringsReadable
      ? {
          status: "ok",
          value: strings.has(key) ? (strings.get(key) as string) : null,
        }
      : { status: "unavailable" },
  valkeyDel: async (key: string): Promise<void> => {
    strings.delete(key);
    sets.delete(key);
    hashes.delete(key);
  },
  valkeySetNx: async (key: string, value: string): Promise<boolean> => {
    if (strings.has(key)) return false;
    strings.set(key, value);
    return true;
  },
  // The TTL arguments are accepted because production passes them; this store does
  // not model expiry, and no battle test depends on a key ageing out.
  valkeyTrySet: async (
    key: string,
    value: string,
    _ttlMs?: number,
  ): Promise<"ok" | "unavailable"> => {
    if (!stringsWritable) return "unavailable";
    strings.set(key, value);
    return "ok";
  },
  valkeyTrySetNx: async (
    key: string,
    value: string,
    _ttlMs?: number,
  ): Promise<"set" | "exists" | "unavailable"> => {
    if (!locksAvailable) return "unavailable";
    if (strings.has(key)) return "exists";
    strings.set(key, value);
    return "set";
  },
  valkeyReleaseLock: async (key: string, token: string): Promise<void> => {
    if (strings.get(key) === token) strings.delete(key);
  },
  // SADD/SREM report how many members actually changed, as the real helpers do.
  valkeySadd: async (key: string, ...members: string[]): Promise<number> => {
    const set = sets.get(key) ?? new Set<string>();
    let added = 0;
    for (const member of members) {
      if (!set.has(member)) added += 1;
      set.add(member);
    }
    sets.set(key, set);
    return added;
  },
  valkeyTrySadd: async (
    key: string,
    member: string,
  ): Promise<"ok" | "unavailable"> => {
    if (!setsWritable) return "unavailable";
    const set = sets.get(key) ?? new Set<string>();
    set.add(member);
    sets.set(key, set);
    return "ok";
  },
  valkeySrem: async (key: string, ...members: string[]): Promise<number> => {
    const set = sets.get(key);
    if (!set) return 0;
    let removed = 0;
    for (const member of members) {
      if (set.delete(member)) removed += 1;
    }
    return removed;
  },
  valkeySmembers: async (key: string): Promise<string[]> => [
    ...(sets.get(key) ?? []),
  ],
  valkeyHset: async (
    key: string,
    field: string,
    value: string,
  ): Promise<void> => {
    const hash = hashes.get(key) ?? new Map<string, number>();
    hash.set(field, Number(value) || 0);
    hashes.set(key, hash);
  },
  valkeyHget: async (key: string, field: string): Promise<string | null> => {
    const current = hashes.get(key)?.get(field);
    return current === undefined ? null : String(current);
  },
  valkeyTryHget: async (
    key: string,
    field: string,
  ): Promise<
    { status: "ok"; value: string | null } | { status: "unavailable" }
  > => {
    if (!hashesReachable) return { status: "unavailable" };
    const current = hashes.get(key)?.get(field);
    return { status: "ok", value: current === undefined ? null : String(current) };
  },
  valkeyHincrby: async (
    key: string,
    field: string,
    increment: number,
  ): Promise<number> => {
    const hash = hashes.get(key) ?? new Map<string, number>();
    const next = (hash.get(field) ?? 0) + increment;
    hash.set(field, next);
    hashes.set(key, hash);
    return next;
  },
  valkeyHgetall: async (key: string): Promise<Record<string, string>> => {
    const out: Record<string, string> = {};
    for (const [field, value] of hashes.get(key) ?? []) {
      out[field] = String(value);
    }
    return out;
  },
  valkeyTryHincrby: async (
    key: string,
    field: string,
    increment: number,
  ): Promise<{ status: "ok"; value: number } | { status: "unavailable" }> => {
    if (!hashesReachable || !hashesWritable) return { status: "unavailable" };
    const hash = hashes.get(key) ?? new Map<string, number>();
    const next = (hash.get(field) ?? 0) + increment;
    hash.set(field, next);
    hashes.set(key, hash);
    return { status: "ok", value: next };
  },
  valkeyTryHgetall: async (
    key: string,
  ): Promise<
    { status: "ok"; value: Record<string, string> } | { status: "unavailable" }
  > => {
    if (!hashesReachable) return { status: "unavailable" };
    const value: Record<string, string> = {};
    for (const [field, v] of hashes.get(key) ?? []) {
      value[field] = String(v);
    }
    return { status: "ok", value };
  },
  valkeyExpire: async (): Promise<void> => {},
  // Checked against the module this stands in for: a helper whose real signature or
  // result union changes can no longer leave the double behind, which is how the
  // outbox TTL argument came to be silently dropped here.
} satisfies Partial<typeof import("../lib/valkey")>;
