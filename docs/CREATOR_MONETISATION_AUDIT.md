# Creator Monetisation — Production Audit Document

**Date:** 2026-08-05  
**Product:** Elix Star Live  
**Model:** Permanent production monetisation (60/40 net gifts & subscriptions; Promote = platform 100%; Creator Rewards milestones)

This document inventories what is implemented in code, how calculations work, and what remains operationally required before claiming full store-settlement automation.

---

## 1. Engineering rules (enforced in code)

| Rule | Implementation |
|------|----------------|
| Backend is financial source of truth | Ledger + wallet tables in Neon; clients never supply payout amounts |
| Integer pence only | `server/lib/monetisation/moneyMath.ts` — no float after catalog boundary |
| Immutable ledger | `elix_financial_ledger` — inserts only; reversals are new rows |
| Paid coins only for earnings | Starter / promo / test gifts return `creator_earnings: 0` |
| Unique qualified views | PK `(video_id, viewer_user_id)` on `elix_qualified_video_views` |
| Idempotency | Ledger `idempotency_key` UNIQUE; IAP / webhook / withdrawal keys |
| Config snapshot on rewards period | `elix_creator_reward_periods.rules_snapshot` |

---

## 2. Database (migration)

**File:** `server/migrations/20260805050000_creator_monetisation_ledger_rewards.sql`

### Tables

- `elix_monetisation_config` — admin splits, settlement hours, rewards flags, budget
- `elix_monetisation_config_audit` — admin field changes
- `elix_financial_ledger` — immutable pence ledger
- `elix_creator_wallet_gbp` — pending / available / withdrawn / reversed / held
- `elix_qualified_video_views` — unique reward views
- `elix_video_view_metrics` — total_plays, unique_viewers, qualified_reward_views, etc.
- `elix_creator_reward_periods` — period with permanent rules snapshot
- `elix_creator_reward_results` — one result per creator per period (UNIQUE)
- `elix_creator_reward_milestones` — configurable milestone table (default £5–£1,000)
- `elix_paid_coin_lots` — FIFO paid IAP lots; net NULL until verified settlement
- `elix_processed_webhook_events` — webhook idempotency
- `elix_processed_purchases` — purchase idempotency
- `elix_creator_withdrawals_gbp` — GBP withdrawal requests with idempotency + provider ref uniqueness

### Constraints

- One qualified view per `video_id + viewer_user_id`
- Self-view CHECK rejection
- One ledger posting per `idempotency_key`
- One reward result per `creator_user_id + reward_period_id`
- One coin lot per `provider + provider_transaction_id`
- Gift / sub split CHECKs: creator% + platform% = 100

---

## 3. Calculation modules

| Module | Role |
|--------|------|
| `moneyMath.ts` | `splitNetRevenue`, `netAfterDeductions`, `promotePlatformOnly`, GBP↔pence |
| `creatorRewardsMath.ts` | Milestone table, eligibility, max £1,000 |
| `config.ts` | Load admin config + rule snapshots + audit |
| `ledger.ts` | Post / reverse ledger; mature pending → available; GBP wallet |
| `paidCoinLots.ts` | Create lots on IAP; settle; FIFO consume for gifts |
| `qualifiedViews.ts` | Record unique reward views from track-view |
| `creatorRewardsJob.ts` | Open/close monthly periods |
| `settlements.ts` | Apply verified store settlement; promote / sub / reverse |

**Unit tests:** `server/lib/monetisation/moneyMath.test.ts` (60/40, milestones, eligibility, promote £0).

---

## 4. Revenue flows

### Paid gifts

1. IAP credits coins → `elix_paid_coin_lots` with **gross** from catalog; **net unsettled**.
2. Gift debit credits coin Diamonds (existing 60% coin share) for UX/ops.
3. When lots are **settled** with verified deductions, gift spend FIFO-consumes net and posts `PAID_GIFT` ledger (60/40 of **actual net**).
4. Test / promo / starter coins: **£0** creator GBP and **0** Diamonds.

### Creator subscriptions

1. Entitlement verified on backend (Apple / Google).
2. Creator GBP 60/40 posts only via `POST /api/admin/monetisation/settlements/subscription` with **verified** deductions / net — never invents store commission.

### Promote Video

1. Purchase recorded; creator share always **0%**.
2. Platform ledger via `POST /api/admin/monetisation/settlements/promote` after verified net.

### Creator Rewards

1. Qualified views from `POST /api/feed/track-view` (logged-in, min watch time, not self).
2. Admin opens/closes periods; close aggregates views, eligibility, milestones, budget guard (no silent balance cuts).

---

## 5. HTTP endpoints

### Admin — `/api/admin/monetisation`

- `GET /config` — current settings
- `PATCH /config` — update field + audit
- `PUT /rewards/milestones` — replace milestone table (future periods)
- `GET /reports/summary` — ledger totals by source + wallets + views
- `POST /settlements/coin-lot` — apply verified IAP settlement to coin lot
- `POST /settlements/promote` — post platform-only promote revenue
- `POST /settlements/subscription` — post 60/40 subscription revenue
- `POST /settlements/reverse` — refund/chargeback reversals
- `POST /rewards/periods/open` | `.../:periodId/close`
- `GET /audit`

### Existing app surfaces (user-readable)

- **Settings → How the app works** (`/how-it-works`) — full creator monetisation section
- **Settings → Creator payout** — required 60/40 + qualified-views explanatory copy

---

## 6. Automated tests status

| Suite | Status |
|-------|--------|
| `moneyMath.test.ts` — splits, milestones, eligibility, promote | Runnable via `npm test` |
| Full DB money IT (`test:money`) | Existing gift coin IT; extend for ledger when TEST_DATABASE_URL available |
| Concurrent qualified views / duplicate withdrawals | Constrained by DB UNIQUE; dedicated IT still recommended |

---

## 7. Known operational requirements (not optional for full production)

1. **Run migration** `20260805050000_creator_monetisation_ledger_rewards.sql` on Neon (`npm run migrate`).
2. **Wire store settlement feeds** (Apple / Google financial reports or RTDN with verified fee amounts) into `settlements/coin-lot` (and sub/promote). Until settled, gift **GBP** ledger does not invent fees; coin Diamonds still operate as today.
3. **Admin UI** for monetisation panel can call the APIs above (APIs exist; dedicated admin screen may still be pending in the frontend admin app).
4. **GBP withdrawals** table exists; payout-provider integration must use `idempotency_key` + `payout_provider_ref` uniqueness.
5. **Fraud signals** for rewards eligibility are currently pass-through defaults on close — connect real enforcement flags before large budgets.
6. Do **not** claim completion of store-fee automation until settlement ingestion is live with real verified numbers.

---

## 8. Reconciliation identity

- Creator GBP wallet columns must equal sum of non-reversed creator ledger amounts by status.
- For any `PAID_GIFT` / `CREATOR_SUBSCRIPTION` row: `creator_amount_pence + platform_amount_pence = net_revenue_pence`.
- Promote: `creator_amount_pence = 0`, `platform_amount_pence = net_revenue_pence`.
- Reports: `GET /api/admin/monetisation/reports/summary` groups by `revenue_source`.

---

## 9. Honesty boundary

**Implemented as a connected production foundation:** schema, integer math, ledger, paid-only gift rule, unique views, rewards calc + period job, admin config/settlement APIs, user-facing docs.

**Not yet automatic end-to-end without ops:** verified store commission ingestion for every IAP; full admin frontend screens; complete DB integration test matrix from the original §22 list; live payout-provider GBP rails.
