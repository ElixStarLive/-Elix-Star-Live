/**
 * TEST-COIN GIFT — behaviour, not source text.
 *
 * Runs the real `gift_sent` handler against the real server-owned test balance
 * (Valkey fake) and proves what a test gift does and does not do: it debits the
 * server balance, plays, and scores the battle seat the server resolved — and it
 * never reaches a wallet, a creator earning, a paid-coin lot, a GBP ledger, or
 * any database write at all. £0, always.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  resetValkeyFake,
  setValkeyFakeHashesReachable,
  valkeyFake,
} from "./battleValkeyFake";

const ws = vi.hoisted(() => ({
  sendToClient: vi.fn(),
  broadcastToRoom: vi.fn(),
  sendToUserGlobal: vi.fn(),
  wsRateCheck: vi.fn(),
  incrementRoomLiveLikes: vi.fn(),
}));

const battle = vi.hoisted(() => ({
  addBattleScore: vi.fn(),
  getBattleFromStore: vi.fn(),
}));

const recipient = vi.hoisted(() => ({
  resolveValidatedGiftRecipient: vi.fn(),
}));

const delivery = vi.hoisted(() => ({
  emitGiftSentToTargetAudience: vi.fn(),
  deliverVerifiedGift: vi.fn(),
}));

const db = vi.hoisted(() => ({ query: vi.fn() }));

const registry = vi.hoisted(() => ({
  getGiftValue: vi.fn(),
  resolvePlayableGiftVideoUrl: vi.fn(),
}));

vi.mock("../lib/valkey", () => valkeyFake);
vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("./index", () => ({
  sendToClient: ws.sendToClient,
  broadcastToRoom: ws.broadcastToRoom,
  sendToUserGlobal: ws.sendToUserGlobal,
  wsRateCheck: ws.wsRateCheck,
  incrementRoomLiveLikes: ws.incrementRoomLiveLikes,
  updateViewerCount: vi.fn(),
  transferLiveAudienceToBattleRoom: vi.fn(),
  upsertCohostJoinRequest: vi.fn(),
  deleteCohostJoinRequest: vi.fn(),
  listCohostJoinRequests: vi.fn(),
  grantBattlePublish: vi.fn(),
  hasBattlePublishGrant: vi.fn(),
  grantCohostPublish: vi.fn(),
  revokeBattlePublish: vi.fn(),
  releaseCohostPublish: vi.fn(),
}));

vi.mock("./battle", () => ({
  addBattleScore: battle.addBattleScore,
  getBattleFromStore: battle.getBattleFromStore,
  broadcastBattleState: vi.fn(),
  buildBattleStateForRoom: vi.fn(),
  claimBattleSeat: vi.fn(),
  claimBattleVoteOnce: vi.fn(),
  releaseBattleVoteOnce: vi.fn(),
  clearPendingBattleInvites: vi.fn(),
  confirmBattleParticipantPresence: vi.fn(),
  ensureBattleForHost: vi.fn(),
  finalizeBattle: vi.fn(),
  hasBattleAcceptedGrant: vi.fn(),
  hasBattleInvite: vi.fn(),
  removeBattleParticipant: vi.fn(),
  setBattleAcceptedGrant: vi.fn(),
  setBattleInvite: vi.fn(),
  setUserBattleRoom: vi.fn(),
  getUserBattleRoom: vi.fn(),
  clearBattleInvite: vi.fn(),
  startBattleIfReady: vi.fn(),
}));

vi.mock("./giftRecipient", () => ({
  resolveValidatedGiftRecipient: recipient.resolveValidatedGiftRecipient,
  normalizeRequestedBattleSeat: vi.fn(),
}));

vi.mock("./giftDelivery", () => ({
  emitGiftSentToTargetAudience: delivery.emitGiftSentToTargetAudience,
  deliverVerifiedGift: delivery.deliverVerifiedGift,
}));

vi.mock("./giftRegistry", () => ({
  getGiftValue: registry.getGiftValue,
  resolvePlayableGiftVideoUrl: registry.resolvePlayableGiftVideoUrl,
}));

vi.mock("../lib/postgres", () => ({
  getPool: () => ({ query: db.query }),
  dbIsBlockedEitherWay: vi.fn(async () => false),
  dbGetLiveStreams: vi.fn(async () => []),
}));

vi.mock("../routes/livestream", () => ({
  resolveStreamOwnerUserId: vi.fn(async () => "creator-host"),
  removeActiveStream: vi.fn(),
  isStreamHost: vi.fn(async () => false),
  listActiveLiveStreams: vi.fn(async () => []),
}));

vi.mock("../services/livekit", () => ({
  grantParticipantPublish: vi.fn(),
  isLiveKitConfigured: () => false,
  isUserPublishingInRoom: vi.fn(async () => false),
  revokeParticipantPublish: vi.fn(),
}));

vi.mock("./engagement", () => ({
  claimWatchTick: vi.fn(),
  getEngagementPublicState: vi.fn(async () => ({})),
  recordEngagementAction: vi.fn(async () => ({ stageUnlocked: false })),
  setEngagementFeatures: vi.fn(),
  setEngagementPoll: vi.fn(),
  startMysteryCountdown: vi.fn(),
  voteEngagementPoll: vi.fn(),
}));

vi.mock("./cohostSeatStore", () => ({ mutateCohostSeats: vi.fn() }));
vi.mock("./cohostSlots", () => ({
  MAX_COHOST_SLOTS: 3,
  removeCohostSlot: vi.fn(),
  upsertCohostSlot: vi.fn(),
}));
vi.mock("./giftGoal", () => ({ clearGiftGoal: vi.fn(), setGiftGoal: vi.fn() }));
vi.mock("./liveCreatorRole", () => ({ setCreatorCohostRoom: vi.fn() }));
vi.mock("../feedBroadcast", () => ({ broadcastStreamEnded: vi.fn() }));
vi.mock("../lib/awardLiveWatchXp", () => ({ awardLiveWatchXp: vi.fn() }));
vi.mock("../lib/booster", () => ({
  activateBooster: vi.fn(),
  getMistFogDurationMs: () => 0,
}));

const { handleMessage } = await import("./handlers");
const { creditTestCoins, readTestCoinsBalance } = await import(
  "../lib/testCoinsBalance"
);

const SENDER = "viewer-1";
const ROOM = "room-1";
const GIFT_COST = 100;

function client() {
  return {
    userId: SENDER,
    roomId: ROOM,
    username: "viewer",
    displayName: "Viewer",
    avatarUrl: "",
    level: 3,
  } as unknown as Parameters<typeof handleMessage>[0];
}

function seatRecipient(seat: string | null, creatorId = "creator-host") {
  return {
    ok: true as const,
    recipient: {
      creatorId,
      battleSeat: seat,
      origin: seat ? "battle_seat" : "host",
    },
  };
}

function lastAck(): Record<string, unknown> {
  const calls = ws.sendToClient.mock.calls.filter((c) => c[1] === "gift_ack");
  return (calls.at(-1)?.[2] ?? {}) as Record<string, unknown>;
}

async function sendTestGift(extra: Record<string, unknown> = {}) {
  await handleMessage(client(), "gift_sent", {
    giftId: "rose",
    giftSource: "test_coins",
    requestId: "tg-1",
    ...extra,
  });
}

describe("test-coin gift behaviour (£0)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    resetValkeyFake();
    ws.wsRateCheck.mockResolvedValue(true);
    ws.incrementRoomLiveLikes.mockResolvedValue(7);
    registry.getGiftValue.mockReturnValue(GIFT_COST);
    registry.resolvePlayableGiftVideoUrl.mockResolvedValue("rose.mp4");
    recipient.resolveValidatedGiftRecipient.mockResolvedValue(
      seatRecipient("opponent", "creator-opponent"),
    );
    battle.addBattleScore.mockResolvedValue({
      ok: true,
      seat: "opponent",
      creatorId: "creator-opponent",
      teamId: "teamB",
      points: GIFT_COST,
    });
    battle.getBattleFromStore.mockResolvedValue(null);
    await creditTestCoins(SENDER, 500);
  });

  it("debits the server balance, plays, and scores the resolved seat", async () => {
    await sendTestGift();

    expect(await readTestCoinsBalance(SENDER)).toEqual({ status: "ok", balance: 400 });
    expect(delivery.emitGiftSentToTargetAudience).toHaveBeenCalledTimes(1);
    expect(battle.addBattleScore).toHaveBeenCalledWith(
      expect.objectContaining({
        roomId: ROOM,
        seat: "opponent",
        points: GIFT_COST,
        source: "test_gift",
      }),
    );
    expect(lastAck()).toMatchObject({
      status: "test",
      origin: "test_coins",
      financialValueGbp: 0,
      testCoinsBalance: 400,
      battlePoints: GIFT_COST,
    });
  });

  /** The whole point of Step 15: a test gift is not a purchase of anything. */
  it("never touches money: no wallet, no earning, no lot, no ledger, no DB write", async () => {
    await sendTestGift();

    expect(db.query).not.toHaveBeenCalled();
    expect(delivery.deliverVerifiedGift).not.toHaveBeenCalled();
    const payload = delivery.emitGiftSentToTargetAudience.mock.calls[0][0] as {
      payload: Record<string, unknown>;
    };
    expect(payload.payload.giftSource).toBe("test_coins");
    expect(String(payload.payload.transactionId)).toMatch(/^test-/);
  });

  it("spends the catalog cost, not the coins the client claimed", async () => {
    await sendTestGift({ coins: 999_999 });

    expect(await readTestCoinsBalance(SENDER)).toEqual({ status: "ok", balance: 400 });
    expect(battle.addBattleScore).toHaveBeenCalledWith(
      expect.objectContaining({ points: GIFT_COST }),
    );
  });

  it("scores the 2x2 seat the server resolved, never the host", async () => {
    recipient.resolveValidatedGiftRecipient.mockResolvedValue(
      seatRecipient("player4", "creator-player4"),
    );
    battle.addBattleScore.mockResolvedValue({
      ok: true,
      seat: "player4",
      creatorId: "creator-player4",
      teamId: "teamB",
      points: GIFT_COST,
    });

    await sendTestGift({ battleTarget: "host" });

    expect(battle.addBattleScore).toHaveBeenCalledWith(
      expect.objectContaining({ seat: "player4" }),
    );
  });

  it("does not score anything on a solo live", async () => {
    recipient.resolveValidatedGiftRecipient.mockResolvedValue(seatRecipient(null));

    await sendTestGift();

    expect(battle.addBattleScore).not.toHaveBeenCalled();
    expect(delivery.emitGiftSentToTargetAudience).toHaveBeenCalledTimes(1);
    expect(lastAck()).toMatchObject({ status: "test", battlePoints: 0 });
  });

  it("refuses a gift the sender cannot afford — nothing plays, nothing scores", async () => {
    registry.getGiftValue.mockReturnValue(900);

    await sendTestGift();

    expect(await readTestCoinsBalance(SENDER)).toEqual({ status: "ok", balance: 500 });
    expect(delivery.emitGiftSentToTargetAudience).not.toHaveBeenCalled();
    expect(battle.addBattleScore).not.toHaveBeenCalled();
    expect(lastAck()).toMatchObject({
      status: "insufficient_test_coins",
      testCoinsBalance: 500,
      financialValueGbp: 0,
    });
  });

  /**
   * A store that cannot answer must not become a free gift. Reporting the
   * balance as 0 here would also wipe the panel's number for a balance that is
   * still there.
   */
  it("refuses the gift when the balance store is unavailable, and claims no balance", async () => {
    setValkeyFakeHashesReachable(false);

    await sendTestGift();

    expect(delivery.emitGiftSentToTargetAudience).not.toHaveBeenCalled();
    expect(battle.addBattleScore).not.toHaveBeenCalled();
    const ack = lastAck();
    expect(ack).toMatchObject({ status: "test_coins_unavailable", financialValueGbp: 0 });
    expect(ack).not.toHaveProperty("testCoinsBalance");

    setValkeyFakeHashesReachable(true);
    expect(await readTestCoinsBalance(SENDER)).toEqual({ status: "ok", balance: 500 });
  });

  it("gives the coins back when the recipient is refused", async () => {
    recipient.resolveValidatedGiftRecipient.mockResolvedValue({
      ok: false,
      error: "invalid_battle_target",
    });

    await sendTestGift();

    expect(await readTestCoinsBalance(SENDER)).toEqual({ status: "ok", balance: 500 });
    expect(delivery.emitGiftSentToTargetAudience).not.toHaveBeenCalled();
    expect(battle.addBattleScore).not.toHaveBeenCalled();
    expect(lastAck()).toMatchObject({
      status: "invalid_battle_target",
      testCoinsBalance: 500,
    });
  });

  it("reports zero battle points when the score write did not land", async () => {
    battle.addBattleScore.mockResolvedValue({ ok: false, reason: "unavailable" });

    await sendTestGift();

    expect(lastAck()).toMatchObject({ status: "test", battlePoints: 0 });
  });

  it("refuses a gift id the catalog does not price", async () => {
    registry.getGiftValue.mockReturnValue(0);

    await sendTestGift();

    expect(await readTestCoinsBalance(SENDER)).toEqual({ status: "ok", balance: 500 });
    expect(delivery.emitGiftSentToTargetAudience).not.toHaveBeenCalled();
    expect(lastAck()).toMatchObject({ status: "invalid_gift", financialValueGbp: 0 });
  });

  /**
   * A live like is engagement. It is not the battle tap and it is not a gift:
   * it must never score a battle, spend a test coin, or touch the database.
   */
  it("keeps a live like separate from battle score and from test coins", async () => {
    await handleMessage(client(), "heart_sent", { username: "viewer" });

    expect(ws.incrementRoomLiveLikes).toHaveBeenCalledWith(ROOM);
    expect(battle.addBattleScore).not.toHaveBeenCalled();
    expect(await readTestCoinsBalance(SENDER)).toEqual({ status: "ok", balance: 500 });
    expect(db.query).not.toHaveBeenCalled();
    const like = ws.broadcastToRoom.mock.calls.find((c) => c[1] === "heart_sent");
    expect(like?.[2]).toMatchObject({ live_likes: 7 });
  });

  /** Two gifts racing the last of a balance: one plays, one is refused. */
  it("cannot be double-spent by two gifts at once", async () => {
    registry.getGiftValue.mockReturnValue(300);

    await Promise.all([sendTestGift(), sendTestGift()]);

    expect(await readTestCoinsBalance(SENDER)).toEqual({ status: "ok", balance: 200 });
    expect(delivery.emitGiftSentToTargetAudience).toHaveBeenCalledTimes(1);
    expect(battle.addBattleScore).toHaveBeenCalledTimes(1);
  });
});
