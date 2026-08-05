# Stripe Radar / Tax — ops checklist (no app UI)

**Date:** 2026-08-05  
**Rule:** Dashboard configuration only. Do not add Radar/Tax UI to the app unless explicitly requested.

## Radar for Platforms (step 3 — owner Dashboard)

Enable in Stripe Dashboard (test first, then live):

1. [Radar](https://dashboard.stripe.com/test/radar) → enable Radar rules for the platform.
2. [Radar for Platforms](https://docs.stripe.com/radar/radar-for-platforms) — turn on for Connect platforms so connected-account and platform charges are covered.
3. Keep default ML rules on; add custom rules only if needed (velocity, country mismatch, etc.).
4. Confirm both:
   - **Shop Checkout** charges (platform merchant of record) appear in Radar reviews.
   - **Connect** related risk (negative balances / dispute exposure on platform) is monitored under Radar for Platforms.

**Document after enabling (fill in):**

| Setting | Test mode | Live mode |
|---------|-----------|-----------|
| Radar enabled | _owner_ | _owner_ |
| Radar for Platforms | _owner_ | _owner_ |
| Default ML rules | _owner_ | _owner_ |
| Custom rules (list) | _none yet_ | _none yet_ |

**App code:** no Radar UI added (by design).

## Tax (step 4 — blocked until registration)

- Do **not** enable `automatic_tax` on Checkout until UK Stripe Tax registration + VAT setup are confirmed.
- When ready: enable automatic tax **only** for shop physical goods Checkout sessions.
- Never apply Stripe Tax to coins, creator memberships, or Promote Video (Apple/Google IAP).

## Not in scope

Terminal, Issuing, Treasury, Billing, Invoicing, Financial Connections, Identity enhancements, embedded Connect onboarding (later).
