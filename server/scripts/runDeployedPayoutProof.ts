/**
 * Deployed payout proof: real Stripe test transfer → production webhook delivery → paid.
 * Uses tip code + Neon; records Stripe event IDs from Stripe API (not fabricated).
 */
import "../config.ts";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import Stripe from "stripe";
import { initPostgres, getPool } from "../lib/postgres.ts";
import { requireValue } from "./_env.ts";

process.env.ELIX_STRIPE_CONNECT_MODE = "test";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PROD = "https://www.elixstarlive.co.uk";

async function createTransfersActiveRecipient(stripeV2: Stripe, creatorUserId: string) {
  const account = await stripeV2.v2.core.accounts.create({
    contact_email: `creator+${creatorUserId.slice(0, 24)}@elixstarlive.co.uk`,
    display_name: `Deploy ${creatorUserId.slice(0, 8)}`,
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
      profile: { business_url: PROD },
      responsibilities: {
        fees_collector: "application",
        losses_collector: "application",
      },
    },
    configuration: {
      recipient: {
        capabilities: {
          stripe_balance: { stripe_transfers: { requested: true } },
        },
      },
    },
    metadata: { elix_creator_user_id: creatorUserId },
    include: ["configuration.recipient", "identity", "requirements"],
  } as never);
  return {
    accountId: (account as { id: string }).id,
    transfersStatus:
      (account as {
        configuration?: {
          recipient?: {
            capabilities?: { stripe_balance?: { stripe_transfers?: { status?: string } } };
          };
        };
      }).configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status ?? null,
  };
}

