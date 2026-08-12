# FULL CLEANUP AUDIT — Elix Star Live

**Mode:** READ-ONLY inventory (no deletions in this pass)  
**Date:** 2026-08-12  
**HEAD:** `6b67914` — Remove remaining money-lying patches for production honesty.  
**Rules:** UI/layout frozen · server connection frozen · no auto-delete without caller trace  

Raw scanner outputs: `docs/_cleanup_audit_raw/`

---

## Tool availability

| Tool | Status | Notes |
|------|--------|-------|
| TypeScript (`tsc -b --noEmit`) | **RAN** | exit 0 |
| ESLint (`eslint .`) | **RAN** | exit 0 — 0 errors, 1 warning |
| Vitest (`npm test`) | **RAN** | 228 passed, 31 skipped (DB-gated), 0 failed |
| Knip 6.32.2 | **RAN** | exit 1 (findings present) |
| jscpd 5.0.14 | **RAN** | 204 clones / 2.73% duplicated lines |
| Semgrep | **UNAVAILABLE** | not installed; `@semgrep/cli` 404 on npm (Windows host) |
| SonarQube / sonar-scanner | **UNAVAILABLE** | binary not on PATH; no Sonar project token in repo |

Gate numbers that require Semgrep/Sonar cannot be claimed PASS until those tools are installed and re-run.

---

## Totals scanned

| Scope | Count |
|-------|------:|
| `src` + `server` `*.ts` / `*.tsx` files | **455** |
| jscpd files analyzed (ts/tsx/css/sql/md) | **452** |
| jscpd total lines | **119425** |
| Vitest test files | **38** (35 pass / 3 skip) |

---

## TypeScript

```
TypeScript errors: 0
Command: npm run check  (tsc -b --noEmit)
Exit: 0
Evidence: docs/_cleanup_audit_raw/tsc.txt
```

---

## ESLint

```
ESLint errors:   0
ESLint warnings: 1
Command: npm run lint
Exit: 0
Evidence: docs/_cleanup_audit_raw/eslint.txt
```

| File | Line | Rule | Finding |
|------|-----:|------|---------|
| `server/routes/gifts.ts` | 26 | `@typescript-eslint/no-unused-vars` | `getPromoBalance` imported but unused after atomic promo spend refactor |

---

## Tests

```
Failed tests: 0
Passed: 228
Skipped: 31 (DB integration suites without Neon)
Command: npm test
Evidence: docs/_cleanup_audit_raw/vitest.txt
```

---

## Knip findings

Evidence: `docs/_cleanup_audit_raw/knip.txt`

### Unused files (19) — DO NOT auto-delete

| File | Classification after trace | Safe to remove? |
|------|----------------------------|-----------------|
| `loadtest/*` (9 files) | Ops load-test harness; not imported by app runtime | **YES** after owner confirm — not connected to app routes |
| `public/env.js` | Runtime env injection for Capacitor/web deploy | **NO** — platform runtime |
| `public/legal-doc.css` | Legal page styling asset | **TRACE** CSS link before delete |
| `scripts/check-env-readiness.mjs` | Ops script; npm may not reference | **YES** if unused by Coolify/docs |
| `server/middleware/requestId.ts` | Middleware — check `server/index.ts` registration | **TRACE** — may be dead if never mounted |
| `server/scripts/_env.ts` | Shared by migrate/smoke scripts via relative import | **NO** — script helper |
| `server/scripts/checkMigrationApplied.ts` | Ops migrate tooling | **KEEP** production ops |
| `server/scripts/postMigrateVerify.ts` | Ops migrate tooling | **KEEP** |
| `server/scripts/schemaColumns.ts` | Ops migrate tooling | **KEEP** |
| `src/features/live/index.ts` | Barrel export; may be unused if deep imports only | **TRACE** then remove barrel only |

### Unused dependencies

| Package | Classification | Safe to remove? |
|---------|----------------|-----------------|
| `@capacitor/clipboard` | Capacitor plugin — may be used via native bridge only | **TRACE** imports in `src` |
| `@testing-library/*` (dev) | Test tooling; knip marks unused if no RTL tests | **MAYBE** if no component tests use them |
| `babel-plugin-react-dev-locator` | Dev locator | **LIKELY YES** |
| `pino-pretty` | Server log pretty in dev | **TRACE** server logger |
| `playwright` | Browser automation — leftover after Express script purge | **YES** if no remaining Playwright scripts |

### Unused exports (98) / unused types (37)

Most are **library public API / server helpers** still called dynamically or reserved for admin/ops. Knip “unused export” ≠ dead file. Each must be traced before deletion. High-priority **abandoned** candidates:

| Export / file | Why suspected abandoned |
|---------------|-------------------------|
| `src/lib/commercialFaceEffects.ts` (`initCommercialFaceEngine`, `isCommercialSdkActive`) | Commercial Face AR never loads; owner ordered Face AR removal |
| `src/lib/faceARRenderer.ts` / `FaceAREffectType` | Face AR stack |
| `src/lib/faceLandmarks.ts` exports | Face AR / MediaPipe face track for AR only |
| `src/lib/liveFaceEffectsProvider.ts` | Face AR engine resolver |
| `src/components/FaceARGift.tsx` | Face AR gift overlay |
| `src/components/LiveFaceEffectsLayer.tsx` | Face AR FX layer |
| `spendPromoCoins` (engagement) | Superseded by `spendPromoCoinsAndRecordGift` — **leftover after proper fix** |

### Duplicate exports (7)

Aliases in `profileFrame.ts` / `settingsNav.ts` / `postgres.connectPostgres` vs `initPostgres` — intentional naming aliases unless proven unused.

---

## jscpd duplicate groups

Evidence: `docs/_cleanup_audit_raw/jscpd/jscpd-report.json` + console summary

```
Clones found:           204
Duplicated lines:       3255 (2.73%)
Duplicated tokens:      21294 (2.83%)
```

### High-priority unwanted duplicate implementations (must unify)

| Group | Files | Why unwanted | Proper replacement |
|-------|-------|--------------|--------------------|
| **IAP product catalogs** | `server/lib/monetisation/storeProductCatalogs.ts` ↔ `src/lib/storeProductCatalogs.ts` (and `src/lib/iap.ts` re-exports) | Two catalogs can drift SKUs | Single shared module or generated contract from one owner |
| **Repost row shape** | `server/lib/repostsNeon.ts` ↔ `src/features/reposts/repostsApi.ts` | Client/server DTO copy-paste | Shared type package or OpenAPI-derived type |
| **XP award SQL** | `server/lib/awardLiveWatchXp.ts` ↔ `server/lib/starterCoinsXp.ts` | Duplicate award path | One XP award owner |
| **Host vs spectator gift send** | `useLiveHostController.tsx` / `useLiveSpectatorController.tsx` large parallel branches | Duplicate money UX surface | Shared gift-send controller (behavior-preserving) |
| **Avatar rings** | `AvatarRing.tsx` vs `StoryGoldRingAvatar.tsx` | Overlapping ring role | Keep both only if distinct UI roles (UI freeze — do not merge visuals) |
| **LiveMarkedTopUi exports** | many capsules exported unused | Dead export surface | Delete unused exports after import trace |

### Acceptable / structural clones (not patches)

- Repeated SQL row mappers in `postgres.ts` shop CRUD  
- Admin Withdrawals/Purchases table row JSX  
- Settings Safety/Security form blocks  
- Auth store login/register session apply blocks  

---

## Semgrep

```
Semgrep workaround violations: TOOL UNAVAILABLE
```

Install path for follow-up (owner machine): Python `pip install semgrep` then:

```bash
semgrep --config p/typescript --config p/react --config p/security-audit src server
```

Custom rules recommended once installed:

- empty `catch` / `.catch(() => {})` outside media play  
- `eslint-disable` / `@ts-ignore`  
- `as any`  
- dual `localStorage` + server write for consent/auth  

---

## SonarQube

```
Sonar blocker issues:   TOOL UNAVAILABLE
Sonar critical issues:  TOOL UNAVAILABLE
```

No `sonar-project.properties` / scanner in repo. Cannot invent green Sonar numbers.

---

## Suspected patches / workarounds / leftovers

Format: `FILE | LINES | CURRENT PURPOSE | WHY PATCH/WORKAROUND | ROOT CAUSE | PROPER REPLACEMENT | DEPENDENCIES | SAFE TO REMOVE?`

### P1 — Owner ordered removal (Face AR entire stack)

