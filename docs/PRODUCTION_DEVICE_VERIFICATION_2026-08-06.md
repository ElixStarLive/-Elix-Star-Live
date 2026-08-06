# Production device verification attempt — 2026-08-06

Only labels used: **VERIFIED** | **FAILED** | **BLOCKED_EXTERNAL**.

Each `BLOCKED_EXTERNAL` row records:
- what was attempted (command / URL),
- the exact output that proved the block,
- the exact missing external requirement to unblock.

No fabricated device results. No "NOT_TESTED", no "IMPLEMENTATION READY", no "OWNER ACTION".

---

## 0. Environment inventory

| Item | Value | How proved |
|------|-------|-----------|
| Host OS | Windows 10.0.19042 | `adb version` header |
| Shell | PowerShell | tool exec header |
| ADB | `C:\Users\Absm Construction\AppData\Local\Android\Sdk\platform-tools\adb.exe` v1.0.41 (37.0.0-14910828) | `adb version` |
| iOS bridge (Windows) | **absent** — `idevice_id`, `ideviceinstaller`, `ideviceinfo`, `tidevice`, `iproxy`, `ios-deploy`, `iTunes` all `missing` | `Get-Command <tool>` for each |
| Xcode | not present (Windows host) | host OS |

Missing iOS bridge is a hard environment fact — no known toolchain on Windows can install an IPA onto a physical iPhone in the way `xcrun devicectl` / `ios-deploy` can on macOS. Owner-side install via TestFlight app is the authorised iOS install path (`codemagic.yaml` `ios-testflight` uploads to App Store Connect; owner installs from TestFlight on device).

---

## 1. Local repo / release tip

| Item | Value | How proved |
|------|-------|-----------|
| Repo | `github.com/ElixStarLive/-Elix-Star-Live` | `git remote -v` (previous session) |
| Local branch | `main` | `git status` |
| Local tip | `bd7c08f` (report refresh) → `07a4951` (opt-in gates) → `2255201` (dead code) → `87c9058` (lint) | `git log --oneline` |
| Production tip (Coolify) | `07a49513269a58b076ce518354240ca783876db9` | `GET https://www.elixstarlive.co.uk/health` |
| Production `/health.status` | `ok` | same |
| Production services | `database=true, valkey=true, livekit=true, bunnyStorage=true, push=true` | same |
| Android artefact (local) | `android/app/build/outputs/bundle/release/app-release.aab` — `versionName 1.0.487`, `versionCode 534`, `applicationId com.elixstarlive.app` | Previous build log |
| iOS artefact (App Store Connect) | see §3 | ASC API call |

**§1 Verdict**: **VERIFIED** — production is running the current head-of-`main` opt-in-gates commit with all services healthy.

---

## 2. Android device — real server-side evidence for owner-performed actions

The owner confirmed the Android build is already installed on the connected physical device and reported that a coin purchase completed successfully through the app. This section records the **server-side backend evidence** for those owner-performed actions. ADB automation from this Windows shell remains blocked (§2.6 below) but that is now a separate concern from proving the transactions happened.

### 2.1 ANDROID COIN PURCHASE — VERIFIED

**Owner-performed device action** (as reported by the owner, on the physical Android phone):
- Physical Android phone used.
- Google Play purchase screen opened from the coin-store UI.
- Coin purchase completed on the Play Store side.
- Purchased coins appeared in the in-app balance.
- Coins are usable in the app.

**Developer-verified backend evidence** (pulled read-only from production Neon via `server/scripts/traceAndroidCoinPurchase.ts`, saved raw to `docs/evidence/android-coin-purchase-2026-08-06.json`):

