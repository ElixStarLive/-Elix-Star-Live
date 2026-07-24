# 08 — Legacy Classification (Phase 3)

Every item classified `KEEP BEHAVIOUR` | `REIMPLEMENT CLEANLY` | `REMOVE` | `REVIEW`.

**Nothing in the `REMOVE` or `REVIEW` columns is deleted by this document.** Owner issues KEEP/REMOVE decisions; this file only proposes.

---

## Headline finding — the debt premise does not survive measurement

The rebuild brief assumes "years of patches, duplicated fixes, temporary code, dead code and unstable architecture." Measured against the actual tree:

| Debt signal | Count | Notes |
|-------------|-------|-------|
| `TODO` | **0** | |
| `FIXME` | **0** | |
| `@ts-ignore` | **0** | |
| `@ts-expect-error` | **0** | |
| `HACK` / `XXX` / `temporary` | 6 | **all false positives** |
| `as any` | 9 | across ~100k lines |
| Orphan components | 3 | |
| Unmatched FE API calls | 0 real (3 template-literal false positives) |
| BE endpoints with no FE caller | 12 | admin/ops tooling |

The six marker hits are: the words "hack" and "Temporary" inside Terms and Guidelines page copy, a caption template string, a profanity-filter word list, one comment about a battle score multiplier, and one comment explaining why native builds avoid margin hacks. **None is technical debt.**

This is not a patched-over codebase. It is a large, comment-rich codebase where the comments record *why* decisions were made. Repeatedly, what looks like a workaround is documented as a fix for a specific, reproducible bug:

- Auth hydration ordering (prevents wiping saved logins)
- Capacitor `hostname` deliberately unset (otherwise login never reaches the backend)
- Full remount per live room (prevents stale WS/LiveKit state)
- Ghost-stream publisher check (prevents dead cards in discovery)
- Test-coin routes compiled out of production (removes an abuse surface)
- Triple-path gift delivery with txn de-dup (instant for sender, reliable for viewers, once for everyone)

A rewrite that does not first understand each of these will reintroduce every one of the bugs they fix.

**The real structural problem is narrower and measurable: two enormous live page files with heavy duplication.** That is worth fixing. It does not require rebuilding the application.

---

## KEEP BEHAVIOUR

Correct today; must exist identically in any new app.

### Security and money
- Server-authoritative publish tokens; 403 for unauthorized publishers
- Server-side gift validation, atomic debit + creator credit
- Idempotency on `client_transaction_id` for every money write
- IAP verify-then-credit; replay-safe; refund-aware
- Stripe restricted to shop/web; raw-body webhook signature verification and its mount order
- Test-coin routes environment-gated out of production
- Four separate currency ledgers, never merged
- Fail-closed production env validation
- `ELIX_SKIP_MIGRATION_CHECK` and `ALLOW_LOADTEST_IN_PROD` fatal in production

### Reliability
- Auth hydration before `checkUser`
- Network-error vs 401 distinction on session refresh
- 3s loading failsafe
- Guarded independent subsystem init
- `__feed__` presence socket with 5s re-check and live-surface handoff
- Foreground reconnect + session refresh + IAP reconcile
- `lazyWithRetry` chunk retry
- `liveRuntimeCaps` bounded collections
- Full remount keys on live routes
- Ghost-stream publisher requirement
- Visible failure on Bunny misconfiguration (503, no fake success)

### Product
- All 77 routes and their exact chrome rules
- All 212 API contracts
- All WS event names and payload shapes
- All 91 tables and their relationships
- Complete gift overlay visual result (`GiftOverlay` geometry, mask, z-index; banner; feed stack)
- Feature-flag defaults, especially wallet-affecting engagement features defaulting off
- Android package id, iOS bundle id, `elixstar` deep link scheme

### Infrastructure
- Hetzner + Coolify deployment
- Neon, Valkey, Bunny, LiveKit, Stripe, FCM
- Migration discipline: 43 migrations, `pending/` quarantine, `postMigrateVerify`
- Existing server contract tests

---

## REIMPLEMENT CLEANLY

Behaviour required; current structure genuinely warrants better organisation. **All of these are achievable in place — none requires a new codebase.**

### R1 — Live page duplication (the one real structural problem)

| Metric | Value |
|--------|-------|
| `LiveStream.tsx` | 8,299 lines |
| `SpectatorPage.tsx` | 5,301 lines |
| Combined | 13,600 lines |
| Identical import lines | 38 of Spectator's 45 |
| WS events handled separately in both | ~13 |

Both pages mount the same 14 overlay components and handle the same event set with parallel implementations. This is why the recent gift-overlay work had to be applied twice — the spectator page needed a separate fix to match the creator path.

