# Creator Monetisation + For You — Status Audit

**Date:** 2026-08-05  
**Rule:** Labels only VERIFIED | PARTIAL | MISSING. Do **not** claim production-complete without evidence.

## This commit deliverables

| Area | What shipped |
|------|----------------|
| For You ranking | Backend-owned multi-signal ranker; stages `initial` → `promoted` / `removed` → `reentry_eligible` → `reentered` |
| Thresholds | Defaults **5000** promote / **1000** re-entry — stored in `elix_foryou_config` (admin-editable, not hardcoded in ranker) |
| Qualified views | Still one user = one qualified view; drives lifecycle transitions |
| Fraud admin | `/api/admin/monetisation/fraud-reviews` + outcome + admin UI queue |
| Platform ledger | `elix_platform_wallet_gbp` + deltas on ledger post + reconcile compare (no silent repair) |
| Creator wallet reconcile | pending/available/held/**withdrawn**/**reversed** checks |
| Creator Connect UI | Stripe Connect onboard wired on Creator Payout page |
| Admin For You | Config fields + sweep endpoint on Monetisation admin |

## Tests (isolated `elix_money_it` — production `neondb` untouched)

| Suite | Result |
|-------|--------|
| `npm run test:money:sibling` | **48 passed**, 0 failed (includes 6 For You DB tests + §22 matrix) |
| Unit `foryouRanking.test.ts` + `moneyMath.test.ts` | **28 passed** |

Evidence: local run 2026-08-05 ~15:41 UTC+1 — `[money-it] PASSED against isolated sibling DB`.

## Stripe Connect paid path

| Check | Result |
|--------|--------|
| Local `STRIPE_SECRET_KEY` | **`sk_live_`** |
| Test Connect transfer / webhook → `paid` | **SKIPPED** — policy requires `sk_test_` only |
| Status | **PARTIAL** / **MISSING** for live-money provider-paid E2E |

**Blocker:** Coolify + local must use `sk_test_…` to verify Express onboard + transfer + webhook `paid` with real `tr_…` IDs.

## Official Apple/Google financial reports

| Check | Result |
|--------|--------|
| CSV ingest + match code | PRESENT |
| Official production closed-period import | **NOT RUN** this session |
| Status | **PARTIAL** |

## Status table

| # | Requirement | Status |
|---|-------------|--------|
| 1 | Store settlement (Apple/Google verified financial data) | **PARTIAL** — auto-settle + CSV ingest present; no official prod report evidence this session |
| 2 | Gift 60/40 automatic | **PARTIAL** — code + prior sandbox evidence; not report-matched + provider-paid chain |
| 3 | Subscription 60/40 automatic | **PARTIAL** |
| 4 | Promote Video 100% platform | **PARTIAL** |
| 5 | Live GBP payout provider (Stripe Connect) | **PARTIAL** — code + creator onboard UI; test-mode paid blocked by live key |
| 6 | Creator GBP withdrawals + provider txn IDs | **PARTIAL** — rail + UI surfaces `payout_provider_ref`; Stripe-confirmed `paid` not proven |
| 7 | Refund/chargeback GBP ledger reversal | **PARTIAL** — matrix covered; store webhook E2E not re-run |
| 8 | Creator wallet reconciliation | **PARTIAL** — withdrawn/reversed checks added; needs clean production run evidence |
| 9 | Platform ledger reconciliation | **PARTIAL** — platform wallet + compare added |
| 10 | Full fraud detection | **PARTIAL** — signals + admin review queue wired |
| 11 | Full admin monetisation dashboard | **PARTIAL** — fraud + For You + prior ops controls |
| 12 | Full creator earnings dashboard | **PARTIAL** — Connect onboard + provider ref display added |
| 13 | Complete end-to-end testing | **PARTIAL** / **MISSING** for Stripe-confirmed paid + official store reports |
| 14 | Complete database integration tests | **VERIFIED** on sibling — **48 passed** including For You |
| 15 | For You: new videos enter feed | **VERIFIED** (DB IT enroll + feed query uses active stages) |
| 16 | For You: 5000 stay recommended | **VERIFIED** (DB IT promote stage) |
| 17 | For You: below threshold stop recommending (profile remains) | **VERIFIED** (DB IT removed excluded; video row kept) |
| 18 | For You: re-entry after +1000 | **VERIFIED** (DB IT) |
| 19 | One user ×30 = one qualified view | **VERIFIED** |
| 20 | Bots/duplicates excluded from qualified/ranking inputs | **PARTIAL** — fraud suite present; high-traffic load not separately load-tested this session |

## Remaining blockers to claim production-ready

1. Configure **`sk_test_`** Stripe + Connect webhook; complete one Express onboard → transfer → webhook → `paid`.
2. Import one official closed-period Apple + Google financial CSV on production admin; document match rates.
3. Apply migration `20260805160000_for_you_feed_and_platform_wallet.sql` on production via deploy migrate.
4. Production reconcile run with 0 mismatches (admin “Run now”).
5. Optional: store refund notification → ledger reverse evidence on sandbox.

## Honest verdict

**Not production-complete.** Code paths for monetisation + For You are substantially implemented and sibling-DB verified. Live Stripe-confirmed payouts and official store financial settlement remain **PARTIAL/MISSING**.