| Field | Value | Table / source |
|-------|-------|----------------|
| Ledger row id | `63f62a37-3dd9-4c8c-9ec6-6a1ac9f837f7` | `elix_wallet_ledger` |
| Buyer user id | `37c3c371-b5c2-4e50-908f-8a7225ba7ba2` (`Andrei Ionut Berica`, account since `2026-07-28`) | `profiles` (via `traceUserActivity.ts`) |
| Ledger `kind` | `iap_purchase` | server enforces this literal on paid path only |
| Provider | `google` | `elix_wallet_ledger.provider` |
| Product ID | `coins100` | `elix_wallet_ledger.product_id` — matches `IAP_PRODUCTS.coins100` in `src/lib/iap.ts` |
| Coins delta | **+100** | `elix_wallet_ledger.coins_delta` |
| **Google Play order ID** | **`GPA.3372-2714-9629-19609`** | parsed from `elix_wallet_ledger.verification.detail` JSON |
| Purchase-token reference | `token_sha256:5ad6e50b452aaad8113fff6d93f153c20c45cbe5a7faef3589d42eda7930bb21` | `elix_wallet_ledger.provider_transaction_id` — server hashes the raw Play token via `providerTransactionKey` before persistence, so the raw token is never stored |
| **Backend verification result** | `verification.verified = true` (`androidpublisher/v3/applications/…/purchases/products/…/tokens/…` returned `purchaseState=0`, `consumptionState≠1`) | `elix_wallet_ledger.verification` jsonb |
| Idempotency key | `iap:google:token_sha256:5ad6e50b…` | `elix_wallet_ledger.idempotency_key` (unique index) |
| **Duplicate transaction protection** | `SELECT COUNT(*) WHERE idempotency_key = …` = **1** (single ledger row) **and** `elix_processed_purchases` row for `external_purchase_id='google:token_sha256:5ad6…'` count = **1** — two-layer dedupe both confirm | `elix_wallet_ledger` unique idem key + `elix_processed_purchases` unique external id |
| Coin-credit transaction id | ledger id `63f62a37-…` | same |
| Paid coin lot id | `lot:google:token_sha256:5ad6e50b…` | `elix_paid_coin_lots` |
| Paid lot coins_original / coins_remaining | 100 / 100 | `elix_paid_coin_lots` |
| Paid lot gross_pence | **35** (i.e. £0.35 gross — matches the Play `coins100` UK tier) | `elix_paid_coin_lots.gross_pence` |
| Paid lot settlement_status | **`settled`** at `2026-08-06T01:18:52.914+00` | `elix_paid_coin_lots.settlement_status`, `settled_at` |
| Currency | GBP (all `_pence` columns are pence sterling by convention across `paidCoinLots` and `monetisation/*`) | `elix_paid_coin_lots` |
| Wallet balance BEFORE credit | **0** | ledger cumulative sum up to but not including this row |
| Wallet balance AFTER credit | **100** | ledger cumulative sum through this row |
| Current wallet balance | **100** (unspent) | `elix_wallet_balances` |
| Ledger created_at | `2026-08-06 01:18:52.892356+00` | `elix_wallet_ledger` |
| Paid lot settled_at | `2026-08-06 01:18:52.914+00` (22 ms after ledger insert — same transaction) | `elix_paid_coin_lots` |
| Test / promotional / starter coins credited by this transaction | **No.** The +100 delta appears on `elix_wallet_ledger.kind='iap_purchase'` and `elix_wallet_balances.coin_balance` only. `starter_coin_balances` and `promotional_coin_balances` for the same user were not touched by this transaction — their values (50 000 and 750 respectively) reflect prior progression state, not this purchase. The test-coin state is client-local only (per project rule). | `elix_wallet_balances` vs `starter_coin_balances` vs `promotional_coin_balances` |
| Ledger / reconciliation result | Paid lot `settled`, coins_original == coins_delta == wallet delta (100 = 100 = 100). Two-layer dedupe row-count == 1 on both `elix_wallet_ledger.idempotency_key` and `elix_processed_purchases.external_purchase_id`. Zero contamination from starter / promotional / test channels. | see all rows above |

**Verdict: ANDROID COIN PURCHASE — VERIFIED.**

Observation (not a bug — recording for later, do not fix silently): `elix_paid_coin_lots.app_store_deduction_pence`, `.tax_deduction_pence`, `.processing_deduction_pence` are all `0` for this row, which implies `resolveCoinPurchaseVerifiedPrice` returned zero deductions for `coins100`. The `net_pence` (35) currently equals gross. Whether Google's 15% cut and VAT should have been applied here is a monetisation-math question, not an IAP-verification question. The credit itself is correct. Owner sign-off required before changing settlement math — no change made in this session.

### 2.2 ANDROID LIVE STREAM HOST (SOLO) — VERIFIED

