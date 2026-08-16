import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (relative: string) => readFileSync(resolve(__dirname, relative), "utf8");

describe("live realtime authority contracts", () => {
  const battle = read("./battle.ts");
  const index = read("./index.ts");
  const handlers = read("./handlers.ts");
  const engagement = read("./engagement.ts");
  const giftGoal = read("./giftGoal.ts");

  it("removes in-memory battle/cohost authority paths", () => {
    expect(battle).not.toContain("localBattle");
    expect(battle).not.toContain("localSeatLocks");
    expect(index).not.toContain("localCohostLayouts");
    expect(index).not.toContain("localCohostPublishGrants");
    expect(index).not.toContain("localCohostJoinRequests");
    expect(index).not.toContain("localTxnClaims");
    expect(engagement).not.toContain("memRooms");
    expect(engagement).not.toContain("memActiveRoom");
    expect(engagement).not.toContain("memTickClaims");
    expect(engagement).not.toContain("memActionClaims");
    expect(giftGoal).not.toContain("memGoals");
  });

  it("fails realtime websocket startup when Valkey is unavailable", () => {
    expect(index).toContain('if (!isValkeyConfigured()) {');
    expect(index).toContain('ws.close(1013, "Realtime backend unavailable")');
  });

  it("uses retryable close code when session validation is temporarily unavailable", () => {
    expect(index).toContain('ws.close(1013, "Session validation unavailable")');
    expect(index).toContain('ws.close(1008, reason)');
  });

  it("returns explicit cohost/battle backend unavailable errors", () => {
    expect(handlers).toContain("function ensureBattleInfra");
    expect(handlers).toContain("function ensureCohostInfra");
    expect(handlers).toContain('reason: "backend_unavailable"');
  });
});
