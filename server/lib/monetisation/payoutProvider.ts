/**
 * Stripe Connect Express payout rail for creator GBP withdrawals (sandbox-safe).
 *
 * Rules:
 * - `paid` only after verified provider confirmation (API success + webhook when available).
 * - Manual/offline mark-paid must set payment_rail=manual_offline + audited note.
 * - Never invent success without Stripe response / webhook.
 * - Idempotency key = withdrawal id.
 * - Never log secret key material.
 * - Sandbox proof: set ELIX_STRIPE_CONNECT_MODE=test + STRIPE_SECRET_KEY_TEST=sk_test_…
 * - Production: uses STRIPE_SECRET_KEY (or STRIPE_SECRET_KEY_LIVE); does not overwrite live.
 */
import Stripe from "stripe";
import { randomUUID } from "crypto";
import { getPool } from "../postgres";
import { logger } from "../logger";
import { adminSetGbpWithdrawalStatus, applyGbpWithdrawalStatusOnClient } from "./gbpWithdrawals";

export type StripeKeyMode = "test" | "live" | "none";
export type StripeKeySource =
  | "STRIPE_SECRET_KEY_TEST"
  | "STRIPE_SECRET_KEY_LIVE"
  | "STRIPE_SECRET_KEY"
  | "none";

/**
 * Resolve Stripe secret for Connect without logging values.
 * - test mode forced when ELIX_STRIPE_CONNECT_MODE=test (evidence / sandbox).
 * - otherwise prefer LIVE dedicated var, then primary STRIPE_SECRET_KEY.
 * - never prefers TEST over LIVE in normal production operation.
 */
export function resolveStripeSecretKey(opts?: {
  forceTest?: boolean;
}): {
  key: string;
  mode: StripeKeyMode;
  source: StripeKeySource;
} {
  const forceTest =
    opts?.forceTest === true ||
    String(process.env.ELIX_STRIPE_CONNECT_MODE || "").trim().toLowerCase() === "test";

  const testKey = (process.env.STRIPE_SECRET_KEY_TEST || "").trim();
  const liveDedicated = (process.env.STRIPE_SECRET_KEY_LIVE || "").trim();
  const primary = (process.env.STRIPE_SECRET_KEY || "").trim();

  if (forceTest) {
    if (testKey.startsWith("sk_test_")) {
      return { key: testKey, mode: "test", source: "STRIPE_SECRET_KEY_TEST" };
    }
    if (primary.startsWith("sk_test_")) {
      return { key: primary, mode: "test", source: "STRIPE_SECRET_KEY" };
    }
    return { key: "", mode: "none", source: "none" };
  }

  if (liveDedicated.startsWith("sk_live_") || liveDedicated.startsWith("sk_test_")) {
    return {
      key: liveDedicated,
      mode: liveDedicated.startsWith("sk_test_") ? "test" : "live",
      source: "STRIPE_SECRET_KEY_LIVE",
    };
  }
  if (primary.startsWith("sk_live_") || primary.startsWith("sk_test_")) {
    return {
      key: primary,
      mode: primary.startsWith("sk_test_") ? "test" : "live",
      source: "STRIPE_SECRET_KEY",
    };
  }
  // Staging-only fallback: dedicated test key when no primary/live configured.
  if (testKey.startsWith("sk_test_")) {
    return { key: testKey, mode: "test", source: "STRIPE_SECRET_KEY_TEST" };
  }
  return { key: "", mode: "none", source: "none" };
}

function getStripe(): Stripe | null {
  const resolved = resolveStripeSecretKey();
  if (!resolved.key) {
    const forced =
      String(process.env.ELIX_STRIPE_CONNECT_MODE || "").trim().toLowerCase() === "test";
    if (forced) {
      logger.warn(
        { stripeMode: "none" },
        "Stripe Connect test mode requires STRIPE_SECRET_KEY_TEST=sk_test_… (live key not used)",
      );
    }
    return null;
  }
  return new Stripe(resolved.key, { apiVersion: "2025-01-27.acacia" as Stripe.LatestApiVersion });
}