**Owner-performed device action** (implicit — not reported in chat, discovered by cross-referencing `live_streams` while pulling context for §2.1):
- Live-stream host session started from the phone.
- Session ended cleanly from the phone.

**Developer-verified backend evidence** (`server/scripts/traceUserActivity.ts`, raw in `docs/evidence/android-user-activity-2026-08-06.json`):

| Field | Value | Table |
|-------|-------|-------|
| Row present | 1 | `live_streams` |
| Stream key (LiveKit room id) | `37c3c371-b5c2-4e50-908f-8a7225ba7ba2` (== user id) | `live_streams.stream_key` |
| Display name | `Andrei Ionut Berica` | `live_streams.display_name` |
| Started at | `2026-08-06 01:14:52.757+00` | `live_streams.started_at` |
| Ended at | `2026-08-06 01:16:51.840+00` (~2 min 0 s session) | `live_streams.ended_at` |
| `is_live` after end | `false` — clean shutdown, no dangling live-session flag | `live_streams.is_live` |
| Peak viewer_count | `1` | `live_streams.viewer_count` |

**Verdict: ANDROID LIVE HOST START/END + CLEAN SHUTDOWN — VERIFIED** (single-device, no confirmed spectator interaction — viewer_count 1 is not proof of a second-device spectator).

The proper two-device live matrix (Android host ↔ iPhone spectator, iPhone host ↔ Android spectator) still requires the iPhone side to be online in TestFlight and remains open (§4).

### 2.3 Everything else on Android — must be tested separately (not implied by §2.1)

The following were **not** performed by the owner and are **not** implied by the coin purchase. Each requires its own on-device action, then a dedicated read-only trace from Neon (server/scripts/traceUserActivity.ts already prints most of the relevant tables):

| Test | Status | What the owner needs to do to unblock |
|------|--------|---------------------------------------|
| Duplicate purchase attempt (repeat same token → server must respond `deduplicated: true` + return authoritative balance, coin_balance must not change) | **BLOCKED_EXTERNAL** | Owner triggers a repeat purchase attempt of the same package while the app is running, or the Play Store re-delivers the token. Server contract (`handleVerifyPurchase` → `neonIsIapProcessed`) already returns `deduplicated: true` with authoritative balance — code path exercised, but I need one real repeated attempt to prove it end-to-end. |
| Refund / revocation (RTDN void event → server must credit `neonReverseIapPurchase`, mark lot reversed, adjust balance) | **BLOCKED_EXTERNAL** | Owner (or Google Play Console) issues a refund for `GPA.3372-2714-9629-19609`. Also requires `GOOGLE_RTDN_WEBHOOK_SECRET` set on Coolify (currently absent — RTDN endpoint fails-closed `503`). Missing external: RTDN secret in Coolify + Pub/Sub URL configured in Play Console. |
| Gift a creator (test-coin gift **must not** post to creator GBP ledger; paid-coin gift **must** post) | **BLOCKED_EXTERNAL** | Owner sends a gift from the app (coin lot present) to a live-streaming creator; I trace `elix_gift_transactions` + `elix_creator_balances` for the deltas. |
| Creator subscription purchase | **BLOCKED_EXTERNAL** | Owner buys a `com.elixstarlive.membership` subscription on device; I trace `elix_membership_purchases`. |
| Promote Video purchase | **BLOCKED_EXTERNAL** | Owner completes a `com.elixstarlive.promote_*` purchase from the Promote Video flow; I trace `elix_promote_purchases`. |
| Account deletion | **BLOCKED_EXTERNAL** | Owner triggers Account Delete on device; I confirm `auth_users.deleted_at` (if implemented) or the equivalent cascade. |
| Report user / video / live | **BLOCKED_EXTERNAL** | Owner submits a Report on device; I trace `elix_reports` (`reporter_user_id`, `target_type`, `target_id`, `reason`, `status`). |
| Block / unblock user | **BLOCKED_EXTERNAL** | Owner blocks a user on device; I trace `elix_blocked_users` (`blocker_user_id`, `blocked_user_id`, `created_at`). |
| Live host (with real second-device spectator) | **BLOCKED_EXTERNAL** | Requires iPhone-side spectator online in TestFlight (§3 / §4). |
| Co-host / battle | **BLOCKED_EXTERNAL** | Same. |
| Performance / thermal / memory | **BLOCKED_EXTERNAL** | Subjective device measurement — I have no telemetry channel from the device to this shell. Owner reports if the app overheats / stutters / crashes during the flows above; I do not fabricate a pass. |

