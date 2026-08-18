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
  const spectatorController = read("../spectator/useLiveSpectatorController.tsx");
  const spectatorScreen = read("../spectator/SpectatorLiveScreen.tsx");

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

  /**
   * The host reserves a seat the moment they invite, so refusing has to reach the
   * server. Clearing the banner alone left that seat "invited" for the rest of the
   * live — one of the eight slots held, and a re-invite blocked — for someone who
   * had already said no.
   */
  describe("declining an invite gives the seat back", () => {
    const banner = read("../../../components/LiveNotifyBanner.tsx");

    it("offers a decline intent alongside accept", () => {
      expect(actions).toContain("export function cohostInviteDecline");
    });

    it("tells the server when a creator refuses another creator's invite", () => {
      const start = hostController.indexOf("const declineCohostInvite = useCallback");
      expect(start).toBeGreaterThan(-1);
      const block = hostController.slice(start, start + 500);
      expect(block).toContain("cohostInviteDecline({ streamKey:");
    });

    it("tells the server when a viewer refuses from the live page", () => {
      const start = spectatorController.indexOf("const declineCoHostInvite = useCallback");
      expect(start).toBeGreaterThan(-1);
      const block = spectatorController.slice(start, start + 600);
      expect(block).toContain("cohostInviteDecline({ streamKey })");
      expect(block).toContain("setPendingCoHostInvite(null)");
      // The Reject control must go through that one handler, not clear state inline.
      expect(spectatorScreen).toContain("onClick={declineCoHostInvite}");
    });

    it("tells the server when a viewer refuses from the global banner", () => {
      const start = banner.indexOf("const rejectInvite = useCallback");
      expect(start).toBeGreaterThan(-1);
      const block = banner.slice(start, start + 700);
      expect(block).toContain("cohostInviteDecline({ streamKey: inviteBanner.streamKey })");
    });
  });

  /**
   * Eight seats are independent, so one viewer taking a seat must not disable the
   * co-host control for everyone else. Each request button may read only the
   * viewer's own state — their pending request, their own seat, their sign-in.
   */
  describe("asking to co-host is per viewer", () => {
    const disabledExpressions = [
      ...spectatorScreen.matchAll(/disabled=\{([^}]*(?:joinRequested|CoHostRequestSent)[^}]*)\}/g),
    ].map((m) => m[1]);

    it("gates the co-host buttons on the viewer's own state only", () => {
      expect(disabledExpressions.length).toBeGreaterThan(0);
      for (const expression of disabledExpressions) {
        // Room-wide inputs would make one viewer's seat silence everyone else.
        expect(expression).not.toContain("spectatorCoHosts.length");
        expect(expression).not.toContain("MAX_CO_HOST");
        expect(expression).not.toContain("coHosts.length");
      }
    });

    it("sends a request only for the viewer who pressed it", () => {
      const start = spectatorController.indexOf("const sendCohostJoinRequest = useCallback");
      expect(start).toBeGreaterThan(-1);
      const block = spectatorController.slice(start, start + 700);
      expect(block).toContain("if (!user?.id || joinRequested) return false;");
      expect(block).not.toContain("spectatorCoHosts.length");
    });
  });
});
