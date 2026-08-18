import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Stripe Connect payout contract.
 *
 * Real money leaves the platform here, and the dangerous answers are the ones
 * that look like ordinary failures. A transfer create that times out has an
 * unknown outcome: Stripe may already have moved the money, so calling that a
 * failure and handing the reserved pence back is how one withdrawal gets paid
 * twice. A withdrawal that already gave its money back must never be submitted
 * again. And a stale event must not turn a reversed payout back into a paid one.
 */

const applyStatus = vi.fn();
const adminSetStatus = vi.fn();

const transfersCreate = vi.fn();
const transfersList = vi.fn();
const v2AccountsRetrieve = vi.fn();
const v1AccountsRetrieve = vi.fn();

const poolQuery = vi.fn();
const clientQuery = vi.fn();
const clientRelease = vi.fn();
let poolAvailable = true;

vi.mock("stripe", () => {
  class FakeStripe {
    transfers = {
      create: (...args: unknown[]) => transfersCreate(...args),
      list: (...args: unknown[]) => transfersList(...args),
    };
    accounts = { retrieve: (...args: unknown[]) => v1AccountsRetrieve(...args) };
    v2 = {
      core: {
        accounts: { retrieve: (...args: unknown[]) => v2AccountsRetrieve(...args) },
        accountLinks: { create: vi.fn(async () => ({ url: "https://connect.stripe.test/x" })) },
      },
    };
  }
  return { default: FakeStripe };
});

vi.mock("../postgres", () => ({
  getPool: () =>
    poolAvailable
      ? {
          query: (...args: unknown[]) => poolQuery(...args),
          connect: async () => ({
            query: (...args: unknown[]) => clientQuery(...args),
            release: () => clientRelease(),
          }),
        }
      : null,
}));

vi.mock("./gbpWithdrawals", () => ({
  applyGbpWithdrawalStatusOnClient: (...args: unknown[]) => applyStatus(...args),
  adminSetGbpWithdrawalStatus: (...args: unknown[]) => adminSetStatus(...args),
}));

const WITHDRAWAL_ID = "wdgbp_1";
const CREATOR_ID = "creator-a";
const ACCOUNT_ID = "acct_live_1";

type WithdrawalRow = Record<string, unknown>;

let withdrawal: WithdrawalRow | null;
let payoutAccount: Record<string, unknown> | null;

function rows(data: unknown[]) {
  return { rows: data, rowCount: data.length };
}

/** Answers the exact statements the provider issues, so nothing is faked away. */
function routeSql(rawSql: string, params?: unknown[]) {
  const sql = rawSql.replace(/\s+/g, " ");
  if (sql.includes("FROM elix_creator_withdrawals_gbp WHERE id")) {
    return rows(withdrawal ? [withdrawal] : []);
  }
  if (sql.includes("FROM elix_creator_payout_accounts") && sql.includes("provider_account_id = $1")) {
    return rows(
      payoutAccount && String(params?.[0]) === ACCOUNT_ID
        ? [{ creator_user_id: CREATOR_ID }]
        : [],
    );
  }
  if (sql.includes("FROM elix_creator_payout_accounts")) {
    return rows(payoutAccount ? [payoutAccount] : []);
  }
  if (sql.trimStart().startsWith("UPDATE")) return rows([]);
  if (sql.trimStart().startsWith("INSERT")) return rows([{ id: 1 }]);
  return rows([]);
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.STRIPE_SECRET_KEY = "sk_test_behaviour";
  delete process.env.STRIPE_SECRET_KEY_TEST;
  delete process.env.STRIPE_SECRET_KEY_LIVE;
  delete process.env.ELIX_STRIPE_CONNECT_MODE;
  poolAvailable = true;
  withdrawal = {
    id: WITHDRAWAL_ID,
    status: "pending",
    creator_user_id: CREATOR_ID,
    amount_pence: 5_000,
    currency: "GBP",
    payout_provider_ref: null,
  };
  payoutAccount = {
    id: "pac_1",
    creator_user_id: CREATOR_ID,
    provider_account_id: ACCOUNT_ID,
    payouts_enabled: true,
    verification_status: "verified",
  };
  poolQuery.mockImplementation(async (sql: string, params?: unknown[]) => routeSql(sql, params));
  clientQuery.mockImplementation(async (sql: string, params?: unknown[]) =>
    routeSql(String(sql), params),
  );
  applyStatus.mockResolvedValue({ ok: true });
  adminSetStatus.mockResolvedValue({ ok: true });
  transfersList.mockResolvedValue({ data: [] });
  transfersCreate.mockResolvedValue({
    id: "tr_new",
    amount: 5_000,
    currency: "gbp",
    reversed: false,
    amount_reversed: 0,
  });
  v2AccountsRetrieve.mockResolvedValue({
    configuration: {
      recipient: { capabilities: { stripe_balance: { stripe_transfers: { status: "active" } } } },
      merchant: { capabilities: { card_payments: { status: "active" } } },
    },
    requirements: { entries: [] },
  });
  v1AccountsRetrieve.mockResolvedValue({
    payouts_enabled: true,
    details_submitted: true,
    charges_enabled: true,
    requirements: {},
  });
});