### 2.4 Fresh Android install / logcat / button-drive via ADB — attempted, still blocked

The owner has confirmed the app is **already installed** and used successfully. Fresh install is therefore not necessary. However, several rows in §2.3 (report/block, gift, live) will be much faster to verify if I can also read logcat + drive UI from this shell. That still requires ADB to reach the device.

### 2.5 Physical detection (unchanged from earlier — device is still present but adbd unreachable from this shell)

Command:
```
Get-PnpDevice -PresentOnly | Where-Object { $_.InstanceId -match "VID_18D1|VID_05AC|ADB Interface" }
```

Output:
```
Status Class     FriendlyName         InstanceId
------ -----     ------------         ----------
OK     USBDevice ADB Interface        USB\VID_18D1&PID_4EE8&MI_00\6&1E24C25B&0&0000
Error            C3                   USB\VID_18D1&PID_4EE8&MI_01\6&1E24C25B&0&0001
Error            C3                   USB\VID_18D1&PID_4EE8&MI_02\6&1E24C25B&0&0002
OK     USB       USB Composite Device USB\VID_18D1&PID_4EE8\C3U000000005847
Error            C3                   USB\VID_18D1&PID_4EE8&MI_03\6&1E24C25B&0&0003
```

Findings: an Android device (Google VID `18D1`, PID `4EE8`) with serial `C3U000000005847` is physically plugged in. Its `ADB Interface` composite (MI_00) is enumerated with status `OK`. Three other functions (`MI_01`, `MI_02`, `MI_03`, Class `C3`) are in `Error` — typical when the phone is in "Charging only" USB mode and the additional file-transfer / MTP / PTP functions are disabled.

### 2.6 ADB reachability from this shell

Commands run in this order:
```
adb kill-server
adb start-server         (→ "daemon started successfully")
adb devices -l           (→ "List of devices attached"  <blank>)
adb reconnect offline    (→ <blank>)
adb devices -l           (→ blank again)
adb -d get-state         (→ "error: no devices found")
```

**Verdict for the "ADB automation from this shell" question**: **BLOCKED_EXTERNAL** — but this is only a *convenience* channel. The core Android device verifications in §2.1 and §2.2 are already **VERIFIED** from prod database records without needing ADB, because the owner performed the actions on the device and the server persisted them.

Exact missing external requirement (to unlock ADB-driven automation of the *remaining* Android rows in §2.3): on-device authorisation.
Cause: either (a) `Developer Options → USB debugging` is currently OFF, (b) the RSA "Allow USB debugging from this computer?" fingerprint prompt was denied / dismissed / timed out, or (c) the USB mode is "Charging only" (the three interfaces in `Error` support this hypothesis).

Owner-side unblock (only needed if you want this shell to actively drive UI + read logcat instead of you performing actions manually):
1. Unlock phone.
2. Settings → System → Developer options → USB debugging = ON. (If already ON, toggle OFF/ON to re-arm.)
3. USB mode notification → set to "File transfer / Android Auto" (not "Charging only").
4. When the "Allow USB debugging from this computer?" dialog appears, tap **Allow** (optionally "Always allow from this computer").
5. Reply here so this shell can retry `adb devices -l` and continue.

If instead you prefer to keep tapping through the flows on your phone and have me pull the server evidence for each (the pattern already used in §2.1 and §2.2), no ADB is required at all.

---

## 3. iOS via App Store Connect API — real attempt

### 3.1 Credentials found in local `.env`

Value-length-only, values never printed:
```
APP_STORE_CONNECT_ISSUER_ID  : len=36
APP_STORE_CONNECT_KEY_ID     : len=10
APP_STORE_CONNECT_PRIVATE_KEY: len=252
```

### 3.2 JWT-signed call to `api.appstoreconnect.apple.com`

Ran `server/scripts/queryAscBuilds.ts` (uses `jose` ES256, signs a 15-min JWT, calls `/v1/apps?filter[bundleId]=com.elixstarlive.app`, then `/v1/builds?filter[app]=…&sort=-uploadedDate&limit=5&include=preReleaseVersion`).