| FILE | LINES | CURRENT PURPOSE | WHY PATCH/WORKAROUND | ROOT CAUSE | PROPER REPLACEMENT | DEPENDENCIES | SAFE TO REMOVE? |
|------|------:|-----------------|----------------------|------------|--------------------|--------------|-----------------|
| `src/components/FaceARGift.tsx` | all | Canvas face overlay on gift | Commercial SDK stub never ready; MediaPipe decorative only | Product abandoned Face AR | Remove component; gifts keep video overlay only | `LiveHostScreen`, host controller | **YES — owner ordered** |
| `src/components/LiveFaceEffectsLayer.tsx` | all | Persistent face FX | Same stub stack | Abandoned | Remove | `LiveHostScreen` | **YES** |
| `src/lib/faceARRenderer.ts` | all | Draw crown/glasses/etc | Only used by Face AR | Abandoned | Delete | FaceARGift, LiveFaceEffectsLayer | **YES** |
| `src/lib/faceLandmarks.ts` | all | MediaPipe face pose | Only Face AR | Abandoned | Delete | Face AR libs | **YES** after import trace |
| `src/lib/commercialFaceEffects.ts` | all | Commercial SDK slot always false | Honest stub still leftover | Never wired SDK | Delete | Face AR components | **YES** |
| `src/lib/liveFaceEffectsProvider.ts` | all | Engine env resolver | Only Face AR | Abandoned | Delete | Face AR | **YES** |
| `src/features/live/host/useLiveHostController.tsx` | ~4508–4536, 4699, 4917, exports | `activeFaceARGift` / `maybeTriggerFaceARGift` | Triggers AR on `face_ar_*` gift ids | Abandoned feature | Remove state + triggers; leave gift send/video | Gift catalog may still have `face_ar_*` ids (animation only) | **YES logic remove** |
| `src/features/live/host/LiveHostScreen.tsx` | ~45,51,194,224,721–730,1235–1244 | Renders FaceARGift / LiveFaceEffectsLayer | Face AR UI mount | Abandoned | Remove JSX mounts only (no layout redesign of remaining controls) | Controller exports | **YES** |

### P1 — Dead leftover after prior proper fix

| FILE | LINES | CURRENT PURPOSE | WHY PATCH/WORKAROUND | ROOT CAUSE | PROPER REPLACEMENT | DEPENDENCIES | SAFE TO REMOVE? |
|------|------:|-----------------|----------------------|------------|--------------------|--------------|-----------------|
| `server/routes/gifts.ts` | 26 | Unused `getPromoBalance` import | Leftover after atomic `spendPromoCoinsAndRecordGift` | Incomplete cleanup | Delete unused import | none | **YES** |
| `server/lib/engagement.ts` | `spendPromoCoins` export | Old promo debit without gift tx | Duplicate of atomic path | Refactor incomplete | Confirm no callers → delete | Knip unused | **TRACE then YES** |

### P1 — Ops leftovers not connected to app runtime

| FILE | LINES | CURRENT PURPOSE | WHY LEFTOVER | ROOT CAUSE | PROPER REPLACEMENT | DEPENDENCIES | SAFE TO REMOVE? |
|------|------:|-----------------|--------------|------------|--------------------|--------------|-----------------|
| `loadtest/**` | all | k6-style load scripts outside app | Not wired to routes/UI | Old capacity testing | Keep in separate repo or delete | none in app | **YES** |
| `playwright` (package.json) | dep | Browser automation | Scripts deleted | Dep orphan | Remove dependency | none remaining | **YES** after confirm |

### P2 — Architecture smell (not auto-delete)

| FILE | LINES | CURRENT PURPOSE | WHY PATCH/RISK | ROOT CAUSE | PROPER REPLACEMENT | DEPENDENCIES | SAFE TO REMOVE? |
|------|------:|-----------------|----------------|------------|--------------------|--------------|-----------------|
| Host/spectator local `coinBalance` + `useWalletStore` | live controllers | Dual wallet UI sources | Stale balance risk | Controllers grew before wallet store | Single wallet owner for paid UI | IAP/gifts | **NO delete** — refactor carefully without UI change |
| Gift dual WS + `ELIX_GIFT_PILL_EVENT` | locked gift overlays | Dual ingest | Locked owner files | Historical local pill + WS | Owner must unlock before change | Gift overlays | **NO without unlock** |
| Catalog `storeProductCatalogs` duplicated client/server | catalogs | SKU lists | Drift risk | No shared package | One generated source | IAP verify | **Unify later** |

### P3 — Not patches (keep)

| Pattern | Why legitimate |
|---------|----------------|
| `video.play().catch(() => {})` | Browser autoplay policy; not money soft-fail |
| Storage `catch { ignore }` on Preferences/localStorage | Quota/private mode |
| “keep prior X — do not soft-empty” + `reportFailure` | Honest failure handling |
| `eslint-disable react-hooks/exhaustive-deps` with comment | Documented mount-once; do not suppress blindly — fix deps only when safe |
| Media cleanup try/catch | Teardown safety |

---

## Unused / dead files (summary)

**Proven removable after this audit (connectedness checked):**

1. Entire Face AR stack (owner ordered) — list in P1  
2. `loadtest/**` — not imported by app  
3. Unused `getPromoBalance` import in `gifts.ts`  
4. `playwright` dep if no scripts remain  