/** Accounts v2 Connect APIs require a preview Stripe-Version. */
function getStripeAccountsV2(): Stripe | null {
  const resolved = resolveStripeSecretKey();
  if (!resolved.key) return null;
  return new Stripe(resolved.key, {
    apiVersion: "2026-07-29.preview" as Stripe.LatestApiVersion,
  });
}

function payoutAppOrigin(): string {
  const raw = (
    process.env.CLIENT_URL ||
    process.env.VITE_API_URL ||
    "https://www.elixstarlive.co.uk"
  )
    .trim()
    .replace(/\/+$/, "");
  return raw || "https://www.elixstarlive.co.uk";
}

/**
 * v2 connected accounts must use v2 Account Links. v1 accountLinks.create
 * against a v2 account produces a hosted URL that infinite-loads.
 * Account was created with merchant + recipient configs — both must be listed.
 */
async function createConnectOnboardingLink(
  stripeV2: Stripe,
  accountId: string,
): Promise<string> {
  const origin = payoutAppOrigin();
  const link = await stripeV2.v2.core.accountLinks.create({
    account: accountId,
    use_case: {
      type: "account_onboarding",
      account_onboarding: {
        configurations: ["merchant", "recipient"],
        collection_options: { fields: "eventually_due" },
        return_url: `${origin}/creator-payout?payout_return=1`,
        refresh_url: `${origin}/creator-payout?payout_refresh=1`,
      },
    },
  });
  const url = String(link.url || "").trim();
  if (!url.startsWith("https://")) {
    throw new Error("missing_onboarding_url");
  }
  return url;
}

export function isStripeTestMode(): boolean {
  return resolveStripeSecretKey().mode === "test";
}

export async function createOrGetPayoutAccount(creatorUserId: string): Promise<{
  ok: boolean;
  accountId?: string;
  onboardingUrl?: string | null;
  verificationStatus?: string;
  error?: string;
}> {
  const stripeClient = getStripe();
  const stripeV2 = getStripeAccountsV2();
  const pool = getPool();
  if (!stripeClient || !stripeV2 || !pool) return { ok: false, error: "provider_unavailable" };

  const existing = await pool.query(
    `SELECT * FROM elix_creator_payout_accounts WHERE creator_user_id = $1 LIMIT 1`,
    [creatorUserId],
  );
  if (existing.rowCount) {
    const row = existing.rows[0];
    const accountId = String(row.provider_account_id);
    if (row.payouts_enabled) {
      return {
        ok: true,
        accountId,
        onboardingUrl: null,
        verificationStatus: String(row.verification_status),
      };
    }
    try {
      const onboardingUrl = await createConnectOnboardingLink(stripeV2, accountId);
      await pool.query(
        `UPDATE elix_creator_payout_accounts SET onboarding_url = $2, updated_at = NOW() WHERE creator_user_id = $1`,
        [creatorUserId, onboardingUrl],
      );
      return {
        ok: true,
        accountId,
        onboardingUrl,
        verificationStatus: String(row.verification_status),
      };
    } catch (err) {
      logger.warn({ err }, "payout account link refresh failed");
      return { ok: false, error: "provider_error" };
    }
  }

  try {
    // Accounts v2 Express connected account for creator payouts.
    // Live Stripe requires merchant.card_payments whenever recipient
    // stripe_balance.stripe_transfers is requested (GB platform). Creators are
    // still paid via platform transfers; card_payments is the capability Stripe
    // mandates on the connected account record, not a separate checkout path.
    const account = await stripeV2.v2.core.accounts.create({
      contact_email: `creator+${creatorUserId.slice(0, 32)}@elixstarlive.co.uk`,
      display_name: `Elix creator ${creatorUserId.slice(0, 8)}`,
      dashboard: "express",
      identity: { country: "gb" },
      defaults: {
        responsibilities: {
          fees_collector: "application",
          losses_collector: "application",
        },
      },
      configuration: {
        merchant: {
          capabilities: {
            card_payments: { requested: true },
          },
        },
        recipient: {
          capabilities: {
            stripe_balance: {
              stripe_transfers: { requested: true },
            },
          },
        },
      },
      metadata: { elix_creator_user_id: creatorUserId },
      include: [
        "configuration.merchant",
        "configuration.recipient",
        "identity",
        "requirements",
      ],
    });

    const onboardingUrl = await createConnectOnboardingLink(stripeV2, account.id);

    const transfersStatus =
      account.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers
        ?.status ?? null;
    const payoutsEnabled = transfersStatus === "active";

    const id = `pac_${randomUUID()}`;
    await pool.query(
      `INSERT INTO elix_creator_payout_accounts
         (id, creator_user_id, provider, provider_account_id, verification_status,
          details_submitted, charges_enabled, payouts_enabled, onboarding_url)
       VALUES ($1,$2,'stripe_connect',$3,'pending',$4,$5,$6,$7)`,
      [
        id,
        creatorUserId,
        account.id,
        false,
        false,
        payoutsEnabled,
        onboardingUrl,
      ],
    );
    return {
      ok: true,
      accountId: account.id,
      onboardingUrl,
      verificationStatus: "pending",
    };
  } catch (err) {
    logger.error({ err }, "createOrGetPayoutAccount failed");
    return { ok: false, error: "provider_error" };
  }
}

