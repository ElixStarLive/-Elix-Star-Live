import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createLiveSnapshotGate,
  pruneEndedBefore,
  reconcileLivePresence,
} from "./liveCardReconcile";

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
 * Both surfaces refresh from mount, route return, visibilitychange and window
 * focus, so two snapshot requests are regularly in flight and can resolve out
 * of order. The merge rule alone cannot see that ordering, so it is exercised
 * here through the same sequence the surfaces run.
 */
function makeDiscoverySurface(opts: { gated: boolean }) {
  const gate = createLiveSnapshotGate();
  const endedAt = new Map<string, number>();
  let cards: Card[] = [];

  return {
    keys: () => cards.map((c) => c.streamKey),
    /** Send a snapshot request; returns the callback that applies its response. */
    request(requestedAt: number) {
      const ticket = gate.begin();
      return (listed: string[]) => {
        if (opts.gated && !gate.isCurrent(ticket)) return;
        cards = reconcileLivePresence<Card>({
          snapshot: listed.map((key) => card(key, requestedAt)),
          previous: cards,
          keyOf: (c) => c.streamKey,
          discoveredAtOf: (c) => c.discoveredAt,
          requestedAt,
          endedAt,
        });
        pruneEndedBefore(endedAt, requestedAt);
      };
    },
    streamEnded(key: string, at: number) {
      endedAt.set(key, at);
      cards = cards.filter((c) => c.streamKey !== key);
    },
    streamStarted(key: string, at: number) {
      endedAt.delete(key);
      if (!cards.some((c) => c.streamKey === key)) cards = [card(key, at), ...cards];
    },
  };
}

/** The sequence that produced a ghost card, replayed step by step. */
function replayOutOfOrderEnd(surface: ReturnType<typeof makeDiscoverySurface>) {
  surface.streamStarted("creator", 1_000);
  const applyOld = surface.request(2_000); // in flight, will answer last
  surface.streamEnded("creator", 3_000); // stream_ended arrives
  const applyNew = surface.request(4_000); // second refresh (focus/visibility)
  applyNew([]); // server already knows: nobody live
  applyOld(["creator"]); // stale answer, built before the end
}

describe("out-of-order snapshots cannot roll live presence backwards", () => {
  it("an older response does not re-add a creator a newer response already dropped", () => {
    const surface = makeDiscoverySurface({ gated: true });
    replayOutOfOrderEnd(surface);
    expect(surface.keys()).toEqual([]);
  });

  it("without the gate that same sequence resurrects the ended creator", () => {
    // Proof the ordering guard is load-bearing: applying the newer snapshot
    // prunes the end record, so the stale answer meets no veto.
    const surface = makeDiscoverySurface({ gated: false });
    replayOutOfOrderEnd(surface);
    expect(surface.keys()).toEqual(["creator"]);
  });

  it("keeps applying later snapshots after a superseded one is discarded", () => {
    const surface = makeDiscoverySurface({ gated: true });
    const applyOld = surface.request(1_000);
    const applyNew = surface.request(2_000);
    applyNew(["a"]);
    applyOld(["a", "b"]);
    expect(surface.keys()).toEqual(["a"]);

    surface.request(3_000)(["a", "b"]);
    expect(surface.keys()).toEqual(["a", "b"]);
  });

  it("applies responses normally when requests do not overlap", () => {
    const surface = makeDiscoverySurface({ gated: true });
    surface.request(1_000)(["a"]);
    surface.request(2_000)(["a", "b"]);
    surface.request(3_000)([]);
    expect(surface.keys()).toEqual([]);
  });

  it("a creator who restarts after the stale request still survives it", () => {
    const surface = makeDiscoverySurface({ gated: true });
    const applyOld = surface.request(1_000);
    surface.streamEnded("creator", 2_000);
    surface.streamStarted("creator", 3_000);
    applyOld([]);
    expect(surface.keys()).toEqual(["creator"]);
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

  it("both surfaces sequence their snapshot responses", () => {
    for (const source of [videoFeed, liveDiscover]) {
      expect(source).toContain("createLiveSnapshotGate()");
      // The ticket has to be claimed before the request and checked after it,
      // or a stale answer still writes.
      const begin = source.indexOf("snapshotGate.current.begin()");
      const check = source.indexOf("snapshotGate.current.isCurrent(ticket)");
      const apply = source.indexOf("reconcileLivePresence<"); // the call, not the import
      expect(begin).toBeGreaterThan(-1);
      expect(check).toBeGreaterThan(begin);
      expect(apply).toBeGreaterThan(check);
    }
  });
});