**Not removable without further trace:** Knip unused exports, `public/env.js`, migrate scripts, Capacitor clipboard until import search.

---

## Obsolete dependencies (candidates)

| Dep | Reason |
|-----|--------|
| `playwright` | Express/ASC headed scripts removed |
| `babel-plugin-react-dev-locator` | Dev-only, unused by production build |
| `@capacitor/clipboard` | Confirm zero imports |

---

## Architecture violations

1. **Dual IAP catalogs** — **resolved in pass 3** (single owner `src/lib/storeProductCatalogs.ts`; server re-exports)  
2. **Dual live wallet UI state** — **partially resolved in pass 3** (live gift paths sync via `useWalletStore`; local display state retained for GiftPanel)  
3. **Mega controllers** (`useLiveHostController` / `useLiveSpectatorController`) owning too many domains  
4. **Face AR commercial stub** — **removed in pass 2**  
5. **Locked gift dual listeners** (owner lock — not touched in cleanup without unlock)

---

## Production / test contamination

| Item | Status |
|------|--------|
| Test coins | Separated; mint gated; not IAP/Stripe | OK by design |
| `loadtest/` | Present in repo but not production bundle | Remove recommended |
| Vitest DB suites skipped without Neon | Expected | OK |
| `VITE_ALLOW_TEST_COINS` | Store build must stay 0 | Verify `.env.store` |

---

## Production / mobile build gate (this pass)

| Gate | Status |
|------|--------|
| Production build (`vite` / `build:store`) | **NOT RUN in this read-only pass** |
| Android release AAB | **NOT CLAIMED** (prior background build may exist; re-run after cleanup) |
| iOS release | **NOT RUN** (macOS / Xcode required) |

---

## Clean gate — current evidence (honest)

```text
TypeScript errors:                  0
ESLint errors:                      0
ESLint warnings:                    1  (unused getPromoBalance)
Knip unexplained unused files:      19 reported — NOT all removable
Knip unexplained unused exports:    98 reported — require per-export trace
Knip unused dependencies:           1 runtime + several dev candidates
jscpd unwanted duplicate impls:     >0 (catalogs, XP, host/spectator) — NOT 0
Semgrep workaround violations:      TOOL UNAVAILABLE
Sonar blocker issues:               TOOL UNAVAILABLE
Sonar critical issues:              TOOL UNAVAILABLE
Known temporary patches:            Face AR stack + promo import leftover + loadtest/
Known workarounds:                  Dual wallet UI sources; locked gift dual listeners
Abandoned implementations:          Face AR commercial SDK path
Failed tests:                       0

Production build:                   NOT YET RE-VALIDATED THIS PASS
Android release build:              NOT YET RE-VALIDATED THIS PASS
iOS release build:                  NOT RUN
```

**Verdict (pass 1):** App was **not** fully clean. Inventory complete.

---

## Pass 2 progress (after inventory — 2026-08-12)

Executed after `docs/FULL_CLEANUP_AUDIT.md` existed:

| Action | Status |
|--------|--------|
| Face AR stack removed (`FaceARGift`, `LiveFaceEffectsLayer`, renderer, landmarks, commercial stub, provider) | DONE |
| Host Face AR triggers + face-effect row removed | DONE |
| CSS filter Effects row kept (non-AR) | DONE |
| `spendPromoCoins` obsolete function removed | DONE |
| `getPromoBalance` unused import removed from `gifts.ts` | DONE |
| `loadtest/` deleted | DONE |
| Deps removed: `@mediapipe/tasks-vision`, `@capacitor/clipboard`, `playwright`, `babel-plugin-react-dev-locator` | DONE |
| `server/middleware/requestId.ts` deleted (inline request id remains in `server/index.ts`) | DONE |
| Android bump 1.0.595 / 642 | DONE |
| tsc | 0 errors (re-check after final lint fix) |
| Semgrep / Sonar | Still unavailable on this host |

Still open after pass 2 (see pass 3 for catalog/wallet progress): locked gift dual listeners, remaining Knip unused exports, jscpd host/spectator duplication, Semgrep/Sonar install.

---

## Pass 3 progress (2026-08-12)

| Action | Status |
|--------|--------|
| Single IAP catalog owner: `src/lib/storeProductCatalogs.ts` (+ `gateProviderProduct`); server re-exports only | DONE |
| Deleted unused barrel `src/features/live/index.ts` | DONE |
| Deleted unused `scripts/check-env-readiness.mjs` | DONE |
| Spectator + host gift balance paths write `useWalletStore.applyServerBalances` | DONE |
| Spectator mirrors store → GiftPanel local balances (same pattern as host) | DONE |
| Catalog vitest (client + server) | 15 passed |
| tsc / eslint on touched live + catalog files | 0 errors |
| Locked gift dual listeners | NOT TOUCHED (owner lock) |
| Semgrep / Sonar | Still unavailable on this host |

