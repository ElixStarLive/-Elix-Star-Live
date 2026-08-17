import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pruneEndedBefore, reconcileLivePresence } from "./liveCardReconcile";

type Card = { streamKey: string; discoveredAt: number };

const card = (streamKey: string, discoveredAt: number): Card => ({ streamKey, discoveredAt });

const run = (args: {
  snapshot: Card[];
  previous: Card[];
  requestedAt: number;
  endedAt?: Map<string, number>;
}) =>
  reconcileLivePresence<Card>({
    snapshot: args.snapshot,
    previous: args.previous,
    keyOf: (c) => c.streamKey,
    discoveredAtOf: (c) => c.discoveredAt,
    requestedAt: args.requestedAt,
    endedAt: args.endedAt ?? new Map(),
  });

describe("live presence reconciliation (server is the authority)", () => {
  it("an authoritative empty response removes stale cards", () => {
    const result = run({
      snapshot: [],
      previous: [card("ghost", 1_000)],
      requestedAt: 5_000,
    });
    expect(result).toEqual([]);
  });

  it("an authoritative list removes a previous card it does not contain", () => {
    const result = run({
      snapshot: [card("live-a", 5_000)],
      previous: [card("live-a", 1_000), card("ghost", 1_000)],
      requestedAt: 5_000,
    });
    expect(result.map((c) => c.streamKey)).toEqual(["live-a"]);
  });

  it("keeps a stream_started card the snapshot could not have seen yet", () => {
    const result = run({
      snapshot: [],
      previous: [card("just-started", 6_000)],
      requestedAt: 5_000,
    });
    expect(result.map((c) => c.streamKey)).toEqual(["just-started"]);
  });

  it("drops that card once a later snapshot still does not list it", () => {
    const result = run({
      snapshot: [],
      previous: [card("just-started", 6_000)],
      requestedAt: 7_000,
    });
    expect(result).toEqual([]);
  });

  it("an end event newer than the snapshot beats a row still listed in it", () => {
    const result = run({
      snapshot: [card("ending", 1_000)],
      previous: [],
      requestedAt: 5_000,
      endedAt: new Map([["ending", 6_000]]),
    });
    expect(result).toEqual([]);
  });

  it("an end event older than the snapshot does not hide a restarted room", () => {
    const result = run({
      snapshot: [card("restarted", 5_000)],
      previous: [],
      requestedAt: 5_000,
      endedAt: new Map([["restarted", 2_000]]),
    });
    expect(result.map((c) => c.streamKey)).toEqual(["restarted"]);
  });

  it("does not duplicate a room present in both the snapshot and the previous list", () => {
    const result = run({
      snapshot: [card("dup", 5_000)],
      previous: [card("dup", 6_000)],
      requestedAt: 5_000,
    });
    expect(result).toHaveLength(1);
  });

  it("keeps the snapshot order first so the server decides card order", () => {
    const result = run({
      snapshot: [card("a", 5_000), card("b", 5_000)],
      previous: [card("c", 6_000)],
      requestedAt: 5_000,
    });
    expect(result.map((c) => c.streamKey)).toEqual(["a", "b", "c"]);
  });

  it("prunes end records the server has already accounted for, with no timer", () => {
    const endedAt = new Map([
      ["old", 1_000],
      ["recent", 9_000],
    ]);
    pruneEndedBefore(endedAt, 5_000);
    expect([...endedAt.keys()]).toEqual(["recent"]);
  });
});

/**
 * The retain-on-empty workaround must not come back: it is what kept ended
 * creators on For You after the server had already stopped listing them.
 */
describe("live discovery surfaces use the shared authority rule", () => {
  const read = (relative: string) => readFileSync(resolve(__dirname, relative), "utf8");
  const videoFeed = read("../../pages/VideoFeed.tsx");
  const liveDiscover = read("../../pages/LiveDiscover.tsx");

  it("For You reconciles through the shared rule", () => {
    expect(videoFeed).toContain("reconcileLivePresence");
    expect(videoFeed).not.toContain("mapped.length === 0 && prev.length > 0");
  });

  it("the live lobby reconciles through the shared rule", () => {
    expect(liveDiscover).toContain("reconcileLivePresence");
    expect(liveDiscover).not.toContain("mapped.length === 0 && prev.length > 0");
  });

  it("both surfaces only clear on a real response, never on a failure", () => {
    for (const source of [videoFeed, liveDiscover]) {
      const at = source.indexOf("if (error)");
      expect(at).toBeGreaterThan(-1);
      expect(source.slice(at, at + 400)).toContain("return");
    }
  });
});
