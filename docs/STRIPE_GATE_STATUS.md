# Production readiness — honest status (2026-08-05T23:15Z)

## Production-ready: **NO** (one Stripe Dashboard step left)

Nobody (including this agent) can create live Connect accounts until Stripe unlocks your platform. API still returns:

> complete your platform profile … `/connect/accounts/overview`

### Done in code (just applied)

- Prod boot requires `sk_live_` + `whsec_`
- Prod forbids `ELIX_STRIPE_CONNECT_MODE=test`
- Prod webhooks verify with **live** secret only
- Shop checkout refuses non-live key in production; `CLIENT_URL` must be https
- Creator Connect “ready” only when `payouts_enabled` / verified (not bare `ok`)

### Already working (live Elix Live App keys)

- Platform charges + payouts enabled
- Live Checkout Session create (shop path)

### You must finish in Stripe (2 minutes)

1. https://dashboard.stripe.com/connect/accounts/overview  
2. Click **platform setup**  
3. **Marketplace** → Confirm  
4. Reply **`done`**

Then I create live Express + prove real creator payout. Until that click, claiming “fully ready” would be a lie.