Remaining: mega-controller split (optional), locked gift listeners (needs unlock), Knip unused-export traces, Semgrep/Sonar install, full re-gate + smoke.

---

## Pass 4 progress (2026-08-12)

| Action | Status |
|--------|--------|
| Knip re-run (`docs/_cleanup_audit_raw/knip-pass4.txt`) | DONE |
| **Test coins module kept intact** (`src/lib/testCoins.ts` — never treat as dead) | DONE |
| Dead unused sound wrappers removed (`fetchSoundCatalog` path, `EMPTY_TRACK`, `getLocalSoundPickerTracks`, `fetchGlobalMusicPlaylist`) | DONE |
| Dead unused helpers removed (`formatWatchClock`, `mysteryRemainingMs`, `giftGoalRemaining`, `isWatchLiveProfilePath`, `releaseParticipantRemoteVideo`) | DONE |
| LiveMarkedTopUi: unexport internal capsules; delete never-mounted `LiveGiftComboColumn` | DONE |
| Dead `comboStack` state removed from host/spectator controllers (screens never read it; round combo button kept) | DONE |
| Server store catalog re-exports slimmed to used symbols | DONE |
| Unused `@testing-library/*` devDeps removed | SKIPPED (leave deps; not authorized this turn) |
| Locked gift overlays / Inbox / etc. | NOT TOUCHED |

---

## Pass 5 — full required tool gate (2026-08-12)

### Tools actually run (recorded)

| Tool | Command / evidence | Result |
|------|--------------------|--------|
| **Knip** | `npx knip` → `docs/_cleanup_audit_raw/knip-pass5.txt` | exit 1 — findings present (6 unused files classified KEEP; 204 unused exports require per-export trace; **testCoins not deleted**) |
| **jscpd** | `npx jscpd src server` → `jscpd-pass5/` + `.txt` | exit 0 — **206 clones**, 2.71% duplicated lines |
| **TypeScript** | `npx tsc -b` → `tsc-pass5.txt` | **0 errors** (exit 0) |
| **ESLint** | `npx eslint src server` → `eslint-pass5-final.txt` | **0 errors** (exit 0) after ignoring `tools/_audit` |
| **Vitest** | `npm test` → `vitest-pass5-final.txt` | **228 passed / 31 skipped** (exit 0) |
| **Semgrep** | local venv `tools/_audit/semgrep-venv` + `semgrep-rules.yaml` → `semgrep-pass5-final.json` | **RAN** — 386 findings (almost all empty/comment-only `catch`; 4× `as any` in locked Create camera file). **No history.back hits.** |
| **SonarScanner** | `npx sonarqube-scanner -Dsonar.host.url=http://127.0.0.1:9000` → `sonar-pass5.txt` | **BLOCKED** — scanner installed/ran; `ECONNREFUSED 127.0.0.1:9000`; `SONAR_TOKEN` unset; Docker not installed (`docker` command missing — `sonar-docker-probe.txt`) |
| **Production build** | `npm run build:store` → `build-store-pass5-final.txt` | **exit 0** |
| **Android release** | `cap sync` + `gradlew bundleRelease` → `aab-pass5-final.txt` | **PASS** — BUILD SUCCESSFUL; version **1.0.597** / 644 |
| **iOS release** | N/A on this host | **NOT APPLICABLE** — Windows 10, no Xcode |

### Semgrep triage (not blind-delete)

| Finding class | Count | Verdict |
|---------------|-------|---------|
| Empty / comment-only `catch` | ~191×2 (duplicate rules) | **OPEN inventory** — many are intentional defensive media/LiveKit/localStorage teardown; money/auth paths need **per-site** root-cause review under server-edit permission. Do **not** mass-rewrite. |
| `as any` | 4 | **BLOCKED** — all in locked `ElixCameraLayout.tsx` (Create camera lock) |
| HACK/FIXME comment rule | 0 after rule tightened to comment-prefix only | Prior hits were false positives (`hack` in Terms / caption marketing copy) |

### jscpd high-priority groups (semantic)

| Group | Status |
|-------|--------|
| IAP catalogs client↔server | **FIXED earlier** — server re-exports; remaining clone is **intra-file** Apple/Google product object shape (legitimate parallel catalogues) |
| XP award SQL `awardLiveWatchXp` ↔ `starterCoinsXp` | **OPEN / BLOCKED** — server money-adjacent unify needs explicit server-permission pass |
| Host↔spectator gift branches | **OPEN** — structural; UI freeze; shared helper extract only with behavior-identical diff |
| Settings Safety/Security form clones | **ACCEPTABLE** — structural UI forms; UI freeze |

