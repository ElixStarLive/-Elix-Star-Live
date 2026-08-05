# Creator Monetisation — Updated Evidence Audit (post-blocker work)

**Date:** 2026-08-05  
**Commit baseline:** work in progress after `dde96cd`  
**Rule:** Do not claim production-complete until every row is VERIFIED with E2E evidence.

## Status table

| # | Requirement | Status | Evidence / gaps |
|---|-------------|--------|-----------------|
| 1 | Automatic store settlement | **PARTIAL** | `storeSettlement.ts` + IAP path auto-creates **settled** paid-coin lots from Apple JWS `price`/`currency` when GBP, else **catalog GBP** after verify. Does **not** invent commission. Real store commission still requires financial-report ingest (`applyVerifiedProceedsAdjustment`). |
| 2 | Gift GBP 60/40 automatic | **PARTIAL** | Settled lots + `neonDebitGiftWithCreatorCredit` post `PAID_GIFT` automatically. Needs settled gross>0. Test/promo still £0. |
| 3 | Subscription automatic 60/40 | **PARTIAL** | `autoPostSubscriptionRevenue` on create + ASN/RTDN renew. Uses verified Apple price when GBP else membership config GBP. |
| 4 | Promote automatic platform 100% | **PARTIAL** | `autoPostPromoteRevenue` on IAP complete. |
| 5 | Creator Rewards automation | **PARTIAL** | Hourly period open/close tick in `server/index.ts`. Fraud uses `isAccountInGoodStanding` / `hasUnresolvedFraudFlag` (not all-true stubs). Country/age/originality still default true. |
| 6 | One qualified view | **VERIFIED** | PK + feed + fraud UA/farm. Unit+DB tests for uniqueness (DB tests need `TEST_DATABASE_URL`). |
| 7 | GBP withdrawals | **PARTIAL** | `gbpWithdrawals.ts` + `/api/creator/withdraw-gbp` + CreatorPayout GBP UI + admin status API. No live bank/PayPal provider rail yet (manual admin mark-paid). |
| 8 | Refund GBP reverse | **PARTIAL** | `neonReverseIapPurchase` → `reversePurchaseFinancials` (lots + ledger). Chargeback-after-withdraw recovery policy still light. |
| 9 | Reconciliation job | **PARTIAL** | `reconcile.ts` + 6h cron + admin run/list. Does not auto-repair. |
| 10 | Admin monetisation UI | **PARTIAL** | `/admin/monetisation` page + dashboard link. Not every package/fraud-country control fully editable in UI. |
| 11 | Creator dashboard GBP | **PARTIAL** | GBP balances, sources, subscribers, ledger, GBP withdraw. Diamonds labeled ops-only. |
| 12 | Admin reports | **PARTIAL** | `/reports/summary` JSON; richer breakdown still thin. |
| 13 | Fraud real | **PARTIAL** | `fraud.ts` + view path. Not full multi-account/purchased-followers ML. |
| 14 | Full §22 test matrix | **PARTIAL** | **33** unit tests pass. DB IT file exists but skipped without test DB. Matrix incomplete. |
| 15 | E2E demonstrated | **MISSING** | No recorded production transaction IDs for full gift→withdraw path in this session. |

## Key new / updated files

- `server/lib/monetisation/storeSettlement.ts`
- `server/lib/monetisation/fraud.ts`
- `server/lib/monetisation/reconcile.ts`
- `server/lib/monetisation/gbpWithdrawals.ts`
- `server/lib/monetisation/monetisationExpand.test.ts` (pass)
- `server/lib/monetisation/monetisation.db.test.ts` (gated)
- `src/pages/admin/Monetisation.tsx`
- `src/pages/CreatorPayout.tsx` (GBP withdraw)
- `server/routes/payout.ts` (`withdraw-gbp`, ledger)
- `server/index.ts` (rewards period + reconcile timers)

## Operational dependencies still required

1. Apple transaction JWS must include `price`+`currency=GBP` for store-verified gross; otherwise catalog GBP is used after receipt verify (tagged in lot).
2. Actual App Store / Play **commission** amounts still need financial-report ingest — not present in verify APIs.
3. GBP payout provider integration (bank/PayPal) — admin marks paid today.
4. Run `TEST_DATABASE_URL` money IT suite for uniqueness/concurrent proofs.
5. Redeploy server so Neon already-migrated schema is used by new code paths.

## Test evidence (this session)

```
vitest: moneyMath.test.ts + monetisationExpand.test.ts
→ 33 passed
```
