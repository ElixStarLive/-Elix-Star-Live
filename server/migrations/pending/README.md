# Engagement Phase 1 — Neon migration PENDING APPROVAL
#
# This file is intentionally NOT under server/migrations/ so Coolify
# `npm run migrate` will not apply it.
#
# Do not move this file into server/migrations/ until the owner explicitly
# approves Neon schema + production wallet writes.
#
# After approval:
# 1. Set ENGAGEMENT_NEON_APPROVED=true in Coolify
# 2. Move this file to server/migrations/
# 3. Set PROMOTIONAL_COINS_ENABLED / BATTLE_ENERGY_ENABLED only after ledger testing
# 4. Keep PROMO_GIFT_SPEND_ENABLED=false until promo gift path is verified
#    (Promo Coin gifts MUST credit zero Diamonds)