export async function refreshPayoutAccountStatus(creatorUserId: string): Promise<{
  ok: boolean;
  verificationStatus?: string;
  payoutsEnabled?: boolean;
}> {
  const stripeClient = getStripe();
  const stripeV2 = getStripeAccountsV2();
  const pool = getPool();
  if (!stripeClient || !pool) return { ok: false };
  const rowR = await pool.query(
    `SELECT * FROM elix_creator_payout_accounts WHERE creator_user_id = $1 LIMIT 1`,
    [creatorUserId],
  );
  if (!rowR.rowCount) return { ok: false };
  const acctId = String(rowR.rows[0].provider_account_id);
  try {
    // Prefer Accounts v2 capability path; fall back to v1 retrieve for older accounts.
    let payoutsEnabled = false;
    let detailsSubmitted = false;
    let chargesEnabled = false;
    let status = "pending";
    try {
      if (!stripeV2) throw new Error("v2_unavailable");
      const v2 = await stripeV2.v2.core.accounts.retrieve(acctId, {
        include: [
          "configuration.merchant",
          "configuration.recipient",
          "identity",
          "requirements",
        ],
      });
      const transfersStatus =
        v2.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers
          ?.status ?? "";
      payoutsEnabled = transfersStatus === "active";
      chargesEnabled =
        v2.configuration?.merchant?.capabilities?.card_payments?.status === "active";
      detailsSubmitted = !(v2.requirements as { entries?: unknown[] } | undefined)?.entries
        ?.length;
      status = (v2.requirements as { disabled_reason?: string | null } | undefined)
        ?.disabled_reason
        ? "restricted"
        : payoutsEnabled
          ? "verified"
          : "pending";
    } catch {
      const account = await stripeClient.accounts.retrieve(acctId);
      payoutsEnabled = !!account.payouts_enabled;
      detailsSubmitted = !!account.details_submitted;
      chargesEnabled = !!account.charges_enabled;
      status = account.requirements?.disabled_reason
        ? "restricted"
        : payoutsEnabled && detailsSubmitted
          ? "verified"
          : "pending";
    }
    await pool.query(
      `UPDATE elix_creator_payout_accounts SET
         verification_status = $2,
         details_submitted = $3,
         charges_enabled = $4,
         payouts_enabled = $5,
         updated_at = NOW()
       WHERE creator_user_id = $1`,
      [
        creatorUserId,
        status,
        detailsSubmitted,
        chargesEnabled,
        payoutsEnabled,
      ],
    );
    return { ok: true, verificationStatus: status, payoutsEnabled };
  } catch (err) {
    logger.warn({ err }, "refreshPayoutAccountStatus failed");
    return { ok: false };
  }
}

/**
 * Did Stripe definitely refuse this request, or is the outcome unknown?
 *
 * A refusal (bad request, insufficient platform balance, bad credentials) means
 * no transfer exists and the reserved pence can safely go back to the creator.
 * A dropped connection, a 5xx or a throttle means Stripe may already have
 * created the transfer, and treating that as a refusal is how a platform pays
 * the same withdrawal twice. Anything unrecognised is treated as unknown.
 */
