/**
 * Test-coin ISSUE client contract.
 *
 * The server owns the test balance. The client may only report what the server
 * actually credited: never a local credit, never a requested amount the server
 * refused, and never "wrong password" for a store that could not answer.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ request: vi.fn() }));
const mirror = vi.hoisted(() => ({ persistTestCoinsBalance: vi.fn() }));

vi.mock("./apiClient", () => ({ request: api.request }));
vi.mock("./testCoins", () => ({
  persistTestCoinsBalance: mirror.persistTestCoinsBalance,
}));

import {
  formatTestCoinIssueError,
  mintTestCoinsViaServer,
} from "./testCoinIssueApi";

type MintBody = { password: string; amount: number; requestId: string };

const bodyOf = (call: unknown[]): MintBody =>
  JSON.parse(String((call[1] as { body?: string })?.body ?? "{}"));

describe("test-coin mint client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends a request id so a replayed mint credits once", async () => {
    api.request.mockResolvedValue({
      data: { balance: 300, minted: 300, origin: "test_coins" },
      error: null,
    });

    await mintTestCoinsViaServer("owner-1", "pw", 300);

    const body = bodyOf(api.request.mock.calls[0]);
    expect(body.requestId).toMatch(/^m[A-Za-z0-9_-]+$/);
    expect(body.amount).toBe(300);
    expect(mirror.persistTestCoinsBalance).toHaveBeenCalledWith("owner-1", 300);
  });

  it("gives each attempt its own request id", async () => {
    api.request.mockResolvedValue({
      data: { balance: 1, minted: 1 },
      error: null,
    });

    await mintTestCoinsViaServer("owner-1", "pw", 1);
    await mintTestCoinsViaServer("owner-1", "pw", 1);

    expect(bodyOf(api.request.mock.calls[0]).requestId).not.toBe(
      bodyOf(api.request.mock.calls[1]).requestId,
    );
  });

  it("reports a replayed mint as nothing minted, not as the amount asked for", async () => {
    api.request.mockResolvedValue({
      data: { balance: 500, minted: 0, duplicate: true },
      error: null,
    });

    const result = await mintTestCoinsViaServer("owner-1", "pw", 500);

    expect(result).toEqual({ ok: true, balance: 500, minted: 0 });
    expect(mirror.persistTestCoinsBalance).toHaveBeenCalledWith("owner-1", 500);
  });

  it("never credits locally when the server refuses", async () => {
    api.request.mockResolvedValue({
      data: null,
      error: { message: "Test-coin balance store is unavailable." },
    });

    const result = await mintTestCoinsViaServer("owner-1", "pw", 500);

    expect(result.ok).toBe(false);
    expect(mirror.persistTestCoinsBalance).not.toHaveBeenCalled();
  });

  it("does not call an unavailable store a wrong password", async () => {
    api.request.mockResolvedValue({
      data: null,
      error: { message: "Test-coin issuance is unavailable." },
    });

    const result = await mintTestCoinsViaServer("owner-1", "pw", 500);

    expect(result).toMatchObject({ ok: false, status: 503 });
    if (result.ok === false) {
      expect(formatTestCoinIssueError(result.error, result.status)).not.toMatch(
        /wrong password/i,
      );
    }
  });

  it("still says wrong password when the server says FORBIDDEN", async () => {
    api.request.mockResolvedValue({
      data: null,
      error: { message: "FORBIDDEN" },
    });

    const result = await mintTestCoinsViaServer("owner-1", "bad", 500);

    expect(result).toMatchObject({ ok: false, status: 403 });
    if (result.ok === false) {
      expect(formatTestCoinIssueError(result.error, result.status)).toBe(
        "Wrong password",
      );
    }
  });
});
