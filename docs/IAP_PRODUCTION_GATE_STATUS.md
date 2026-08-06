# IAP production gate report — 2026-08-06

Labels used only: **VERIFIED** | **FAILED** | **BLOCKED_EXTERNAL** | **NOT_CONFIGURED** | **NOT_TESTED**

## Summary (required)

| Gate | Status |
|------|--------|
| ANDROID IMPLEMENTATION READY | **YES** |
| ANDROID STORE-PROVEN | **NO** |
| APPLE IMPLEMENTATION READY | **YES** |
| APPLE STORE-PROVEN | **NO** |
| FINANCIAL SETTLEMENT REPORTS | **PENDING CLOSED-PERIOD STORE REPORTS** |
| FULL IAP PRODUCTION-READY | **NO** |

Production tip at check time: commit `d983682` (`/health`).

Apple/RTDN gates were made **opt-in** after an initial fail-closed attempt caused Coolify to roll back the newer container. The corrected posture is:

- **Boot-time**: fatal only when `APPLE_IAP_REQUIRED=1` is set AND Apple trio / bundle / notification secret are missing. When `APPLE_IAP_REQUIRED` is unset, boot succeeds and Android/web serve normally.
- **Runtime**: iOS purchase verification (`fetchAppleTransaction`, `verifyAppleSubscription`) still returns `APPLE_CREDENTIALS_NOT_CONFIGURED` and refuses to credit any coins when Apple credentials are missing. Nothing is silently succeeded.
- **RTDN / ASN endpoints**: return `503 not configured` when the shared secret is unset, so refund/void callbacks fail closed without preventing boot.

Redeploy is safe whether or not Apple / RTDN secrets are present in Coolify — the app will not silently credit anything.

---

## Android — Google Play Billing

| # | Requirement | Status | Evidence / notes |
|---|-------------|--------|------------------|
| 1 | Production package name matches uploaded app | **VERIFIED** (code) / **BLOCKED_EXTERNAL** (Play Console upload match) | `android/app/build.gradle` `applicationId "com.elixstarlive.app"`; server default `GOOGLE_PLAY_PACKAGE_NAME\|\|"com.elixstarlive.app"`. Play Console listing of uploaded AAB package not accessible from agent. |
| 2 | Version 1.0.486 / 533 signed with production identity | **VERIFIED** (version strings historically) / **BLOCKED_EXTERNAL** (Play App Signing identity) | Checklist target `1.0.486` / `533` was built as `app-release.aab`. Tip now `1.0.487` / `534` after IAP gate harden (same package). Play Console signing certificate fingerprint not verifiable here. |
| 3 | Every coin product Active in Play Console | **BLOCKED_EXTERNAL** | Agent has no Play Console access. Cannot assert Active. |
| 4 | Product IDs match code exactly | **VERIFIED** (code inventory) / **BLOCKED_EXTERNAL** (Console) | Client `IAP_PRODUCTS` in `src/lib/iap.ts`: `coins100`, `coins500`, `coins500a`, `coins1000`, `coins5000`, `coins10000`, `coins50000`, `coins100000`, `coins150000`, `coins200000`, `coins350000`. Android uses `coins500a` for 500; `coins500` is iOS ASC id also listed. Console Active status unknown. |
| 5 | No missing/renamed/obsolete IDs | **NOT_TESTED** | Code list is source of truth; Console orphan/missing SKUs unknown. `coins350000` is offered in app — must exist Active on Play if shipped. |
| 6 | Google service account API + Console access | **BLOCKED_EXTERNAL** | Local `.env` has `GOOGLE_SERVICE_ACCOUNT_JSON` present (len 2338, value not logged). Play Console linkage / API enablement not verifiable. |
| 7 | `GOOGLE_SERVICE_ACCOUNT_JSON` in Coolify | **BLOCKED_EXTERNAL** | Coolify env UI/API not available to agent. Prod tip `d983682` is live; whether Google JSON is on Coolify unknown. |
| 8 | Production server starts with Google credentials | **NOT_TESTED** | Boot requires Google JSON (`envValidate`). No Coolify log proof captured this session. |
| 9 | Verify package, product, token, state, ack/consume, dup | **VERIFIED** (server logic) | `verifyGooglePlayPurchase` checks purchaseState===0, rejects consumptionState===1; API path includes packageName+productId+token; dedupe via `neonIsIapProcessed` / provider txn key. Physical proof absent. |
| 10 | Same token cannot credit twice | **VERIFIED** (server logic) / **NOT_TESTED** (live) | Dedup returns 200 `deduplicated: true` without second credit. No physical token hash evidence. |
| 11 | Failed/cancelled/pending/refunded never credit | **VERIFIED** (server logic) / **NOT_TESTED** (live) | Non-zero purchaseState rejected; invalid receipt → 400; refunds via RTDN path in `iapNotifications.ts`. |
| 12 | Test coins separate from paid | **VERIFIED** | Test-coin rules + separate state; IAP credits paid path only (`neonCreditIap` / paid lots). |
| 13 | Real purchase on physical device (license tester) | **NOT_TESTED** | No device purchase performed this session. |
| 14 | Prove purchase → verify → credit once → consume → no recredit | **NOT_TESTED** | No transaction ID / token hash / ledger row captured. |
| 15 | RTDN for refunds/voids configured | **NOT_CONFIGURED** / **BLOCKED_EXTERNAL** | Code supports RTDN + optional OIDC. Console Pub/Sub topic + Coolify URL not proven. Prod boot **does not** require `GOOGLE_RTDN_WEBHOOK_SECRET`; the RTDN endpoint returns `503 not configured` until it is set (fail-closed without blocking boot). |
| 16 | RTDN valid accept / invalid reject | **VERIFIED** (code) / **NOT_TESTED** (live HTTP) | Secret compare + optional OIDC in `iapNotifications.ts`. No HTTP evidence this session. |
| 17 | Refund/reversal ledger + reconcile | **VERIFIED** (code) / **NOT_TESTED** (live) | `neonReverseIapPurchase` on void notifications. No live refund event ID. |

