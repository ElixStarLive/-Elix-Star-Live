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

## 2. Android device — attempted verification

### 2.1 Physical detection

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

### 2.2 ADB reachability

Commands run in this order:
```
adb kill-server
adb start-server         (→ "daemon started successfully")
adb devices -l           (→ "List of devices attached"  <blank>)
adb reconnect offline    (→ <blank>)
adb devices -l           (→ blank again)
adb -d get-state         (→ "error: no devices found")
```

**Verdict**: **BLOCKED_EXTERNAL**.
**Exact missing external requirement**: on-device authorisation.
The phone-side adbd is not accepting connections despite the ADB Interface being enumerated. Cause: either (a) `Developer Options → USB debugging` is currently OFF, (b) the RSA "Allow USB debugging from this computer?" fingerprint prompt was denied / dismissed / timed out, or (c) the USB mode is "Charging only" (the three interfaces in `Error` support this hypothesis). None of (a)-(c) can be resolved from this shell — they require the owner to unlock the phone and tap Allow.

Because §2.1 proves the device is physically connected and §2.2 proves adbd refuses, no App/APK operation (`install`, `shell`, `logcat`, `screencap`, `input tap`) can be issued.

### 2.3 Consequent Android rows

Every row below is **BLOCKED_EXTERNAL** for the same reason (adbd unreachable). Not repeated per-row; noted here once.

| Test | Status | Missing external |
|------|--------|------------------|
| Confirm on-device Android version, model, storage | **BLOCKED_EXTERNAL** | §2.2 |
| Uninstall old / free storage | **BLOCKED_EXTERNAL** | §2.2 |
| Install new debug / store-equivalent AAB | **BLOCKED_EXTERNAL** | §2.2 |
| Launch, capture cold-boot logcat, screenshot | **BLOCKED_EXTERNAL** | §2.2 |
| Button-by-button UI drive (`adb input tap`) | **BLOCKED_EXTERNAL** | §2.2 |
| Auth / feed / video / upload / search / profile / follow / like / comment / share / save / report / block / unblock / chat / notifications / live host / spectator / co-host / battle / camera / mic / reconnect / network switch / gifts / coins / creator subscription / Promote Video / GBP wallet / account deletion / background↔foreground / thermal | **BLOCKED_EXTERNAL** | §2.2 |
| Google Play licence-tester purchase, verify, credit-once, no recredit | **BLOCKED_EXTERNAL** | §2.2 + Play Console license tester configuration and internal-testing track distribution not visible from agent |
| RTDN void / refund path via real Play event | **BLOCKED_EXTERNAL** | §2.2 + Play Console RTDN Pub/Sub subscription URL not visible from agent |

### 2.4 What is required to move Android rows off BLOCKED_EXTERNAL

Owner-side, exactly:
1. Unlock phone.
2. Settings → About phone → tap Build number 7× (if Developer options not yet enabled).
3. Settings → System → Developer options → USB debugging = ON. (If already ON, toggle OFF/ON to re-arm.)
4. USB mode notification → set to "File transfer / Android Auto" (not "Charging only").
5. When the "Allow USB debugging from this computer?" dialog appears, tap **Allow** (optionally "Always allow from this computer").
6. Reply here so this shell can retry `adb devices -l` and continue.

Once (1)-(6) are done, `adb devices` will show `C3U000000005847 device` and the full §2.3 matrix becomes executable.

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

### 3.4 iOS device functional matrix — attempted

Attempted from this Windows shell:
- Any iOS bridge tool (`ideviceinstaller`, `ios-deploy`, `tidevice`, `iproxy`, `iTunes`) — all **`missing`** (§0 table).
- Any Apple-VID USB device (`VID_05AC`) — **none present** (`Get-PnpDevice` returned no matching row).

**Verdict**: **BLOCKED_EXTERNAL** for every on-device iOS row.
**Exact missing external requirement**: iPhone installation of TestFlight build `1.0.97 (17)` via the TestFlight iOS app (Apple ID = ASC tester), plus Apple Sandbox tester credentials configured in ASC → Users and Access → Sandbox → Testers.

| iOS test | Status | Missing external |
|----------|--------|------------------|
| Install build 1.0.97 (17) on iPhone | **BLOCKED_EXTERNAL** | Owner opens TestFlight app on iPhone, taps Install for "Elix Star Live" build 17. |
| Cold-boot, first-render, no crash | **BLOCKED_EXTERNAL** | after install |
| Sign in / Apple sign-in | **BLOCKED_EXTERNAL** | after install |
| Feed / video playback / camera / mic | **BLOCKED_EXTERNAL** | after install |
| Notifications / push | **BLOCKED_EXTERNAL** | after install |
| Live streaming (host, spectator, reconnect, background/foreground, black screen, thermal) | **BLOCKED_EXTERNAL** | after install |
| Co-host / battle | **BLOCKED_EXTERNAL** | after install |
| Apple Sandbox IAP: coin purchase, JWS verify, single-credit, dup-reject | **BLOCKED_EXTERNAL** | after install + ASC Sandbox tester + product records with matching IDs cleared-for-sale |
| Restore purchases | **BLOCKED_EXTERNAL** | after install |
| ASN V2 refund/revocation | **BLOCKED_EXTERNAL** | after install + ASC ASN V2 URL pointed at production and `APPLE_IAP_NOTIFICATION_SECRET` set in Coolify |

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
| Android on-device functional pass | **BLOCKED_EXTERNAL** (§2.2 — phone-side USB-debug authorisation) |
| iOS on-device functional pass | **BLOCKED_EXTERNAL** (§3.4 — Windows host has no iOS bridge; owner-side TestFlight install required) |
| Google Play sandbox IAP proof | **BLOCKED_EXTERNAL** (§2.3) |
| Apple Sandbox IAP proof | **BLOCKED_EXTERNAL** (§3.4) |
| Two-device live proof | **BLOCKED_EXTERNAL** (§4) |
| **FINAL RELEASE VERDICT** | **NOT_RELEASE_READY** — code + CI + store artefacts + production infra are all `VERIFIED`; the remaining gates are all owner-executed on-device functional tests. The moment owner authorises USB debugging on the Android phone and installs TestFlight build `1.0.97 (17)` on the iPhone, the matrix in §2.3 / §3.4 / §4 can be run from here (Android side) and by the owner (iOS side) without any further code work. |

---

## 8. Files touched this session

- Added (untracked, not committed — diagnostic script): `server/scripts/queryAscBuilds.ts` — ES256 JWT to App Store Connect, reads TestFlight builds. Prints no secrets. No production import surface changes.
- Added (evidence): `docs/evidence/asc-testflight-builds-2026-08-06.json`.
- Modified (committed as `bd7c08f`): `docs/PRODUCTION_READINESS_REPORT.md` — reflects landed opt-in gate fix + iOS CI green.
- Added (this file, about to commit): `docs/PRODUCTION_DEVICE_VERIFICATION_2026-08-06.md`.

No source file, no UI file, no infrastructure file was modified this session.
