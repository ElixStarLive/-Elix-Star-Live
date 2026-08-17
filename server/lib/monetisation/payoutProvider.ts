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

export function isPayoutProviderConfigured(): boolean {
  return !!getStripe();
}

export function isStripeTestMode(): boolean {
  return resolveStripeSecretKey().mode === "test";
}

export function getStripeModeSafe(): { mode: StripeKeyMode; source: StripeKeySource } {
  const r = resolveStripeSecretKey();
  return { mode: r.mode, source: r.source };
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
 * Submit withdrawal to Stripe Connect Transfer.
 * Sets status processing with provider_ref; paid only via confirmPayoutFromProvider / webhook.
 */
export async function submitWithdrawalToProvider(input: {
  withdrawalId: string;
  adminUserId?: string | null;
}): Promise<{ ok: boolean; providerRef?: string; error?: string }> {
  const stripeClient = getStripe();
  const pool = getPool();
  if (!stripeClient || !pool) return { ok: false, error: "provider_unavailable" };

  const wd = await pool.query(
    `SELECT * FROM elix_creator_withdrawals_gbp WHERE id = $1 LIMIT 1`,
    [input.withdrawalId],
  );
  if (!wd.rowCount) return { ok: false, error: "not_found" };
  const row = wd.rows[0];
  if (String(row.status) === "paid") {
    return { ok: true, providerRef: row.payout_provider_ref || undefined };
  }
  if (row.payout_provider_ref && String(row.status) === "processing") {
    return { ok: true, providerRef: String(row.payout_provider_ref) };
  }

  const acct = await pool.query(
    `SELECT * FROM elix_creator_payout_accounts WHERE creator_user_id = $1 LIMIT 1`,
    [row.creator_user_id],
  );
  if (!acct.rowCount || !acct.rows[0].payouts_enabled) {
    return { ok: false, error: "payout_account_not_ready" };
  }

  const amount = Math.floor(Number(row.amount_pence) || 0);
  if (amount <= 0) return { ok: false, error: "invalid_amount" };

  try {
    await adminSetGbpWithdrawalStatus({
      withdrawalId: input.withdrawalId,
      toStatus: "processing",
      adminUserId: input.adminUserId || "system:payout_provider",
      note: "Submitted to Stripe Connect",
    });

    const transfer = await stripeClient.transfers.create(
      {
        amount,
        currency: "gbp",
        destination: String(acct.rows[0].provider_account_id),
        transfer_group: input.withdrawalId,
        metadata: {
          elix_withdrawal_id: input.withdrawalId,
          elix_creator_user_id: String(row.creator_user_id),
        },
      },
      { idempotencyKey: `wdgbp_xfer_${input.withdrawalId}` },
    );

    await pool.query(
      `UPDATE elix_creator_withdrawals_gbp SET
         payout_provider_ref = $2,
         payment_rail = 'stripe_connect',
         provider_status = $3,
         payout_account_id = $4,
         manual_exception = FALSE
       WHERE id = $1`,
      [input.withdrawalId, transfer.id, transfer.reversed ? "reversed" : "pending", acct.rows[0].id],
    );

    // In Connect, a successful Transfer create is the primary confirmation for sandbox.
    // Webhook may also confirm; mark paid only via confirm path.
    await confirmPayoutFromProvider({
      withdrawalId: input.withdrawalId,
      providerRef: transfer.id,
      providerEventId: `xfer_create_${transfer.id}`,
      eventType: "transfer.created",
      feePence: 0,
      payload: { id: transfer.id, amount: transfer.amount, currency: transfer.currency },
    });

    return { ok: true, providerRef: transfer.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err, withdrawalId: input.withdrawalId }, "submitWithdrawalToProvider failed");
    await adminSetGbpWithdrawalStatus({
      withdrawalId: input.withdrawalId,
      toStatus: "failed",
      adminUserId: input.adminUserId || "system:payout_provider",
      note: "Stripe transfer failed",
      failureReason: msg.slice(0, 500),
    });
    return { ok: false, error: msg };
  }
}

export async function confirmPayoutFromProvider(input: {
  withdrawalId: string;
  providerRef: string;
  providerEventId: string;
  eventType: string;
  feePence?: number;
  payload?: Record<string, unknown>;
}): Promise<{ ok: boolean; alreadyProcessed?: boolean }> {
  const pool = getPool();
  if (!pool) return { ok: false };
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const ev = await client.query(
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
    const r = await applyGbpWithdrawalStatusOnClient(client, {
      withdrawalId: input.withdrawalId,
      toStatus: "paid",
      adminUserId: "system:stripe_connect",
      note: `Provider confirmed (${input.eventType})`,
      payoutProviderRef: input.providerRef,
    });
    if (!r.ok) {
      await client.query("ROLLBACK");
      logger.error(
        { withdrawalId: input.withdrawalId, error: r.error },
        "confirmPayoutFromProvider status update failed — event not committed",
      );
      return { ok: false };
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
    return { ok: false };
  } finally {
    client.release();
  }
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
  const r = await adminSetGbpWithdrawalStatus({
    withdrawalId: input.withdrawalId,
    toStatus: "paid",
    adminUserId: input.adminUserId,
    note: `MANUAL_OFFLINE_EXCEPTION: ${note}`,
    payoutProviderRef: ref,
  });
  if (!r.ok) return r;
  await pool.query(
    `UPDATE elix_creator_withdrawals_gbp SET
       payment_rail = 'manual_offline',
       manual_exception = TRUE,
       manual_exception_note = $2,
       provider_status = 'manual'
     WHERE id = $1`,
    [input.withdrawalId, note.slice(0, 1000)],
  );
  return { ok: true };
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
      const failed = await adminSetGbpWithdrawalStatus({
        withdrawalId,
        toStatus: "failed",
        adminUserId: "system:stripe_webhook",
        note:
          eventType === "transfer.failed"
            ? "Transfer failed"
            : "Transfer reversed",
        failureReason:
          eventType === "transfer.failed" ? "transfer_failed" : "transfer_reversed",
        payoutProviderRef: transfer.id,
      });
      return { ok: failed.ok };
    }
    const confirmed = await confirmPayoutFromProvider({
      withdrawalId,
      providerRef: transfer.id,
      providerEventId: event.id,
      eventType,
      payload: { id: transfer.id, amount: transfer.amount },
    });
    return { ok: confirmed.ok };
  }

  if (eventType === "account.updated") {
    const account = event.data.object as Stripe.Account;
    const creatorId = account.metadata?.elix_creator_user_id;
    if (creatorId) await refreshPayoutAccountStatus(creatorId);
    return { ok: true };
  }

  return { ok: true };
}
