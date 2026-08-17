import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (relative: string) => readFileSync(resolve(__dirname, relative), "utf8");

/**
 * A spectator becomes a co-host by server decision inside the same LiveKit room.
 * The client may not invent that role from a URL, gaining a seat must not
 * reconnect the room, and losing a seat must leave the viewer watching instead of
 * stranded on a publish token the server refuses.
 */
describe("spectator co-host role authority contract (client)", () => {
  const spectator = read("./useLiveSpectatorController.tsx");
  const session = read("./session/useSpectatorLiveSession.ts");
  const liveKit = read("../../../lib/liveKitSession.ts");

  it("derives the co-host role from the server seat table, not the URL", () => {
    expect(spectator).toContain(
      "const isCoHosting = mySeatStatus === 'live' || mySeatStatus === 'accepted';",
    );
    // No second owner of the role: nothing may set it locally.
    expect(spectator).not.toContain("setIsCoHosting");
  });

  it("publishes only once the server has seated this client and granted publish", () => {
    const start = spectator.indexOf("if (!spectatorSession.connected || !isCoHosting) return;");
    expect(start).toBeGreaterThan(-1);
    const block = spectator.slice(start, start + 400);
    expect(block).toContain("if (!spectatorSession.canPublish) return;");
  });

  it("a released seat drops the publish intent so the viewer keeps watching", () => {
    const start = spectator.indexOf("const handleCohostSeatReleased = () =>");
    expect(start).toBeGreaterThan(-1);
    const block = spectator.slice(start, start + 500);
    expect(block).toContain("clearCohostPublishIntentRef.current()");
    expect(spectator).toContain("params.delete('cohost')");
  });

  it("a seat granted mid-session is a permission change, not a reconnect", () => {
    // `publish` is read from a ref at connect time and is deliberately absent
    // from the connect effect's dependency list.
    expect(session).toContain("const publishRef = useRef(opts.publish);");
    expect(session).toContain(
      "}, [opts.enabled, opts.roomId, opts.retryKey, opts.liveKitHandlersRef]);",
    );
    expect(session).toContain("onLocalPublishPermissionChanged: (allowed) =>");
    expect(liveKit).toContain("RoomEvent.ParticipantPermissionsChanged");
  });

  it("a refused publish token still joins the room as a spectator", () => {
    const start = session.indexOf("if (publishRef.current) {");
    const end = session.indexOf("if (!creds) {", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    // Refusing to publish is not a join failure: the publish branch never blocks
    // the connection, it falls through to the watch token below.
    const publishBranch = session.slice(start, end);
    expect(publishBranch).not.toContain("setJoinError");
    expect(session.slice(end, end + 400)).toContain(
      "const asViewer = await apiLiveToken(opts.roomId, false);",
    );
  });
});