---

## Apple — StoreKit / App Store Connect

| # | Requirement | Status | Evidence / notes |
|---|-------------|--------|------------------|
| 1 | Bundle ID matches app | **VERIFIED** (code default) / **BLOCKED_EXTERNAL** (ASC) | Default/expected `com.elixstarlive.app` (`appleIap.ts`, Capacitor/iOS project). ASC app record not viewed. |
| 2 | Every consumable exists with exact ID | **BLOCKED_EXTERNAL** | Same ID list as client; ASC not accessible. |
| 3 | Cleared for sale / attached to version | **BLOCKED_EXTERNAL** | |
| 4 | Membership/Promote only if sold via Apple | **VERIFIED** (code offers them) / **BLOCKED_EXTERNAL** (ASC) | Membership `com.elixstarlive.membership`; Promote SKUs `com.elixstarlive.promote_*`. Must exist in ASC if features are live. |
| 5 | Remove obsolete IDs | **NOT_TESTED** | |
| 6 | Coolify Apple trio + `APPLE_IAP_REQUIRED=1` + notification secret | **NOT_CONFIGURED** (local) / **BLOCKED_EXTERNAL** (Coolify) | Local: Apple trio **absent**; `APPLE_IAP_REQUIRED` unset. Notification secret present locally. Coolify unknown. |
| 7 | Key belongs to correct ASC + permissions | **BLOCKED_EXTERNAL** | |
| 8 | Prod fail-closed without Apple credentials | **VERIFIED** (runtime) | `fetchAppleTransaction`/`verifyAppleSubscription` return `APPLE_CREDENTIALS_NOT_CONFIGURED` → `handleVerifyPurchase` sets `isValid=false` → no credit. When owner opts in via `APPLE_IAP_REQUIRED=1`, boot also fatals if any Apple credential is missing. |
| 9 | Verify bundle, product, JWS, env, status, revocation, dup | **VERIFIED** (server logic) / **NOT_TESTED** (live) | JWS verify, productId match, revocationDate reject, dedupe. |
| 10 | Same txn cannot credit twice | **VERIFIED** (logic) / **NOT_TESTED** | |
| 11 | Invalid/failed/refunded never credit | **VERIFIED** (logic) / **NOT_TESTED** | |
| 12 | ASN V2 production webhook URL configured | **BLOCKED_EXTERNAL** | Endpoint exists in app; ASC console URL not confirmed. |
| 13 | Signed notifications verified | **VERIFIED** (code) | `verifyAppleJwsPayload`; unsigned rejected. |
| 14 | Valid accept / invalid reject | **NOT_TESTED** | |
| 15 | Sandbox purchase on physical iPhone | **NOT_TESTED** | |
| 16 | Prove sandbox credit once | **NOT_TESTED** | |
| 17 | Controlled production purchase after approval | **NOT_TESTED** | |
| 18 | Refund/revocation ledger | **VERIFIED** (code) / **NOT_TESTED** (live) | |