export function classifyStripeFailure(err: unknown): "refused" | "unknown" {
  const type = String(
    (err as { type?: unknown; name?: unknown } | null)?.type ??
      (err as { name?: unknown } | null)?.name ??
      "",
  );
  switch (type) {
    case "StripeInvalidRequestError":
    case "StripeCardError":
    case "StripeAuthenticationError":
    case "StripePermissionError":
      return "refused";
    default:
      return "unknown";
  }
}

/**
 * Find a transfer a previous attempt may already have created for this
 * withdrawal. Stripe drops an idempotency key after 24 hours, so replaying the
 * key is not enough to resolve an outcome that stayed unknown longer than that;
 * transfer_group is set to the withdrawal id precisely so it stays findable.
 */
async function findTransferForWithdrawal(
  stripeClient: Stripe,
  withdrawalId: string,
): Promise<
  { ok: true; transfer: Stripe.Transfer | null } | { ok: false }
> {
  try {
    const list = await stripeClient.transfers.list({
      transfer_group: withdrawalId,
      limit: 1,
    });
    return { ok: true, transfer: list.data[0] ?? null };
  } catch (err) {
    logger.error({ err, withdrawalId }, "transfer lookup failed — not creating a second transfer");
    return { ok: false };
  }
}

/**
 * Submit withdrawal to Stripe Connect Transfer.
 * Sets status processing with provider_ref; paid only via confirmPayoutFromProvider / webhook.
 */