async function provider() {
  return await import("./payoutProvider");
}

function stripeError(type: string, message = "boom"): Error {
  const err = new Error(message) as Error & { type: string };
  err.type = type;
  return err;
}

describe("Stripe failure classification", () => {
  it("treats a refusal as definitive and everything else as unknown", async () => {
    const { classifyStripeFailure } = await provider();
    expect(classifyStripeFailure(stripeError("StripeInvalidRequestError"))).toBe("refused");
    expect(classifyStripeFailure(stripeError("StripeAuthenticationError"))).toBe("refused");
    expect(classifyStripeFailure(stripeError("StripePermissionError"))).toBe("refused");
    expect(classifyStripeFailure(stripeError("StripeConnectionError"))).toBe("unknown");
    expect(classifyStripeFailure(stripeError("StripeAPIError"))).toBe("unknown");
    expect(classifyStripeFailure(stripeError("StripeRateLimitError"))).toBe("unknown");
    expect(classifyStripeFailure(stripeError("StripeIdempotencyError"))).toBe("unknown");
    // A socket hang-up with no Stripe type is still an unknown outcome.
    expect(classifyStripeFailure(new Error("socket hang up"))).toBe("unknown");
    expect(classifyStripeFailure(undefined)).toBe("unknown");
  });
});

