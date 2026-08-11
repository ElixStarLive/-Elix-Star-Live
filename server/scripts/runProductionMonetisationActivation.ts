/**
 * Production Neon + Stripe TEST monetisation activation.
 * Tip code against neondb; Playwright opens Express Account Link.
 * Never prints secrets. Never uses sk_live for Connect.
 */
import "../config.ts";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import { chromium } from "playwright";
import Stripe from "stripe";
import { initPostgres, getPool } from "../lib/postgres.ts";
import { requireValue } from "./_env.ts";

process.env.ELIX_STRIPE_CONNECT_MODE = "test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");

async function createTransfersActiveRecipient(
  stripeV2: Stripe,
  creatorUserId: string,
): Promise<{ accountId: string; transfersStatus: string | null }> {
  const account = await stripeV2.v2.core.accounts.create({
    contact_email: `creator+${creatorUserId.slice(0, 24)}@elixstarlive.co.uk`,
    display_name: `Elix act ${creatorUserId.slice(0, 8)}`,
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
          stripe_balance: { stripe_transfers: { requested: true } },
        },
      },
    },
    metadata: { elix_creator_user_id: creatorUserId, elix_activation: "1" },
    include: ["configuration.recipient", "identity", "requirements"],
  } as never);
  const transfersStatus =
    (account as {
      configuration?: {
        recipient?: {
          capabilities?: { stripe_balance?: { stripe_transfers?: { status?: string } } };
        };
      };
    }).configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status ?? null;
  return { accountId: (account as { id: string }).id, transfersStatus };
}

