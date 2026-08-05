# Stripe Connect / checkout — gate status (2026-08-05)

## Pushed commits (`origin/main`)

| SHA | Message |
|-----|---------|
| `5a98e301017323b5d6a80729d4aab1ec48e7d99e` | Separate Stripe test Connect key path and add sandbox proof runner |
| `714f6c5babde99132a88ff75389f1154f82d4874` | Migrate Connect onboarding to Accounts v2 recipient API |
| `6f9ecf0128ba3bea73fc22f0d8eebb237fd0db3e` | Complete Stripe Connect test proof and enable dynamic Checkout methods |
| `5e4b50017a3e5750c08abbe77015234823e6d127` | Isolate Connect proof reconcile to zero mismatches; dual webhook secrets |
| `e1b98231080ba46e8e8b76a3c0fc745f8c7c4ea7` | Fix PAYOUT_FAILURE creator restore and WITHDRAWAL reconcile |

Tip of `origin/main`: **`e1b98231080ba46e8e8b76a3c0fc745f8c7c4ea7`**

Secret scan: no `sk_test_` / `sk_live_` / `whsec_` material values in commits. `.env` not committed.

## Status labels (VERIFIED | PARTIAL | MISSING only)

| Item | Status | Evidence |
|------|--------|----------|
| Stripe Connect sandbox transfer proof | **VERIFIED** | `tr_1U1ADhEBKv1hetTHUIg566g3` (latest isolate) |
| Checkout dynamic payment methods | **VERIFIED** | `server/routes/checkout.ts` (no forced `payment_method_types`) |
| Isolated sibling reconcile (`elix_connect_proof`) | **VERIFIED** | `ok: true`, `mismatchCount: 0`, full reversed/failed handlers |
| PAYOUT_FAILURE creator-only restore | **VERIFIED** (code) | `gbpWithdrawals.ts` — no platform credit; held WITHDRAWAL required |
| WITHDRAWAL held/paid reconcile | **VERIFIED** (code) | `reconcile.ts` uses `rule_snapshot.amount_pence` / gross |
| Production health commit matches tip | **MISSING** | `/health` still `66da5bf…` (not tip) |
| Production Stripe webhook signed deliveries | **PARTIAL** | Route mounts (400 without sig); Coolify `STRIPE_WEBHOOK_SECRET_TEST` + live deliveries not evidenced |
| Express hosted onboarding (browser TOS) | **PARTIAL** | Account Link path in code; no browser TOS completion IDs |
| GBP payout rail on deployed app | **PARTIAL** | Sandbox isolate VERIFIED; production rail not run on tip |
| Financial reconciliation (production) | **PARTIAL** | Sibling isolate 0; production Neon not re-proven on tip |
| Official Apple CSV settlement | **MISSING** | No official CSV supplied |
| Official Google CSV settlement | **MISSING** | No official CSV supplied |
| Gift / sub / Promote E2E settlement | **MISSING** | Blocked on official store CSVs |
| For You + Creator Rewards (production) | **PARTIAL** | Sibling/migrate VERIFIED in isolate; prod migrate + activation not evidenced |
| Radar for Platforms | **PARTIAL** | Checklist ready; Dashboard enable = owner |
| Stripe Tax (`automatic_tax`) | **MISSING** (by design) | Off until UK registration |
| Creator monetisation production-ready | **NO** | Required gates above not all VERIFIED |

## Phase A — code fix evidence (this pass)

- Files: `server/lib/monetisation/gbpWithdrawals.ts`, `reconcile.ts`, `server/scripts/stripeConnectTestProof.ts`
- Isolated run: `npm run test:stripe:connect-proof:isolated`
- Connect proof: `docs/evidence/stripe-connect-test-proof-2026-08-05T19-11-17-348Z.json`
  - Transfer: `tr_1U1ADhEBKv1hetTHUIg566g3`
  - Express link account: `acct_1U1ADSEBKva1rS2h`
  - Transfers-active recipient: `acct_1U1ADaEBKvQgG8gv`
  - Handlers: `transfer.created`, `transfer.updated_as_paid`, `transfer.reversed`, `transfer.failed` all `handlerInvoked: true`
- Reconcile: `docs/evidence/connect-proof-reconcile-elix_connect_proof-2026-08-05T19-11-19-440Z.json`
  - `ok: true`, `mismatchCount: 0`, DB `elix_connect_proof`

## Production health (re-checked 2026-08-05T19:15Z)

```json
{"status":"ok","commit":"66da5bf780de3039bd97ec9fb5da0d153b5b7a55","timestamp":"2026-08-05T19:15:47.119Z"}
```

`origin/main` tip is `e1b9823…`. Production is still on `66da5bf…`. Until Coolify redeploys tip + sets test webhook env + migrate, production items stay PARTIAL/MISSING.

## Phase B–F agent verification (2026-08-05)

| Phase | Agent result | Gate |
|-------|--------------|------|
| B Coolify | Health ≠ tip; no Coolify access; cannot set env or migrate from here | **PARTIAL** / deploy **MISSING** |
| C Express | Code path `dashboard: "express"` + Account Link in `payoutProvider.ts`; no browser TOS IDs | **PARTIAL** |
| D GBP rail | Isolate sibling VERIFIED; deployed app rail not run on tip | **PARTIAL** |
| E Apple/Google CSV | Admin Import report UI present; no official CSVs supplied | **MISSING** |
| F For You / Rewards | Migrations apply on isolate; production activation not evidenced | **PARTIAL** |
| G Radar / Tax | Checklist updated; Dashboard not filled; Tax off by design | Radar **PARTIAL**; Tax **MISSING** |

## Owner actions remaining (cannot be faked from code)

1. **Rotate** exposed `sk_test_` in Stripe Dashboard; put new value only in Coolify + local `.env` as `STRIPE_SECRET_KEY_TEST`.
2. Copy local `STRIPE_WEBHOOK_SECRET_TEST` into Coolify (do not paste in chat). Endpoint: `we_1U1A0xEBKv1hetTHTx1CPf9L` → `https://www.elixstarlive.co.uk/api/stripe-webhook` (test mode).
3. **Redeploy** Coolify from `origin/main` tip (must leave `66da5bf` behind).
4. Run `npm run migrate` on production Neon.
5. Confirm `/health` commit matches tip; send Stripe Dashboard test deliveries for `account.updated`, `transfer.created`, `transfer.updated`, `transfer.reversed` (+ failed); record event IDs + delivery status.
6. Complete **Express** browser Account Link (TOS + test identity) via CreatorPayout → Set up Stripe Connect. Do not count API-forced `dashboard: none` as Express VERIFIED.
7. After Express + deploy: full GBP withdrawal rail on deployed app (request → approve → submit → paid / fail).
8. Official Apple + Google CSV import via `/admin/monetisation` → Import report.
9. For You + Creator Rewards production activation after migrate.
10. Radar for Platforms in Dashboard — fill [`docs/STRIPE_RADAR_TAX_CHECKLIST.md`](STRIPE_RADAR_TAX_CHECKLIST.md).
11. Do not enable `automatic_tax` until UK Tax registration confirmed.

## Creator payouts production-ready

**NO** until Coolify tip deploy, signed production webhook IDs, Express browser onboarding, deployed GBP rail, official store CSVs, production reconcile zero, and For You/Rewards production evidence are genuinely VERIFIED.