Proposed direction: extract shared live-room state and WS handling into a hook (`useLiveRoom`) consumed by both pages, leaving each page's JSX **completely untouched**. Rendered output must be byte-identical.

Risk: high. This is the most sensitive code in the app. Should be done in small, individually verifiable steps with a device check after each.

### R2 — Duplicate `/api/admin` mount

`payout.router.ts` and `adminActions.ts` both mount at `/api/admin`. Works via Express fallthrough, but path collisions would resolve silently by registration order. Proposal: keep both mounts, add a comment documenting the ordering dependency. Low risk. Behaviour-preserving.

### R3 — Router / handler file pairs

Several domains have both `x.ts` and `x.router.ts` (`auth`, `chat`, `feed`, `gifts`, `misc`, `music`, `payout`, `profiles`, `risingStars`, `wallet`). This is a consistent, intentional split (router = wiring, plain = handlers). **Not debt.** Noted only so a rebuild does not mistake it for accidental duplication.

### R4 — Client test coverage

One client test file exists (`liveRuntimeCaps.test.ts`). The server has real contract tests; the client has effectively none. This is the clearest genuine gap. Adding client tests is pure upside and requires no rewrite.

### R5 — Large secondary files

`Upload.tsx` (1,407), `EnhancedVideoPlayer.tsx` (1,309), `Profile.tsx` (1,229), `EngagementDrawer.tsx` (1,072), `handlers.ts` (1,303), `postgres.ts` (1,522). Large but coherent. Lower priority than R1, and only worth touching if a specific bug makes it necessary.

---

## CANDIDATE REMOVE — owner decision required

Nothing here is deleted without an explicit instruction.

| Item | Evidence | Recommendation |
|------|----------|----------------|
| `ForYouStoriesStrip.tsx` | 0 usages | ask owner — may be a planned feature |
| `GoldProfileFrame.tsx` | 0 usages | ask owner |
| `LiveAIFilters.tsx` | 0 usages | ask owner — AR filters are partly configured |
| `@capacitor/clipboard` dependency | no import found | safe to drop if truly unused |

---

## REVIEW — must be understood before anything touches them

| Item | Question |
|------|----------|
| `auth_users` **and** `elix_auth_users` | Two user tables. Which is authoritative? Any rebuild that guesses will corrupt auth. Requires a data audit before any auth work. |
| 12 BE endpoints with no FE caller | Admin/ops tooling reachable outside the app, or genuinely dead? Owner knows; the code does not. |
| `battle_gift_score` WS handler | Accepted by server, never sent by client. Confirm it is server-internal only — it must never become client-drivable. |
| APNS not configured | iOS push incomplete. Is this deliberate for now? |
| `/api/media/public/:storagePath` | Dynamic passthrough; confirm authorization behaviour. |
| Face AR providers (DeepAR / Banuba) | Licensed keys optional. Confirm intended production state. |
| `GET /api/auth/guest` | Guest auth exists server-side with no client caller. Intended future feature? |

---

## Recommendation to the owner

Based on measured evidence rather than the initial assumption:

> **A full rebuild is not justified by the state of this codebase.**

The evidence: zero TODO/FIXME/ts-ignore markers, 9 `as any` in ~100k lines, 3 orphan components, no broken client API calls, migration discipline already enforced, money paths already covered by server contract tests, and security invariants already server-authoritative.

A rebuild would mean re-deriving ~212 API contracts, 91 tables, 45 WS events, 3 payment integrations and two live-video role paths — and the documented bug fixes above are exactly the kind of subtle knowledge that gets lost in translation. The likeliest outcome is months of work to reproduce behaviour you already have, plus a fresh set of regressions in the highest-risk areas of the product: money and live.

What the evidence *does* support is targeted work on the one real problem:

| Priority | Work | Risk | Rebuild needed |
|----------|------|------|----------------|
| 1 | Extract shared live-room logic from the two 5–8k-line pages, JSX untouched | High, mitigate with small steps | No |
| 2 | Add client tests, starting with gift de-dup and auth session restore | Low | No |
| 3 | Resolve the `auth_users` / `elix_auth_users` question | Medium | No |
| 4 | Owner KEEP/REMOVE on 3 orphans + 12 endpoints | Low | No |
| 5 | Decide APNS | Low | No |

This recommendation is offered, not enacted. If you still want the sibling clean codebase, the parity contract in [`02_FEATURE_PARITY_SPEC.md`](02_FEATURE_PARITY_SPEC.md) is ready to drive it, and the backup and map are complete either way.

**Nothing further happens without your decision.**