export async function submitWithdrawalToProvider(input: {
  withdrawalId: string;
  adminUserId?: string | null;
}): Promise<{ ok: boolean; providerRef?: string; error?: string; retryable?: boolean }> {
  const stripeClient = getStripe();
  const pool = getPool();
  if (!stripeClient || !pool) {
    return { ok: false, error: "provider_unavailable", retryable: true };
  }
  // A test-mode transfer moves no real money, but it returns a transfer object
  // that would mark this withdrawal paid and consume the creator's balance. Hold
  // the money and refuse until the live key is in place.
  if (process.env.NODE_ENV === "production" && isStripeTestMode()) {
    logger.error(
      { withdrawalId: input.withdrawalId, stripeMode: "test" },
      "Stripe payout refused — production is configured with a test-mode Connect key",
    );
    return { ok: false, error: "provider_test_mode_in_production", retryable: true };
  }
  const adminUserId = input.adminUserId || "system:payout_provider";

  const wd = await pool.query(
    `SELECT * FROM elix_creator_withdrawals_gbp WHERE id = $1 LIMIT 1`,
    [input.withdrawalId],
  );
  if (!wd.rowCount) return { ok: false, error: "not_found" };
  const row = wd.rows[0];
  const status = String(row.status);
  if (status === "paid") {
    return { ok: true, providerRef: row.payout_provider_ref || undefined };
  }
  if (row.payout_provider_ref && status === "processing") {
    return { ok: true, providerRef: String(row.payout_provider_ref) };
  }
  if (status !== "pending" && status !== "approved" && status !== "processing") {
    // failed / rejected / cancelled already returned the reserved pence to the
    // creator's available balance. Paying this row now would send money that is
    // no longer reserved, and the creator could withdraw it a second time.
    logger.warn(
      { withdrawalId: input.withdrawalId, status },
      "Stripe submit refused — withdrawal is not payable",
    );
    return { ok: false, error: "withdrawal_not_payable" };
  }

  const amount = Math.floor(Number(row.amount_pence) || 0);
  if (amount <= 0) return { ok: false, error: "invalid_amount" };

  const creatorUserId = String(row.creator_user_id);
  const acct = await pool.query(
    `SELECT id, provider_account_id FROM elix_creator_payout_accounts
      WHERE creator_user_id = $1 LIMIT 1`,
    [creatorUserId],
  );
  if (!acct.rowCount) return { ok: false, error: "payout_account_not_ready" };

  // payouts_enabled in our table is a cache of Stripe's answer and can be hours
  // stale by the time an admin submits. Ask Stripe before moving money, and
  // refuse rather than transfer blind when Stripe cannot be reached.
  const fresh = await refreshPayoutAccountStatus(creatorUserId);
  if (!fresh.ok) {
    return { ok: false, error: "payout_account_unverifiable", retryable: true };
  }
  if (!fresh.payoutsEnabled) {
    return { ok: false, error: "payout_account_not_ready" };
  }

  // Adopt a transfer an earlier attempt already created instead of creating a
  // second one for the same withdrawal.
  const found = await findTransferForWithdrawal(stripeClient, input.withdrawalId);
  if (!found.ok) {
    return { ok: false, error: "provider_lookup_failed", retryable: true };
  }
  if (found.transfer) {
    return await recordTransferOutcome({
      pool,
      withdrawalId: input.withdrawalId,
      transfer: found.transfer,
      payoutAccountRowId: String(acct.rows[0].id),
      adminUserId,
      providerEventId: `xfer_adopt_${found.transfer.id}`,
    });
  }

  const claimed = await adminSetGbpWithdrawalStatus({
    withdrawalId: input.withdrawalId,
    toStatus: "processing",
    adminUserId,
    note: "Submitted to Stripe Connect",
  });
  if (!claimed.ok) {
    return { ok: false, error: claimed.error || "invalid_transition" };
  }

  let transfer: Stripe.Transfer;
  try {
    transfer = await stripeClient.transfers.create(
      {
        amount,
        currency: "gbp",
        destination: String(acct.rows[0].provider_account_id),
        transfer_group: input.withdrawalId,
        metadata: {
          elix_withdrawal_id: input.withdrawalId,
          elix_creator_user_id: creatorUserId,
        },
      },
      { idempotencyKey: `wdgbp_xfer_${input.withdrawalId}` },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (classifyStripeFailure(err) === "unknown") {
      // Stripe may already have created this transfer. Releasing the hold now
      // would let the same pence be withdrawn again alongside a real payout, so
      // the money stays held and this withdrawal stays retryable — the next
      // attempt resolves the outcome from Stripe itself.
      logger.error(
        { err, withdrawalId: input.withdrawalId },
        "Stripe transfer outcome unknown — funds stay held, withdrawal stays retryable",
      );
      await pool.query(
        `UPDATE elix_creator_withdrawals_gbp SET
           provider_status = 'unknown',
           failure_reason = $2
         WHERE id = $1`,
        [input.withdrawalId, msg.slice(0, 500)],
      );
      return { ok: false, error: "provider_outcome_unknown", retryable: true };
    }
    logger.error({ err, withdrawalId: input.withdrawalId }, "Stripe refused the transfer");
    await adminSetGbpWithdrawalStatus({
      withdrawalId: input.withdrawalId,
      toStatus: "failed",
      adminUserId,
      note: "Stripe transfer failed",
      failureReason: msg.slice(0, 500),
    });
    return { ok: false, error: msg };
  }

  return await recordTransferOutcome({
    pool,
    withdrawalId: input.withdrawalId,
    transfer,
    payoutAccountRowId: String(acct.rows[0].id),
    adminUserId,
    providerEventId: `xfer_create_${transfer.id}`,
  });
}

/**
 * Persist the Stripe transfer against the withdrawal and settle its status.
 * A reversed transfer is not a payout, so it must not land as paid.
 */
async function recordTransferOutcome(args: {
  pool: NonNullable<ReturnType<typeof getPool>>;
  withdrawalId: string;
  transfer: Stripe.Transfer;
  payoutAccountRowId: string;
  adminUserId: string;
  providerEventId: string;
}): Promise<{ ok: boolean; providerRef?: string; error?: string; retryable?: boolean }> {
  const { transfer, withdrawalId } = args;
  const reversed = transfer.reversed === true || (transfer.amount_reversed ?? 0) > 0;
  try {
    await args.pool.query(
      `UPDATE elix_creator_withdrawals_gbp SET
         payout_provider_ref = $2,
         payment_rail = 'stripe_connect',
         provider_status = $3,
         payout_account_id = $4,
         manual_exception = FALSE
       WHERE id = $1`,
      [withdrawalId, transfer.id, reversed ? "reversed" : "pending", args.payoutAccountRowId],
    );
  } catch (err) {
    logger.error({ err, withdrawalId }, "storing transfer reference failed");
    return { ok: false, error: "database_error", retryable: true };
  }

  if (reversed) {
    const failed = await adminSetGbpWithdrawalStatus({
      withdrawalId,
      toStatus: "failed",
      adminUserId: args.adminUserId,
      note: "Stripe transfer reversed",
      failureReason: "transfer_reversed",
      payoutProviderRef: transfer.id,
    });
    return failed.ok
      ? { ok: false, error: "transfer_reversed" }
      : { ok: false, error: failed.error || "database_error", retryable: true };
  }

  // In Connect, a created Transfer is the platform's proof the money left for
  // the connected account. The webhook confirms the same thing idempotently.
  const confirmed = await confirmPayoutFromProvider({
    withdrawalId,
    providerRef: transfer.id,
    providerEventId: args.providerEventId,
    eventType: "transfer.created",
    feePence: 0,
    payload: { id: transfer.id, amount: transfer.amount, currency: transfer.currency },
  });
  if (!confirmed.ok) {
    // The transfer is real but the settlement write did not land. Never report
    // this as a completed payout.
    return {
      ok: false,
      error: confirmed.error || "settlement_failed",
      retryable: confirmed.retryable !== false,
      providerRef: transfer.id,
    };
  }
  return { ok: true, providerRef: transfer.id };
}

/**
 * Errors a provider event can hit that no amount of redelivery will fix. These
 * are recorded and acknowledged; anything else is a retry.
 */
function isPermanentSettlementError(error?: string): boolean {
  return error === "not_found" || error === "invalid_transition" || error === "duplicate_provider_ref";
}

export async function confirmPayoutFromProvider(input: {
  withdrawalId: string;
  providerRef: string;
  providerEventId: string;
  eventType: string;
  feePence?: number;
  payload?: Record<string, unknown>;
}): Promise<{
  ok: boolean;
  alreadyProcessed?: boolean;
  error?: string;
  retryable?: boolean;
}> {
  const pool = getPool();
  if (!pool) return { ok: false, error: "database_unavailable", retryable: true };
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const ev = await recordProviderEvent(client, input);
    const r = await applyGbpWithdrawalStatusOnClient(client, {
      withdrawalId: input.withdrawalId,
      toStatus: "paid",
      adminUserId: "system:stripe_connect",
      note: `Provider confirmed (${input.eventType})`,
      payoutProviderRef: input.providerRef,
    });
    if (!r.ok) {
      if (isPermanentSettlementError(r.error)) {
        // Keep the event so it is not reprocessed, and record why it could not
        // settle. Retrying an unknown withdrawal or a refused transition would
        // fail identically forever.
        await client.query("COMMIT");
        logger.warn(
          { withdrawalId: input.withdrawalId, error: r.error, eventType: input.eventType },
          "Payout provider event cannot settle — acknowledged without money movement",
        );
        return { ok: false, error: r.error, retryable: false };
      }
      await client.query("ROLLBACK");
      logger.error(
        { withdrawalId: input.withdrawalId, error: r.error },
        "confirmPayoutFromProvider status update failed — event not committed",
      );
      return { ok: false, error: r.error || "database_error", retryable: true };
    }
    if ((input.feePence || 0) > 0) {
      await client.query(
        `UPDATE elix_creator_withdrawals_gbp SET provider_fee_pence = $2 WHERE id = $1`,
        [input.withdrawalId, Math.floor(input.feePence || 0)],
      );
    }
    await client.query("COMMIT");
    return { ok: true, alreadyProcessed: (ev.rowCount ?? 0) === 0 };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (rbErr) {
      logger.error({ err: rbErr }, "confirmPayoutFromProvider ROLLBACK failed");
    }
    logger.error({ err }, "confirmPayoutFromProvider failed");
    return { ok: false, error: "database_error", retryable: true };
  } finally {
    client.release();
  }
}

