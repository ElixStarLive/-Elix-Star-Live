# 05 — Database

Provider: **Neon (PostgreSQL)**. Access layer: [`server/lib/postgres.ts`](../server/lib/postgres.ts) via `getPool()`.
Sources: `server/migrations/*.sql` (43 files), [`_audit/tables.txt`](../_audit/tables.txt) at commit `013c722`.

**91 tables. 43 migrations.**

> Hard rule for the entire rebuild programme: this database is production data. No destructive migration, no schema recreation, no data movement without explicit written owner approval and a written migration plan.

## Table groups

### Auth and identity (6)
`auth_users`, `elix_auth_users`, `elix_auth_sessions`, `profiles`, `elix_blocked_users`, `elix_device_tokens`

Two user tables exist (`auth_users` and `elix_auth_users`). This is a legacy artifact and a **`REVIEW`** item — it must be understood before any rebuild touches auth, and must not be "cleaned up" by merging them without a migration plan.

### Wallet and money (11)
`elix_wallet_balances`, `elix_wallet_ledger`, `elix_gift_transactions`, `elix_gifts`, `gift_logs`, `elix_coin_packages`, `elix_shop_purchases`, `shop_items`, `elix_promote_purchases`, `elix_membership_purchases`, `elix_creator_membership_products`

### Creator earnings and payouts (5)
`elix_creator_balances`, `elix_creator_earnings`, `elix_payout_requests`, `elix_payout_methods`, `elix_payout_audit`

### Separate currency ledgers (5)
`starter_coin_balances`, `starter_coin_transactions`, `promotional_coin_balances`, `promotional_coin_ledger`, `daily_hearts`

Distinct balances are intentional. Purchased coins, starter coins and promotional coins must never be merged — this mirrors the app rule that test/promo currency never becomes real money.

### Battle energy (5)
`battle_energy_balances`, `battle_energy_ledger`, `battle_energy_daily_caps`, `battle_fan_energy`, `battle_creator_buckets`

### Video and social (12)
`videos`, `video_views`, `video_scores`, `likes`, `saves`, `comments`, `comment_likes`, `follows`, `stories`, `sounds`, `mvp_scores`, `elix_analytics_events`

### Live (4)
`live_streams`, `live_moderation_log`, `live_share_inbox`, `booster_catch_logs` (+ `booster_config`)

### Chat and notifications (4)
`chat_threads`, `messages`, `elix_notifications`, `elix_reports`

### Progression and XP (6)
`user_progression`, `xp_transactions`, `xp_activity_config`, `xp_level_requirements`, `level_history`, `daily_reward_config` (+ `daily_reward_claims`)

### Engagement (11)
`engagement_missions`, `user_mission_progress`, `engagement_achievements`, `user_achievements`, `engagement_settings`, `engagement_admin_audit`, `user_engagement_unique_creators`, `treasure_chest_defs`, `user_treasure_chests`, `creator_card_defs`, `user_creator_cards`, `user_creator_collection_progress`

### Stickers (5)
`sticker_defs`, `sticker_sets`, `user_stickers`, `creator_stickers`

### Rising Stars (15)
`rs_seasons`, `rs_challenges`, `rs_entries`, `rs_votes`, `rs_teams`, `rs_team_members`, `rs_categories`, `rs_regions`, `rs_badges`, `rs_user_badges`, `rs_reward_definitions`, `rs_reward_grants`, `rs_phase_results`, `rs_admin_audit`

## Migration discipline already in place

- 43 migrations under `server/migrations/`
- Quarantine convention exists: `server/migrations/pending/` holds migrations deliberately **not** auto-applied (used previously for the engagement phase 1 schema)
- `ELIX_SKIP_MIGRATION_CHECK=1` is **fatal in production** ([`server/lib/envValidate.ts:25-28`](../server/lib/envValidate.ts)) — migration checks cannot be bypassed on prod
- Post-migration verification exists: [`server/scripts/postMigrateVerify.ts`](../server/scripts/postMigrateVerify.ts) asserts table existence
- Production boot log explicitly reminds that `npm run migrate` must run in the deploy step before workers start

This is genuinely good practice already present in the old app. `KEEP BEHAVIOUR`.

## Data-integrity behaviours to preserve

| Behaviour | Where |
|-----------|-------|
| Gift send validates and debits server-side before delivery | `server/routes/gifts.ts` |
| Gift prices unique per gift | `migrations/20260720020000_gift_prices_unique_per_gift.sql` |
| Money safety contract tests | `server/lib/moneySafetyContract.test.ts`, `moneyIntegration.test.ts` |
| Starter coin / XP contract tests | `server/lib/starterCoinsXpContract.test.ts` |
| Rising Stars Neon contract tests | `server/lib/risingStarsNeon.test.ts`, `risingStarsContract.test.ts` |
| Engagement trust contract tests | `server/lib/engagementTrustContract.test.ts` |

Server-side contract tests already exist for the money paths. These are the strongest existing safety net and should be the **first** thing ported to any new backend — before any feature code.

## Caching layer

Valkey-backed caches sit in front of several read paths:

| Cache | Module |
|-------|--------|
| Feed | `server/lib/feedCacheValkey.ts` |
| Catalogs (gifts, packages) | `server/lib/catalogCacheValkey.ts` — profiles use an epoch key; gifts/packages rely on TTL |
| Music | `server/lib/musicCacheValkey.ts` |
| Audio scan | `server/lib/audioScanValkey.ts` |
| Metrics | `server/lib/cacheLayerMetrics.ts` |

Invalidation strategy differs per cache and is documented in source comments. Copying the wrong strategy would produce stale catalogs.