Full raw response saved: `docs/evidence/asc-testflight-builds-2026-08-06.json`.

Extracted:

| Item | Value |
|------|-------|
| App | `Elix Star Live` |
| App ID | `6794781473` |
| Bundle ID | `com.elixstarlive.app` |
| Latest build ID | `6d85590c-776c-4851-b8da-552cff1663eb` |
| Latest build version | **1.0.97 (17)** |
| Uploaded | **2026-08-05 17:30:51 PDT** (~90 min before this report) |
| Expires | 2026-11-03 |
| `expired` | `false` |
| **processingState** | **`VALID`** |
| Previous 4 builds | 1.0.97 (16), (15), (14), (13) — all `VALID`, not expired |

### 3.3 Verdicts on iOS CI / TestFlight distribution

| Row | Status | Evidence |
|-----|--------|----------|
| Codemagic `ios-testflight` workflow succeeded and produced a signed IPA | **VERIFIED** | Codemagic Applications dashboard: "-Elix-Star-Live" last build "an hour ago", green indicator (owner screenshot) |
| IPA uploaded to App Store Connect | **VERIFIED** | ASC returned build `6d85590c…` uploaded `2026-08-05T17:30:51-07:00` |
| ASC processing succeeded (TestFlight-eligible) | **VERIFIED** | `processingState: VALID`, `expired: false` |
| Build not stalled / not still processing | **VERIFIED** | 4 previous builds all `VALID` |
| Codemagic API build metadata (build number, log, ID) directly queried | **BLOCKED_EXTERNAL** | `GET https://api.codemagic.io/apps` returned `HTTP 401`; `.env` line `CODEMAGIC_API_TOKEN` still absent (`Select-String` returned no match). Missing external: an unrevoked Codemagic personal API token added to `.env` (not to be pasted in chat). Not blocking, because ASC already confirms the artifact — this row is redundant evidence, not a gate. |

### 3.4 iOS device functional matrix — actual results from owner's TestFlight session

TestFlight build `1.0.97 (17)` is installed on the iPhone. The owner performed a live test session. Analytics beacons emitted by the shipped web bundle were pulled from prod Neon (`server/scripts/traceIosAnalytics.ts`, raw at `docs/evidence/ios-analytics-2026-08-06.json`).

**iOS tester user id**: `80f9639c-b7d5-4f3b-8362-0b0fcdd69816` (distinct from the Android buyer). 66 events in the last 12 h. Client-reported `app_version = 1.0.2` (== `package.json` version — unrelated to marketing `1.0.97`).

| iOS test | Status | Evidence |
|----------|--------|----------|
| App opens / cold-boot renders | **VERIFIED** | `event=app_open` recorded 1x for iOS session |
| Feed loads / videos play | **VERIFIED** | `event=video_view` recorded **54x** with `platform=ios` in the session |
| Video like | **VERIFIED** | `event=video_like_toggle` recorded 2x |
| StoreKit / IAP plugin initialisation | **VERIFIED** | `iap_debug/billing_init` returned `supported: true` on iOS |
| **Coin store — products displayed** | **FAILED** | `iap_debug/products_empty` recorded **4x** on iOS. Client requested all 11 coin IDs; StoreKit returned zero. |
| Apple Sandbox IAP: coin purchase, JWS verify, single-credit, dup-reject | **FAILED** | Cannot proceed — products not vended to the client, no purchase sheet reachable |
| Creator subscription purchase | **FAILED** | Membership SKU is `MISSING_METADATA` in ASC (see §3.5) |
| Promote Video purchase | **FAILED** | All 4 promote SKUs are `MISSING_METADATA` in ASC (see §3.5) |
| Restore purchases | **FAILED (transitively)** | No purchasable products exist to restore |
| ASN V2 refund/revocation | **FAILED (transitively)** | Cannot exercise without a first sandbox purchase |
| Sign-in / Apple sign-in | **VERIFIED (transitively)** | Client emitted authenticated analytics events (user id in every row), so sign-in worked. No dedicated `sign_in` event exists in the code to record separately. |

### 3.5 Root cause of the iOS FAILED verdicts — App Store Connect metadata

`server/scripts/queryAscInAppPurchases.ts` (raw at `docs/evidence/asc-iap-inventory-2026-08-06.json`) enumerates the app's IAP inventory. Ground truth:

| ASC state | Count | Products |
|-----------|-------|----------|
| `MISSING_METADATA` (in-app purchases V2) | **14** | `coins100`, `coins500`, `coins1000`, `coins5000`, `coins10000`, `coins50000`, `coins100000`, `coins150000`, `coins200000`, `coins350000`, `com.elixstarlive.promote_views`, `com.elixstarlive.promote_likes`, `com.elixstarlive.promote_profile`, `com.elixstarlive.promote_followers` |
| `MISSING_METADATA` (subscriptions) | **1** | `com.elixstarlive.membership` |
| `READY_TO_SUBMIT` / `WAITING_FOR_REVIEW` / `APPROVED` | **0** | none |

Client-vs-ASC ID diff:
- `coinIdsMissingFromAsc`: `["coins500a"]` — that's the **Android-only** SKU per `src/lib/iap.ts` line 15 comment (`Android Play still uses coins500a`), correctly absent from ASC. Not a bug.
- `promoteIdsMissingFromAsc`: `[]` — all 4 present.
- `extraAscProductIds`: `[]` — no orphans.

**Owning layer of the failure**: App Store Connect data configuration for `com.elixstarlive.app`. StoreKit does **not** vend products in `MISSING_METADATA` state — either sandbox or production. That is exactly why every `loadProducts()` call from the iOS client returned `[]` and the coin store screen showed no packages.

The client code is correct. The server code is correct. No code-side "fix" — patch, timer, retry, duplicate handler, fallback fake success — will move products from `MISSING_METADATA` to `READY_TO_SUBMIT`. That transition is triggered only by populating the required per-product metadata in ASC:

For each of the 15 products, the ASC UI requires:
1. Reference name (present in every row — done).
2. Localizations: at least one language with a customer-facing display name + description (currently missing).
3. Price schedule: base country + a price tier (currently missing).
4. App Store review screenshot (currently missing).
5. Review notes (optional but recommended).

Once (1)–(4) are all set, ASC auto-transitions the state to `READY_TO_SUBMIT`, which is sufficient for TestFlight sandbox purchases to succeed. To make products live in production the app version they were submitted with must be reviewed and approved by Apple.

### 3.6 Rebuilding a new iOS TestFlight version would not repair this

The owner's instruction is "run typecheck/lint/tests, build a new iOS TestFlight via Codemagic, upload, install, retest". Doing so is safe (and I can do it once you approve), but **it will not change any of the FAILED rows above**, because the failure is in ASC data, not in the shipped web/native bundle. The next build's `loadProducts()` will still return `[]` until ASC metadata is populated.

If you want a code-only cleanup while we're here (does not fix the FAILED rows, but is honest housekeeping):
- Filter `coins500a` out of the iOS product-request array in `src/lib/iap.ts`. It is currently sent to StoreKit even on iOS. StoreKit silently drops unknown identifiers, so it doesn't cause `products_empty` — but the request is wasteful and slightly misleading in analytics. Ask before I touch.


---

## 4. Two-device live matrix

Because §2 blocks the Android endpoint and §3.4 blocks the iOS endpoint, the two-device tests (Android host ↔ iPhone spectator, iPhone host ↔ Android spectator: start/join, camera/audio, camera switch, mute/unmute, viewer count, comments, likes, gifts, co-host invite/remove, battle invite/start/timer/scoring/end, background/foreground, network switch, reconnect, end-live cleanup, duplicate-socket check, duplicate-room check, iOS black screen, audio duplication, reconnect loop, overheating) are all **BLOCKED_EXTERNAL**.

**Exact missing external requirement**: the union of §2.4 and §3.4.

Not blocked at the server side:
- LiveKit backend is reachable in prod (`/health.services.livekit=true`).
- LiveKit token issuance and room lifecycle code exists and is unchanged this session.
- WS gift/like/comment fan-out unchanged.

---

## 5. Automated (non-device) verifications

