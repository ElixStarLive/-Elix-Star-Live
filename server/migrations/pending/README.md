# Engagement migrations live under server/migrations/ (Coolify: npm run migrate)
#
# Phase 1: 20260722190000_engagement_phase1.sql
# Phase 1.5: 20260722200000_engagement_phase15_collections.sql
# Promo gift_source: 20260722210000_engagement_promo_gift_source.sql
# E2E progress tables: 20260722220000_engagement_e2e_progress.sql
#
# Defaults ON (override in Coolify if needed):
# ENGAGEMENT_NEON_APPROVED=true
# PROMOTIONAL_COINS_ENABLED=true
# BATTLE_ENERGY_ENABLED=true
# PROMO_GIFT_SPEND_ENABLED=true
# Promo gifts always create ZERO Diamonds.
