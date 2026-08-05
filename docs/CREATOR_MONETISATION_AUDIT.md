# Creator Monetisation — Post-Deploy Evidence Audit

**Date:** 2026-08-05  
**Rule:** Labels only VERIFIED | PARTIAL | MISSING. Do not claim complete / production-ready.

## Git & deployment

| Field | Value |
|--------|--------|
| Branch | `main` |
| Deployed commit | `5ad807aea95050c34fc64204b7c719609c2f3139` |
| Contains `c6f49ff` | **YES** (`git merge-base --is-ancestor c6f49ff 5ad807a` → OK) |
| Ancestry | `c6f49ff` → `5ad807a` (Shop/Share commit on top of monetisation) |
| Health (no longer `f850ab3`) | `status=ok`, `commit=5ad807a…`, Neon/Valkey/LiveKit/Bunny/push all true |
| Observed uptime at verify | ~670s after new container start |
| Coolify Deployment ID | **NOT AVAILABLE** from this environment (no Coolify API token/webhook); deploy confirmed via public `/api/health` commit SHA |
| Start/completion timestamps | Coolify UI timestamps not accessible; health `timestamp` at verify: `2026-08-05T14:13:47.274Z` |

### Migration

| Field | Value |
|--------|--------|
| Command | `npx tsx server/migrate.ts` (applied against Neon `neondb`) |
| Result | `[migrate] applying` → `[migrate] applied` for `20260805140000_payout_provider_financial_reports.sql` |
| Row count in `elix_schema_migrations` | **1** (exactly once) |
| Applied at | `2026-08-05T14:09:37.643Z` |
| Tables present | `elix_creator_payout_accounts`, `elix_payout_provider_events`, `elix_store_financial_reports`, `elix_store_financial_report_lines`, `elix_fraud_reviews` |
| Note | Local Valkey cache invalidate failed (DNS ENOTFOUND from workstation); migration itself committed successfully |

## Endpoint mounting (unauthenticated)

| Endpoint | Status | Meaning |
|----------|--------|---------|
| `GET /api/creator/payout-account` | **401** | mounted |
| `POST /api/creator/payout-account/onboard` | **401** | mounted |
| `GET /api/creator/balance` | **401** | mounted |
| `GET /api/creator/ledger` | **401** | mounted |
| `GET /api/creator/withdrawals-gbp` | **401** | mounted |
| `GET /api/admin/monetisation/reports/dashboard` | **401** | mounted |
| `POST /api/admin/monetisation/financial-reports/import` | **401** | mounted |
| `POST /api/admin/monetisation/withdrawals-gbp/:id/submit-provider` | **401** | mounted |
| `POST /api/stripe-webhook` | **400** | mounted (signature required) |
| `GET /admin/monetisation` | **200** | SPA loads |

## Admin UI (deployed chunk `Monetisation-SiIgCkSl.js`)

Verified strings present:

- Submit Stripe payout
- Manual offline paid
- Financial report import
- Ops dashboard
- Import report

Manual offline remains labelled exception (not Stripe-confirmed).

## Scheduled jobs

Cannot read Coolify container logs from this environment. Code in `server/index.ts` starts rewards period tick (hourly) and reconciliation (6h) on boot. Server process is healthy (`uptime` reset, `status=ok`, DB connected). **Log-level “started once” evidence: NOT VERIFIABLE remotely.**

## Stripe test-mode verification

| Check | Result |
|--------|--------|
| Local/Coolify key available to agent | Local `.env` has **`sk_live_`** |
| Transfer / Connect onboard executed | **SKIPPED** — policy requires `sk_test_` only |
| Stripe test transfer ID | `null` |
| Signed test webhook processed | **NOT RUN** (would need test key + webhook secret) |

**Blocker:** Configure Coolify + local with `sk_test_…` for payout-provider sandbox verification. Do not use live keys for Connect transfers.

## Financial-report settlement (sandbox sibling only)

Evidence file: `docs/evidence/monetisation-postdeploy-2026-08-05T14-16-50-641Z.json`

| Field | Value |
|--------|--------|
| Database | `elix_money_it` (not production destructive IT) |
| Report ID | `sfr_c5447daa-c597-46e8-a089-c7bf886e67b6` |
| Store txn | `TEST_TXN_12d848e4-51dc-4b0b-9a4a-debd2b19b02b` |
| Paid-coin lot | `lot_4ebeac6f-f97e-4a9a-9f7b-caadeca25202` |
| Gift ID | `gift_42f68388-4404-450f-9874-62c68d2ca463` |
| Creator ledger | `led_gift_4fe2d77a-7cfe-46c9-baea-3240a886da2c` |
| Creator/platform | 180p / 120p |
| Withdrawal | `wdgbp_81a13856-9ffc-400d-bcd1-6b5ba4537e53` status `processing` (simulated provider ref) |
| Duplicate import | rejected via `import_hash` unique |
| Unmatched lines | 1 |
| Commission invented | **false** (300p from 9.99−6.99) |
| Label | `TEST_EVIDENCE_NOT_PRODUCTION_APPLE` |

## Preserved prior test evidence

- §22 isolated Neon suite: **42 passed, 0 failed, 0 skipped** on `elix_money_it`
- Unit monetisation: **33 passed**
- Production `neondb` was **not** used for destructive IT

## Status table (post-deploy)

| # | Requirement | Status |
|---|-------------|--------|
| 1 | Store settlement | **PARTIAL** — ingest live; no official production Apple/Google report imported |
| 2 | Gift 60/40 | **PARTIAL** — code + sandbox evidence; not report-matched provider-paid |
| 3 | Subscription 60/40 | **PARTIAL** |
| 4 | Promote Video | **PARTIAL** |
| 5 | Creator Rewards | **PARTIAL** — jobs coded; period→paid not proven on deploy |
| 6 | One qualified view | **VERIFIED** |
| 7 | GBP withdrawal / provider rail | **PARTIAL** — endpoints live; Stripe **test** paid confirmation blocked by live key |
| 8 | Refund/chargeback chain | **PARTIAL** |
| 9 | Reconciliation | **PARTIAL** |
| 10 | Admin UI | **PARTIAL** — required controls present in deployed chunk |
| 11 | Creator GBP dashboard | **PARTIAL** — APIs mounted; diamonds not cash rail |
| 12 | Admin reports dashboard | **PARTIAL** — endpoint mounted |
| 13 | Fraud | **PARTIAL** |
| 14 | §22 DB matrix | **VERIFIED** |
| 15 | Live-money / provider-paid E2E | **PARTIAL** / **MISSING** for Stripe-confirmed paid |

## Remaining blockers

1. Coolify Deployment ID / release log export (need Coolify UI or API token).
2. Job start log lines (need container logs).
3. `sk_test_` Stripe Connect sandbox → real transfer ID + webhook → `paid`.
4. Official production App Store / Play financial report import (not TEST CSV).
5. Full gift→report-matched→provider-paid chain on deployed environment.
