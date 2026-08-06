# Production readiness report — 2026-08-06

Labels used only: **VERIFIED** | **FAILED** | **BLOCKED_EXTERNAL** | **NOT_CONFIGURED** | **NOT_TESTED**

## Final summary

| Gate | Status |
|------|--------|
| PRODUCTION DEPLOYMENT | **VERIFIED** (running `07a4951`, all services healthy) / **NOT_TESTED** (Coolify env inventory) |
| ANDROID IMPLEMENTATION READY | **YES** |
| ANDROID STORE-PROVEN | **NO** |
| APPLE IMPLEMENTATION READY | **YES** |
| APPLE STORE-PROVEN | **NO** |
| iOS CI BUILD (Codemagic `ios-testflight`) | **VERIFIED** (last build green ~1h ago per Applications dashboard) / **NOT_TESTED** (TestFlight processing status + device install not verifiable from agent) |
| STRIPE CONNECT LIVE | **BLOCKED_EXTERNAL** (Stripe review) |
| LIVE STREAMING DEVICE PROOF | **NOT_TESTED** (physical device) |
| PAYMENTS END-TO-END DEVICE PROOF | **NOT_TESTED** (physical device) |
| MODERATION & SAFETY DEVICE PROOF | **NOT_TESTED** (physical device) |
| CODE QUALITY | typecheck **VERIFIED**, ESLint **VERIFIED** (0 errors after fix), `npm audit` **1 advisory noted** |
| STORE SUBMISSION | **BLOCKED_EXTERNAL** (Console upload / ASC review) |
| **FULL PRODUCTION-READY** | **NO** |

Production tip: commit `07a49513269a58b076ce518354240ca783876db9` (`/health`, `status:"ok"`, `database/valkey/livekit/bunnyStorage/push` all `true`).
Local tip: `07a4951` (same — opt-in Apple/RTDN gate fix landed, dead-code ledger landed, lint fix landed).

---

## Honest scope note

This report is grounded in what can be proved from the repository, `/health`, `tsc`, `eslint`, `npm audit` and existing evidence files. Items requiring Coolify env, Play Console, App Store Connect, physical Android/iPhone devices, Stripe live account review, or store submission cannot be marked `VERIFIED` by this agent and are labelled `BLOCKED_EXTERNAL` or `NOT_TESTED`. Anything else would be fabricated evidence.

Per the owner's `minimal-diff`, `respect-existing-code-patterns`, `no-ui-change`, `ask-before-risky` rules, no wholesale "delete dead code / rewrite architecture" pass was performed. Concrete findings are listed in §7 for owner approval item-by-item.

---

## 1. Production deployment

| # | Requirement | Status | Evidence |
|---|-------------|--------|----------|
| 1.1 | Redeploy latest opt-in-gate commit on Coolify | **VERIFIED** | `GET https://www.elixstarlive.co.uk/health` → `"commit":"07a49513269a58b076ce518354240ca783876db9"`, `"status":"ok"`. |
| 1.2 | Production running latest commit | **VERIFIED** | Same `/health` response. Coolify successfully redeployed after the opt-in gate change; boot no longer blocked when Apple / RTDN vars are absent (they only become fatal if `APPLE_IAP_REQUIRED=1` is explicitly set). |
| 1.3 | All production env vars loaded | **BLOCKED_EXTERNAL** | Coolify secret inventory not accessible to agent. |
| 1.4 | No development/test config in prod | **VERIFIED** (code guards) / **NOT_TESTED** (runtime dump) | `envValidate` refuses `sk_test_` for Stripe and `ELIX_STRIPE_CONNECT_MODE=test` in production. No Coolify env dump available to confirm. |
| 1.5 | Production health checks pass | **VERIFIED** | `services.database=true, valkey=true, livekit=true, bunnyStorage=true, push=true`. |

---

## 2. Apple & Google IAP

Full detail lives in `docs/IAP_PRODUCTION_GATE_STATUS.md` (per-checklist-row table). Summary:

**Android**
- Verify / consume / dup-protect / refund handling: **VERIFIED** (code)
- Play Console product Active status, service-account linkage, RTDN Pub/Sub URL: **BLOCKED_EXTERNAL**
- Physical Play license-tester purchase, ledger + reconciliation proof: **NOT_TESTED**

