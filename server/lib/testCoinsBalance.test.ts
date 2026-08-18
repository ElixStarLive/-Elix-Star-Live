import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  resetValkeyFake,
  setValkeyFakeHashesReachable,
  valkeyFake,
} from "../websocket/battleValkeyFake";

vi.mock("./valkey", () => valkeyFake);
vi.mock("./logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const {
  creditTestCoins,
  debitTestCoins,
  readTestCoinsBalance,
  isTestCoinsStoreAvailable,
} = await import("./testCoinsBalance");

describe("server-owned test-coin balance", () => {
  beforeEach(() => {
    resetValkeyFake();
  });

  it("starts at zero and credits only whole positive amounts", async () => {
    expect(isTestCoinsStoreAvailable()).toBe(true);
    expect(await readTestCoinsBalance("u1")).toEqual({ status: "ok", balance: 0 });
    expect(await creditTestCoins("u1", 500)).toEqual({ status: "ok", balance: 500 });
    expect(await creditTestCoins("u1", 0)).toEqual({ status: "ok", balance: 500 });
    expect(await creditTestCoins("u1", -100)).toEqual({ status: "ok", balance: 500 });
    expect(await creditTestCoins("u1", 12.9)).toEqual({ status: "ok", balance: 512 });
    expect(await readTestCoinsBalance("u1")).toEqual({ status: "ok", balance: 512 });
  });

  it("debits a gift and reports the new balance", async () => {
    await creditTestCoins("u1", 100);
    expect(await debitTestCoins("u1", 30)).toEqual({ ok: true, newBalance: 70 });
    expect(await readTestCoinsBalance("u1")).toEqual({ status: "ok", balance: 70 });
  });

  it("refuses to overdraw and leaves the balance untouched", async () => {
    await creditTestCoins("u1", 10);
    expect(await debitTestCoins("u1", 25)).toEqual({
      ok: false,
      balance: 10,
      reason: "insufficient",
    });
    expect(await readTestCoinsBalance("u1")).toEqual({ status: "ok", balance: 10 });
    expect(await debitTestCoins("u2", 5)).toMatchObject({ ok: false, reason: "insufficient" });
  });

  it("cannot be double-spent by concurrent gifts", async () => {
    await creditTestCoins("u1", 100);
    const results = await Promise.all([
      debitTestCoins("u1", 60),
      debitTestCoins("u1", 60),
      debitTestCoins("u1", 60),
    ]);
    expect(results.filter((r) => r.ok === true)).toHaveLength(1);
    expect(await readTestCoinsBalance("u1")).toEqual({ status: "ok", balance: 40 });
  });

  it("keeps balances separate per user", async () => {
    await creditTestCoins("u1", 50);
    await creditTestCoins("u2", 700);
    await debitTestCoins("u1", 50);
    expect(await readTestCoinsBalance("u1")).toEqual({ status: "ok", balance: 0 });
    expect(await readTestCoinsBalance("u2")).toEqual({ status: "ok", balance: 700 });
  });

  /**
   * A store that cannot answer must never look like a spend that worked. A
   * "successful" debit of a balance that never moved would hand out unlimited
   * free test gifts and unlimited battle points for as long as Valkey is down.
   */
  describe("an unreachable store is never zero and never success", () => {
    it("refuses the debit instead of reporting a spend", async () => {
      await creditTestCoins("u1", 100);
      setValkeyFakeHashesReachable(false);

      expect(await debitTestCoins("u1", 30)).toEqual({
        ok: false,
        reason: "unavailable",
      });
    });

    it("reports the balance as unavailable, not as 0", async () => {
      await creditTestCoins("u1", 100);
      setValkeyFakeHashesReachable(false);

      expect(await readTestCoinsBalance("u1")).toEqual({ status: "unavailable" });
    });

    it("refuses the credit instead of reporting a mint of nothing", async () => {
      setValkeyFakeHashesReachable(false);

      expect(await creditTestCoins("u1", 500)).toEqual({ status: "unavailable" });
    });

    it("keeps the spent coins spent when the debit landed and the read did not", async () => {
      await creditTestCoins("u1", 100);
      expect(await debitTestCoins("u1", 40)).toEqual({ ok: true, newBalance: 60 });
      setValkeyFakeHashesReachable(false);
      expect(await readTestCoinsBalance("u1")).toEqual({ status: "unavailable" });
      setValkeyFakeHashesReachable(true);
      expect(await readTestCoinsBalance("u1")).toEqual({ status: "ok", balance: 60 });
    });
  });
});
