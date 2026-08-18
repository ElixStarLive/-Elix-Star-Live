/** @vitest-environment jsdom */

/**
 * The withdrawal control is display + request only: the server owns the balance
 * and the settlement. What the page does own is the idempotency key, and it has
 * to get that right — one key per attempt so a timed-out request settles once,
 * but a fresh key once the creator changes the amount, because the server
 * refuses a key reused for different terms.
 */

import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const api = vi.hoisted(() => ({
  withdraw: vi.fn(),
  balance: vi.fn(),
  methods: vi.fn(),
  withdrawals: vi.fn(),
  ledger: vi.fn(),
  account: vi.fn(),
  onboard: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: "/creator/payout", state: null, search: "" }),
}));

vi.mock("../lib/toast", () => ({ showToast: api.toast }));

vi.mock("../components/SettingsOptionSheet", () => ({
  default: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("../lib/platform", () => ({
  openStripeHostedUrl: vi.fn(),
  platform: { isNative: false },
}));

vi.mock("../features/creator/creatorPayoutApi", () => ({
  apiCreatorBalance: api.balance,
  apiCreatorPayoutMethods: api.methods,
  apiCreatorSavePayoutMethod: vi.fn(),
  apiCreatorWithdrawGbp: api.withdraw,
  apiCreatorGbpWithdrawals: api.withdrawals,
  apiCreatorLedger: api.ledger,
  apiCreatorPayoutAccount: api.account,
  apiCreatorPayoutOnboard: api.onboard,
}));

const { default: CreatorPayout } = await import("./CreatorPayout");

let container: HTMLDivElement;
let root: Root;

/** The key the page sent on the nth withdrawal attempt. */
function keyForCall(index: number): string {
  return String(api.withdraw.mock.calls[index]?.[0]?.idempotency_key ?? "");
}

function amountForCall(index: number): number {
  return Number(api.withdraw.mock.calls[index]?.[0]?.amount_pence);
}

async function typeAmount(pounds: string) {
  const input = Array.from(container.querySelectorAll("input")).find(
    (el) => el.getAttribute("inputMode") === "decimal" || el.inputMode === "decimal",
  );
  if (!input) throw new Error("withdraw amount input not found");
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(input, pounds);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function clickWithdraw() {
  const button = Array.from(container.querySelectorAll("button")).find((el) =>
    /Request GBP withdrawal|Submitting/.test(el.textContent ?? ""),
  );
  if (!button) throw new Error("withdraw button not found");
  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("CreatorPayout — GBP withdrawal request", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    api.balance.mockResolvedValue({
      data: {
        pending_coins: 0,
        available_coins: 0,
        locked_coins: 0,
        total_earned: 0,
        total_withdrawn: 0,
        gbp: {
          pending_pence: 0,
          available_pence: 5_000,
          withdrawn_pence: 0,
          reversed_pence: 0,
          held_pence: 0,
        },
      },
      error: null,
    });
    api.methods.mockResolvedValue({ methods: [{ id: "m1", type: "bank" }], error: null });
    api.withdrawals.mockResolvedValue({ withdrawals: [], error: null });
    api.ledger.mockResolvedValue({ ledger: [], error: null });
    api.account.mockResolvedValue({ data: { status: "verified" }, error: null });
    api.withdraw.mockResolvedValue({ data: { ok: true }, error: null });

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(<CreatorPayout />);
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("retrying the same amount after a failure reuses the idempotency key", async () => {
    api.withdraw.mockResolvedValueOnce({ data: null, error: "network timeout" });
    await typeAmount("20.00");
    await clickWithdraw();
    await clickWithdraw();

    expect(api.withdraw).toHaveBeenCalledTimes(2);
    expect(amountForCall(0)).toBe(2_000);
    expect(amountForCall(1)).toBe(2_000);
    // The same request retrying, so the server must be able to settle it once.
    expect(keyForCall(1)).toBe(keyForCall(0));
    expect(keyForCall(0)).not.toBe("");
  });

  it("a corrected amount after a refusal gets a fresh idempotency key", async () => {
    api.withdraw.mockResolvedValueOnce({ data: null, error: "insufficient_available" });
    await typeAmount("80.00");
    await clickWithdraw();

    // The creator lowers the amount and tries again. This is a different
    // request; reusing the first key would be refused as a conflict forever.
    await typeAmount("30.00");
    await clickWithdraw();

    expect(api.withdraw).toHaveBeenCalledTimes(2);
    expect(amountForCall(0)).toBe(8_000);
    expect(amountForCall(1)).toBe(3_000);
    expect(keyForCall(1)).not.toBe(keyForCall(0));
  });

  it("a new withdrawal after a successful one uses a new key", async () => {
    await typeAmount("10.00");
    await clickWithdraw();
    await typeAmount("10.00");
    await clickWithdraw();

    expect(api.withdraw).toHaveBeenCalledTimes(2);
    expect(keyForCall(1)).not.toBe(keyForCall(0));
  });

  it("refuses to send an amount the server would reject", async () => {
    await typeAmount("0");
    await clickWithdraw();
    expect(api.withdraw).not.toHaveBeenCalled();
    expect(api.toast).toHaveBeenCalledWith("Enter a valid GBP amount");
  });

  it("never sends a creator id or a balance the server should resolve itself", async () => {
    await typeAmount("15.00");
    await clickWithdraw();
    const body = api.withdraw.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["amount_pence", "idempotency_key"]);
  });
});
