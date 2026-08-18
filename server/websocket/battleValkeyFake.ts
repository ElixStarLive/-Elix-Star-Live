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
let stringsWritable = true;
let stringsReadable = true;
let setsWritable = true;
let locksAvailable = true;

export function resetValkeyFake(): void {
  strings.clear();
  sets.clear();
  hashes.clear();
  hashesReachable = true;
  stringsWritable = true;
  stringsReadable = true;
  setsWritable = true;
  locksAvailable = true;
}

/** Simulate Valkey being unable to serve the score hash. */
export function setValkeyFakeHashesReachable(reachable: boolean): void {
  hashesReachable = reachable;
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

export function valkeyFakeKeys(): string[] {
  return [...strings.keys(), ...sets.keys(), ...hashes.keys()];
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
  valkeyTrySet: async (
    key: string,
    value: string,
  ): Promise<"ok" | "unavailable"> => {
    if (!stringsWritable) return "unavailable";
    strings.set(key, value);
    return "ok";
  },
  valkeyTrySetNx: async (
    key: string,
    value: string,
  ): Promise<"set" | "exists" | "unavailable"> => {
    if (!locksAvailable) return "unavailable";
    if (strings.has(key)) return "exists";
    strings.set(key, value);
    return "set";
  },
  valkeyReleaseLock: async (key: string, token: string): Promise<void> => {
    if (strings.get(key) === token) strings.delete(key);
  },
  valkeySadd: async (key: string, member: string): Promise<void> => {
    const set = sets.get(key) ?? new Set<string>();
    set.add(member);
    sets.set(key, set);
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
  valkeySrem: async (key: string, member: string): Promise<void> => {
    sets.get(key)?.delete(member);
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
    if (!hashesReachable) return { status: "unavailable" };
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
};