describe("submitWithdrawalToProvider", () => {
  it("keeps the money held when the transfer outcome is unknown", async () => {
    transfersCreate.mockRejectedValue(stripeError("StripeConnectionError", "timeout"));
    const { submitWithdrawalToProvider } = await provider();

    const r = await submitWithdrawalToProvider({ withdrawalId: WITHDRAWAL_ID });

    expect(r).toMatchObject({ ok: false, error: "provider_outcome_unknown", retryable: true });
    // Marking this failed would release the hold while a real transfer may be
    // in flight, and the same pence could then be withdrawn a second time.
    const failedCalls = adminSetStatus.mock.calls.filter(
      (c) => (c[0] as { toStatus?: string }).toStatus === "failed",
    );
    expect(failedCalls).toHaveLength(0);
    const unknownWrite = poolQuery.mock.calls.find((c) =>
      String(c[0]).includes("provider_status = 'unknown'"),
    );
    expect(unknownWrite).toBeTruthy();
  });

  it("keeps the money held for an unrecognised transport error too", async () => {
    transfersCreate.mockRejectedValue(new Error("ETIMEDOUT"));
    const { submitWithdrawalToProvider } = await provider();
    const r = await submitWithdrawalToProvider({ withdrawalId: WITHDRAWAL_ID });
    expect(r).toMatchObject({ ok: false, error: "provider_outcome_unknown" });
    expect(
      adminSetStatus.mock.calls.filter(
        (c) => (c[0] as { toStatus?: string }).toStatus === "failed",
      ),
    ).toHaveLength(0);
  });

  it("releases the money when Stripe definitely refused the transfer", async () => {
    transfersCreate.mockRejectedValue(
      stripeError("StripeInvalidRequestError", "Insufficient funds in Stripe balance"),
    );
    const { submitWithdrawalToProvider } = await provider();

    const r = await submitWithdrawalToProvider({ withdrawalId: WITHDRAWAL_ID });

    expect(r.ok).toBe(false);
    expect(r.retryable).toBeUndefined();
    expect(adminSetStatus).toHaveBeenCalledWith(
      expect.objectContaining({ withdrawalId: WITHDRAWAL_ID, toStatus: "failed" }),
    );
  });

  it("adopts a transfer an earlier attempt already created", async () => {
    transfersList.mockResolvedValue({
      data: [{ id: "tr_existing", amount: 5_000, currency: "gbp", reversed: false }],
    });
    const { submitWithdrawalToProvider } = await provider();

    const r = await submitWithdrawalToProvider({ withdrawalId: WITHDRAWAL_ID });

    expect(transfersList).toHaveBeenCalledWith(
      expect.objectContaining({ transfer_group: WITHDRAWAL_ID }),
    );
    // Creating a second transfer here would pay the creator twice.
    expect(transfersCreate).not.toHaveBeenCalled();
    expect(r).toMatchObject({ ok: true, providerRef: "tr_existing" });
  });

  it("does not create a transfer when it cannot check for an existing one", async () => {
    transfersList.mockRejectedValue(stripeError("StripeAPIError"));
    const { submitWithdrawalToProvider } = await provider();

    const r = await submitWithdrawalToProvider({ withdrawalId: WITHDRAWAL_ID });

    expect(r).toMatchObject({ ok: false, error: "provider_lookup_failed", retryable: true });
    expect(transfersCreate).not.toHaveBeenCalled();
  });

  it("does not pay a withdrawal whose money was already given back", async () => {
    for (const status of ["cancelled", "rejected", "failed"]) {
      vi.clearAllMocks();
      transfersList.mockResolvedValue({ data: [] });
      poolQuery.mockImplementation(async (sql: string, params?: unknown[]) =>
        routeSql(sql, params),
      );
      withdrawal = { ...(withdrawal as WithdrawalRow), status };
      const { submitWithdrawalToProvider } = await provider();

      const r = await submitWithdrawalToProvider({ withdrawalId: WITHDRAWAL_ID });

      expect(r).toMatchObject({ ok: false, error: "withdrawal_not_payable" });
      expect(transfersCreate).not.toHaveBeenCalled();
      expect(adminSetStatus).not.toHaveBeenCalled();
    }
  });

  it("resumes a withdrawal left processing with no provider reference", async () => {
    withdrawal = { ...(withdrawal as WithdrawalRow), status: "processing" };
    const { submitWithdrawalToProvider } = await provider();

    const r = await submitWithdrawalToProvider({ withdrawalId: WITHDRAWAL_ID });

    expect(transfersList).toHaveBeenCalled();
    expect(r).toMatchObject({ ok: true, providerRef: "tr_new" });
  });

  it("asks Stripe whether payouts are enabled instead of trusting the cached flag", async () => {
    payoutAccount = { ...(payoutAccount as Record<string, unknown>), payouts_enabled: true };
    // Cache says enabled; Stripe says the capability is inactive now.
    v2AccountsRetrieve.mockResolvedValue({
      configuration: {
        recipient: {
          capabilities: { stripe_balance: { stripe_transfers: { status: "inactive" } } },
        },
      },
      requirements: { entries: [{ id: "identity" }], disabled_reason: "requirements.past_due" },
    });
    const { submitWithdrawalToProvider } = await provider();

    const r = await submitWithdrawalToProvider({ withdrawalId: WITHDRAWAL_ID });

    expect(r).toMatchObject({ ok: false, error: "payout_account_not_ready" });
    expect(transfersCreate).not.toHaveBeenCalled();
  });

  it("refuses to transfer when the Connect account cannot be checked", async () => {
    v2AccountsRetrieve.mockRejectedValue(stripeError("StripeAPIError"));
    v1AccountsRetrieve.mockRejectedValue(stripeError("StripeAPIError"));
    const { submitWithdrawalToProvider } = await provider();

    const r = await submitWithdrawalToProvider({ withdrawalId: WITHDRAWAL_ID });

    expect(r).toMatchObject({ ok: false, error: "payout_account_unverifiable", retryable: true });
    expect(transfersCreate).not.toHaveBeenCalled();
  });

  it("refuses when the creator has no payout account at all", async () => {
    payoutAccount = null;
    const { submitWithdrawalToProvider } = await provider();
    const r = await submitWithdrawalToProvider({ withdrawalId: WITHDRAWAL_ID });
    expect(r).toMatchObject({ ok: false, error: "payout_account_not_ready" });
    expect(transfersCreate).not.toHaveBeenCalled();
  });

  it("does not call Stripe when the withdrawal cannot be claimed for processing", async () => {
    adminSetStatus.mockResolvedValue({ ok: false, error: "invalid_transition" });
    const { submitWithdrawalToProvider } = await provider();

    const r = await submitWithdrawalToProvider({ withdrawalId: WITHDRAWAL_ID });

    expect(r).toMatchObject({ ok: false, error: "invalid_transition" });
    expect(transfersCreate).not.toHaveBeenCalled();
  });

  it("sends the creator's own account, amount and currency with an idempotency key", async () => {
    const { submitWithdrawalToProvider } = await provider();

    const r = await submitWithdrawalToProvider({ withdrawalId: WITHDRAWAL_ID });

    expect(transfersCreate).toHaveBeenCalledWith(
      {
        amount: 5_000,
        currency: "gbp",
        destination: ACCOUNT_ID,
        transfer_group: WITHDRAWAL_ID,
        metadata: {
          elix_withdrawal_id: WITHDRAWAL_ID,
          elix_creator_user_id: CREATOR_ID,
        },
      },
      { idempotencyKey: `wdgbp_xfer_${WITHDRAWAL_ID}` },
    );
    expect(r).toMatchObject({ ok: true, providerRef: "tr_new" });
    expect(applyStatus).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ toStatus: "paid", payoutProviderRef: "tr_new" }),
    );
  });

  it("never reports a reversed transfer as a completed payout", async () => {
    transfersCreate.mockResolvedValue({
      id: "tr_rev",
      amount: 5_000,
      currency: "gbp",
      reversed: true,
      amount_reversed: 5_000,
    });
    const { submitWithdrawalToProvider } = await provider();

    const r = await submitWithdrawalToProvider({ withdrawalId: WITHDRAWAL_ID });

    expect(r).toMatchObject({ ok: false, error: "transfer_reversed" });
    expect(adminSetStatus).toHaveBeenCalledWith(
      expect.objectContaining({ toStatus: "failed", failureReason: "transfer_reversed" }),
    );
    expect(applyStatus).not.toHaveBeenCalled();
  });

  it("does not report paid when the settlement write did not land", async () => {
    applyStatus.mockResolvedValue({ ok: false, error: "database_error" });
    const { submitWithdrawalToProvider } = await provider();

    const r = await submitWithdrawalToProvider({ withdrawalId: WITHDRAWAL_ID });

    expect(r.ok).toBe(false);
    expect(r.retryable).toBe(true);
    expect(r.providerRef).toBe("tr_new");
  });

  it("returns the stored reference for an already paid withdrawal without calling Stripe", async () => {
    withdrawal = {
      ...(withdrawal as WithdrawalRow),
      status: "paid",
      payout_provider_ref: "tr_done",
    };
    const { submitWithdrawalToProvider } = await provider();

    const r = await submitWithdrawalToProvider({ withdrawalId: WITHDRAWAL_ID });

    expect(r).toMatchObject({ ok: true, providerRef: "tr_done" });
    expect(transfersCreate).not.toHaveBeenCalled();
    expect(transfersList).not.toHaveBeenCalled();
  });
});

