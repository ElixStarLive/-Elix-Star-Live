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

1. **Dual IAP catalogs** (client `src/lib/storeProductCatalogs.ts` vs server monetisation catalog)  
2. **Dual live wallet UI state** (local refs vs `useWalletStore`)  
3. **Mega controllers** (`useLiveHostController` / `useLiveSpectatorController`) owning too many domains  
4. **Face AR commercial stub** still in tree despite never activating  
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

Still open for later passes: dual IAP catalogs, dual wallet UI sources, locked gift dual listeners, remaining Knip unused exports, jscpd host/spectator duplication, Semgrep/Sonar install.

---

## Next actions (remaining)

1. Re-run tsc / eslint / knip / tests / `build:store` / Android AAB after pass 2.  
2. Install Semgrep + Sonar for gate zeros.  
3. Unify IAP catalogs / wallet UI owner without UI change.  
4. Only then open app locally for smoke.