---

## Coolify production verification

| # | Requirement | Status | Evidence |
|---|-------------|--------|----------|
| 1 | Redeploy commit `d983682` | **VERIFIED** | `GET https://www.elixstarlive.co.uk/health` → `"commit":"d983682a234f575f9b7a2d3ceb3be092abe47859"` |
| 2 | Production running `d983682` | **VERIFIED** | Same `/health` response |
| 3 | No test Stripe/Google/Apple credentials in prod | **NOT_TESTED** | Prod boot refuses `sk_test_` and `ELIX_STRIPE_CONNECT_MODE=test`. Coolify env dump not available to confirm Google/Apple are live/production values. |
| 4 | No localhost / sandbox-only verify fallback | **VERIFIED** (code paths) / **NOT_TESTED** (runtime) | Google uses Play API; Apple uses App Store Server API. No localhost verify path found for IAP. |
| 5 | Secrets not in Git/logs/chat | **VERIFIED** (this report) | No secret values printed; `.env` not committed in this work. |
| 6 | Startup + health checks | **VERIFIED** (health) / **NOT_TESTED** (boot log Apple fatals) | Health OK on `d983682`. New Apple/RTDN fatals need Coolify vars before next redeploy or boot will fail. |
| 7 | Redacted evidence vars present | **BLOCKED_EXTERNAL** (Coolify) / local sample only | Local redacted (names + present/len only): `GOOGLE_SERVICE_ACCOUNT_JSON` present; `GOOGLE_RTDN_WEBHOOK_SECRET` present; `APPLE_IAP_NOTIFICATION_SECRET` present; **Apple trio absent** (`APPLE_ISSUER_ID` / `APPLE_KEY_ID` / `APPLE_PRIVATE_KEY`); `APPLE_IAP_REQUIRED` unset. Coolify inventory not accessible. |

---

## Product ID inventory (app)

```
coins100, coins500, coins500a, coins1000, coins5000, coins10000,
coins50000, coins100000, coins150000, coins200000, coins350000
membership: com.elixstarlive.membership
promote: com.elixstarlive.promote_views|likes|profile|followers
```

---

## Owner actions required before STORE-PROVEN = YES

1. Coolify: set Apple trio, `APPLE_BUNDLE_ID=com.elixstarlive.app`, `APPLE_IAP_REQUIRED=1`, `APPLE_IAP_NOTIFICATION_SECRET`, confirm Google JSON + `GOOGLE_RTDN_WEBHOOK_SECRET`; redeploy. (Prior to setting `APPLE_IAP_REQUIRED=1`, iOS purchases already fail closed at runtime — see updated gate #8 above.)
2. Play Console: activate every coin SKU above (incl. `coins350000` if shipping); confirm package `com.elixstarlive.app`; license-tester physical purchase; capture order ID + verify + ledger.
3. App Store Connect: create/clear-for-sale matching IAPs; ASN V2 → `https://www.elixstarlive.co.uk/api/...` (exact route in `iapNotifications`); sandbox then production purchase proofs.
4. Closed-period Apple/Google financial CSVs when issued → admin import.

**FULL IAP PRODUCTION-READY: NO**