async function main() {
  const steps: Array<Record<string, unknown>> = [];
  const key = (process.env.STRIPE_SECRET_KEY_TEST || "").trim();
  if (!key.startsWith("sk_test_")) {
    console.log(JSON.stringify({ ok: false, error: "STRIPE_SECRET_KEY_TEST_required" }));
    process.exit(2);
  }

  const health = (await (
    await fetch("https://www.elixstarlive.co.uk/health")
  ).json()) as { commit?: string; status?: string };
  const { execSync } = await import("child_process");
  const localTip = execSync("git rev-parse HEAD", { cwd: root }).toString().trim();
  steps.push({
    step: "deploy_gate",
    productionCommit: health.commit,
    localTip,
    tipDeployed:
      !!health.commit &&
      (health.commit === localTip || localTip.startsWith(health.commit) || health.commit.startsWith(localTip.slice(0, 7))),
    coolifyCredentials: "MISSING",
  });

  await initPostgres();
  const pool = requireValue(getPool(), "postgres pool");
  const mig = await pool.query(
    `SELECT COUNT(*)::int AS c, MAX(filename) AS last FROM elix_schema_migrations`,
  );
  steps.push({
    step: "neon",
    database: (await pool.query(`SELECT current_database() AS d`)).rows[0].d,
    migrations: mig.rows[0].c,
    lastMigration: mig.rows[0].last,
  });

  const {
    createOrGetPayoutAccount,
    refreshPayoutAccountStatus,
    submitWithdrawalToProvider,
    handleStripeConnectPayoutWebhook,
  } = await import("../lib/monetisation/payoutProvider.ts");
  const { requestGbpWithdrawal, adminSetGbpWithdrawalStatus } = await import(
    "../lib/monetisation/gbpWithdrawals.ts"
  );
  const { postLedgerEntryStandalone } = await import("../lib/monetisation/ledger.ts");
  const { runWalletLedgerReconciliation } = await import("../lib/monetisation/reconcile.ts");
  const { openCreatorRewardPeriod } = await import("../lib/monetisation/creatorRewardsJob.ts");
  const { enrollVideoInForYou, onQualifiedUniqueViewForFeed } = await import(
    "../lib/feed/foryouLifecycle.ts"
  );
  const { loadForYouConfig } = await import("../lib/feed/foryouConfig.ts");
  const { parseAppleFinancialCsv, parseGoogleEarningsCsv } = await import(
    "../lib/monetisation/financialReports.ts"
  );

  const creatorId = `monet_act_${randomUUID()}`;
  await pool.query(
    `INSERT INTO elix_payout_methods (id, user_id, type, is_default, details)
     VALUES ($1,$2,'stripe_connect',TRUE,'{}'::jsonb)`,
    [`pm_${randomUUID()}`, creatorId],
  );

  const onboard = await createOrGetPayoutAccount(creatorId);
  steps.push({
    step: "express_link",
    ok: onboard.ok,
    accountId: onboard.accountId || null,
    urlPresent: !!onboard.onboardingUrl,
    error: onboard.error || null,
  });

  let browserOk = false;
  let browserHost = "";
  if (onboard.onboardingUrl) {
    try {
      const browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();
      page.setDefaultTimeout(45_000);
      await page.goto(onboard.onboardingUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await page.waitForTimeout(2000);
      browserHost = new URL(page.url()).host;
      browserOk = /stripe|elixstarlive/i.test(browserHost);
      await browser.close();
    } catch (e) {
      steps.push({
        step: "express_browser_error",
        error: e instanceof Error ? e.message : "browser_failed",
      });
    }
  }
  const refreshed = await refreshPayoutAccountStatus(creatorId);
  steps.push({
    step: "express_browser",
    opened: browserOk,
    host: browserHost,
    payoutsEnabled: refreshed.payoutsEnabled ?? null,
    verificationStatus: refreshed.verificationStatus || null,
    expressVerified:
      browserOk && refreshed.payoutsEnabled === true && refreshed.verificationStatus === "verified",
  });

  // Transfer rail: Express if ready, else labeled dashboard:none recipient
  const stripeV2 = new Stripe(key, { apiVersion: "2026-07-29.preview" as never });
  const usedExpressForTransfer = !!refreshed.payoutsEnabled;
  let transferAccountId = onboard.accountId || null;
  if (!usedExpressForTransfer) {
    const ready = await createTransfersActiveRecipient(stripeV2, creatorId);
    transferAccountId = ready.accountId;
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
      [`pac_${randomUUID()}`, creatorId, transferAccountId],
    );
    steps.push({
      step: "transfer_recipient_fallback",
      accountId: transferAccountId,
      transfersStatus: ready.transfersStatus,
      expressVerified: false,
    });
  }

  const stripe = new Stripe(key, { apiVersion: "2025-01-27.acacia" as never });
  // Fund platform GBP if needed
  const bal = await stripe.balance.retrieve();
  const gbp = Math.floor(Number(bal.available.find((b) => b.currency === "gbp")?.amount || 0));
  if (gbp < 2000) {
    await stripe.charges.create({
      amount: 10000,
      currency: "gbp",
      source: "tok_bypassPending",
      description: "elix_monet_activation_topup",
    });
  }

  await postLedgerEntryStandalone({
    idempotencyKey: `monet_act_earn:${creatorId}`,
    revenueSource: "CREATOR_REWARD",
    creatorUserId: creatorId,
    grossPence: 2500,
    netRevenuePence: 2500,
    creatorPct: 100,
    creatorAmountPence: 2500,
    platformPct: 0,
    platformAmountPence: 0,
    status: "available",
    ruleSnapshot: { monetisation_activation: true },
  });

  const walletBefore = (
    await pool.query(
      `SELECT available_pence, held_pence, withdrawn_pence FROM elix_creator_wallet_gbp WHERE user_id = $1`,
      [creatorId],
    )
  ).rows[0];

  const wdReq = await requestGbpWithdrawal({
    creatorUserId: creatorId,
    amountPence: 1000,
    idempotencyKey: `monet_act_wd:${creatorId}`,
  });
  steps.push({ step: "withdraw_request", result: wdReq });
  let transferId: string | null = null;
  let wdId = "";
  if (wdReq.ok) {
    wdId = wdReq.id;
    await adminSetGbpWithdrawalStatus({
      withdrawalId: wdId,
      toStatus: "approved",
      adminUserId: "system:monet_activation",
    });
    const s1 = await submitWithdrawalToProvider({
      withdrawalId: wdId,
      adminUserId: "system:monet_activation",
    });
    const s2 = await submitWithdrawalToProvider({
      withdrawalId: wdId,
      adminUserId: "system:monet_activation",
    });
    transferId = typeof s1.providerRef === "string" ? s1.providerRef : null;
    steps.push({
      step: "submit_transfer",
      ok: s1.ok,
      transferId,
      idempotent: s1.ok && s2.ok && s1.providerRef === s2.providerRef,
    });

    if (transferId) {
      let whsec = (process.env.STRIPE_WEBHOOK_SECRET_TEST || "").trim();
      if (!whsec.startsWith("whsec_")) whsec = `whsec_${randomUUID().replace(/-/g, "")}`;
      for (const type of ["transfer.created", "transfer.updated"] as const) {
        const eventId = `evt_monet_${randomUUID()}`;
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
              reversed: false,
              metadata: { elix_withdrawal_id: wdId },
            },
          },
        });
        const header = stripe.webhooks.generateTestHeaderString({ payload, secret: whsec });
        const event = stripe.webhooks.constructEvent(payload, header, whsec);
        const wh = await handleStripeConnectPayoutWebhook(event);
        steps.push({ step: `handler_${type}`, ok: wh.ok, eventId });
      }
    }
  }

  // Fail/reverse path
  await postLedgerEntryStandalone({
    idempotencyKey: `monet_act_fail_earn:${creatorId}`,
    revenueSource: "CREATOR_REWARD",
    creatorUserId: creatorId,
    grossPence: 500,
    netRevenuePence: 500,
    creatorPct: 100,
    creatorAmountPence: 500,
    platformPct: 0,
    platformAmountPence: 0,
    status: "available",
    ruleSnapshot: { monetisation_activation: true },
  });
  const wdFail = await requestGbpWithdrawal({
    creatorUserId: creatorId,
    amountPence: 500,
    idempotencyKey: `monet_act_wd_fail:${creatorId}`,
  });
  if (wdFail.ok) {
    const failRef = `tr_fail_${randomUUID().slice(0, 8)}`;
    await adminSetGbpWithdrawalStatus({
      withdrawalId: wdFail.id,
      toStatus: "processing",
      adminUserId: "system:monet_activation",
      payoutProviderRef: failRef,
    });
    let whsec = (process.env.STRIPE_WEBHOOK_SECRET_TEST || "").trim();
    if (!whsec.startsWith("whsec_")) whsec = `whsec_${randomUUID().replace(/-/g, "")}`;
    const eventId = `evt_monet_rev_${randomUUID()}`;
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
    const event = stripe.webhooks.constructEvent(payload, header, whsec);
    await handleStripeConnectPayoutWebhook(event);
    const pf = await pool.query(
      `SELECT id, creator_amount_pence, platform_amount_pence FROM elix_financial_ledger
        WHERE revenue_source='PAYOUT_FAILURE' AND (rule_snapshot->>'withdrawal_id')=$1`,
      [wdFail.id],
    );
    steps.push({
      step: "reverse_restore",
      eventId,
      payoutFailureId: pf.rows[0]?.id || null,
      creatorCredited: Number(pf.rows[0]?.creator_amount_pence || 0) > 0,
      platformCredited: Number(pf.rows[0]?.platform_amount_pence || 0) > 0,
    });
  }

  const walletAfter = (
    await pool.query(
      `SELECT available_pence, held_pence, withdrawn_pence FROM elix_creator_wallet_gbp WHERE user_id = $1`,
      [creatorId],
    )
  ).rows[0];
  const wdRow = wdId
    ? (
        await pool.query(
          `SELECT id, status, payout_provider_ref FROM elix_creator_withdrawals_gbp WHERE id=$1`,
          [wdId],
        )
      ).rows[0]
    : null;

  // For You
  const fyCfg = await loadForYouConfig();
  const videoId = `vid_${randomUUID()}`;
  await pool.query(
    `INSERT INTO videos (id, user_id, url, privacy, created_at)
     VALUES ($1,$2,'https://cdn.example/test.mp4','public',NOW())
     ON CONFLICT (id) DO NOTHING`,
    [videoId, creatorId],
  ).catch(async () => {
    await pool.query(
      `INSERT INTO videos (id, user_id, created_at) VALUES ($1,$2,NOW()) ON CONFLICT DO NOTHING`,
      [videoId, creatorId],
    );
  });
  await enrollVideoInForYou({ videoId, creatorUserId: creatorId, privacy: "public" });
  const viewer = `viewer_${randomUUID()}`;
  for (let i = 0; i < 5; i++) {
    await pool.query(
      `INSERT INTO elix_qualified_video_views (video_id, viewer_user_id, creator_user_id, watch_seconds)
       VALUES ($1,$2,$3,30) ON CONFLICT DO NOTHING`,
      [videoId, viewer, creatorId],
    ).catch(() => {});
  }
  await onQualifiedUniqueViewForFeed({ videoId, creatorUserId: creatorId });
  const qv = await pool.query(
    `SELECT COUNT(*)::int AS c FROM elix_qualified_video_views WHERE video_id=$1`,
    [videoId],
  );
  const fyState = await pool.query(
    `SELECT stage, qualified_unique_views FROM elix_video_foryou_state WHERE video_id=$1`,
    [videoId],
  );
  steps.push({
    step: "for_you",
    promotionThreshold: fyCfg.promotionQualifiedViews,
    reentryAdditional: fyCfg.reentryAdditionalQualifiedViews,
    qualifiedViews: qv.rows[0]?.c,
    oneUserOneView: Number(qv.rows[0]?.c) === 1,
    stage: fyState.rows[0]?.stage || null,
  });

  const periodId = await openCreatorRewardPeriod({
    startsAt: new Date(Date.now() - 86400000),
    endsAt: new Date(Date.now() + 86400000 * 29),
  });
  steps.push({ step: "rewards_period_open", periodId });

  const appleRows = parseAppleFinancialCsv(
    "Provider,Provider Country,SKU,Developer,Title,Version,Product Type Identifier,Units,Developer Proceeds,Begin Date,End Date,Customer Currency,Country Code,Currency of Proceeds,Apple Identifier,Customer Price,Promo Code,Parent Identifier,Subscription,Period,Category\nAPPLE,GB,coins_100,Elix,Coins,1,1F,1,6.99,08/01/2026,08/01/2026,GBP,GB,GBP,123,9.99,,,,,",
  );
  const googleRows = parseGoogleEarningsCsv(
    "Description,Transaction Date,Transaction Time,Tax Type,Transaction Type,Sku Id,Product Title,Product Type,Hardware,Buyer Country,Buyer State,Buyer Postal Code,Buyer Currency,Amount (Buyer Currency),Currency Conversion Rate,Merchant Currency,Amount (Merchant Currency)\nCoins,2026-08-01,12:00:00,,Charge,coins_100,Coins,inapp,,GB,,,GBP,9.99,1,GBP,6.99",
  );
  steps.push({
    step: "store_csv_parsers",
    appleRows: appleRows.length,
    googleRows: googleRows.length,
    officialCsvImported: false,
  });

  const reconcile = await runWalletLedgerReconciliation();
  const ledger = await pool.query(
    `SELECT id, revenue_source, status, creator_amount_pence, platform_amount_pence
       FROM elix_financial_ledger WHERE creator_user_id=$1 ORDER BY created_at`,
    [creatorId],
  );

  const evidence = {
    finishedAt: new Date().toISOString(),
    productionCommit: health.commit,
    localTip,
    tipDeployedOnCoolify: steps[0]?.tipDeployed === true,
    coolifyDeploy: "MISSING_NO_CREDENTIALS",
    creatorId,
    expressAccountId: onboard.accountId || null,
    transferAccountId,
    usedExpressForTransfer,
    transferId,
    withdrawalId: wdId || null,
    withdrawalStatus: wdRow?.status || null,
    walletBefore,
    walletAfter,
    ledgerEntryIds: ledger.rows.map((r) => r.id),
    ledgerRows: ledger.rows,
    reconcile: {
      ok: (reconcile as { ok?: boolean }).ok === true,
      mismatchCount: ((reconcile as { mismatches?: unknown[] }).mismatches || []).length,
      runId: (reconcile as { runId?: number }).runId ?? null,
    },
    steps,
  };
  const file = path.join(
    root,
    "docs/evidence",
    `production-monetisation-activation-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
  );
  fs.writeFileSync(file, JSON.stringify(evidence, null, 2));
  console.log(
    JSON.stringify(
      {
        evidenceFile: file,
        productionCommit: health.commit,
        tipDeployedOnCoolify: evidence.tipDeployedOnCoolify,
        transferId,
        withdrawalStatus: wdRow?.status || null,
        reconcile: evidence.reconcile,
        expressVerified: steps.find((s) => s.step === "express_browser")?.expressVerified,
        usedExpressForTransfer,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