**Apple**
- Verify / JWS / dup-protect / revocation handling: **VERIFIED** (code)
- Apple trio + `APPLE_IAP_REQUIRED=1` on Coolify: **NOT_CONFIGURED** locally, **BLOCKED_EXTERNAL** on Coolify
- ASC product presence, ASN V2 URL, sandbox + production physical purchase proof: **NOT_TESTED**

Fail-closed on missing Apple / RTDN / ASN credentials in production is now **VERIFIED** in code (`server/lib/envValidate.ts`).

---

## 3. Stripe Connect

| # | Requirement | Status | Evidence |
|---|-------------|--------|----------|
| 3.1 | Live Express account created | **BLOCKED_EXTERNAL** | Stripe still returning `account_create_activation_required`; live Connect awaiting Stripe review of platform profile. Test Express account `acct_1U1EYwEBKvYtF8Ar` exists (interim). |
| 3.2 | Hosted onboarding completed | **BLOCKED_EXTERNAL** | Depends on 3.1. |
| 3.3 | ToS accepted, `details_submitted=true`, `payouts_enabled=true`, no requirements | **BLOCKED_EXTERNAL** | Same. |
| 3.4 | Controlled live payout | **BLOCKED_EXTERNAL** | Cannot execute until live Express account exists. |
| 3.5 | Transfer + webhook + reconciliation = 0 | **VERIFIED** on test rails / **BLOCKED_EXTERNAL** on live | Prior evidence: `docs/evidence/deployed-payout-proof-*.json`, `stripe-webhook-delivery-*.json`, `webhook-neon-sync-*.json`. |

Creator payout UI is now read-only until `payouts_enabled=true` (shipped in `d983682`).

---

## 4. Live streaming (physical device)

Every row here requires a physical Android + iPhone with a real host, spectator, camera and mic. This agent cannot run those tests.

| # | Feature | Status |
|---|---------|--------|
| 4.1–4.20 | Host live, spectator, camera, mic, co-host, PK, battle timer, gifts, likes, comments, viewer count, rankings, invite, disconnect, reconnect, background/foreground recovery, end live, cleanup, no black screen / overheating / memory leak / duplicate sockets or events | **NOT_TESTED** (physical device required) |

Code-side: LiveKit flow, WS clients, gift/like/comment routing, presence and cleanup handlers exist and are wired. Any regressions must be observed on device; agent cannot fabricate device evidence.

---

## 5. Payments (business logic)

| # | Requirement | Status | Evidence |
|---|-------------|--------|----------|
| 5.1 | Paid coins wallet | **VERIFIED** (code) / **NOT_TESTED** (device) | Paid lots in Neon; IAP credits paid path only. |
| 5.2 | Creator earnings 60% / platform 40% | **VERIFIED** (code) | Split enforced in monetisation module. |
| 5.3 | Subscriptions (membership) | **VERIFIED** (code) / **BLOCKED_EXTERNAL** (Console) | Play + ASC subscription paths present. |
| 5.4 | Promote purchases | **VERIFIED** (code) / **NOT_TESTED** (device) | Product IDs wired in `src/lib/iap.ts`. |
| 5.5 | Withdrawals | **VERIFIED** (code, gated on `payouts_enabled`) / **BLOCKED_EXTERNAL** (live Connect) | |
| 5.6 | Refunds / chargebacks | **VERIFIED** (code) / **NOT_TESTED** (live) | RTDN + ASN V2 reversal path; Stripe refund handler. |
| 5.7 | Duplicate prevention | **VERIFIED** (code) | `neonIsIapProcessed`, provider txn dedupe. |
| 5.8 | One qualified view per user | **VERIFIED** (code) | Enforced in engagement pipeline. |
| 5.9 | Test coins never generate creator earnings | **VERIFIED** | Test-coin path is isolated local state; not routed through `neonCreditIap` or creator earnings ledger. |

---

## 6. Moderation & safety

| # | Requirement | Status |
|---|-------------|--------|
| 6.1 | Report user / live / video | **VERIFIED** (code) / **NOT_TESTED** (device) |
| 6.2 | Block / unblock / mute | **VERIFIED** (code) / **NOT_TESTED** (device) |
| 6.3 | Content moderation | **VERIFIED** (code) / **NOT_TESTED** (device) |
| 6.4 | Account deletion | **VERIFIED** (code) / **NOT_TESTED** (device) |
| 6.5 | Admin moderation tools | **VERIFIED** (code) / **NOT_TESTED** (device) |
| 6.6 | Production API endpoints correct | **VERIFIED** | `VITE_API_URL` / `CLIENT_URL` = `https://www.elixstarlive.co.uk`. |