/** Durable provider-event identity — the only dedupe authority for RTDN-style replays. */
async function recordProviderEvent(
  client: import("pg").PoolClient,
  input: {
    providerEventId: string;
    eventType: string;
    withdrawalId: string | null;
    providerRef: string | null;
    payload?: Record<string, unknown>;
  },
): Promise<{ rowCount: number | null }> {
  const r = await client.query(
    `INSERT INTO elix_payout_provider_events
       (provider, event_id, event_type, withdrawal_id, provider_ref, payload)
     VALUES ('stripe_connect', $1, $2, $3, $4, $5::jsonb)
     ON CONFLICT (provider, event_id) DO NOTHING
     RETURNING id`,
    [
      input.providerEventId,
      input.eventType,
      input.withdrawalId,
      input.providerRef,
      JSON.stringify(input.payload ?? {}),
    ],
  );
  return { rowCount: r.rowCount };
}

/** Audited exception — never pretend this is a provider payout. */
export async function markPaidManualOffline(input: {
  withdrawalId: string;
  adminUserId: string;
  note: string;
  externalReference?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const note = String(input.note || "").trim();
  if (note.length < 8) return { ok: false, error: "manual_note_required" };
  const pool = getPool();
  if (!pool) return { ok: false, error: "database_error" };
  const ref = input.externalReference?.trim() || `manual_${input.withdrawalId}`;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // A withdrawal already handed to Stripe may still settle there. Paying it
    // offline as well would pay the creator twice, so this exception is only for
    // rows Stripe never took.
    const existing = await client.query(
      `SELECT payment_rail, payout_provider_ref FROM elix_creator_withdrawals_gbp
        WHERE id = $1 FOR UPDATE`,
      [input.withdrawalId],
    );
    if (!existing.rowCount) {
      await client.query("ROLLBACK");
      return { ok: false, error: "not_found" };
    }
    if (String(existing.rows[0].payment_rail || "") === "stripe_connect") {
      await client.query("ROLLBACK");
      logger.warn(
        { withdrawalId: input.withdrawalId, adminUserId: input.adminUserId },
        "manual offline mark-paid refused — withdrawal was submitted to Stripe",
      );
      return { ok: false, error: "already_submitted_to_provider" };
    }
    // The status change and the manual-exception flag land together, so a paid
    // row can never look like a Stripe payout that no one can find.
    const applied = await applyGbpWithdrawalStatusOnClient(client, {
      withdrawalId: input.withdrawalId,
      toStatus: "paid",
      adminUserId: input.adminUserId,
      note: `MANUAL_OFFLINE_EXCEPTION: ${note}`,
      payoutProviderRef: ref,
    });
    if (!applied.ok) {
      await client.query("ROLLBACK");
      return applied;
    }
    await client.query(
      `UPDATE elix_creator_withdrawals_gbp SET
         payment_rail = 'manual_offline',
         manual_exception = TRUE,
         manual_exception_note = $2,
         provider_status = 'manual'
       WHERE id = $1`,
      [input.withdrawalId, note.slice(0, 1000)],
    );
    await client.query("COMMIT");
    return { ok: true };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (rbErr) {
      logger.error({ err: rbErr }, "markPaidManualOffline ROLLBACK failed");
    }
    logger.error({ err, withdrawalId: input.withdrawalId }, "markPaidManualOffline failed");
    return { ok: false, error: "database_error" };
  } finally {
    client.release();
  }
}