describe("Stripe Connect payout webhook", () => {
  const transferEvent = (
    type: string,
    overrides: Record<string, unknown> = {},
  ) =>
    ({
      id: `evt_${type}`,
      type,
      data: {
        object: {
          id: "tr_hook",
          amount: 5_000,
          reversed: false,
          metadata: { elix_withdrawal_id: WITHDRAWAL_ID },
          ...overrides,
        },
      },
    }) as unknown as import("stripe").Stripe.Event;

  it("records a reversal durably and applies it once", async () => {
    const { handleStripeConnectPayoutWebhook } = await provider();

    const r = await handleStripeConnectPayoutWebhook(transferEvent("transfer.reversed"));

    expect(r.ok).toBe(true);
    const eventWrite = clientQuery.mock.calls.find((c) =>
      String(c[0]).includes("elix_payout_provider_events"),
    );
    expect(eventWrite).toBeTruthy();
    expect(String(eventWrite?.[0])).toContain("ON CONFLICT (provider, event_id) DO NOTHING");
    expect(applyStatus).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ toStatus: "failed", failureReason: "transfer_reversed" }),
    );
    expect(clientQuery).toHaveBeenCalledWith("COMMIT");
  });

  it("acknowledges a stale event that cannot legally change the state", async () => {
    applyStatus.mockResolvedValue({ ok: false, error: "invalid_transition" });
    const { handleStripeConnectPayoutWebhook } = await provider();

    const r = await handleStripeConnectPayoutWebhook(transferEvent("transfer.created"));

    // Asking Stripe to redeliver forever would never make this transition legal.
    expect(r.ok).toBe(true);
    expect(clientQuery).toHaveBeenCalledWith("COMMIT");
  });

  it("acknowledges an event for a withdrawal it does not hold", async () => {
    applyStatus.mockResolvedValue({ ok: false, error: "not_found" });
    const { handleStripeConnectPayoutWebhook } = await provider();

    const r = await handleStripeConnectPayoutWebhook(transferEvent("transfer.created"));

    expect(r.ok).toBe(true);
  });

  it("asks Stripe to redeliver when the database write failed", async () => {
    applyStatus.mockResolvedValue({ ok: false, error: "database_error" });
    const { handleStripeConnectPayoutWebhook } = await provider();

    const r = await handleStripeConnectPayoutWebhook(transferEvent("transfer.created"));

    expect(r.ok).toBe(false);
    expect(clientQuery).toHaveBeenCalledWith("ROLLBACK");
  });

  it("asks Stripe to redeliver a reversal whose write failed", async () => {
    applyStatus.mockResolvedValue({ ok: false, error: "database_error" });
    const { handleStripeConnectPayoutWebhook } = await provider();

    const r = await handleStripeConnectPayoutWebhook(transferEvent("transfer.reversed"));

    expect(r.ok).toBe(false);
    expect(clientQuery).toHaveBeenCalledWith("ROLLBACK");
  });

  it("asks Stripe to redeliver when the database is unavailable", async () => {
    poolAvailable = false;
    const { handleStripeConnectPayoutWebhook } = await provider();
    const r = await handleStripeConnectPayoutWebhook(transferEvent("transfer.created"));
    expect(r.ok).toBe(false);
  });

  it("ignores a transfer that is not one of ours", async () => {
    const { handleStripeConnectPayoutWebhook } = await provider();
    const r = await handleStripeConnectPayoutWebhook(
      transferEvent("transfer.created", { metadata: {} }),
    );
    expect(r.ok).toBe(true);
    expect(applyStatus).not.toHaveBeenCalled();
  });

  it("treats a transfer already reversed on arrival as a failure, not a payment", async () => {
    const { handleStripeConnectPayoutWebhook } = await provider();
    await handleStripeConnectPayoutWebhook(
      transferEvent("transfer.updated", { reversed: true }),
    );
    expect(applyStatus).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ toStatus: "failed" }),
    );
  });

  const accountEvent = (id: string, metadata: Record<string, string> = {}) =>
    ({
      id: "evt_acct",
      type: "account.updated",
      data: { object: { id, metadata } },
    }) as unknown as import("stripe").Stripe.Event;

  it("takes the creator from our own records, not from the event metadata", async () => {
    const { handleStripeConnectPayoutWebhook } = await provider();

    const r = await handleStripeConnectPayoutWebhook(
      accountEvent(ACCOUNT_ID, { elix_creator_user_id: "someone-else" }),
    );

    expect(r.ok).toBe(true);
    const updated = poolQuery.mock.calls.find((c) =>
      String(c[0]).includes("UPDATE elix_creator_payout_accounts"),
    );
    expect(String(updated?.[1]?.[0])).toBe(CREATOR_ID);
  });

  it("acknowledges an account it does not hold without writing anything", async () => {
    const { handleStripeConnectPayoutWebhook } = await provider();
    const r = await handleStripeConnectPayoutWebhook(accountEvent("acct_unknown"));
    expect(r.ok).toBe(true);
    expect(
      poolQuery.mock.calls.some((c) => String(c[0]).includes("UPDATE elix_creator_payout_accounts")),
    ).toBe(false);
  });

  it("asks Stripe to redeliver a capability change it failed to store", async () => {
    v2AccountsRetrieve.mockRejectedValue(stripeError("StripeAPIError"));
    v1AccountsRetrieve.mockRejectedValue(stripeError("StripeAPIError"));
    const { handleStripeConnectPayoutWebhook } = await provider();

    const r = await handleStripeConnectPayoutWebhook(accountEvent(ACCOUNT_ID));

    // payouts_enabled gates every payout. Acknowledging a change we did not
    // store would leave the gate open on stale data.
    expect(r.ok).toBe(false);
  });
});

