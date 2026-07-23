import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (relative: string) =>
  readFileSync(resolve(__dirname, relative), "utf8");

describe("1:1 video call contracts", () => {
  const handlers = read("./handlers.ts");
  const live = read("../routes/livestream.ts");
  const index = read("./index.ts");
  const app = read("../../src/App.tsx");
  const callPage = read("../../src/pages/VideoCall.tsx");

  it("server relays call_invite / accepted / rejected / ended to the peer", () => {
    expect(handlers).toContain('case "call_invite"');
    expect(handlers).toContain('case "call_accepted"');
    expect(handlers).toContain('case "call_rejected"');
    expect(handlers).toContain('case "call_ended"');
    expect(handlers).toContain('sendToUserGlobal(calleeId, "call_invite"');
    expect(handlers).toContain("dbIsBlockedEitherWay");
  });

  it("call_* LiveKit rooms always get publish tokens without a live host registry", () => {
    expect(live).toContain('roomName.startsWith(\'call_\')');
    expect(live).toContain("canPublish: isCallRoom ? true : publish");
  });

  it("feed sockets are registered on the user channel for global delivery", () => {
    expect(index).toContain('roomId: "__feed__"');
    expect(index).toContain("subscribeUserChannel(userId)");
  });

  it("authenticated app keeps a presence socket for call signaling", () => {
    expect(app).toContain('websocket.connect("__feed__"');
    expect(app).toContain("subscribeToIncomingCalls");
  });

  it("VideoCall requests a publish token for the call room", () => {
    expect(callPage).toContain("publish=1");
    expect(callPage).toContain("getCallRoomName");
  });
});

describe("WS keepalive + stream_start contracts", () => {
  const handlers = read("./handlers.ts");
  const index = read("./index.ts");
  const clientWs = read("../../src/lib/websocket.ts");

  it("server handles application ping and stream_start (no silent drop)", () => {
    expect(handlers).toContain('case "ping"');
    expect(handlers).toContain('case "stream_start"');
    expect(handlers).toContain('sendToClient(client, "pong"');
    expect(handlers).toContain('sendToClient(client, "stream_start_ack"');
  });

  it("server accepts legacy bare ping text before JSON parse", () => {
    expect(index).toContain('raw === "ping"');
  });

  it("client keepalive sends JSON event ping via send()", () => {
    expect(clientWs).toContain('this.send("ping", {})');
  });
});
