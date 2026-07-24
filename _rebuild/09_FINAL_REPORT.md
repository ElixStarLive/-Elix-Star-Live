# 09 — Final Report (Phases 0–3) and Approval Gate

Date: 2026-07-24. Reference commit: `013c722`. Backup tag: `pre-clean-rebuild-reference-20260724`.

Scope executed: **backup, map, parity spec, classification.** No new codebase was started. No product file was modified.

---

## OLD APPLICATION — what was mapped

| Metric | Count |
|--------|-------|
| Routes | 77 |
| Page files | 69 |
| Components | 56 |
| Client library modules | 59 |
| State stores | 7 |
| HTTP API endpoints | 212 |
| Backend routers mounted | 23 + webhooks |
| Server route files | 45 |
| Server lib modules | 53 |
| Server services | 7 |
| WebSocket inbound events | 36 |
| WebSocket outbound events | 45 |
| Database tables | 91 |
| Migrations | 43 |
| External services | 12 |
| Capacitor native plugins | 8 |
| Client env keys | 20 |
| Server env keys (fatal in prod) | 11 |

### Disconnected / dead items found

| Item | Count | Detail |
|------|-------|--------|
| Orphan components | 3 | `ForYouStoriesStrip`, `GoldProfileFrame`, `LiveAIFilters` |
| FE calls with no BE route | 0 | 3 apparent hits are template-literal false positives |
| BE endpoints with no FE caller | 12 | admin/ops tooling — retained pending owner decision |
| Unused dependency | 1 | `@capacitor/clipboard` |
| Client-unsent WS handler | 1 | `battle_gift_score` — intentionally server-authoritative |
| Real debt markers (TODO/FIXME/ts-ignore) | **0** | |

**Total genuinely disconnected items: 4** (3 components + 1 dependency). Everything else is either connected or deliberately server-side only.

---

## NEW APPLICATION

| Metric | Count |
|--------|-------|
| Features rebuilt | 0 |
| Features tested | 0 |
| Features at parity | 0 |
| APIs connected | 0 |
| Database integrations connected | 0 |
| Realtime integrations connected | 0 |
| Features remaining | all |

This is the correct and intended state. Phase 4 is behind your approval gate and was not started.

---

## REMOVED LEGACY CODE

**Nothing.** No file, route, endpoint, table, component or dependency was deleted, renamed or moved.

Four items are *proposed* for removal and await your explicit decision (see [`08_LEGACY_CLASSIFICATION.md`](08_LEGACY_CLASSIFICATION.md)).

---

## UNRESOLVED DIFFERENCES

No old-vs-new differences exist, because no new application exists.

Open questions requiring your input before any further work:

| # | Question |
|---|----------|
| 1 | `auth_users` vs `elix_auth_users` — which is authoritative? Blocks any auth work. |
| 2 | The 3 orphan components — planned features or delete? |
| 3 | The 12 caller-less endpoints — live ops tooling or dead? |
| 4 | APNS not configured — deliberate, or should iOS push be completed? |
| 5 | Face AR (DeepAR / Banuba) — intended production state? |
| 6 | `POST /api/auth/guest` — planned guest mode? |
| 7 | Do you still want the sibling clean codebase, given the finding below? |

---

## The finding that changes the recommendation

You asked for this assessment on the premise of "years of patches, duplicated fixes, temporary code, dead code and unstable architecture." I measured that premise instead of assuming it.

| Expected symptom | Measured |
|------------------|----------|
| `TODO` markers | 0 |
| `FIXME` markers | 0 |
| `@ts-ignore` / `@ts-expect-error` | 0 |
| `as any` | 9 in ~100k lines |
| Broken client API calls | 0 |
| Orphan components | 3 of 56 |
| Migration discipline | enforced, unbypassable in production |
| Money-path test coverage | server contract tests already exist |
| Security posture | already server-authoritative throughout |

The codebase does not match the description. Repeatedly, code that looks like a workaround turns out to be a documented fix for a specific bug — auth hydration ordering, the deliberately unset Capacitor hostname, per-room remount keys, the ghost-stream publisher check, the production gate on test-coin routes, the triple-path gift delivery with transaction de-duplication.

There is **one** real structural problem: `LiveStream.tsx` (8,299 lines) and `SpectatorPage.tsx` (5,301 lines) duplicate each other heavily — 38 of the spectator's 45 imports are identical, and roughly 13 WebSocket events are handled separately in each. That duplication is exactly why the recent gift-overlay fix had to be applied twice.

That problem is worth solving. It does not require rebuilding the application.

### What a full rebuild would actually cost

Re-deriving 212 API contracts, 91 tables, 45 realtime events, three payment integrations and two live-video role paths — while the documented bug fixes above are precisely the kind of knowledge that gets lost in translation. The likely result is months spent reproducing behaviour you already have, with new regressions concentrated in money and live: the two areas where a regression costs real money and real trust.

### Recommended alternative

| Priority | Work | Rebuild needed |
|----------|------|----------------|
| 1 | Extract shared live-room logic from the two live pages, JSX untouched | No |
| 2 | Add client tests — gift de-dup and auth session restore first | No |
| 3 | Resolve the two-user-tables question | No |
| 4 | Your KEEP/REMOVE on the 4 disconnected items | No |
| 5 | Decide APNS | No |

Every one of these is a minimal-diff change to the existing app, verifiable on a device, with the UI untouched.

---

## Guarantees for this work slice

| Guarantee | Status |
|-----------|--------|
| No product source file modified | Confirmed — only `_rebuild/*.md` created |
| No UI, layout or navigation change | Confirmed |
| No API, WS or schema change | Confirmed |
| No file deleted, renamed or moved | Confirmed |
| No migration run | Confirmed |
| No deployment triggered | Confirmed |
| No secrets committed | Confirmed — secret dumps excluded from backup and docs |
| Old app remains production reference | Confirmed |
| Backup verified restorable from two independent sources | Confirmed |

---

## RELEASE DECISION

> **NEW CODEBASE NOT READY TO REPLACE OLD APPLICATION**

Correct for this stage: no new codebase exists. The old application remains the production reference and the fallback.

---

## Approval gate — stopped here, as instructed

Phase 4 (creating a sibling clean codebase) is **not started** and will not start without your explicit instruction.

Three paths are open:

| Option | What happens |
|--------|--------------|
| **A — Targeted improvement** *(recommended)* | Keep the app. Work the 5-item priority list above with minimal diffs and frozen UI. |
| **B — Proceed with the rebuild** | Create `Desktop/Elix-Star-Live-CLEAN` and rebuild feature-by-feature against the parity contract. Old app untouched throughout. |
| **C — Answer the open questions first** | Resolve the 7 questions above, then choose A or B with full information. |

Awaiting your decision.
