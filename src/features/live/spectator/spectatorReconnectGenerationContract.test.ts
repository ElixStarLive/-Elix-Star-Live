/**
 * A spectator's LiveKit rebuild belongs to the room that dropped.
 *
 * When media drops, the controller waits out a backoff and then forces a rebuild
 * of the Room. Swiping to another live inside that backoff used to hand the
 * pending timer the NEW room id, so it rebuilt a connection the new room had not
 * asked for and charged it the previous room's failed attempts. The timer must
 * name the room it was scheduled for, and must not outlive the controller.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const controller = readFileSync(
  resolve(__dirname, "./useLiveSpectatorController.tsx"),
  "utf8",
);

/** The LiveKit disconnect handler, where the rebuild is scheduled. */
const onDisconnected = controller.slice(
  controller.indexOf("onDisconnected: () => {"),
  controller.indexOf("onReconnected: () => {"),
);

describe("spectator LiveKit rebuild", () => {
  it("captures the room it belongs to before waiting", () => {
    expect(onDisconnected).toContain(
      "const retryForStreamId = effectiveStreamIdRef.current;",
    );
    expect(onDisconnected.indexOf("const retryForStreamId")).toBeLessThan(
      onDisconnected.indexOf("setTimeout("),
    );
  });

  it("does nothing if the spectator has moved to another live", () => {
    expect(onDisconnected).toContain(
      "if (effectiveStreamIdRef.current !== retryForStreamId) return;",
    );
    // The generation check has to come before both the attempt counter and the
    // rebuild it triggers, or the new room pays for the old room's failures.
    const guard = onDisconnected.indexOf(
      "effectiveStreamIdRef.current !== retryForStreamId",
    );
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(
      onDisconnected.indexOf("liveConnectRetryAttemptsRef.current = attempt + 1"),
    );
    expect(guard).toBeLessThan(onDisconnected.indexOf("setLiveConnectRetryKey"));
  });

  it("is cancelled when the spectator leaves live", () => {
    // Declared next to the ref so the cleanup cannot drift away from it.
    const ownership = controller.slice(
      controller.indexOf("const lkDisconnectRetryRef"),
      controller.indexOf("const spectatorSession = useSpectatorLiveSession("),
    );
    expect(ownership).toContain("clearTimeout(lkDisconnectRetryRef.current)");
    expect(ownership).toContain("lkDisconnectRetryRef.current = null;");
  });

  it("still rebuilds for the room that actually dropped", () => {
    expect(onDisconnected).toContain("setLiveConnectRetryKey((k) => k + 1)");
    expect(onDisconnected).toContain("if (attempt >= 5) return;");
  });
});
