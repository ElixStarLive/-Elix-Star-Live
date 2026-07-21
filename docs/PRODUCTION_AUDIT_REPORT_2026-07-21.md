# Production readiness audit report — Elix Star Live
Date: 2026-07-21  
Freeze tag: `pre-production-audit-2026-07-21` (`a6f8d6e`)  
Audit commits: `8a43213`, (this report commit)

## Scope
Code hardening, automated tests, static QA, Android store technical checks.  
**Design frozen** — no intentional UI/layout/visual changes.

## What was fixed

| ID | Severity | Fix |
|----|----------|-----|
| F1 | HIGH | Spectator Test-coins UI gated with `IS_STORE_BUILD` |
| F2 | HIGH | Store builds ignore test-coin balance/spend/XP |
| B1 | HIGH | Production WS rejects `giftSource=test_coins` |
| F3 | MEDIUM | IAP init/reconcile errors logged via crashReporting |
| B2 | HIGH | Production Neon/SSL verifies TLS by default (`PG_SSL_REJECT_UNAUTHORIZED=false` escape only) |
| B3 | HIGH | Apple IAP credentials required at boot when `APPLE_BUNDLE_ID` or `APPLE_IAP_REQUIRED=1` |
| B4 | MEDIUM | Loadtest rate-limit bypass never enabled in production; boot fatals if `ALLOW_LOADTEST_IN_PROD=1` |
| C1 | MEDIUM | Added `.env.store.example` for store client builds |

## Tests run

| Command | Result |
|---------|--------|
| `npm test` | See CI/local run in audit session (server Vitest) |
| `npm run check` | TypeScript project build |
| e2e / Playwright / Cypress | **Not present in repo** |
| Real device matrix | **Not executable in this environment** |

## Static QA

- No client payment/API secrets found in `src/`
- No missing App.tsx page imports
- No empty `onClick={() => {}}` in `src/pages`
- `google-services.json` has no private keys
- Forbidden services (Supabase/Apwrite/etc.): none in app code
- IAP (coins) vs Stripe (shop) separation preserved

## Android / Play technical

| Check | Status |
|-------|--------|
| applicationId | `com.elixstarlive.app` |
| minSdk / targetSdk | 23 / 36 |
| BILLING permission | Yes |
| allowBackup | false |
| usesCleartextTraffic | false (localhost exception for Capacitor only) |
| AD_ID removed | Yes |
| R8 minify release | Yes |
| Signing props | `MYAPP_RELEASE_*` in gitignored `gradle.properties` |
| google-services.json | Present |

## Visual freeze

Changed files are logic/config/tests/docs/version only. No redesign of screens, colours, spacing, or navigation appearance beyond hiding Test-coins entry in **store** builds (parity with existing host LiveStream behaviour).

## Residual risks (cannot claim 100% without these)

1. Physical device + Play Internal Testing smoke (login, feed, live, gifts, IAP, settings close)
2. Coolify/server env must include Google IAP JSON, Stripe, LiveKit, Bunny, Neon pooled URL
3. If Apple shipping: set full Apple IAP env vars (boot now fails closed when bundle id configured without keys)
4. No client/e2e automated suite yet
5. Operator must copy `.env.store.example` → `.env.store` with real public `VITE_*` values for store builds

## Confirmation (honest)

**Stable for continued Android store testing:** yes (critical store/test-coin and several server hardening items addressed; automated server tests + tsc green when run).  

**Fully tested on all devices/browsers/OS and guaranteed Play approval:** **no** — not possible from this environment; residual list above remains.
