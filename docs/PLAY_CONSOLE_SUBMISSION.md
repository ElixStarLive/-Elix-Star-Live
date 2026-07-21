# Google Play Console — submission checklist (Elix Star Live)

Freeze tag: `pre-production-audit-2026-07-21`  
Current AAB target: **1.0.232+** (`android/app/build/outputs/bundle/release/app-release.aab`)  
Package: `com.elixstarlive.app`

**This document prepares Play Console answers from the codebase. Filling Console and submitting still requires your Google account.**

---

## 1. Upload

1. Play Console → App → Production or **Internal testing** (recommended first)
2. Create release → upload `app-release.aab`
3. Release name: `1.0.232 (279)` (match `versionName` / `versionCode`)

---

## 2. Store listing URLs (must be live)

| Field | Exact URL |
|-------|-----------|
| Privacy policy | https://www.elixstarlive.co.uk/privacy.html |
| App support | mailto:info@elixstarlive.co.uk or https://www.elixstarlive.co.uk (Support in app) |
| Account deletion (Data safety / Account deletion) | https://www.elixstarlive.co.uk/delete-account.html |

Verify in a browser before submit (200 OK, HTTPS).

---

## 3. Data safety (answer from actual app)

### Does your app collect or share user data?
**Yes**

### Data collected (typical mapping)

| Data type | Collected? | Shared? | Purpose | Notes |
|-----------|------------|---------|---------|-------|
| Email | Yes | No (except processors) | Account | Registration / login |
| Name / username | Yes | Yes (other users) | App functionality | Public profile / live / chat |
| Photos / videos | Yes | Yes (UGC) | App functionality | User uploads / live |
| Audio | Yes | Yes (UGC) | App functionality | Live / video |
| Messages | Yes | Yes (recipients) | App functionality | Chat / live chat |
| Purchase history | Yes | With Google Play | App functionality | IAP receipts verified server-side |
| Device IDs | Yes | No | Analytics / fraud / push | Device tokens |
| Crash logs | Yes | No | Analytics | Store builds → `/api/analytics/track` |
| App interactions | Yes | No | Analytics | Optional analytics events |

### Security practices
- Data encrypted in transit: **Yes** (HTTPS / WSS)
- Users can request deletion: **Yes** (Settings → Delete Account + web URL)

### Advertising ID
- **Not used** — AD_ID permission removed from manifest

### Approximate location / precise location
- **Not collected** (no location permission)

---

## 4. Permissions declaration

Declared and used:
- Camera, Microphone — create / live / calls  
- Notifications — push  
- Billing — in-app coins / membership / promote  

Also present (libraries / live streaming): `WAKE_LOCK`, `MODIFY_AUDIO_SETTINGS`, `ACCESS_NETWORK_STATE` — declare as required for live streaming / connectivity if Console asks.

---

## 5. In-app products (create before testing IAP)

Consumable coin packs (IDs must match exactly):

`coins100` `coins500a` `coins1000` `coins5000` `coins10000` `coins50000` `coins100000` `coins150000` `coins200000`

Also configure promote / membership products from `src/lib/iap.ts` if offered.

License testers: add your Google account under Setup → License testing.

---

## 6. Account deletion (Play policy)

| Path | Status |
|------|--------|
| In-app | Settings → Delete Account → `POST /api/auth/delete` (hard delete) |
| Web | https://www.elixstarlive.co.uk/delete-account.html |

---

## 7. Content / UGC

- Reporting: Report flows in app  
- Blocking: Settings → Blocked Accounts  
- Guidelines: in-app `/guidelines`  
- Age: registration requires confirming **13+**  
- Not Families / Designed for Children  

---

## 8. Assets

| Asset | Path |
|-------|------|
| Feature graphic | `store-assets/android/feature-graphic.png` |
| Screenshots | Capture yourself into `store-assets/android/screenshots/` (min 2 phone) |

---

## 9. Pre-submit smoke test (you on a device)

Internal testing track install, then verify:

- [ ] Cold start / login / register (13+ checkbox)  
- [ ] Feed plays  
- [ ] Live join / leave  
- [ ] Settings → Privacy / Terms / Delete Account (cancel delete)  
- [ ] Buy coins (license tester) — real Play Billing sheet  
- [ ] No Test coins menu in store build  
- [ ] Close/back on Settings & Live works under status bar  

---

## 10. Honest status

Code + AAB + checklist: **ready to upload to Internal testing**.  
**Google approval is not guaranteed** until Console forms, screenshots, IAP products, and device smoke tests are complete on your side.