### Knip unused files (reconfirmed)

| File | Verdict |
|------|---------|
| `public/env.js`, `public/legal-doc.css` | **KEEP** — runtime/legal assets |
| `server/scripts/*` migrate helpers | **KEEP** — ops |
| `@testing-library/*`, `pino-pretty` | **KEEP for now** — pino-pretty used dynamically by logger; RTL reserved |

### Clean gate — honest final (Pass 5)

```text
TypeScript errors:                  0
ESLint errors (src+server):         0
Failed tests:                       0
Knip unexplained unused files:      6 reported — all classified KEEP / ops
Knip unused exports:                204 — require continued per-export TRACE (testCoins KEEP)
jscpd unwanted duplicate owners:    >0 (XP award SQL; host/spectator gift) — NOT 0
Semgrep workaround findings:        RAN — empty-catch inventory OPEN; no history.back
Sonar blocker/critical:             BLOCKED — no SonarQube server/token on this host
Production build:                   PASS (build:store)
Android release build:              see AAB evidence this pass
iOS release build:                  NOT APPLICABLE (Windows)
Known temporary patches:            none newly introduced this pass
Test coins:                         PRESERVED (owner order)
```

**Verdict:** App is **not** “fully clean forever.” Required tools were **run** (Sonar blocked only after real scanner attempt). Locally actionable Pass 4 leftovers are in tree for commit with this evidence.

---

## Next actions (remaining after Pass 5)

1. Owner: provide SonarQube/SonarCloud URL + token (or approve local SonarQube install) to unblock Sonar gate zeros.  
2. Owner: unlock server-file edits for XP award SQL unify + prioritized silent-catch money paths.  
3. Continue Knip unused-export traces (**never** `testCoins`).  
4. Shared gift-send extract (behavior-identical) when ordered.  
5. Local smoke after commit/push.

---

## Pass 6 progress (2026-08-12) — continue full app

| Action | Status |
|--------|--------|
| Shared XP apply owner `server/lib/xpProgressionApply.ts` used by live-watch + paid-gift XP | DONE |
| jscpd XP award SQL duplicate owners unified | DONE (root cause) |
| IAP barrel re-exports of catalogs removed (single owner remains `storeProductCatalogs`) | DONE |
| Dead `PremiumSidebarButton` removed (never mounted) | DONE |
| Dead AvatarRing `USER_CIRCLE_GLOW` re-export removed | DONE |
| `parseWalletBalances` unexported (internal to walletApi) | DONE |
| **testCoins** | UNTOUCHED |
| Sonar | Still BLOCKED (no server/token) — not fake-pass |
| Remaining Knip unused exports | Mostly server public API / design tokens — KEEP with TRACE; not mass-deleted |
| Remaining Semgrep empty-catch | OPEN inventory — intentional defensive teardowns; money paths need per-site unlock |
| Host↔spectator gift mega-controllers | OPEN structural — UI freeze |

**Locally actionable Pass 6 complete.** Remaining gate items are BLOCKED/OPEN with evidence, not abandoned silently.

---

## Pass 7 (2026-08-12) — finish locally actionable Knip src exports

### What was safe to change
- Unexported / removed confirmed-dead **client** exports after import TRACE (`docs/_cleanup_audit_raw/knip-pass7-trace.txt` + post-edit `knip-pass7-after.txt`).
- Dead AI helper bodies, unused interactionTracker surface, unused payout/likes API helpers, unused battle/cohost helpers, unused profileFrame tokens, unused liveWsOn helper, unused liveKitSession re-exports, unused royce asset barrel re-exports, etc.
- **testCoins** exports left exported (owner KEEP — Knip still reports them; do not delete).

### What was not touched
- Locked UI files (gift overlays, Inbox, ChatThread, VideoCall, Create camera, Comments).
- Server public-API unused exports (TRACE/KEEP — route/module surface).
- Sonar (still no host/token).
- Mass empty-catch rewrites (Semgrep inventory OPEN).
- Host↔spectator gift mega-controller unify (UI freeze).

### Tool gate (Pass 7)

| Tool | Result |
|------|--------|
| **tsc -b** | **0 errors** |
| **eslint src server** | **0 errors** |
| **vitest** | **228 passed / 31 skipped** |
| **Knip** | Unused exports **105** (was ~192 after Pass 6 / 117 mid-Pass-7); remaining mostly **server** + **testCoins KEEP** + classified unused files KEEP |
| **Sonar** | **BLOCKED** — no SonarQube/SonarCloud |
| **iOS** | **NOT APPLICABLE** (Windows) |