describe("production must not pay with a test-mode key", () => {
  it("holds the money instead of creating a test-mode transfer in production", async () => {
    const previousEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    process.env.STRIPE_SECRET_KEY = "sk_test_behaviour";
    try {
      const { submitWithdrawalToProvider } = await provider();
      const r = await submitWithdrawalToProvider({ withdrawalId: WITHDRAWAL_ID });

      // A test transfer succeeds and pays nobody — that would consume the
      // creator's balance for money that never left.
      expect(r).toMatchObject({
        ok: false,
        error: "provider_test_mode_in_production",
        retryable: true,
      });
      expect(transfersCreate).not.toHaveBeenCalled();
      expect(adminSetStatus).not.toHaveBeenCalled();
    } finally {
      process.env.NODE_ENV = previousEnv;
    }
  });

  it("pays normally in production with a live key", async () => {
    const previousEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    process.env.STRIPE_SECRET_KEY = "sk_live_behaviour";
    try {
      const { submitWithdrawalToProvider } = await provider();
      const r = await submitWithdrawalToProvider({ withdrawalId: WITHDRAWAL_ID });
      expect(r.ok).toBe(true);
      expect(transfersCreate).toHaveBeenCalled();
    } finally {
      process.env.NODE_ENV = previousEnv;
      process.env.STRIPE_SECRET_KEY = "sk_test_behaviour";
    }
  });
});

