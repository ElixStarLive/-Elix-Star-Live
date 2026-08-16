import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The co-host stage is server-owned: one host plus eight independent seats.
 * A host-side render must never be able to replace the seat table or stand
 * another participant down, so these contracts pin the client to per-user
 * seat intents.
 */
describe("co-host seat ownership contract (client)", () => {
  const read = (relative: string) => readFileSync(resolve(__dirname, relative), "utf8");
  const layoutSync = read("./syncBroadcastCohostLayout.ts");
  const actions = read("./liveCohostActions.ts");
  const hostController = read("../host/useLiveHostController.tsx");

  it("host layout broadcast carries presentation only, never seat membership", () => {
    expect(layoutSync).toContain("featuredUserId");
    expect(layoutSync).toContain("layoutId");
    expect(layoutSync).not.toContain("coHosts");
    expect(layoutSync).not.toContain("mapCoHostsForLayoutSync");
  });

  it("exposes per-seat intents instead of a whole-stage replacement", () => {
    expect(actions).toContain("export function cohostSeatRelease");
    expect(actions).toContain("targetUserId: string");
    expect(actions).toContain("export function cohostSeatsClear");
  });

  it("removing one co-host releases only that participant's seat on the server", () => {
    const start = hostController.indexOf("const removeCoHost = (hostId: string) =>");
    expect(start).toBeGreaterThan(-1);
    const block = hostController.slice(start, start + 900);
    expect(block).toContain(
      "cohostSeatRelease({ roomId: effectiveStreamId, targetUserId: host.userId })",
    );
  });

  it("ending co-host mode asks the server to release seats rather than wiping locally only", () => {
    const start = hostController.indexOf("const endCoHostMode = useCallback");
    expect(start).toBeGreaterThan(-1);
    const block = hostController.slice(start, start + 1400);
    expect(block).toContain("cohostSeatsClear({ roomId: effectiveStreamIdRef.current })");
  });

  it("keeps incoming co-host requests as an independent per-user queue", () => {
    expect(hostController).toContain(
      "const [pendingJoinRequests, setPendingJoinRequests] = useState<PendingJoinRequest[]>([])",
    );
    // A new request is appended, never allowed to overwrite an existing one.
    expect(hostController).toContain(
      "if (prev.some((r) => sameUserId(r.requesterId, requesterId))) return prev;",
    );
  });
});