/**
 * Reverse or fail a payout from a provider event, recording the event durably in
 * the same transaction so a redelivery cannot move money twice.
 */
async function failPayoutFromProvider(input: {
  withdrawalId: string;
  providerRef: string;
  providerEventId: string;
  eventType: string;
  failureReason: string;
  note: string;
  payload?: Record<string, unknown>;
}): Promise<{ ok: boolean; error?: string; retryable?: boolean }> {
  const pool = getPool();
  if (!pool) return { ok: false, error: "database_unavailable", retryable: true };
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await recordProviderEvent(client, {
      providerEventId: input.providerEventId,
      eventType: input.eventType,
      withdrawalId: input.withdrawalId,
      providerRef: input.providerRef,
      payload: input.payload,
    });
    const r = await applyGbpWithdrawalStatusOnClient(client, {
      withdrawalId: input.withdrawalId,
      toStatus: "failed",
      adminUserId: "system:stripe_webhook",
      note: input.note,
      failureReason: input.failureReason,
      payoutProviderRef: input.providerRef,
    });
    if (!r.ok) {
      if (isPermanentSettlementError(r.error)) {
        await client.query("COMMIT");
        logger.warn(
          { withdrawalId: input.withdrawalId, error: r.error, eventType: input.eventType },
          "Payout failure event cannot apply — acknowledged without money movement",
        );
        return { ok: false, error: r.error, retryable: false };
      }
      await client.query("ROLLBACK");
      return { ok: false, error: r.error || "database_error", retryable: true };
    }
    await client.query("COMMIT");
    return { ok: true };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (rbErr) {
      logger.error({ err: rbErr }, "failPayoutFromProvider ROLLBACK failed");
    }
    logger.error({ err, withdrawalId: input.withdrawalId }, "failPayoutFromProvider failed");
    return { ok: false, error: "database_error", retryable: true };
  } finally {
    client.release();
  }
}

