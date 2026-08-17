import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

/**
 * Paid gift money attribution.
 *
 * During a battle the creator revenue (60/40 on the coin cost) must follow the
 * creator the viewer actually gifted — NOT the room host. The recipient is
 * decided once by `resolveValidatedGiftRecipient`, and the SAME recipient must
 * be used for the wallet credit and for room delivery (animation + battle
 * score), so money and visuals can never disagree.
 *
 * Which seat the resolver picks is covered by giftRecipient.test.ts; this suite
 * covers what the money path does with that answer.
 */

const authMocks = vi.hoisted(() => ({
  getTokenFromRequest: vi.fn(),
  verifyAuthToken: vi.fn(),
}));

const dbMocks = vi.hoisted(() => ({ query: vi.fn() }));

const walletMocks = vi.hoisted(() => ({
  neonDebitGiftWithCreatorCredit: vi.fn(),
  neonEnsureBalanceFromFile: vi.fn(),
}));

const recipientMocks = vi.hoisted(() => ({
  resolveValidatedGiftRecipient: vi.fn(),
}));

const deliveryMocks = vi.hoisted(() => ({ deliverVerifiedGift: vi.fn() }));

vi.mock("./auth", () => authMocks);
vi.mock("../lib/postgres", () => ({
  getPool: () => ({ query: dbMocks.query }),
  dbLoadGifts: async () => [
    { gift_id: "rose", name: "Rose", coin_cost: 100, gift_type: "basic", animation_url: "rose.mp4" },
  ],
}));
vi.mock("../lib/walletNeon", () => walletMocks);
vi.mock("../websocket/giftRecipient", () => recipientMocks);
vi.mock("../websocket/giftDelivery", () => deliveryMocks);
vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../lib/fraud", () => ({
  assertGiftRestVelocityOk: async () => ({ ok: true }),
}));
vi.mock("../lib/starterCoinsXp", () => ({
  awardPaidGiftXp: async () => ({ xp_gained: 0, total_xp: 0, new_level: 1, leveled_up: false }),
  sendStarterCoinGift: async () => ({ ok: true, already_processed: true }),
}));
vi.mock("../lib/notifications", () => ({ insertNotification: vi.fn() }));
vi.mock("./profiles", () => ({
  getOrCreateProfile: async () => ({ displayName: "Sender", username: "sender", avatarUrl: "" }),
}));
vi.mock("../lib/giftAssets", () => ({
  giftIconUrlFromAnimation: (u: string) => u,
  resolveGiftMediaUrl: (u: string | null) => u ?? null,
}));
vi.mock("../lib/engagementFlags", () => ({
  getEngagementFlags: () => ({ promoGiftSpendEnabled: false, promotionalCoinsEnabled: false }),
}));
vi.mock("../lib/engagement", () => ({ spendPromoCoinsAndRecordGift: vi.fn() }));

import { handleSendGift } from "./gifts";

const HOST = "creator-host";
const PLAYER4 = "creator-player4";

function mockRes() {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  return { value: { status, json } as unknown as Response, status, json };
}

function mockReq(body: Record<string, unknown>): Request {
  return { body, headers: {} } as unknown as Request;
}

function paidGiftBody(extra: Record<string, unknown> = {}) {
  return {
    room_id: "room-1",
    gift_id: "rose",
    transaction_id: "tx-1",
    gift_source: "paid_coins",
    ...extra,
  };
}

describe("paid gift creator attribution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.getTokenFromRequest.mockReturnValue("tok");
    authMocks.verifyAuthToken.mockReturnValue({ sub: "viewer-1" });
    // The room is live and owned by the battle host.
    dbMocks.query.mockResolvedValue({ rows: [{ user_id: HOST }] });
    walletMocks.neonDebitGiftWithCreatorCredit.mockResolvedValue({
      ok: true,
      newBalance: 900,
      alreadyProcessed: false,
      credited: 60,
    });
    deliveryMocks.deliverVerifiedGift.mockResolvedValue({ delivered: true });
  });

  it("credits the gifted battle creator, not the room host", async () => {
    const recipient = {
      creatorId: PLAYER4,
      battleSeat: "player4" as const,
      teamId: "teamB" as const,
      origin: "battle_seat" as const,
    };
    recipientMocks.resolveValidatedGiftRecipient.mockResolvedValue({ ok: true, recipient });

    const res = mockRes();
    await handleSendGift(mockReq(paidGiftBody({ battleTarget: "player4" })), res.value);

    expect(walletMocks.neonDebitGiftWithCreatorCredit).toHaveBeenCalledWith(
      expect.objectContaining({ creatorId: PLAYER4, coins: 100 }),
    );
    expect(walletMocks.neonDebitGiftWithCreatorCredit).not.toHaveBeenCalledWith(
      expect.objectContaining({ creatorId: HOST }),
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("pays the creator on the same coin cost the viewer was charged", async () => {
    recipientMocks.resolveValidatedGiftRecipient.mockResolvedValue({
      ok: true,
      recipient: {
        creatorId: PLAYER4,
        battleSeat: "player4" as const,
        teamId: "teamB" as const,
        origin: "battle_seat" as const,
      },
    });

    await handleSendGift(mockReq(paidGiftBody({ battleTarget: "player4" })), mockRes().value);

    // Battle multipliers must never reach the money path: the 60/40 split is
    // taken from the catalog coin cost only.
    const call = walletMocks.neonDebitGiftWithCreatorCredit.mock.calls[0][0];
    expect(call.coins).toBe(100);
    expect(call.clientTransactionId).toBe("tx-1");
  });

  it("uses one recipient for money and for room delivery", async () => {
    const recipient = {
      creatorId: PLAYER4,
      battleSeat: "player4" as const,
      teamId: "teamB" as const,
      origin: "battle_seat" as const,
    };
    recipientMocks.resolveValidatedGiftRecipient.mockResolvedValue({ ok: true, recipient });

    await handleSendGift(mockReq(paidGiftBody({ battleTarget: "player4" })), mockRes().value);

    expect(deliveryMocks.deliverVerifiedGift).toHaveBeenCalledWith(
      expect.objectContaining({ recipient, giftSource: "paid_coins" }),
    );
  });

  it("refuses the gift and moves no money when the target is invalid", async () => {
    recipientMocks.resolveValidatedGiftRecipient.mockResolvedValue({
      ok: false,
      error: "BATTLE_SEAT_EMPTY",
    });

    const res = mockRes();
    await handleSendGift(mockReq(paidGiftBody({ battleTarget: "player3" })), res.value);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(walletMocks.neonDebitGiftWithCreatorCredit).not.toHaveBeenCalled();
    expect(deliveryMocks.deliverVerifiedGift).not.toHaveBeenCalled();
  });

  it("solo live still credits the stream owner", async () => {
    recipientMocks.resolveValidatedGiftRecipient.mockResolvedValue({
      ok: true,
      recipient: {
        creatorId: HOST,
        battleSeat: null,
        teamId: null,
        origin: "stream_owner" as const,
      },
    });

    await handleSendGift(mockReq(paidGiftBody()), mockRes().value);

    expect(walletMocks.neonDebitGiftWithCreatorCredit).toHaveBeenCalledWith(
      expect.objectContaining({ creatorId: HOST }),
    );
  });

  it("test coins can never enter the REST money path", async () => {
    const res = mockRes();
    await handleSendGift(
      mockReq(paidGiftBody({ gift_source: "test_coins" })),
      res.value,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ origin: "test_coins", financialValueGbp: 0 }),
    );
    expect(walletMocks.neonDebitGiftWithCreatorCredit).not.toHaveBeenCalled();
  });
});
