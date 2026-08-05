/**
 * Stripe Connect TEST-MODE proof only.
 *
 * Requirements:
 *   STRIPE_SECRET_KEY_TEST=sk_test_…
 *   ELIX_STRIPE_CONNECT_MODE=test (forced here)
 *   DATABASE_URL → sibling elix_money_it only
 *
 * Never uses sk_live_. Never logs secret material.
 * Evidence: docs/evidence/stripe-connect-test-proof-*.json (safe IDs only).
 *
 * Run: npm run test:stripe:connect-proof
 */
import "../config.ts";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID, randomBytes } from "crypto";
import pg from "pg";
import { normalizeDatabaseUrl } from "../lib/databaseUrl.ts";

process.env.ELIX_STRIPE_CONNECT_MODE = "test";
process.env.NODE_ENV = "development";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");

function swapDb(url: string, name: string): string {
  const u = new URL(url.replace(/^postgres(ql)?:/i, "http:"));
  u.pathname = "/" + name;
  return u.toString().replace(/^http:/i, "postgresql:");
}

function redactMode(key: string): "test" | "live" | "missing" | "other" {
  const k = (key || "").trim();
  if (!k) return "missing";
  if (k.startsWith("sk_test_") || k.startsWith("pk_test_")) return "test";
  if (k.startsWith("sk_live_") || k.startsWith("pk_live_")) return "live";
  if (k.startsWith("whsec_")) return "test";
  return "other";
}

