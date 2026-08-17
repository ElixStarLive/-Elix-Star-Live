import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetValkeyFake, valkeyFake } from "../websocket/battleValkeyFake";

vi.mock("./valkey", () => valkeyFake);

const {
  creditTestCoins,
  debitTestCoins,
  getTestCoinsBalance,
  isTestCoinsStoreAvailable,
} = await import("./testCoinsBalance");

describe("server-owned test-coin balance", () => {
  beforeEach(() => {
    resetValkeyFake();
  });

  it("starts at zero and credits only whole positive amounts", async () => {
    expect(isTestCoinsStoreAvailable()).toBe(true);
    expect(await getTestCoinsBalance("u1")).toBe(0);
    expect(await creditTestCoins("u1", 500)).toBe(500);
    expect(await creditTestCoins("u1", 0)).toBe(500);
    expect(await creditTestCoins("u1", -100)).toBe(500);
    expect(await creditTestCoins("u1", 12.9)).toBe(512);
    expect(await getTestCoinsBalance("u1")).toBe(512);
  });

  it("debits a gift and reports the new balance", async () => {
    await creditTestCoins("u1", 100);
    expect(await debitTestCoins("u1", 30)).toEqual({ ok: true, newBalance: 70 });
    expect(await getTestCoinsBalance("u1")).toBe(70);
  });

  it("refuses to overdraw and leaves the balance untouched", async () => {
    await creditTestCoins("u1", 10);
    expect(await debitTestCoins("u1", 25)).toEqual({
      ok: false,
      balance: 10,
      reason: "insufficient",
    });
    expect(await getTestCoinsBalance("u1")).toBe(10);
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
    expect(await getTestCoinsBalance("u1")).toBe(40);
  });

  it("keeps balances separate per user", async () => {
    await creditTestCoins("u1", 50);
    await creditTestCoins("u2", 700);
    await debitTestCoins("u1", 50);
    expect(await getTestCoinsBalance("u1")).toBe(0);
    expect(await getTestCoinsBalance("u2")).toBe(700);
  });
});
