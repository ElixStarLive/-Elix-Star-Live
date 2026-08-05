# Stripe Connect / checkout — gate status (2026-08-05)

## Pushed commits (`origin/main`)

| SHA | Message |
|-----|---------|
| `5a98e301017323b5d6a80729d4aab1ec48e7d99e` | Separate Stripe test Connect key path and add sandbox proof runner |
| `714f6c5babde99132a88ff75389f1154f82d4874` | Migrate Connect onboarding to Accounts v2 recipient API |
| `6f9ecf0128ba3bea73fc22f0d8eebb237fd0db3e` | Complete Stripe Connect test proof and enable dynamic Checkout methods |

Tip of `origin/main` after push: **`6f9ecf0128ba3bea73fc22f0d8eebb237fd0db3e`**

Secret scan of those commits: no `sk_test_` / `sk_live_` / `whsec_` material values. `.env` not committed.

## Status labels

| Item | Status |
|------|--------|
| Stripe Connect sandbox transfer proof | **VERIFIED** |
| Checkout dynamic payment methods | **VERIFIED** |
| Isolated sibling reconcile (`elix_connect_proof`) | **VERIFIED** — `ok: true`, `mismatches: 0` |
| Production Stripe webhook configuration | **PARTIAL** |
| Express hosted onboarding | **PARTIAL** |
| GBP payout rail in production | **PARTIAL** |
| Financial reconciliation (production) | **PARTIAL** |
| Creator payouts production-ready | **NO** |

## Isolated reconcile evidence

- Database: `elix_connect_proof`
- Test-run: `iso_20260805_195709`
- Command: `npm run test:stripe:connect-proof:isolated` → `npx tsx server/scripts/runConnectProofReconcile.ts`
- Result: `ok: true`, `mismatchCount: 0`
- Evidence: `docs/evidence/connect-proof-reconcile-elix_connect_proof-2026-08-05T18-57-35-981Z.json`
- Connect proof: `docs/evidence/stripe-connect-test-proof-2026-08-05T18-57-33-798Z.json`
  - Transfer: `tr_1U1A0PEBKv1hetTHnL8lIOCH`
  - Express account (link path): `acct_1U1A0BEBKv35pPiw`
  - Transfers-active recipient: `acct_1U1A0IEBKvGo47QK`

## Prior `elix_money_it` 31 mismatches

Not deleted. Classified as **Invalid historical test data / Test fixture residue** from money IT + prior proof wallet seeds (wallet_vs_ledger / platform_wallet_vs_ledger). Isolated DB replaces that as payout evidence.

## Owner actions remaining

1. **Rotate** exposed `sk_test_` in Stripe Dashboard; put new value only in Coolify + local `.env` as `STRIPE_SECRET_KEY_TEST`. Confirm old key revoked.
2. Copy local `STRIPE_WEBHOOK_SECRET_TEST` into Coolify (do not paste in chat). Endpoint created: `we_1U1A0xEBKv1hetTHTx1CPf9L` → `https://www.elixstarlive.co.uk/api/stripe-webhook` (test mode).
3. **Redeploy** Coolify from `origin/main` @ `6f9ecf0+` (health still showed `66da5bf` at check time).
4. Run `npm run migrate` on production Neon; confirm For You migrations.
5. Complete **Express** browser onboarding for a test Account Link (do not use API-forced capability as Express proof).
6. Radar for Platforms in Dashboard.
7. Official Apple + Google CSV import; production reconcile = 0.
8. Do not enable `automatic_tax` until UK Tax registration confirmed.

## Creator payouts production-ready

**NO** until rotated key, Coolify webhook secret, Express hosted onboarding, prod migrate/redeploy, official store reports, and production reconcile zero mismatches are done.