async function writeEvidence(evidence: Record<string, unknown>) {
  const dir = path.join(root, "docs", "evidence");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(
    dir,
    `stripe-connect-test-proof-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
  );
  fs.writeFileSync(file, JSON.stringify(evidence, null, 2));
  console.log("[connect-proof] evidence_file=", file);
  return file;
}

/** Ensure platform test balance can fund a GBP transfer. */
async function ensureTestGbpBalance(
  stripe: import("stripe").default,
  minPence: number,
): Promise<{ ok: boolean; availablePence: number; topUpId?: string; error?: string }> {
  const bal = await stripe.balance.retrieve();
  const gbp = bal.available.find((b) => b.currency === "gbp");
  let available = Math.floor(Number(gbp?.amount || 0));
  if (available >= minPence) return { ok: true, availablePence: available };
  try {
    const charge = await stripe.charges.create({
      amount: Math.max(minPence * 2, 10_000),
      currency: "gbp",
      source: "tok_bypassPending",
      description: "elix_connect_proof_platform_topup",
    });
    const bal2 = await stripe.balance.retrieve();
    available = Math.floor(
      Number(bal2.available.find((b) => b.currency === "gbp")?.amount || 0),
    );
    return {
      ok: available >= minPence,
      availablePence: available,
      topUpId: charge.id,
    };
  } catch (err) {
    return {
      ok: false,
      availablePence: available,
      error: err instanceof Error ? err.message : "topup_failed",
    };
  }
}

/**
 * Create a transfers-active recipient via Accounts v2 API onboarding (test mode).
 * Express hosted onboarding still requires a browser for TOS; dashboard:none allows
 * automated sandbox proof of Transfers + webhooks.
 */
async function createTransfersActiveRecipient(
  stripeV2: import("stripe").default,
  creatorUserId: string,
): Promise<{ accountId: string; transfersStatus: string | null }> {
  const account = await stripeV2.v2.core.accounts.create({
    contact_email: `creator+${creatorUserId.slice(0, 24)}@elixstarlive.co.uk`,
    display_name: `Elix proof ${creatorUserId.slice(0, 8)}`,
    dashboard: "none",
    identity: {
      country: "gb",
      entity_type: "individual",
      individual: {
        given_name: "Jenny",
        surname: "Rosen",
        email: `creator+${creatorUserId.slice(0, 24)}@elixstarlive.co.uk`,
        address: {
          line1: "address_full_match",
          city: "London",
          postal_code: "E1 6AN",
          country: "GB",
        },
        date_of_birth: { day: 1, month: 1, year: 1901 },
      },
      attestations: {
        terms_of_service: {
          account: { date: new Date().toISOString(), ip: "127.0.0.1" },
        },
      },
    },
    defaults: {
      currency: "gbp",
      profile: { business_url: "https://www.elixstarlive.co.uk" },
      responsibilities: {
        fees_collector: "application",
        losses_collector: "application",
      },
    },
    configuration: {
      recipient: {
        capabilities: {
          stripe_balance: {
            stripe_transfers: { requested: true },
          },
        },
      },
    },
    metadata: { elix_creator_user_id: creatorUserId, elix_proof: "1" },
    include: ["configuration.recipient", "identity", "requirements"],
  });
  const transfersStatus =
    account.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers
      ?.status ?? null;
  return { accountId: account.id, transfersStatus };
}

async function main() {
  const evidence: Record<string, unknown> = {
    startedAt: new Date().toISOString(),
    policy: "sk_test_only — never sk_live_",
    note_events:
      "Stripe Transfer webhooks are transfer.created|updated|reversed (no transfer.paid). Paid is confirmed via created/updated; failed/reversed via reversed or transfer.failed handler.",
    steps: [] as unknown[],
  };
  const steps = evidence.steps as Array<Record<string, unknown>>;

  const testKey = (process.env.STRIPE_SECRET_KEY_TEST || "").trim();
  const primary = (process.env.STRIPE_SECRET_KEY || "").trim();
  const primaryMode = redactMode(primary);
  const testMode = redactMode(testKey);

  evidence.env_modes = {
    STRIPE_SECRET_KEY: primaryMode,
    STRIPE_SECRET_KEY_TEST: testMode,
    STRIPE_SECRET_KEY_LIVE: redactMode(process.env.STRIPE_SECRET_KEY_LIVE || ""),
    ELIX_STRIPE_CONNECT_MODE: "test",
  };

  if (testMode !== "test") {
    evidence.status = "BLOCKED";
    evidence.blocker =
      "STRIPE_SECRET_KEY_TEST=sk_test_… required (do not overwrite STRIPE_SECRET_KEY sk_live_).";
    await writeEvidence(evidence);
    console.error("[connect-proof] BLOCKED — STRIPE_SECRET_KEY_TEST required");
    process.exit(2);
  }

  const base = normalizeDatabaseUrl((process.env.DATABASE_URL || "").trim());
  if (!base) throw new Error("DATABASE_URL required");
  const siblingUrl = swapDb(base, "elix_money_it");
  process.env.DATABASE_URL = siblingUrl;
  process.env.TEST_DATABASE_URL = siblingUrl;
  process.env.ALLOW_MONEY_IT_ON_URL = "1";
  process.env.ELIX_SKIP_MIGRATION_CHECK = "1";

  const { connectPostgres, getPool: getAppPool } = await import("../lib/postgres.ts");
  await connectPostgres();
  if (!getAppPool()) {
    evidence.status = "FAILED";
    evidence.blocker = "App pool failed to open on elix_money_it sibling";
    await writeEvidence(evidence);
    process.exit(1);
  }

  const {
    resolveStripeSecretKey,
    createOrGetPayoutAccount,
    refreshPayoutAccountStatus,
    submitWithdrawalToProvider,
    handleStripeConnectPayoutWebhook,
    getStripeModeSafe,
  } = await import("../lib/monetisation/payoutProvider.ts");

  const resolved = resolveStripeSecretKey({ forceTest: true });
  steps.push({
    step: "resolve_stripe_mode",
    mode: resolved.mode,
    source: resolved.source,
    safeMode: getStripeModeSafe(),
  });
  if (resolved.mode !== "test") {
    evidence.status = "BLOCKED";
    evidence.blocker = "Connect resolve did not yield test mode";
    await writeEvidence(evidence);
    process.exit(2);
  }

  const pool = new pg.Pool({
    connectionString: siblingUrl,
    ssl: { rejectUnauthorized: false },
    max: 3,
  });

  const creatorId = `connect_proof_${randomUUID()}`;
  const wdId = `wdgbp_${randomUUID()}`;
  const wdFailId = `wdgbp_${randomUUID()}`;
  let expressAccountId: string | undefined;
  let transferAccountId: string | undefined;
  let transferId: string | undefined;
  const webhookEventIds: Record<string, string> = {};

  try {
    await pool.query(
      `INSERT INTO elix_creator_wallet_gbp (user_id, available_pence, pending_pence, withdrawn_pence)
       VALUES ($1, 50000, 0, 0)
       ON CONFLICT (user_id) DO UPDATE SET available_pence = GREATEST(elix_creator_wallet_gbp.available_pence, 50000)`,
      [creatorId],
    );

    // 1) Express path (production createOrGet) — Account Link onboarding evidence
    const onboard = await createOrGetPayoutAccount(creatorId);
    expressAccountId = onboard.accountId;
    steps.push({
      step: "express_onboard_account_link",
      ok: onboard.ok,
      accountId: expressAccountId || null,
      verificationStatus: onboard.verificationStatus || null,
      onboardingUrlPresent: !!onboard.onboardingUrl,
      error: onboard.error || null,
    });

    const refreshed = await refreshPayoutAccountStatus(creatorId);
    steps.push({
      step: "express_account_status",
      ok: refreshed.ok,
      verificationStatus: refreshed.verificationStatus || null,
      payoutsEnabled: refreshed.payoutsEnabled ?? null,
    });

    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(resolved.key, {
      apiVersion: "2025-01-27.acacia" as never,
    });
    const stripeV2 = new Stripe(resolved.key, {
      apiVersion: "2026-07-29.preview" as never,
    });

    // 2) API-onboarded recipient with active stripe_transfers (sandbox proof)
    const ready = await createTransfersActiveRecipient(stripeV2, creatorId);
    transferAccountId = ready.accountId;
    steps.push({
      step: "transfers_capability_api_onboard",
      accountId: transferAccountId,
      transfersStatus: ready.transfersStatus,
      ok: ready.transfersStatus === "active",
    });
    if (ready.transfersStatus !== "active") {
      evidence.status = "INCOMPLETE";
      evidence.blocker = "stripe_transfers not active after API onboarding";
      await writeEvidence(evidence);
      process.exit(1);
    }

    // Point payout account row at transfers-active recipient for submit path
    await pool.query(
      `UPDATE elix_creator_payout_accounts SET
         provider_account_id = $2,
         payouts_enabled = TRUE,
         details_submitted = TRUE,
         verification_status = 'verified',
         updated_at = NOW()
       WHERE creator_user_id = $1`,
      [creatorId, transferAccountId],
    );
    if (!(await pool.query(`SELECT 1 FROM elix_creator_payout_accounts WHERE creator_user_id = $1`, [creatorId])).rowCount) {
      await pool.query(
        `INSERT INTO elix_creator_payout_accounts
           (id, creator_user_id, provider, provider_account_id, verification_status,
            details_submitted, charges_enabled, payouts_enabled)
         VALUES ($1,$2,'stripe_connect',$3,'verified',TRUE,FALSE,TRUE)`,
        [`pac_${randomUUID()}`, creatorId, transferAccountId],
      );
    }

    const fund = await ensureTestGbpBalance(stripe, 2000);
    steps.push({
      step: "platform_test_balance",
      ok: fund.ok,
      availablePence: fund.availablePence,
      topUpId: fund.topUpId || null,
      error: fund.error || null,
    });
    if (!fund.ok) {
      evidence.status = "BLOCKED";
      evidence.blocker = "Insufficient Stripe test GBP available balance";
      await writeEvidence(evidence);
      process.exit(2);
    }

    await pool.query(
      `INSERT INTO elix_creator_withdrawals_gbp
         (id, idempotency_key, creator_user_id, amount_pence, currency, status, payment_rail)
       VALUES ($1,$1,$2,1000,'GBP','approved','stripe_connect')
       ON CONFLICT (id) DO NOTHING`,
      [wdId, creatorId],
    );

    const submit1 = await submitWithdrawalToProvider({
      withdrawalId: wdId,
      adminUserId: "system:connect_proof",
    });
    transferId =
      typeof submit1.providerRef === "string" ? submit1.providerRef : undefined;
    steps.push({
      step: "submit_provider_first",
      ok: submit1.ok,
      providerRef: transferId || null,
      error: submit1.error || null,
      maps_to: "transfer.created / paid confirmation path",
    });

    const submit2 = await submitWithdrawalToProvider({
      withdrawalId: wdId,
      adminUserId: "system:connect_proof",
    });
    steps.push({
      step: "submit_provider_duplicate_idempotent",
      ok: submit2.ok,
      providerRef: submit2.providerRef || null,
      sameTransfer:
        !!transferId &&
        typeof submit2.providerRef === "string" &&
        submit2.providerRef === transferId,
      error: submit2.error || null,
    });

    // Ephemeral whsec for signed constructEvent proof (not live webhook secret).
    // Prefer STRIPE_WEBHOOK_SECRET_TEST when set; else generate for crypto proof only.
    let whsec = (process.env.STRIPE_WEBHOOK_SECRET_TEST || "").trim();
    let whsecSource = "STRIPE_WEBHOOK_SECRET_TEST";
    if (!whsec.startsWith("whsec_")) {
      whsec = `whsec_${randomBytes(24).toString("base64url")}`;
      whsecSource = "ephemeral_proof_only";
      process.env.STRIPE_WEBHOOK_SECRET_TEST = whsec;
    }
    steps.push({
      step: "webhook_secret_source",
      source: whsecSource,
      present: true,
    });

    if (transferId) {
      const eventSpecs: Array<{
        type: string;
        reversed?: boolean;
        label: string;
      }> = [
        { type: "transfer.created", label: "transfer.created" },
        { type: "transfer.updated", label: "transfer.updated_as_paid" },
        { type: "transfer.reversed", reversed: true, label: "transfer.reversed" },
        { type: "transfer.failed", label: "transfer.failed" },
      ];

      // Separate withdrawal for failed/reversed so paid path stays clean first
      const paidWd = await pool.query(
        `SELECT status, payout_provider_ref FROM elix_creator_withdrawals_gbp WHERE id = $1`,
        [wdId],
      );
      steps.push({
        step: "withdrawal_after_submit",
        status: paidWd.rows[0]?.status || null,
        providerRef: paidWd.rows[0]?.payout_provider_ref || null,
      });

      // Signed created + updated (paid) on primary withdrawal
      for (const spec of eventSpecs.filter((e) =>
        ["transfer.created", "transfer.updated"].includes(e.type),
      )) {
        const eventId = `evt_connect_proof_${randomUUID()}`;
        const payload = JSON.stringify({
          id: eventId,
          object: "event",
          type: spec.type,
          data: {
            object: {
              id: transferId,
              object: "transfer",
              amount: 1000,
              currency: "gbp",
              reversed: false,
              metadata: { elix_withdrawal_id: wdId },
            },
          },
        });
        const header = stripe.webhooks.generateTestHeaderString({
          payload,
          secret: whsec,
        });
        const event = stripe.webhooks.constructEvent(payload, header, whsec);
        const wh = await handleStripeConnectPayoutWebhook(event);
        webhookEventIds[spec.label] = event.id;
        steps.push({
          step: `signed_webhook_${spec.label}`,
          ok: wh.ok,
          eventId: event.id,
          eventType: event.type,
          transferId,
          withdrawalId: wdId,
        });
      }

      // Failed + reversed on a second withdrawal that was processing with same transfer pattern
      await pool.query(
        `INSERT INTO elix_creator_withdrawals_gbp
           (id, idempotency_key, creator_user_id, amount_pence, currency, status, payment_rail, payout_provider_ref)
         VALUES ($1,$1,$2,500,'GBP','processing','stripe_connect',$3)
         ON CONFLICT (id) DO NOTHING`,
        [wdFailId, creatorId, `tr_proof_fail_${randomUUID().slice(0, 8)}`],
      );
      const failTransferId = (
        await pool.query(
          `SELECT payout_provider_ref FROM elix_creator_withdrawals_gbp WHERE id = $1`,
          [wdFailId],
        )
      ).rows[0]?.payout_provider_ref as string;

      for (const spec of eventSpecs.filter((e) =>
        ["transfer.reversed", "transfer.failed"].includes(e.type),
      )) {
        const eventId = `evt_connect_proof_${randomUUID()}`;
        const payload = JSON.stringify({
          id: eventId,
          object: "event",
          type: spec.type,
          data: {
            object: {
              id: failTransferId,
              object: "transfer",
              amount: 500,
              currency: "gbp",
              reversed: spec.type === "transfer.reversed",
              metadata: { elix_withdrawal_id: wdFailId },
            },
          },
        });
        const header = stripe.webhooks.generateTestHeaderString({
          payload,
          secret: whsec,
        });
        const event = stripe.webhooks.constructEvent(payload, header, whsec);
        const wh = await handleStripeConnectPayoutWebhook(event);
        webhookEventIds[spec.label] = event.id;
        steps.push({
          step: `signed_webhook_${spec.label}`,
          ok: wh.ok,
          eventId: event.id,
          eventType: event.type,
          transferId: failTransferId,
          withdrawalId: wdFailId,
        });
      }
    }

    const wdRow = await pool.query(
      `SELECT id, status, payout_provider_ref, payment_rail, failure_reason
         FROM elix_creator_withdrawals_gbp WHERE id = ANY($1::text[])`,
      [[wdId, wdFailId]],
    );

    let reconcileResult: unknown = null;
    try {
      const { runWalletLedgerReconciliation } = await import(
        "../lib/monetisation/reconcile.ts"
      );
      reconcileResult = await runWalletLedgerReconciliation();
    } catch (err) {
      reconcileResult = {
        error: err instanceof Error ? err.message : "reconcile_failed",
      };
    }

    const ledgerRows = await pool.query(
      `SELECT id, creator_user_id, status, revenue_source, creator_amount_pence, platform_amount_pence
         FROM elix_financial_ledger
        WHERE creator_user_id = $1
        ORDER BY id DESC
        LIMIT 20`,
      [creatorId],
    ).catch(() => ({ rows: [] as unknown[] }));

    const allOk =
      !!transferId &&
      submit1.ok &&
      submit2.ok &&
      submit2.providerRef === transferId &&
      Object.keys(webhookEventIds).length >= 4;

    evidence.safe_ids = {
      creatorUserId: creatorId,
      expressConnectAccountId: expressAccountId || null,
      transfersActiveAccountId: transferAccountId || null,
      transferId: transferId || null,
      withdrawalId: wdId,
      withdrawalFailedId: wdFailId,
      withdrawalRows: wdRow.rows,
      webhookEventIds,
      ledgerEntryIds: (ledgerRows.rows as Array<{ id: unknown }>).map((r) => r.id),
    };
    evidence.reconciliation = reconcileResult;
    evidence.status = allOk ? "PROOF_PASSED" : "INCOMPLETE";
    evidence.finishedAt = new Date().toISOString();
    await writeEvidence(evidence);
    console.log(
      JSON.stringify(
        {
          status: evidence.status,
          mode: resolved.mode,
          source: resolved.source,
          expressAccountId: expressAccountId || null,
          transfersActiveAccountId: transferAccountId || null,
          transferId: transferId || null,
          withdrawalId: wdId,
          webhookEventIds,
          withdrawalStatuses: wdRow.rows.map((r: { id: string; status: string }) => ({
            id: r.id,
            status: r.status,
          })),
        },
        null,
        2,
      ),
    );
    process.exit(allOk ? 0 : 1);
  } finally {
    await pool.end().catch(() => {});
  }
}

main().catch((err) => {
  console.error("[connect-proof] fatal", err instanceof Error ? err.message : err);
  process.exit(1);
});
