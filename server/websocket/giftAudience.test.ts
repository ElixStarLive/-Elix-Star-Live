import { describe, expect, it } from "vitest";
import {
  battleSeatUserId,
  clientReceivesCreatorGiftAudience,
  isActiveBattleSession,
  resolveGiftTargetCreatorId,
  resolveJoinAudienceCreatorId,
  seatedBattleCreatorIds,
} from "./giftAudience";

const battle4 = {
  status: "ACTIVE" as const,
  hostUserId: "c1",
  opponentUserId: "c2",
  player3UserId: "c3",
  player4UserId: "c4",
};

describe("4-creator battle gift audience ownership", () => {
  it("maps each battle seat to exactly one creator id", () => {
    expect(battleSeatUserId(battle4, "host")).toBe("c1");
    expect(battleSeatUserId(battle4, "opponent")).toBe("c2");
    expect(battleSeatUserId(battle4, "player3")).toBe("c3");
    expect(battleSeatUserId(battle4, "player4")).toBe("c4");
    expect(seatedBattleCreatorIds(battle4)).toEqual(["c1", "c2", "c3", "c4"]);
  });

  it("routes a gift to the target creator, never the teammate", () => {
    expect(
      resolveGiftTargetCreatorId({
        battle: battle4,
        battleTarget: "host",
        streamOwnerUserId: "c1",
      }),
    ).toBe("c1");
    expect(
      resolveGiftTargetCreatorId({
        battle: battle4,
        battleTarget: "opponent",
        streamOwnerUserId: "c1",
      }),
    ).toBe("c2");
    expect(
      resolveGiftTargetCreatorId({
        battle: battle4,
        battleTarget: "player3",
        streamOwnerUserId: "c1",
      }),
    ).toBe("c3");
    expect(
      resolveGiftTargetCreatorId({
        battle: battle4,
        battleTarget: "player4",
        streamOwnerUserId: "c1",
      }),
    ).toBe("c4");
  });

  it("does not reassign an empty-seat gift to the host or a teammate", () => {
    expect(
      resolveGiftTargetCreatorId({
        battle: { ...battle4, opponentUserId: "" },
        battleTarget: "opponent",
        streamOwnerUserId: "c1",
      }),
    ).toBe(null);
  });

  it("prefers an explicit cohost/creator tile target over the battle seat", () => {
    expect(
      resolveGiftTargetCreatorId({
        battle: battle4,
        battleTarget: "host",
        cohostTargetUserId: "c3",
        streamOwnerUserId: "c1",
      }),
    ).toBe("c3");
  });

  it("solo live (no battle) targets the stream owner", () => {
    expect(
      resolveGiftTargetCreatorId({
        battle: null,
        battleTarget: "host",
        streamOwnerUserId: "solo-host",
      }),
    ).toBe("solo-host");
    expect(isActiveBattleSession({ status: "ENDED", hostUserId: "c1" })).toBe(
      false,
    );
  });

  it("seated creators own their own audience; spectators keep the creator they followed", () => {
    expect(
      resolveJoinAudienceCreatorId({
        userId: "c2",
        streamOwnerUserId: "c1",
        battle: battle4,
      }),
    ).toBe("c2");
    expect(
      resolveJoinAudienceCreatorId({
        userId: "c2",
        queryAudienceCreatorId: "c2",
        streamOwnerUserId: "c1",
        battle: { ...battle4, opponentUserId: "" },
      }),
    ).toBe("c2");
    expect(
      resolveJoinAudienceCreatorId({
        userId: "spec-c2",
        queryAudienceCreatorId: "c2",
        streamOwnerUserId: "c1",
        battle: battle4,
      }),
    ).toBe("c2");
    expect(
      resolveJoinAudienceCreatorId({
        userId: "spec-c4",
        stampedAudienceCreatorId: "c4",
        streamOwnerUserId: "c1",
        battle: battle4,
      }),
    ).toBe("c4");
    expect(
      resolveJoinAudienceCreatorId({
        userId: "spec-host",
        streamOwnerUserId: "c1",
        battle: battle4,
      }),
    ).toBe("c1");
  });

  it("gift visuals reach only the target creator and that creator's spectators", () => {
    const c1 = { userId: "c1", audienceCreatorId: "c1" };
    const spec1 = { userId: "s1", audienceCreatorId: "c1" };
    const c2 = { userId: "c2", audienceCreatorId: "c2" };
    const spec2 = { userId: "s2", audienceCreatorId: "c2" };
    const spec3 = { userId: "s3", audienceCreatorId: "c3" };
    const spec4 = { userId: "s4", audienceCreatorId: "c4" };

    expect(clientReceivesCreatorGiftAudience(c1, "c1")).toBe(true);
    expect(clientReceivesCreatorGiftAudience(spec1, "c1")).toBe(true);
    expect(clientReceivesCreatorGiftAudience(c2, "c1")).toBe(false);
    expect(clientReceivesCreatorGiftAudience(spec2, "c1")).toBe(false);
    expect(clientReceivesCreatorGiftAudience(spec3, "c1")).toBe(false);
    expect(clientReceivesCreatorGiftAudience(spec4, "c1")).toBe(false);

    expect(clientReceivesCreatorGiftAudience(c2, "c2")).toBe(true);
    expect(clientReceivesCreatorGiftAudience(spec2, "c2")).toBe(true);
    expect(clientReceivesCreatorGiftAudience(c1, "c2")).toBe(false);
    expect(clientReceivesCreatorGiftAudience(spec1, "c2")).toBe(false);
  });
});
