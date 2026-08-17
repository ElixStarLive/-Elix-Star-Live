import { describe, expect, it } from "vitest";
import {
  clientReceivesCreatorGiftAudience,
  resolveJoinAudienceCreatorId,
} from "./giftAudience";
import { seatedUserIds } from "./battleModel";
import { battleSessionFixture } from "./battleTestFixtures";

const battle4 = battleSessionFixture({
  status: "ACTIVE",
  seats: { host: "c1", opponent: "c2", player3: "c3", player4: "c4" },
});

describe("4-creator battle gift audience ownership", () => {
  it("lists every seated creator exactly once", () => {
    expect(seatedUserIds(battle4)).toEqual(["c1", "c2", "c3", "c4"]);
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
        battle: battleSessionFixture({
          status: "ACTIVE",
          seats: { host: "c1", player3: "c3", player4: "c4" },
        }),
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
