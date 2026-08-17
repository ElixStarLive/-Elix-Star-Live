import { beforeEach, describe, expect, it, vi } from "vitest";
import { battleSessionFixture } from "./battleTestFixtures";
import type { BattleSession } from "./battleModel";

const state: {
  battle: BattleSession | null;
  publishGrants: Set<string>;
  layoutCoHosts: Array<{ userId: string; status?: string }>;
} = {
  battle: null,
  publishGrants: new Set(),
  layoutCoHosts: [],
};

vi.mock("./index", () => ({
  hasCohostPublishGrant: async (_roomId: string, userId: string) =>
    state.publishGrants.has(userId),
  getCohostLayout: async () => ({ coHosts: state.layoutCoHosts }),
}));

vi.mock("./battle", () => ({
  getBattleFromStore: async () => state.battle,
}));

const { normalizeRequestedBattleSeat, resolveValidatedGiftRecipient } =
  await import("./giftRecipient");

const ACTIVE_2X2 = () =>
  battleSessionFixture({
    status: "ACTIVE",
    roomId: "host-room",
    seats: { host: "c1", opponent: "c2", player3: "c3", player4: "c4" },
  });

describe("validated gift recipient", () => {
  beforeEach(() => {
    state.battle = null;
    state.publishGrants = new Set();
    state.layoutCoHosts = [];
  });

  it("normalizes only real seats", () => {
    expect(normalizeRequestedBattleSeat("host")).toBe("host");
    expect(normalizeRequestedBattleSeat("player4")).toBe("player4");
    expect(normalizeRequestedBattleSeat("me")).toBe("host");
    expect(normalizeRequestedBattleSeat("p3")).toBe("player3");
    expect(normalizeRequestedBattleSeat("teamB")).toBe(null);
    expect(normalizeRequestedBattleSeat(42)).toBe(null);
  });

  it("credits the requested battle seat's creator — all four seats", async () => {
    state.battle = ACTIVE_2X2();
    for (const [seat, creatorId, teamId] of [
      ["host", "c1", "teamA"],
      ["opponent", "c2", "teamB"],
      ["player3", "c3", "teamA"],
      ["player4", "c4", "teamB"],
    ] as const) {
      const r = await resolveValidatedGiftRecipient({
        roomId: "host-room",
        streamOwnerUserId: "c1",
        requestedBattleTarget: seat,
      });
      expect(r).toEqual({
        ok: true,
        recipient: { creatorId, battleSeat: seat, teamId, origin: "battle_seat" },
      });
    }
  });

  it("errors on an empty seat instead of falling back to the host", async () => {
    state.battle = battleSessionFixture({
      status: "ACTIVE",
      roomId: "host-room",
      seats: { host: "c1", opponent: "c2" },
    });
    await expect(
      resolveValidatedGiftRecipient({
        roomId: "host-room",
        streamOwnerUserId: "c1",
        requestedBattleTarget: "player4",
      }),
    ).resolves.toEqual({ ok: false, error: "INVALID_BATTLE_TARGET" });
  });

  it("errors on an unknown battle target instead of guessing", async () => {
    state.battle = ACTIVE_2X2();
    await expect(
      resolveValidatedGiftRecipient({
        roomId: "host-room",
        streamOwnerUserId: "c1",
        requestedBattleTarget: "teamA",
      }),
    ).resolves.toEqual({ ok: false, error: "INVALID_BATTLE_TARGET" });
  });

  it("ignores a co-host target while a battle owns the room", async () => {
    state.battle = ACTIVE_2X2();
    state.publishGrants = new Set(["ch1"]);
    const r = await resolveValidatedGiftRecipient({
      roomId: "host-room",
      streamOwnerUserId: "c1",
      requestedBattleTarget: "opponent",
      requestedCohostTargetUserId: "ch1",
    });
    expect(r).toEqual({
      ok: true,
      recipient: {
        creatorId: "c2",
        battleSeat: "opponent",
        teamId: "teamB",
        origin: "battle_seat",
      },
    });
  });

  it("uses the battle host seat when the client names no target", async () => {
    state.battle = ACTIVE_2X2();
    const r = await resolveValidatedGiftRecipient({
      roomId: "host-room",
      streamOwnerUserId: "c1",
    });
    expect(r).toMatchObject({ ok: true, recipient: { creatorId: "c1" } });
  });

  it("does not treat a WAITING or ENDED battle as a scoring target", async () => {
    state.battle = battleSessionFixture({
      status: "WAITING",
      roomId: "host-room",
      seats: { host: "c1", opponent: "c2" },
    });
    await expect(
      resolveValidatedGiftRecipient({
        roomId: "host-room",
        streamOwnerUserId: "c1",
        requestedBattleTarget: "opponent",
      }),
    ).resolves.toEqual({
      ok: true,
      recipient: {
        creatorId: "c1",
        battleSeat: null,
        teamId: null,
        origin: "stream_owner",
      },
    });
  });

  it("validates a co-host target against the server grant or synced layout", async () => {
    state.publishGrants = new Set(["ch1"]);
    await expect(
      resolveValidatedGiftRecipient({
        roomId: "host-room",
        streamOwnerUserId: "c1",
        requestedCohostTargetUserId: "ch1",
      }),
    ).resolves.toEqual({
      ok: true,
      recipient: {
        creatorId: "ch1",
        battleSeat: null,
        teamId: null,
        origin: "cohost",
      },
    });

    state.publishGrants = new Set();
    state.layoutCoHosts = [{ userId: "ch2", status: "live" }];
    await expect(
      resolveValidatedGiftRecipient({
        roomId: "host-room",
        streamOwnerUserId: "c1",
        requestedCohostTargetUserId: "ch2",
      }),
    ).resolves.toMatchObject({ ok: true, recipient: { creatorId: "ch2" } });

    await expect(
      resolveValidatedGiftRecipient({
        roomId: "host-room",
        streamOwnerUserId: "c1",
        requestedCohostTargetUserId: "stranger",
      }),
    ).resolves.toEqual({ ok: false, error: "INVALID_COHOST_TARGET" });
  });

  it("solo live credits the stream owner", async () => {
    await expect(
      resolveValidatedGiftRecipient({
        roomId: "host-room",
        streamOwnerUserId: "solo-host",
      }),
    ).resolves.toEqual({
      ok: true,
      recipient: {
        creatorId: "solo-host",
        battleSeat: null,
        teamId: null,
        origin: "stream_owner",
      },
    });
    await expect(
      resolveValidatedGiftRecipient({ roomId: "host-room", streamOwnerUserId: "" }),
    ).resolves.toEqual({ ok: false, error: "NO_RECIPIENT" });
  });
});
