import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

/**
 * A live share lands in someone else's inbox, so its send limit is the only
 * thing keeping one account from spraying the whole platform.
 *
 * Counted per process, that limit is not a limit: N instances allow N times the
 * ceiling, and which instance a request lands on is a coin toss the sender can
 * flip as often as they like. The window belongs in Valkey, and when Valkey
 * cannot answer, production refuses the send rather than quietly granting a
 * fresh local budget.
 */

const auth = vi.hoisted(() => ({
  getTokenFromRequest: vi.fn(() => "tok"),
  verifyAuthToken: vi.fn(() => ({ sub: "sharer-1" })),
}));
const valkey = vi.hoisted(() => ({
  isValkeyConfigured: vi.fn(() => true),
  valkeyRateCheck: vi.fn(async () => true),
}));
const ops = vi.hoisted(() => ({
  executeLiveShareSend: vi.fn(async () => ({ ok: true, persisted: true })),
}));

vi.mock("./auth", () => auth);
vi.mock("../lib/valkey", () => valkey);
vi.mock("../lib/liveShareOps", () => ops);
vi.mock("../lib/postgres", () => ({ listLiveShareRequestsNonFollowing: vi.fn(async () => []) }));
vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function mockRes() {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  return { value: { status, json } as unknown as Response, status, json };
}

const shareRequest = () =>
  ({
    body: { targetUserId: "friend-1", streamKey: "room-1", hostUserId: "host-1" },
    headers: {},
  }) as unknown as Request;

/** Load the route with NODE_ENV fixed, since the local-window flag is read once. */
async function loadRoute(nodeEnv: string) {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = nodeEnv;
  vi.resetModules();
  const mod = await import("./liveShareInbox");
  process.env.NODE_ENV = previous;
  return mod;
}

describe("live share send limit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    valkey.isValkeyConfigured.mockReturnValue(true);
    valkey.valkeyRateCheck.mockResolvedValue(true);
    ops.executeLiveShareSend.mockResolvedValue({ ok: true, persisted: true });
    auth.getTokenFromRequest.mockReturnValue("tok");
    auth.verifyAuthToken.mockReturnValue({ sub: "sharer-1" });
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("counts sends in Valkey so every instance shares one window", async () => {
    const { handlePostLiveShare } = await loadRoute("production");

    await handlePostLiveShare(shareRequest(), mockRes().value);

    expect(valkey.valkeyRateCheck).toHaveBeenCalledWith(
      "rl:live-share:sharer-1",
      60_000,
      40,
    );
  });

  it("refuses the send once the shared window is full", async () => {
    valkey.valkeyRateCheck.mockResolvedValue(false);
    const { handlePostLiveShare } = await loadRoute("production");
    const res = mockRes();

    await handlePostLiveShare(shareRequest(), res.value);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(ops.executeLiveShareSend).not.toHaveBeenCalled();
  });

  it("fails closed in production when Valkey cannot answer", async () => {
    valkey.valkeyRateCheck.mockRejectedValue(new Error("valkey down"));
    const { handlePostLiveShare } = await loadRoute("production");
    const res = mockRes();

    await handlePostLiveShare(shareRequest(), res.value);

    // The old per-process window would have allowed 40 more sends per instance.
    expect(res.status).toHaveBeenCalledWith(429);
    expect(ops.executeLiveShareSend).not.toHaveBeenCalled();
  });

  it("fails closed in production when Valkey is not configured at all", async () => {
    valkey.isValkeyConfigured.mockReturnValue(false);
    const { handlePostLiveShare } = await loadRoute("production");
    const res = mockRes();

    await handlePostLiveShare(shareRequest(), res.value);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(ops.executeLiveShareSend).not.toHaveBeenCalled();
  });

  it("still runs locally in development without Valkey", async () => {
    valkey.isValkeyConfigured.mockReturnValue(false);
    const { handlePostLiveShare } = await loadRoute("development");
    const res = mockRes();

    await handlePostLiveShare(shareRequest(), res.value);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(ops.executeLiveShareSend).toHaveBeenCalled();
  });
});