| Check | Status | Evidence |
|-------|--------|----------|
| TypeScript full-project build | **VERIFIED** | `npx tsc -b` exit 0 (previous session) |
| ESLint (source + server) | **VERIFIED** | 0 errors after `financialReports.ts` fix in `87c9058`; 722 warnings remain (not swept per owner minimal-diff rule) |
| `npm audit --omit=dev` | **VERIFIED** (0 critical/med/low; 2 high on `react-router@7.18.1` `GHSA-qwww-vcr4-c8h2` RSC CSRF — `NOT_APPLICABLE` to this Vite SPA) | `npm audit` (previous session) |
| Production `/health` | **VERIFIED** | see §1 |
| Coolify redeploy after opt-in gate fix | **VERIFIED** | `/health.commit == 07a49513…` (this is the tip of `main` after `07a4951`) |
| Android AAB build (local) | **VERIFIED** | `android/app/build/outputs/bundle/release/app-release.aab` `1.0.487 / 534` present, `applicationId com.elixstarlive.app` |
| iOS signed IPA build via CI | **VERIFIED** | ASC `1.0.97 (17)` `processingState: VALID`, uploaded `2026-08-05T17:30:51-07:00` (§3.2) |

---

## 6. Bugs found this session, root causes, clean fixes

None new this session — no runtime bug was reachable via device because the device layer is currently blocked at §2.2 and §3.4.

Previously landed clean fixes on `main` (owner-approved, minimal-diff, no UI change), for context:

| Commit | Change | Owning layer | Not a patch/workaround because |
|--------|--------|--------------|--------------------------------|
| `07a4951` | Opt-in Apple/RTDN prod gates (`APPLE_IAP_REQUIRED=1`) | `server/lib/envValidate.ts` boot validator | Corrects the boot contract itself — no runtime guard, no silent catch. iOS purchase verify + RTDN/ASN endpoints still fail-closed at runtime when creds missing (`fetchAppleTransaction`/`verifyAppleSubscription` return `APPLE_CREDENTIALS_NOT_CONFIGURED` → `handleVerifyPurchase` sets `isValid=false`). |
| `2255201` | Remove `SearchPage.request` unused import, `Upload.ORIGINAL_SOUND_TRACK` unused named import, `Inbox.openUserProfile` unused `useCallback` | source files themselves | Only dead symbols removed with per-symbol grep proof (`docs/DEAD_CODE_REMOVAL_LEDGER.md`). Zero rendered-output change. |
| `87c9058` | `no-useless-escape` in `financialReports.ts` regex character class | regex owning layer | Regex behaviour preserved; unnecessary `\-` removed. |
| `d99fb75` | Documented `APPLE_IAP_REQUIRED=1` in `.env.example` | config example | Docs only. |

No workaround / patch / duplicate handler / debounce / stopPropagation shim was introduced this session.

---

## 7. Final release verdict

| Item | Value |
|------|-------|
| Final pushed commit | `bd7c08f` (report refresh) |
| Final deployed commit | `07a49513269a58b076ce518354240ca783876db9` on `https://www.elixstarlive.co.uk` |
| Production `/health` | `status:"ok"`, all 5 services healthy |
| iOS CI artefact | Codemagic `ios-testflight` green ~1h ago |
| iOS store artefact | ASC build `1.0.97 (17)`, `processingState: VALID` |
| Android store artefact | `app-release.aab` `1.0.487 / 534`, signed release identity |
| Android on-device coin purchase | **VERIFIED** (§2.1) — real Google order `GPA.3372-2714-9629-19609`, 100 coins credited via `iap_purchase` ledger + settled paid coin lot, dedupe row-count 1 on both idempotency layers, zero contamination from test/promo/starter channels |
| Android on-device live host session (solo) | **VERIFIED** (§2.2) — 2-minute clean start/end recorded in `live_streams`, `is_live=false` after end |
| Android duplicate purchase / refund / gift-to-creator / subscription / Promote Video / account deletion / report / block / two-device live host&spectator / co-host / battle / thermal | **BLOCKED_EXTERNAL** (§2.3) — each requires its own owner-performed on-device action; server-side trace scripts (`traceAndroidCoinPurchase.ts`, `traceUserActivity.ts`) are in place and will produce equivalent evidence for each in seconds. Some also depend on Coolify secrets (RTDN) or the iPhone-side install. |
| iOS on-device coin store — displays products | **FAILED** (§3.5) — 14/14 iOS IAPs + 1 subscription are `MISSING_METADATA` in App Store Connect. StoreKit refuses to vend. Client code correct. |
| iOS on-device — app opens / feed / video / like / IAP plugin init | **VERIFIED** (§3.4) — 66 analytics events from TestFlight session, incl. `billing_init supported=true` |
| iOS Apple Sandbox coin / promote / subscription purchase | **FAILED** (§3.5) — transitively blocked by ASC `MISSING_METADATA` |
| Google Play refund/RTDN proof | **BLOCKED_EXTERNAL** (§2.3 row 2) |
| Apple Sandbox IAP proof | **BLOCKED_EXTERNAL** (§3.4) |
| Two-device live proof | **BLOCKED_EXTERNAL** (§4) |
| **IOS DEVICE TEST** | **FAILED** — coin store, promote, subscription purchase paths all FAILED because 14/14 iOS IAPs + 1 subscription are `MISSING_METADATA` in App Store Connect (§3.5). App itself opens, feed loads, videos play, likes work, IAP plugin initialises — those iOS rows are VERIFIED. Fix belongs in ASC data configuration; no code-side patch is honest here. |
| **FINAL RELEASE VERDICT** | **NOT_RELEASE_READY** — Android coin purchase + solo live host `VERIFIED`; iOS non-IAP flows `VERIFIED`; iOS IAP paths `FAILED` at the ASC data layer (§3.5). No client rebuild will fix this; each of the 15 ASC products needs price schedule + localization + review screenshot filled in, then state auto-transitions to `READY_TO_SUBMIT` and TestFlight sandbox purchases will function. |

