import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("spectator 2v2 media attachment contracts", () => {
  const controller = readFileSync(
    resolve(__dirname, "./useLiveSpectatorController.tsx"),
    "utf8",
  );

  it("defines dedicated video refs for opponent, player3, and player4", () => {
    expect(controller).toContain("const opponentVideoRef = useRef<HTMLVideoElement>(null);");
    expect(controller).toContain("const player3VideoRef = useRef<HTMLVideoElement>(null);");
    expect(controller).toContain("const player4VideoRef = useRef<HTMLVideoElement>(null);");
  });

  it("maps P1/P2/P3/P4 user ids to independent video surfaces", () => {
    const attachBlockStart = controller.indexOf("const tryAttachAll = () => {");
    const attachBlockEnd = controller.indexOf("applyRemoteVideoBudget(room", attachBlockStart);
    expect(attachBlockStart).toBeGreaterThan(-1);
    expect(attachBlockEnd).toBeGreaterThan(attachBlockStart);
    const attachBlock = controller.slice(attachBlockStart, attachBlockEnd);

    expect(attachBlock).toContain("battleStreamIds?.hostUserId");
    expect(attachBlock).toContain("videoRef.current");

    expect(attachBlock).toContain("battleStreamIds?.opponentUserId");
    expect(attachBlock).toContain("opponentVideoRef.current");

    expect(attachBlock).toContain("battleStreamIds?.player3UserId");
    expect(attachBlock).toContain("player3VideoRef.current");

    expect(attachBlock).toContain("battleStreamIds?.player4UserId");
    expect(attachBlock).toContain("player4VideoRef.current");
  });

  it("does not attach unknown non-host tracks to main surface during battle", () => {
    const start = controller.indexOf("if (track.kind === 'video' && participant && videoRef.current)");
    expect(start).toBeGreaterThan(-1);
    expect(controller.slice(start, start + 800)).toContain(
      "!spectatorBattleRef.current?.active && !mainVideoAttachedRef.current",
    );
  });
});