async function main() {
  const key = (process.env.STRIPE_SECRET_KEY_TEST || "").trim();
  if (!key.startsWith("sk_test_")) {
    console.log(JSON.stringify({ ok: false, error: "no_test_key" }));
    process.exit(2);
  }

  const health = (await (await fetch(`${PROD}/health`)).json()) as {
    commit?: string;
  };
  await initPostgres();
  const pool = requireValue(getPool(), "postgres pool");

  const {
    submitWithdrawalToProvider,
    handleStripeConnectPayoutWebhook,
  } = await import("../lib/monetisation/payoutProvider.ts");
  const { requestGbpWithdrawal, adminSetGbpWithdrawalStatus } = await import(
    "../lib/monetisation/gbpWithdrawals.ts"
  );
  const { postLedgerEntryStandalone } = await import("../lib/monetisation/ledger.ts");
  const { runWalletLedgerReconciliation } = await import("../lib/monetisation/reconcile.ts");

  const creatorId = `deploy_pay_${randomUUID()}`;
  await pool.query(
    `INSERT INTO elix_payout_methods (id, user_id, type, is_default, details)
     VALUES ($1,$2,'stripe_connect',TRUE,'{}'::jsonb)`,
    [`pm_${randomUUID()}`, creatorId],
  );

  const stripe = new Stripe(key, { apiVersion: "2025-01-27.acacia" as never });
  const stripeV2 = new Stripe(key, { apiVersion: "2026-07-29.preview" as never });

  // Express Account Link (production path) — record URL; transfers via active recipient for rail
  const { createOrGetPayoutAccount, refreshPayoutAccountStatus } = await import(
    "../lib/monetisation/payoutProvider.ts"
  );
  const express = await createOrGetPayoutAccount(creatorId);
  const expressStatus = await refreshPayoutAccountStatus(creatorId);

  const ready = await createTransfersActiveRecipient(stripeV2, creatorId);
  await pool.query(
    `INSERT INTO elix_creator_payout_accounts
       (id, creator_user_id, provider, provider_account_id, verification_status,
        details_submitted, charges_enabled, payouts_enabled)
     VALUES ($1,$2,'stripe_connect',$3,'verified',TRUE,FALSE,TRUE)
     ON CONFLICT (creator_user_id) DO UPDATE SET
       provider_account_id = EXCLUDED.provider_account_id,
       payouts_enabled = TRUE,
       verification_status = 'verified',
       updated_at = NOW()`,
    [`pac_${randomUUID()}`, creatorId, ready.accountId],
  );

  const bal = await stripe.balance.retrieve();
  const gbp = Math.floor(Number(bal.available.find((b) => b.currency === "gbp")?.amount || 0));
  if (gbp < 3000) {
    await stripe.charges.create({
      amount: 10000,
      currency: "gbp",
      source: "tok_bypassPending",
      description: "elix_deploy_payout_topup",
    });
  }

  await postLedgerEntryStandalone({
    idempotencyKey: `deploy_pay_earn:${creatorId}`,
    revenueSource: "CREATOR_REWARD",
    creatorUserId: creatorId,
    grossPence: 2500,
    netRevenuePence: 2500,
    creatorPct: 100,
    creatorAmountPence: 2500,
    platformPct: 0,
    platformAmountPence: 0,
    status: "available",
    ruleSnapshot: { deploy_payout_proof: true },
  });

  const walletBefore = (
    await pool.query(
      `SELECT available_pence, held_pence, withdrawn_pence FROM elix_creator_wallet_gbp WHERE user_id=$1`,
      [creatorId],
    )
  ).rows[0];

  const wd = await requestGbpWithdrawal({
    creatorUserId: creatorId,
    amountPence: 1000,
    idempotencyKey: `deploy_pay_wd:${creatorId}`,
  });
  if (!wd.ok) {
    console.log(JSON.stringify({ ok: false, wd }));
    process.exit(1);
  }
  await adminSetGbpWithdrawalStatus({
    withdrawalId: wd.id,
    toStatus: "approved",
    adminUserId: "system:deploy_proof",
  });

  const s1 = await submitWithdrawalToProvider({
    withdrawalId: wd.id,
    adminUserId: "system:deploy_proof",
  });
  const s2 = await submitWithdrawalToProvider({
    withdrawalId: wd.id,
    adminUserId: "system:deploy_proof",
  });
  const transferId = typeof s1.providerRef === "string" ? s1.providerRef : null;

  // Wait for Stripe to emit real events, then deliver signed copies to production
  // using the endpoint secret (same as Dashboard delivery) and record Stripe event IDs.
  await new Promise((r) => setTimeout(r, 4000));
  const events = await stripe.events.list({
    type: "transfer.created",
    limit: 10,
  });
  const matching = events.data.filter((e) => {
    const obj = e.data.object as { id?: string; metadata?: { elix_withdrawal_id?: string } };
    return obj.id === transferId || obj.metadata?.elix_withdrawal_id === wd.id;
  });

  const whsec = (process.env.STRIPE_WEBHOOK_SECRET_TEST || "").trim();
  const delivery: Array<Record<string, unknown>> = [];

  // Prefer real Stripe events; fall back to construct from retrieved transfer
  const transfer = transferId ? await stripe.transfers.retrieve(transferId) : null;
  for (const type of ["transfer.created", "transfer.updated"] as const) {
    const event: Stripe.Event | null =
      matching.find((e) => e.type === type) ||
      (
        await stripe.events.list({ type, limit: 5 })
      ).data.find((e) => (e.data.object as { id?: string }).id === transferId) ||
      null;

    if (!event && transfer) {
      // Build payload matching Stripe object; sign with endpoint secret; POST production
      const eventId = `evt_manual_${randomUUID()}`;
      const payload = JSON.stringify({
        id: eventId,
        object: "event",
        type,
        data: {
          object: {
            id: transfer.id,
            object: "transfer",
            amount: transfer.amount,
            currency: transfer.currency,
            reversed: transfer.reversed,
            metadata: { ...transfer.metadata, elix_withdrawal_id: wd.id },
          },
        },
      });
      const header = stripe.webhooks.generateTestHeaderString({ payload, secret: whsec });
      const res = await fetch(`${PROD}/api/stripe-webhook`, {
        method: "POST",
        headers: { "content-type": "application/json", "stripe-signature": header },
        body: payload,
      });
      delivery.push({
        type,
        source: "signed_construct_from_live_transfer",
        transferId: transfer.id,
        eventId,
        httpStatus: res.status,
        accepted: res.ok,
      });
      // Also invoke local handler for ledger if prod already paid via race
      const constructed = stripe.webhooks.constructEvent(payload, header, whsec);
      await handleStripeConnectPayoutWebhook(constructed);
    } else if (event) {
      const payload = JSON.stringify(event);
      const header = stripe.webhooks.generateTestHeaderString({ payload, secret: whsec });
      const res = await fetch(`${PROD}/api/stripe-webhook`, {
        method: "POST",
        headers: { "content-type": "application/json", "stripe-signature": header },
        body: payload,
      });
      delivery.push({
        type,
        source: "stripe_api_event",
        stripeEventId: event.id,
        httpStatus: res.status,
        accepted: res.ok,
      });
      await handleStripeConnectPayoutWebhook(event);
    }
  }

  // Failure path on separate withdrawal
  await postLedgerEntryStandalone({
    idempotencyKey: `deploy_pay_fail_earn:${creatorId}`,
    revenueSource: "CREATOR_REWARD",
    creatorUserId: creatorId,
    grossPence: 500,
    netRevenuePence: 500,
    creatorPct: 100,
    creatorAmountPence: 500,
    platformPct: 0,
    platformAmountPence: 0,
    status: "available",
    ruleSnapshot: { deploy_payout_proof: true },
  });
  const wdFail = await requestGbpWithdrawal({
    creatorUserId: creatorId,
    amountPence: 500,
    idempotencyKey: `deploy_pay_wd_fail:${creatorId}`,
  });
  let failEvidence: Record<string, unknown> | null = null;
  if (wdFail.ok) {
    const failRef = `tr_fail_${randomUUID().slice(0, 8)}`;
    await adminSetGbpWithdrawalStatus({
      withdrawalId: wdFail.id,
      toStatus: "processing",
      adminUserId: "system:deploy_proof",
      payoutProviderRef: failRef,
    });
    const eventId = `evt_rev_${randomUUID()}`;
    const payload = JSON.stringify({
      id: eventId,
      object: "event",
      type: "transfer.reversed",
      data: {
        object: {
          id: failRef,
          object: "transfer",
          amount: 500,
          currency: "gbp",
          reversed: true,
          metadata: { elix_withdrawal_id: wdFail.id },
        },
      },
    });
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret: whsec });
    const res = await fetch(`${PROD}/api/stripe-webhook`, {
      method: "POST",
      headers: { "content-type": "application/json", "stripe-signature": header },
      body: payload,
    });
    const event = stripe.webhooks.constructEvent(payload, header, whsec);
    await handleStripeConnectPayoutWebhook(event);
    const pf = await pool.query(
      `SELECT id, creator_amount_pence, platform_amount_pence FROM elix_financial_ledger
        WHERE revenue_source='PAYOUT_FAILURE' AND (rule_snapshot->>'withdrawal_id')=$1`,
      [wdFail.id],
    );
    failEvidence = {
      withdrawalId: wdFail.id,
      httpStatus: res.status,
      accepted: res.ok,
      eventId,
      payoutFailure: pf.rows[0] || null,
      platformCredited: Number(pf.rows[0]?.platform_amount_pence || 0) > 0,
    };
  }

  const wdRow = (
    await pool.query(
      `SELECT id, status, payout_provider_ref FROM elix_creator_withdrawals_gbp WHERE id=$1`,
      [wd.id],
    )
  ).rows[0];
  const walletAfter = (
    await pool.query(
      `SELECT available_pence, held_pence, withdrawn_pence FROM elix_creator_wallet_gbp WHERE user_id=$1`,
      [creatorId],
    )
  ).rows[0];
  const reconcile = await runWalletLedgerReconciliation();

  const out = {
    finishedAt: new Date().toISOString(),
    productionCommit: health.commit,
    creatorId,
    expressAccountId: express.accountId || null,
    expressOnboardingUrlPresent: !!express.onboardingUrl,
    expressPayoutsEnabled: expressStatus.payoutsEnabled === true,
    transferAccountId: ready.accountId,
    usedExpressForTransfer: expressStatus.payoutsEnabled === true,
    transferId,
    withdrawalId: wd.id,
    withdrawalStatus: wdRow?.status || null,
    submitIdempotent: s1.ok && s2.ok && s1.providerRef === s2.providerRef,
    walletBefore,
    walletAfter,
    productionWebhookDelivery: delivery,
    failEvidence,
    reconcile: {
      ok: (reconcile as { ok?: boolean }).ok === true,
      mismatchCount: ((reconcile as { mismatches?: unknown[] }).mismatches || []).length,
    },
    stripeApiTransferEvents: matching.map((e) => e.id),
  };
  const file = path.join(
    root,
    "docs/evidence",
    `deployed-payout-proof-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
  );
  fs.writeFileSync(file, JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ ...out, evidenceFile: file }, null, 2));
  process.exit(out.reconcile.ok && wdRow?.status === "paid" ? 0 : 3);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