/**
 * Which creator owns this Stripe account. Our own table is the authority — the
 * event's metadata is only a hint, and a payout account must never be rebound to
 * a different creator by whatever an event says.
 */
async function creatorForProviderAccount(
  accountId: string,
  metadataCreatorId?: string | null,
): Promise<{ ok: boolean; creatorUserId: string | null }> {
  const pool = getPool();
  if (!pool) return { ok: false, creatorUserId: null };
  try {
    const r = await pool.query(
      `SELECT creator_user_id FROM elix_creator_payout_accounts
        WHERE provider = 'stripe_connect' AND provider_account_id = $1 LIMIT 1`,
      [accountId],
    );
    if (r.rowCount) return { ok: true, creatorUserId: String(r.rows[0].creator_user_id) };
    // Not one of ours (or not stored yet). Only then fall back to the hint we set
    // at creation time, and only if that creator really owns this account id.
    if (metadataCreatorId) {
      const owned = await pool.query(
        `SELECT creator_user_id FROM elix_creator_payout_accounts
          WHERE creator_user_id = $1 AND provider_account_id = $2 LIMIT 1`,
        [metadataCreatorId, accountId],
      );
      if (owned.rowCount) return { ok: true, creatorUserId: metadataCreatorId };
    }
    return { ok: true, creatorUserId: null };
  } catch (err) {
    logger.error({ err, accountId }, "creatorForProviderAccount lookup failed");
    return { ok: false, creatorUserId: null };
  }
}

export async function handleStripeConnectPayoutWebhook(
  event: Stripe.Event,
): Promise<{ ok: boolean }> {
  const pool = getPool();
  if (!pool) return { ok: false };

  const eventType = String(event.type);
  if (
    eventType === "transfer.created" ||
    eventType === "transfer.updated" ||
    eventType === "transfer.reversed" ||
    eventType === "transfer.failed"
  ) {
    const transfer = event.data.object as Stripe.Transfer;
    const withdrawalId = transfer.metadata?.elix_withdrawal_id;
    if (!withdrawalId) return { ok: true };
    // Stripe Transfer API emits created/updated/reversed (not transfer.paid).
    // transfer.failed is handled if Stripe emits it.
    if (
      eventType === "transfer.reversed" ||
      eventType === "transfer.failed" ||
      transfer.reversed
    ) {
      const failed = await failPayoutFromProvider({
        withdrawalId,
        providerRef: transfer.id,
        providerEventId: event.id,
        eventType,
        note: eventType === "transfer.failed" ? "Transfer failed" : "Transfer reversed",
        failureReason:
          eventType === "transfer.failed" ? "transfer_failed" : "transfer_reversed",
        payload: { id: transfer.id, amount: transfer.amount },
      });
      // A permanent outcome is acknowledged; only a retryable one asks Stripe again.
      return { ok: failed.ok || failed.retryable === false };
    }
    const confirmed = await confirmPayoutFromProvider({
      withdrawalId,
      providerRef: transfer.id,
      providerEventId: event.id,
      eventType,
      payload: { id: transfer.id, amount: transfer.amount },
    });
    return { ok: confirmed.ok || confirmed.retryable === false };
  }

  if (eventType === "account.updated") {
    const account = event.data.object as Stripe.Account;
    const resolved = await creatorForProviderAccount(
      String(account.id || ""),
      account.metadata?.elix_creator_user_id ?? null,
    );
    if (!resolved.ok) return { ok: false };
    // An account we do not hold is nothing to update — acknowledge it.
    if (!resolved.creatorUserId) return { ok: true };
    const refreshed = await refreshPayoutAccountStatus(resolved.creatorUserId);
    // Capability changes gate payouts. Never acknowledge one we failed to store.
    return { ok: refreshed.ok };
  }

  return { ok: true };
}
