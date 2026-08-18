import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The live moderation overlay was bound on the client while no server code ever
 * emitted the event, so a warning issued during a broadcast could never reach
 * the creator's screen. This pins both ends of that one contract together.
 */
describe("moderation warning reaches the live overlay", () => {
  const read = (relative: string) => readFileSync(resolve(__dirname, relative), "utf8");
  const adminActions = read("./adminActions.ts");
  const bindModeration = read("../../src/features/live/ws/bindLiveModerationWs.ts");
  const wsEvents = read("../../src/lib/websocket.ts");

  it("emits moderation_warning to the warned owner", () => {
    const warned = adminActions.indexOf('if (action === "warned")');
    expect(warned).toBeGreaterThan(-1);
    const block = adminActions.slice(warned);
    expect(block).toContain('sendToUserGlobal(ownerId, "moderation_warning"');
  });

  it("sends the same body the notification carries, not an empty payload", () => {
    expect(adminActions).toContain("const warningBody =");
    expect(adminActions).toContain("sendToUserGlobal(ownerId, \"moderation_warning\", { message: warningBody })");
  });

  it("uses the event name the client binds", () => {
    expect(bindModeration).toContain("'moderation_warning'");
    expect(wsEvents).toContain('"moderation_warning"');
  });
});
