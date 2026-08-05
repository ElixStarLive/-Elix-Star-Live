# Creator monetisation gate audit — 2026-08-05

Labels only: **VERIFIED** | **PARTIAL** | **MISSING**

## Deployed commit

| Field | Value |
|-------|--------|
| `origin/main` tip | `9ec1da3450a7dcca85679ecd64255db1d59b7256` |
| Contains `e1b9823` | yes (ancestor) |
| Contains `9ec1da3` | yes (tip) |
| Production `/health` commit | `9ec1da3450a7dcca85679ecd64255db1d59b7256` |
| Production uptime at check | ~337s (fresh deploy) |
| Status | **VERIFIED** |

## Migrations / Neon

| Field | Value |
|-------|--------|
| Database | `neondb` (Neon `ep-autumn-meadow-…eu-west-2`) |
| Migration count | 53 |
| Last migration | `20260805160000_for_you_feed_and_platform_wallet.sql` |
| Applied exactly once | yes (`elix_schema_migrations`) |
| Status | **VERIFIED** |

## Production endpoints

| Path | Probe | Status |
|------|-------|--------|
| `/health` | 200 + tip commit | **VERIFIED** |
| `/api/creator/payout-account` | 401 mounted | **VERIFIED** |
| `/api/creator/balance` | 401 mounted | **VERIFIED** |
| `/api/creator/withdrawals-gbp` | 401 mounted | **VERIFIED** |
| `/api/admin/monetisation/*` | 401 mounted | **VERIFIED** |
| `/api/stripe-webhook` unsigned | 400 | **VERIFIED** (mounted) |
| `/api/stripe-webhook` signed test | 400 Invalid signature | **PARTIAL** — tip dual-secret code deployed; Coolify lacks matching `STRIPE_WEBHOOK_SECRET_TEST` (no Coolify API credentials in agent env) |

Webhook endpoint (Stripe test): `we_1U1AtmEBKv1hetTHuvhFzbcK` → `https://www.elixstarlive.co.uk/api/stripe-webhook`  
Local secret rotated into `.env` only (not logged). Delivery IDs recorded in `docs/evidence/stripe-webhook-rotate-*.json`.

## Stripe Connect / GBP rail (test mode, production Neon)

Evidence: `docs/evidence/production-monetisation-activation-2026-08-05T19-46-59-911Z.json`

| Item | ID / result | Status |
|------|-------------|--------|
| Express Account Link opened | `acct_1U1AltEBKvoA6k5s`, host `connect.stripe.com` | **PARTIAL** (browser opened; `payouts_enabled=false` — headless TOS/KYC not finished) |
| Transfers-active recipient (sandbox fallback) | `acct_1U1Am9EBKvFRtti8` | used for rail; **not** Express VERIFIED |
| Withdrawal | `wdgbp_3e86733b-9d2c-42e1-8ea2-079165d490e4` → `paid` | **VERIFIED** |
| Transfer | `tr_1U1AmFEBKv1hetTHNQoUUAUu` | **VERIFIED** |
| Idempotent resubmit | same `tr_…` | **VERIFIED** |
| Signed handler `transfer.created` | `evt_monet_022eddbf-7a45-466c-a843-98ac9cc57e29` | **VERIFIED** (tip handler path) |
| Signed handler `transfer.updated` | `evt_monet_76ce5f38-8a00-4a28-87a6-5e8cc7e8ccad` | **VERIFIED** |
| Reverse restore | `evt_monet_rev_b3cfc906-40cc-4065-80c7-ba2872ea6373` | **VERIFIED** |
| `PAYOUT_FAILURE` | ledger `0ff174d5-112e-4719-901b-36aa116ea102` creator 500 / platform 0 | **VERIFIED** |
| Wallet before → after | available 2500→2000; withdrawn 0→1000 | **VERIFIED** |

## Reconciliation (production Neon)

| Run | Result |
|-----|--------|
| After activation | `ok: true`, `mismatchCount: 0`, runId 4 |
| After rewards | `ok: true`, `mismatchCount: 0`, runId 8 |
| Status | **VERIFIED** |

## Creator Rewards

Evidence: `docs/evidence/creator-rewards-eligible-2026-08-05T20-27-13-489Z.json`

| Field | Value |
|-------|--------|
| Period | `crp_2026-08_7257d707` |
| Result | `approved`, `reward_pence: 500`, `eligible: true` |
| Ledger | `da700728-f945-4061-ab0f-8e258355188d` |
| Min followers enforced | 8000 (code + fraud growth window) |
| Prev-30d gate | enforced (`below_min_prev_30d_qualified_views` when unmet) |
| Fraud not hardcoded off | `manipulated_engagement` blocked bulk same-day follows |
| Status | **VERIFIED** (period open/close + credit on Neon; hourly job code in `server/index.ts` when `ELIX_JOB_WORKER=1`) |

## For You

| Check | Result | Status |
|-------|--------|--------|
| Config thresholds | promotion 5000, reentry +1000 | **VERIFIED** |
| One user × 5 watches | `qualifiedViews: 1` | **VERIFIED** |
| Stage | `initial` | **VERIFIED** |
| Migration present | `20260805160000_…` | **VERIFIED** |
| Client-side ranking removed | backend `foryouQuery` / lifecycle | **VERIFIED** (code) |

## Apple / Google settlement

| Check | Status |
|-------|--------|
| Admin Import report UI + parsers | **VERIFIED** (Apple 1 row / Google 1 row fixture parse) |
| Official App Store / Play CSV import | **MISSING** — official closed-period reports not available from connected store accounts |

## Radar / Tax

| Item | Status |
|------|--------|
| Radar for Platforms | **PARTIAL** — Dashboard-only; no Stripe API enable from agent; checklist in `docs/STRIPE_RADAR_TAX_CHECKLIST.md` |
| Stripe Tax / `automatic_tax` | **MISSING** (by design — UK registration) |

## Exact remaining external dependencies

1. **Coolify env write access** — set `STRIPE_WEBHOOK_SECRET_TEST` (and keep `STRIPE_SECRET_KEY_TEST`) to the rotated local `.env` value so production signed deliveries accept. Agent has **no** `COOLIFY_TOKEN` / `COOLIFY_APP_UUID`.
2. **Interactive Express TOS/KYC** — finish Account Link in a real browser for a test creator until `payouts_enabled=true` (headless cannot complete Stripe hosted identity).
3. **Official Apple + Google financial CSVs** — import via `/admin/monetisation` when store reports exist.
4. **Radar Dashboard toggle** — enable Radar for Platforms; fill checklist table.

## Creator monetisation production-ready

**NO** — production tip is deployed and Neon rail/reconcile/rewards/For You evidence exists, but signed production webhook acceptance, Express TOS completion, official store CSVs, and Radar Dashboard remain not all **VERIFIED**.
