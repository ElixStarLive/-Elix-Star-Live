/**
 * Stripe Connect TEST-MODE proof only.
 *
 * Requirements:
 *   STRIPE_SECRET_KEY_TEST=sk_test_…   (preferred)
 *   OR STRIPE_SECRET_KEY=sk_test_… when no live key conflict
 *   ELIX_STRIPE_CONNECT_MODE=test      (forced by this script)
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
import { randomUUID } from "crypto";
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
  if (k.startsWith("sk_test_")) return "test";
  if (k.startsWith("sk_live_")) return "live";
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

async function main() {
  const evidence: Record<string, unknown> = {
    startedAt: new Date().toISOString(),
    policy: "sk_test_only — never sk_live_",
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

  if (testMode !== "test" && primaryMode !== "test") {
    evidence.status = "BLOCKED";
    evidence.blocker =
      "No sk_test_ key available. Set STRIPE_SECRET_KEY_TEST=sk_test_… in Coolify/local (do not overwrite STRIPE_SECRET_KEY sk_live_).";
    await writeEvidence(evidence);
    console.error("[connect-proof] BLOCKED — STRIPE_SECRET_KEY_TEST=sk_test_… required");
    process.exit(2);
  }
  if (primaryMode === "live" && testMode !== "test") {
    evidence.status = "BLOCKED";
    evidence.blocker =
      "STRIPE_SECRET_KEY is sk_live_ and STRIPE_SECRET_KEY_TEST is missing.";
    await writeEvidence(evidence);
    console.error("[connect-proof] BLOCKED — refuse live key");
    process.exit(2);
  }

  // Bind sibling DB BEFORE importing payoutProvider/getPool.
  const base = normalizeDatabaseUrl((process.env.DATABASE_URL || "").trim());
  if (!base) throw new Error("DATABASE_URL required");
  const siblingUrl = swapDb(base, "elix_money_it");
  process.env.DATABASE_URL = siblingUrl;
  process.env.TEST_DATABASE_URL = siblingUrl;
  process.env.ALLOW_MONEY_IT_ON_URL = "1";

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
  let accountId: string | undefined;
  let transferId: string | undefined;

  try {
    await pool.query(
      `INSERT INTO elix_creator_wallet_gbp (user_id, available_pence, pending_pence, withdrawn_pence)
       VALUES ($1, 50000, 0, 0)
       ON CONFLICT (user_id) DO UPDATE SET available_pence = GREATEST(elix_creator_wallet_gbp.available_pence, 50000)`,
      [creatorId],
    );

    const onboard = await createOrGetPayoutAccount(creatorId);
    accountId = onboard.accountId;
    steps.push({
      step: "connect_onboard",
      ok: onboard.ok,
      accountId: accountId || null,
      verificationStatus: onboard.verificationStatus || null,
      onboardingUrlPresent: !!onboard.onboardingUrl,
      error: onboard.error || null,
    });
    if (!onboard.ok || !accountId) {
      evidence.status = "FAILED";
      await writeEvidence(evidence);
      process.exit(1);
    }

    const refreshed = await refreshPayoutAccountStatus(creatorId);
    steps.push({
      step: "account_status",
      ok: refreshed.ok,
      verificationStatus: refreshed.verificationStatus || null,
      payoutsEnabled: refreshed.payoutsEnabled ?? null,
    });

    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(resolved.key, {
      apiVersion: "2025-01-27.acacia" as never,
    });
    try {
      const stripeAccount = await stripe.accounts.retrieve(accountId);
      steps.push({
        step: "stripe_account_retrieve",
        accountId,
        payouts_enabled: !!stripeAccount.payouts_enabled,
        details_submitted: !!stripeAccount.details_submitted,
      });
      // Sibling DB: allow submit path to proceed in sandbox when Express is still pending
      // (Stripe test transfers to incomplete Express accounts often fail — recorded honestly).
      if (stripeAccount.payouts_enabled) {
        await pool.query(
          `UPDATE elix_creator_payout_accounts SET payouts_enabled = TRUE, details_submitted = TRUE,
             verification_status = 'verified', updated_at = NOW()
           WHERE creator_user_id = $1`,
          [creatorId],
        );
      }
    } catch (err) {
      steps.push({
        step: "stripe_account_retrieve",
        ok: false,
        error: err instanceof Error ? err.message : "retrieve_failed",
      });
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

    const whsec = (
      process.env.STRIPE_WEBHOOK_SECRET_TEST ||
      (primaryMode === "test" ? process.env.STRIPE_WEBHOOK_SECRET : "") ||
      ""
    ).trim();

    if (transferId && whsec.startsWith("whsec_")) {
      for (const type of ["transfer.updated", "transfer.reversed"] as const) {
        try {
          const eventId = `evt_connect_proof_${randomUUID()}`;
          const payload = JSON.stringify({
            id: eventId,
            object: "event",
            type,
            data: {
              object: {
                id: transferId,
                object: "transfer",
                amount: 1000,
                currency: "gbp",
                reversed: type === "transfer.reversed",
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
          steps.push({
            step: `signed_webhook_${type.replace(".", "_")}`,
            ok: wh.ok,
            eventId: event.id,
            eventType: event.type,
            transferId,
            withdrawalId: wdId,
          });
        } catch (err) {
          steps.push({
            step: `signed_webhook_${type.replace(".", "_")}`,
            ok: false,
            error: err instanceof Error ? err.message : "webhook_failed",
          });
        }
      }
    } else {
      steps.push({
        step: "signed_webhook",
        ok: false,
        skipped: true,
        reason:
          "Need STRIPE_WEBHOOK_SECRET_TEST=whsec_… for signed webhook proof (live whsec not used when primary is live)",
      });
    }

    const wdRow = await pool.query(
      `SELECT id, status, payout_provider_ref, payment_rail, failure_reason
         FROM elix_creator_withdrawals_gbp WHERE id = $1`,
      [wdId],
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

    evidence.safe_ids = {
      creatorUserId: creatorId,
      connectAccountId: accountId || null,
      transferId: transferId || null,
      withdrawalId: wdId,
      withdrawalRow: wdRow.rows[0] || null,
    };
    evidence.reconciliation = reconcileResult;
    evidence.status = submit1.ok && transferId ? "PROOF_PARTIAL_SEE_STEPS" : "INCOMPLETE";
    evidence.finishedAt = new Date().toISOString();
    await writeEvidence(evidence);
    console.log(
      JSON.stringify(
        {
          status: evidence.status,
          mode: resolved.mode,
          source: resolved.source,
          accountId: accountId || null,
          transferId: transferId || null,
          withdrawalId: wdId,
          withdrawalStatus: wdRow.rows[0]?.status || null,
        },
        null,
        2,
      ),
    );
  } finally {
    await pool.end().catch(() => {});
  }
}

main().catch((err) => {
  console.error("[connect-proof] fatal", err instanceof Error ? err.message : err);
  process.exit(1);
});