### Honest remaining (not “fully clean forever”)

```text
TypeScript / ESLint / tests:     PASS
Knip unused exports:             105 — server API + testCoins KEEP; not mass-deleted
Sonar:                           BLOCKED
Semgrep empty-catch:             OPEN inventory
Host/spectator gift structure:   OPEN (UI freeze)
iOS:                             N/A
```

**Verdict:** Locally actionable Pass 7 finished. Remaining items are BLOCKED/OPEN with evidence, not abandoned.

---

## Pass 8 — FULL repository cleanup + final verification (2026-08-12)

**HEAD at verification:** `034b170`  
**Face AR:** confirmed absent from `src/` / `server/` / `ios/` — **not restored**.  
**testCoins:** preserved (owner KEEP).

### Fixes completed this pass (root-cause)

| Issue | Single production owner | Change |
|-------|-------------------------|--------|
| Dual live wallet UI state | `useWalletStore` + `useLiveWalletDisplay` | Removed local paid/starter/promo `useState` mirrors; GiftPanel reads store; recharge → `applyServerBalances` |
| Duplicate gift-result balance apply | `sendGift` (`giftSend.ts`) writes wallet; `applyLiveGiftWalletResult` only switches giftSource | Controllers no longer double-apply |
| Gift playable URL dual path | `resolvePlayableGiftVideoUrl` in `liveGiftIngest.ts` | Host + spectator (+ combo) share prefer-MP4 CDN path |
| XP lock preamble duplicate | `ensureAndLockUserProgression` in `xpProgressionApply.ts` | Used by live-watch + paid-gift XP |
| Unused RTL deps | removed | `@testing-library/*` zero imports → deleted from package.json |

### Intentionally retained (legitimate — not “ignored”)

| Item | Why legitimate |
|------|----------------|
| Apple vs Google SKU maps in one `storeProductCatalogs.ts` | Two store platforms; server re-exports same module — **not dual owners** |
| `PROMOTE_IAP_PRODUCTS` in `misc.ts` | Separate promote products, not coin catalog |
| Gift pill: `GiftAnimationOverlay` + `LiveGiftFeedStack` both listen to `ELIX_GIFT_PILL_EVENT` | **Locked** intentional dual consumers (banner + feed); not duplicate registration bug |
| Spectator `testCoinBalance` | Required separation from paid wallet |
| Host vs spectator `handleGiftSent` role branches | Role-specific MVP/cohost/battle side effects; money paths already shared |
| Settings Safety/Security form clones | UI freeze — structural form copy |
| Auth login/register session apply clones | Same session contract applied twice by design |
| Knip unused server exports (105) | Public module/API surface — TRACE/KEEP, not mass-deleted |
| Knip unused files (6) | `public/env.js`, `legal-doc.css`, migrate scripts — runtime/ops KEEP |
| `pino-pretty` | Dynamic logger transport in non-prod |
| Semgrep empty-catch (~185×2) | Mostly media/LiveKit/teardown; inventory OPEN for money-path per-site review |
| `as any` ×4 | Locked Create camera (`ElixCameraLayout`) |

### Tool results — final scan evidence (`docs/_cleanup_audit_raw/pass8/final/`)

```text
FINAL HEAD: 034b170

TypeScript errors:                 0
ESLint errors:                     0
ESLint warnings:                   0

Knip unused files:                 6 (all classified KEEP)
Knip unused exports:               105 (server API + testCoins KEEP + traced KEEP)
Knip unused types:                 53 (mostly server public types — KEEP)
Knip unused dependencies:          1 (pino-pretty — KEEP dynamic)

jscpd total clones:                204 (2.66% lines) — final rescan after wallet hook
jscpd unwanted implementation clones:
  FIXED this pass: dual wallet mirrors; gift URL dual path; XP lock SQL preamble
  REMAINING STRUCTURAL: host↔spectator mega-controller role clones (~20+ pairs)
    — money/catalog/XP owners unified; full controller merge blocked by UI freeze
    + intentional role divergence (not abandoned dual money owners)
  LEGITIMATE: Apple↔Google product object shape; Settings forms; auth blocks; SQL mappers

Semgrep violations:                374 findings (0 history.back)
  — empty-catch inventory OPEN; 4× as any in locked Create camera

Sonar blocker issues:              BLOCKED
Sonar critical issues:             BLOCKED
  Evidence: docs/_cleanup_audit_raw/pass8/sonar.txt
  Scanner ran against sonarcloud.io; failed: missing SONAR_TOKEN + sonar.organization
  No WSL/Docker on this Windows host for local SonarQube

Known patches:                     none newly introduced
Known workarounds:                 none newly introduced
Known temporary fixes:             none newly introduced
Known abandoned implementations:   Face AR — already removed (verified absent)
Duplicate state owners:            paid/starter/promo → useWalletStore ONLY
                                   testCoins → separate (KEEP)
Duplicate network owners:          paid gifts → giftSend / sendLivePaidGift ONLY
Duplicate event/listener owners:   room gift_sent → bindLiveRoomWs once per role
                                   ELIX_GIFT_PILL_EVENT → locked dual consumers (KEEP)
Duplicate catalog owners:          storeProductCatalogs.ts single owner (server re-export)

Failed tests:                      0 (228 passed / 31 skipped)

Production build:                  PASS (build:store) — docs/_cleanup_audit_raw/pass8/final/build-store.txt
Android release build:             PASS — app-release.aab; version 1.0.600 / versionCode 647
iOS release validation:            Capacitor Doctor: Android OK; Xcode NOT installed (Windows)
                                   ios/App present (Podfile + pbxproj + capacitor.config appId com.elixstarlive.app)
                                   Full iOS archive requires macOS/Xcode
```