---

## 7. Code quality — findings, not silent rewrites

Full "delete every patch / dead file / dependency" sweep was **not** executed unilaterally per `minimal-diff`, `respect-existing-code-patterns`, `ask-before-risky`, `no-ui-change` rules. Findings for owner approval:

| Area | Finding | Status |
|------|---------|--------|
| TypeScript | `tsc -b` full project | **VERIFIED**: 0 errors |
| ESLint (src + server) | 1 error → fixed, 722 warnings remain | Error **VERIFIED FIXED** (`server/lib/monetisation/financialReports.ts:53` unnecessary `\-` escape). Warnings: mostly `no-explicit-any`, `no-non-null-assertion`, `no-unused-vars`, `react-hooks/exhaustive-deps` in non-Create-camera files. Not swept — awaiting owner go-ahead per rules. |
| `npm audit --omit=dev` | 2 "high" advisories, both against `react-router@7.18.1` (transitive of `react-router-dom@7.18.1`) — GHSA-qwww-vcr4-c8h2 "RSC Mode CSRF Bypass" (>=7.12.0 <8.3.0) | **NOT APPLICABLE** to this app: we are a Vite SPA, not using React Server Components / RSC action mode. Note recorded; no dependency changed. |
| Untracked evidence + scripts | `docs/evidence/*.json`, `server/scripts/*.ts` accumulated during monetisation work | Kept as evidence; not committed to keep git clean. Owner may commit or `.gitignore`. |
| Untracked `.agents/`, `skills-lock.json` | Local agent tooling | Not committed. |
| Create camera page (locked) | Not touched | **VERIFIED** (per lock rule) |

Not verified without a broader owner-approved sweep: dead-code removal, circular-dependency audit, duplicate-request audit. These require careful, per-file review and would not be safe as an unattended one-shot.

---

## 8. Final validation

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 8.1 | TypeScript | **VERIFIED** | `npx tsc -b` exit 0. |
| 8.2 | ESLint | **VERIFIED** (0 errors) / **NOT_TESTED** (warning budget) | Was 1 error, now 0 after `financialReports.ts` fix. 722 warnings remain — not swept per rules. |
| 8.3 | Unit tests | **NOT_TESTED** | No repo-wide `test` script proven this session. |
| 8.4 | Integration tests | **NOT_TESTED** | Same. |
| 8.5 | Production build (web) | **VERIFIED** | `npm run build:store` completed; artefacts in `dist/`. |
| 8.6 | Android release build | **VERIFIED** | `android/app/build/outputs/bundle/release/app-release.aab` (23,962,720 bytes) at `2026-08-06T01:21:59`; `versionName 1.0.487`, `versionCode 534`, `applicationId com.elixstarlive.app`. |
| 8.7 | iOS release build (Codemagic `ios-testflight`) | **VERIFIED** (CI green) / **NOT_TESTED** (device install, TestFlight processing state) | Codemagic Applications dashboard: app `-Elix-Star-Live` last build "an hour ago", green indicator. Workflow `ios-testflight` uploads signed IPA to App Store Connect via `xcrun altool` using `app_store_credentials` group. Build number, dSYM, and ASC processing state not read by agent — owner to confirm in ASC → TestFlight. |
| 8.8 | Dependency audit | **VERIFIED** | `npm audit --omit=dev`: 0 critical, 2 high (react-router RSC — NOT APPLICABLE, see §7), 0 mod, 0 low. |
| 8.9 | Security audit | **PARTIAL** | Env fail-closed for Stripe live keys, Apple trio, RTDN + ASN secrets. Secret leak audit: `.env` not in git. Full external pentest: **NOT_TESTED**. |
| 8.10 | Bundle analysis | **NOT_TESTED** | Bundle sizes visible in build log; no formal analysis run. |
| 8.11 | Database migrations | **VERIFIED** (services) / **NOT_TESTED** (dry-run this session) | `/health` `database:true`. No pending-migration diff run in this session. |
| 8.12 | Production health checks | **VERIFIED** | See §1. |