describe("manual offline mark-paid", () => {
  it("refuses a withdrawal Stripe already took", async () => {
    withdrawal = {
      ...(withdrawal as WithdrawalRow),
      status: "processing",
      payment_rail: "stripe_connect",
      payout_provider_ref: "tr_in_flight",
    };
    const { markPaidManualOffline } = await provider();

    const r = await markPaidManualOffline({
      withdrawalId: WITHDRAWAL_ID,
      adminUserId: "admin-1",
      note: "paid by bank transfer",
    });

    // That transfer may still settle at Stripe; paying it offline too pays twice.
    expect(r).toMatchObject({ ok: false, error: "already_submitted_to_provider" });
    expect(applyStatus).not.toHaveBeenCalled();
    expect(clientQuery).toHaveBeenCalledWith("ROLLBACK");
  });

  it("marks paid and flags the exception in one transaction", async () => {
    withdrawal = { ...(withdrawal as WithdrawalRow), status: "approved", payment_rail: null };
    const { markPaidManualOffline } = await provider();

    const r = await markPaidManualOffline({
      withdrawalId: WITHDRAWAL_ID,
      adminUserId: "admin-1",
      note: "bank transfer ref 8891",
      externalReference: "bt_8891",
    });

    expect(r.ok).toBe(true);
    expect(applyStatus).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        toStatus: "paid",
        adminUserId: "admin-1",
        payoutProviderRef: "bt_8891",
        note: expect.stringContaining("MANUAL_OFFLINE_EXCEPTION"),
      }),
    );
    const flag = clientQuery.mock.calls.find((c) =>
      String(c[0]).includes("manual_exception = TRUE"),
    );
    expect(flag).toBeTruthy();
    // The flag must not be able to land without the payment, or vice versa.
    const order = clientQuery.mock.calls.map((c) => String(c[0]));
    expect(order.indexOf("COMMIT")).toBeGreaterThan(
      order.findIndex((sql) => sql.includes("manual_exception = TRUE")),
    );
    expect(clientQuery).not.toHaveBeenCalledWith("ROLLBACK");
  });

  it("requires a real audit note", async () => {
    const { markPaidManualOffline } = await provider();
    const r = await markPaidManualOffline({
      withdrawalId: WITHDRAWAL_ID,
      adminUserId: "admin-1",
      note: "ok",
    });
    expect(r).toMatchObject({ ok: false, error: "manual_note_required" });
    expect(applyStatus).not.toHaveBeenCalled();
  });

  it("does not mark paid when the transition is refused", async () => {
    withdrawal = { ...(withdrawal as WithdrawalRow), status: "cancelled", payment_rail: null };
    applyStatus.mockResolvedValue({ ok: false, error: "invalid_transition" });
    const { markPaidManualOffline } = await provider();

    const r = await markPaidManualOffline({
      withdrawalId: WITHDRAWAL_ID,
      adminUserId: "admin-1",
      note: "tried to pay a cancelled row",
    });

    expect(r).toMatchObject({ ok: false, error: "invalid_transition" });
    expect(clientQuery).toHaveBeenCalledWith("ROLLBACK");
    expect(
      clientQuery.mock.calls.some((c) => String(c[0]).includes("manual_exception = TRUE")),
    ).toBe(false);
  });
});
