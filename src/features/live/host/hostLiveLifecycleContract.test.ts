import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("host live lifecycle ownership contract", () => {
  const read = (relative: string) =>
    readFileSync(resolve(__dirname, relative), "utf8");
  const controller = read("./useLiveHostController.tsx");
  const session = read("./session/useHostLiveSession.ts");
  const liveRoute = read("../../../../server/routes/livestream.ts");
  const postgres = read("../../../../server/lib/postgres.ts");
  const websocket = read("../../../../server/websocket/index.ts");
  const websocketHandlers = read("../../../../server/websocket/handlers.ts");
  const webhook = read("../../../../server/routes/livekit-webhook.ts");

  it("keeps WS teardown owner-scoped on host page unmount", () => {
    const unmountOwner = controller.indexOf(
      "// Disconnect WS only when leaving the LiveStream page entirely.",
    );
    expect(unmountOwner).toBeGreaterThan(-1);
    const unmountBlock = controller.slice(unmountOwner, unmountOwner + 400);
    expect(unmountBlock).toContain("websocket.disconnectIfOwner(wsOwnerId)");
    expect(unmountBlock).not.toContain("endHostBroadcast");
    expect(unmountBlock).not.toContain("stream_end");
  });

  it("ends the broadcast only through the deliberate End Live path", () => {
    const stopStart = controller.indexOf("const stopBroadcast = async () =>");
    expect(stopStart).toBeGreaterThan(-1);
    const stopBlock = controller.slice(stopStart, stopStart + 900);
    expect(stopBlock).toContain("hostSession.endHostBroadcast(roomId)");
    expect(stopBlock).toContain("navigate('/feed', { replace: true })");

    expect(session).toContain(
      "const endHostBroadcast = useCallback(async (roomId: string) =>",
    );
    expect(session).toContain(
      "lifecycleRef.current.endHostBroadcast(roomId)",
    );
  });

  it("reattaches to the same active registration after a role transition", () => {
    expect(liveRoute).toContain(
      "const startedAt = isReconnect",
    );
    expect(liveRoute).toContain(
      "dbInsertLiveStream(roomName, auth.userId, safeDisplayName, isReconnect)",
    );
    expect(postgres).toContain(
      "started_at = CASE WHEN $4 THEN live_streams.started_at ELSE NOW() END",
    );
    expect(postgres).toContain(
      "viewer_count = CASE WHEN $4 THEN live_streams.viewer_count ELSE 0 END",
    );
  });

  it("retains active registration while the creator publishes in another live role", () => {
    expect(websocket).toContain(
      "Host moved to another live creator role; active stream registration retained",
    );
    expect(liveRoute).toContain("getCreatorLiveRoleRoom(row.user_id)");
    expect(webhook).toContain(
      "creator publishing in another live role",
    );
  });

  it("transitions spectators into the battle room when the host joins a battle", () => {
    const start = websocketHandlers.indexOf('case "stream_end"');
    expect(start).toBeGreaterThan(-1);
    const block = websocketHandlers.slice(start, start + 1400);
    expect(block).toContain("getUserBattleRoom(client.userId)");
    expect(block).toContain("transferLiveAudienceToBattleRoom(");
    expect(block).toContain('battleRedirect ? "host_joined_battle" : "host_ended"');
  });
});