**Honest verdict:** Money/catalog/XP dual-owner leftovers from the audit are **fixed**. Full jscpd zero and Sonar green are **not** claimed — structural host/spectator clones + Sonar credentials remain. Semgrep **ran**. This is not a partial “catalogs-only” stop.

---

## Pass 8 continue (same day — owner: do not stop)

### Additional root-cause unifies
| Item | Owner / change |
|------|----------------|
| Promote IAP dual maps | `PROMOTE_IAP_PRODUCTS` in `storeProductCatalogs.ts` (shipped `d81c511`) |
| Starter-gift XP inline SQL | `ensureAndLockUserProgression` + `applyXpGainAndSyncLevel` |
| Gift panel wallet triad | `refreshLiveGiftPanelBalances` / `loadLiveGiftWalletBootstrap` |
| `gift_sent` parse/chat | `processLiveGiftSentEvent.ts` — host+spectator |
| Local gift send pill/tile | `applyLocalGiftSendSideEffects.ts` — host send/combo + spectator |
| Dead client exported types | Unexported/deleted after zero-importer TRACE (unused types **53 → 24**) |

### Rescan snapshot
```text
tsc: 0
tests: 229 passed / 31 skipped
Knip unused exports: ~106 (mostly server KEEP + testCoins)
Knip unused types: 24
jscpd clones: 199 (2.55%) — down from 204
```

Still OPEN (honest): locked gift-overlay dual `gift_sent` listeners; host/spectator role-specific MVP/battle branches; Sonar token; Semgrep empty-catch inventory; engagement `awardEngagementXp` lighter path (no xp_transactions — intentional parallel contract, not mass-merged).

### Continue 2 — auth + battle score feedback
| Item | Change |
|------|--------|
| Auth login/register network + session apply | Shared helpers in `useAuthStore.ts` |
| Battle score VFX/lead/win taunts | `applyBattleScoreFeedback.ts` |
| Cohost gift tile from gift_sent | `applyCohostGiftTileScore` in applyLocalGiftSendSideEffects |
| jscpd | **196** clones (2.51%) |
| Android | 1.0.603 |

### Continue 3 — video feed map
| Item | Change |
|------|--------|
| Friends/following feed video mapping | `mapApiFeedVideosWithEngagement` in `useVideoStore.ts` |
| Android | 1.0.604 |

### Continue 4 — battle stream ids / booster-mist / share contacts
| Item | Change |
|------|--------|
| Battle seat/room id parse | `battleStreamIdsFromPayload.ts` |
| Booster + mist WS handlers | `battleBoosterMistEvents.ts` (`createBattleBoosterMistHandlers`) |
| Share panel contacts + live ids | `loadSharePanelContactsWithLive.ts` |
| jscpd | **194** clones (2.48%) — down from 196 |
| Android | bundled with Continue 5 |

### Continue 5 — missions / speed unlock / gift goal
| Item | Change |
|------|--------|
| Engagement missions progress load | `loadLiveEngagementMissionsProgress.ts` |
| Battle speed-challenge tier unlock | `tryUnlockBattleSpeedChallenge.ts` |
| Gift goal sync + reach sound | `applyLiveGiftGoalSync.ts` |
| jscpd | **195** clones (2.45% lines) — line % down; clone count can oscillate as helpers land |
| Android | 1.0.605 |

Still OPEN (honest): locked gift-overlay dual listeners; remaining host↔spectator role clones (join/MVP/LiveKit attach); Sonar token; Semgrep empty-catch money-path review; Settings form clones (UI freeze).