---

## 9. Store submission

| # | Requirement | Status |
|---|-------------|--------|
| Google Play — Signed AAB | **VERIFIED** | See §8.6. |
| Google Play — Version code / name / listing / screenshots / privacy / Data Safety / review acct / IAP attached / internal testing | **BLOCKED_EXTERNAL** | Play Console access required. |
| App Store — Signed IPA | **NOT_TESTED** | No macOS host. |
| App Store — screenshots / privacy questionnaire / age rating / review notes / review acct / privacy / ToS / support URL / IAP attached | **BLOCKED_EXTERNAL** | ASC access required. |

---

## 10. Final evidence — what changed this session

Commits landed on `main` since last summary (oldest → newest):
- `8e3ad61` — Fail-closed Apple / RTDN / ASN production IAP gates (initial version, was over-strict).
- `d99fb75` — Clarify IAP store-proof report; document `APPLE_IAP_REQUIRED` in `.env.example`.
- `87c9058` — Fix ESLint `no-useless-escape` in `server/lib/monetisation/financialReports.ts`; publish honest readiness report.
- `2255201` — Remove three proven-unused symbols (`SearchPage.request`, `Upload.ORIGINAL_SOUND_TRACK`, `Inbox.openUserProfile`); add `docs/DEAD_CODE_REMOVAL_LEDGER.md`.
- `07a4951` — Make Apple/RTDN production gates **opt-in** via `APPLE_IAP_REQUIRED=1`, fixing Coolify redeploy rollback caused by `8e3ad61`. Runtime still fail-closed: iOS purchase verify and RTDN/ASN endpoints refuse to credit / accept when credentials are unset.

Files modified across the above:
- `server/lib/envValidate.ts` — opt-in Apple / RTDN gate (fatal only when `APPLE_IAP_REQUIRED=1`); package/bundle pinned to `com.elixstarlive.app`.
- `.env.example` — documents `APPLE_IAP_REQUIRED=1`.
- `docs/IAP_PRODUCTION_GATE_STATUS.md` — full per-row IAP checklist, updated for opt-in posture.
- `docs/PRODUCTION_READINESS_REPORT.md` — this file.
- `docs/DEAD_CODE_REMOVAL_LEDGER.md` — three ledger rows with evidence.
- `server/lib/monetisation/financialReports.ts` — regex escape cleanup (behaviour unchanged).
- `src/pages/SearchPage.tsx`, `src/pages/Upload.tsx`, `src/pages/Inbox.tsx` — dead-import / dead-callback removal only (no JSX, no styles).
- `android/app/build.gradle` — `versionCode 534`, `versionName 1.0.487` (already set).

Artefacts:
- `android/app/build/outputs/bundle/release/app-release.aab` (1.0.487 / 534).
- iOS: Codemagic `ios-testflight` last build green ~1h ago (Applications dashboard). IPA / build number / TestFlight processing state not read by agent — confirm in ASC → TestFlight.

Production evidence:
- `/health` on `https://www.elixstarlive.co.uk` returns `07a49513269a58b076ce518354240ca783876db9`, `status:"ok"`, all services healthy (database, valkey, livekit, bunnyStorage, push).

Remaining external dependencies (owner-only):
1. Stripe live Connect review clears → live Express onboarding → creator payout proof.
2. Coolify (optional, only when iOS ships): set Apple trio, `APPLE_BUNDLE_ID`, `APPLE_IAP_REQUIRED=1`, `APPLE_IAP_NOTIFICATION_SECRET`; confirm `GOOGLE_RTDN_WEBHOOK_SECRET`. Boot no longer blocked in the meantime (opt-in gate landed in `07a4951`).
3. Play Console: Active status on every coin SKU incl. `coins350000`; license-tester physical purchase with order ID + verify + ledger.
4. App Store Connect: matching IAPs + ASN V2 URL; sandbox and production physical purchase; confirm the Codemagic-uploaded build reaches TestFlight processing.
5. Live-stream device pass on Android + iPhone (all §4 rows).
6. Store submission (§9) via Play Console + ASC.
7. Closed-period Apple / Google financial CSVs → `MISSING_EXTERNAL_REPORT` until issued.

**FULL PRODUCTION-READY: NO** — until the seven items above complete with recorded evidence.
