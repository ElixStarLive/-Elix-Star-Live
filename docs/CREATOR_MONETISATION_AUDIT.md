# Creator Monetisation — Evidence Audit

**Date:** 2026-08-05  
**Rule:** Do not claim production-complete. Labels only: VERIFIED | PARTIAL | MISSING.

## Status table

| # | Requirement | Status | Evidence / gaps |
|---|-------------|--------|-----------------|
| 1 | Automatic store settlement | **PARTIAL** | JWS/catalog provisional gross + admin financial-report CSV ingest (`financialReports.ts`, `docs/STORE_FINANCIAL_SETTLEMENT.md`). No production report file reconciled yet. Commission never invented. |
| 2 | Gift GBP 60/40 automatic | **PARTIAL** | Settled lots → ledger. Matrix proves 60/40 pennies. Needs verified report net for final truth. |
| 3 | Subscription automatic 60/40 | **PARTIAL** | Auto-post on create/renew + matrix idempotency/refund signs. |
| 4 | Promote automatic platform 100% | **PARTIAL** | Auto-post + matrix. |
| 5 | Creator Rewards automation | **PARTIAL** | Cron + eligibility flags (country/age/public/follower growth/manual review). Originality still soft. |
| 6 | One qualified view | **VERIFIED** | PK + concurrent test on `elix_money_it`. Files: `monetisationMatrix.db.test.ts`, `qualifiedViews.ts`. |
| 7 | GBP withdrawals + provider rail | **PARTIAL** | Stripe Connect Express onboard/submit/webhook/idempotency + audited `manual_offline` exception. Live sandbox Connect payout to a verified creator account not yet confirmed paid end-to-end. |
| 8 | Refund GBP reverse | **PARTIAL** | Reverse chain + matrix maturity/chargeback-after-withdraw paths. |
| 9 | Reconciliation job | **PARTIAL** | Job + admin run; matrix executes runner. |
| 10 | Admin monetisation UI | **PARTIAL** | Config, ops dashboard, report import, provider submit, manual exception. |
| 11 | Creator dashboard GBP | **PARTIAL** | GBP withdraw + ledger; diamonds not cash rail. Payout-account onboard API added. |
| 12 | Admin reports | **PARTIAL** | `/reports/dashboard` aggregates unsettled/settled/unmatched/gifts/subs/promote/rewards/withdrawals/fraud/wallets. |
| 13 | Fraud real | **PARTIAL** | Velocity, view-farm, multi-account device, follower growth, country/age, manual review, audit history. Not full ML purchased-engagement. |
| 14 | Full §22 test matrix | **VERIFIED** | Isolated Neon sibling `elix_money_it`. **42/42 passed**, 0 skipped. Command: `npm run test:money:sibling`. |
| 15 | E2E demonstrated | **PARTIAL** | Sandbox simulation evidence in `docs/evidence/monetisation-e2e-*.json` (ledger/withdrawal IDs). Live Stripe Connect `paid` + official store report match still outstanding. |

## Blockers that remain PARTIAL / MISSING

| Blocker | Status |
|---------|--------|
| Verified App Store / Play commission from financial reports (production import) | **PARTIAL** (ingest code + docs; no live report reconciled) |
| Live GBP payout-provider confirmation (sandbox Connect account → paid) | **PARTIAL** (code wired; live paid confirmation pending) |
| Full §22 database integration suite | **VERIFIED** on `elix_money_it` |
| Recorded end-to-end with live provider-paid + report settlement | **PARTIAL** / effectively **MISSING** for live paid |

## §22 test run (this session)

- **Test database:** Neon sibling `elix_money_it` (source `neondb` untouched)
- **Migration:** applied via test `beforeAll` (`elix_schema_migrations` + all `server/migrations/*.sql`)
- **Command:** `npm run test:money:sibling`
- **Result:** Test Files 3 passed; Tests **42 passed**; **0 failed**; **0 skipped**
- Files: `moneyIntegration.test.ts`, `monetisation.db.test.ts`, `monetisationMatrix.db.test.ts`

## Key new files

- `server/lib/monetisation/payoutProvider.ts`
- `server/lib/monetisation/financialReports.ts`
- `server/lib/monetisation/monetisationMatrix.db.test.ts`
- `server/migrations/20260805140000_payout_provider_financial_reports.sql`
- `docs/STORE_FINANCIAL_SETTLEMENT.md`
- `docs/evidence/monetisation-e2e-*.json`
- `server/scripts/monetisationE2eEvidence.ts` / `runMonetisationE2eSibling.ts`