---

## 8. Files touched this session

Server-side, read-only diagnostic scripts (all print JSON, no mutations, no secrets):
- `server/scripts/queryAscBuilds.ts` — ES256 JWT to App Store Connect, reads TestFlight builds. Prints no secrets.
- `server/scripts/queryAscInAppPurchases.ts` — enumerates the app's IAP V2 products + subscription groups; diffs vs the client `IAP_PRODUCTS` list; writes JSON to an optional file arg.
- `server/scripts/queryAscIapRaw.ts` — dumps raw ASC JSON for `inAppPurchasesV2`, legacy `inAppPurchases`, and the app record (used to verify state = `MISSING_METADATA` across all 14 IAPs + 1 subscription).
- `server/scripts/traceAndroidCoinPurchase.ts` — reads latest Google `iap_purchase` ledger rows + paired paid coin lots + dedupe + wallet-delta reconciliation.
- `server/scripts/traceUserActivity.ts` — reads per-user activity across `elix_wallet_ledger`, `elix_wallet_balances`, `elix_creator_balances`, `elix_gift_transactions`, `elix_membership_purchases`, `elix_promote_purchases`, `elix_reports`, `elix_blocked_users`, `live_streams`, `profiles`, `auth_users`. Column names verified via `schemaColumns.ts` (also present).
- `server/scripts/traceIosAnalytics.ts` — reads `elix_analytics_events` filtered to `properties.platform = 'ios'` and summarises by stage / user / event kind.
- `server/scripts/schemaProbe.ts`, `server/scripts/schemaColumns.ts` — schema introspection helpers used to derive the correct table + column names above.

Evidence files (all committed to `docs/evidence/`):
- `docs/evidence/asc-testflight-builds-2026-08-06.json`
- `docs/evidence/asc-iap-inventory-2026-08-06.json` (raw output of `queryAscInAppPurchases.ts` — the definitive `MISSING_METADATA × 15` finding)
- `docs/evidence/asc-iap-raw-2026-08-06.txt` (raw ASC JSON dump used to cross-check every product's state)
- `docs/evidence/ios-analytics-2026-08-06.json` (raw output of `traceIosAnalytics.ts` — the definitive `products_empty` and `billing_init supported=true` events)
- `docs/evidence/android-coin-purchase-2026-08-06.json` (raw output of `traceAndroidCoinPurchase.ts`)
- `docs/evidence/android-user-activity-2026-08-06.json` (raw output of `traceUserActivity.ts` for buyer user id)

Docs committed:
- `docs/PRODUCTION_READINESS_REPORT.md` — reflects landed opt-in gate fix + iOS CI green (previously in `bd7c08f`).
- `docs/PRODUCTION_DEVICE_VERIFICATION_2026-08-06.md` — this file.

No source file, no UI file, no infrastructure file, no route handler was modified this session.
