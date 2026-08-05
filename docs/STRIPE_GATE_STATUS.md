# Creator monetisation — final status (2026-08-05T21:05Z)

Allowed labels in this file: **VERIFIED** | **MISSING_EXTERNAL_REPORT** only.

## VERIFIED

| Item | Evidence |
|------|----------|
| Tip on `origin/main` | `e0d2126` (webhook Neon fallback) contains ancestors `e1b9823` + `9ec1da3` + `601cfde` |
| Neon migrations | 54 applied including `20260805210000_runtime_config_webhook_secret.sql` |
| Neon webhook secret sync | `elix_runtime_config` key `STRIPE_WEBHOOK_SECRET_TEST` saved (`neonSecretSaved: true`) |
| Stripe test webhook endpoint | `we_1U1AtmEBKv1hetTHuvhFzbcK` → `https://www.elixstarlive.co.uk/api/stripe-webhook` |
| Production routes mounted (prior tip `9ec1da3`) | creator/admin 401; webhook unsigned 400 |
| GBP rail on production Neon + tip code path | transfer `tr_1U1AmFEBKv1hetTHNQoUUAUu`; withdrawal `wdgbp_3e86733b-…` paid; reconcile 0 |
| `PAYOUT_FAILURE` creator-only | ledger `0ff174d5-…` platform 0 |
| Creator Rewards credit on Neon | period `crp_2026-08_7257d707`; approved 500p; ledger `da700728-…`; reconcile 0 |
| For You unique view | 5 watches → 1 qualified view; thresholds 5000 / +1000 |
| Store CSV parsers + admin import path | Apple/Google fixture parsers; `/admin/monetisation` Import report |

## MISSING_EXTERNAL_REPORT

| Report | Where downloaded | Period | Why not imported now | Expected availability | Import procedure |
|--------|------------------|--------|----------------------|----------------------|------------------|
| Apple Payments / Financial Reports CSV | App Store Connect → **Payments and Financial Reports** (also Sales and Trends exports) | Closed fiscal/settlement period only | No closed-period official Apple CSV is present in the repo, admin uploads, or connected automation on this workstation | When Apple issues the next closed settlement period for the Elix Star Live legal entity (typically after period close + Apple processing; often mid-month following the reporting month) | `/admin/monetisation` → Financial reports → store=Apple → upload official CSV → server stores report ID, matches lots/subs/promote, rejects duplicate `import_hash`, leaves unmatched for ops |
| Google Play Earnings / Financial CSV | Play Console → **Download reports → Financial** (or Play Reporting / GCS bucket export) | Closed month earnings file | No closed-period official Google earnings CSV is present in the repo, admin uploads, or connected automation on this workstation | When Google publishes the monthly earnings report for the Play developer account after month close | `/admin/monetisation` → Financial reports → store=Google → upload official CSV → same match/settle/unmatched path as Apple |

## Cannot be labeled VERIFIED from this workstation

These are **not** store-report delays. They require Coolify panel/API credentials and/or an interactive Stripe Dashboard / Express browser session that are **not present** here:

| Requirement | Probe result |
|-------------|--------------|
| Coolify `COOLIFY_TOKEN` + `COOLIFY_APP_UUID` | MISSING in `.env`, process env, GitHub secrets, SSH |
| Coolify browser session | `coolifyLoggedIn: no` (`docs/evidence/dashboard-session-*.json`) |
| Stripe Dashboard session (Radar) | `stripeLoggedIn: no` |
| Production commit = tip `e0d2126` | **Still** `9ec1da3450a7dcca85679ecd64255db1d59b7256` (auto-deploy did not run for latest pushes) |
| Production signed webhook accept | 400 Invalid signature until tip with Neon fallback is live **or** Coolify env `STRIPE_WEBHOOK_SECRET_TEST` matches |
| Express `payouts_enabled=true` | Headless Account Link opens `connect.stripe.com` but does not finish hosted KYC/TOS |
| Radar for Platforms enable | Dashboard-only; no Stripe API; no logged-in Dashboard session |

Code already on `origin/main` for Coolify-independent webhook secret fallback: `server/lib/runtimeConfig.ts` + `webhook.ts` + migration. It activates only after Coolify runs a deploy of `e0d2126+`.

## Production-ready

**NO** — signed production webhook acceptance, Express TOS completion, Radar enable, and tip deploy are not VERIFIED.
