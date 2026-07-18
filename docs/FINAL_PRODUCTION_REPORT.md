# Elix Star Live — Full Production Audit & Rebuild Report

**Date:** March 30, 2026
**Scope:** Complete system scan, backend fixes, connection layer rebuild, infrastructure guidance

---

## Executive Summary

The application suffered 100% load test failure at all VU levels. Root cause analysis revealed **three layers of failure**, each amplifying the others:

1. **Infrastructure bottleneck:** Hetzner LB tier `lb11` has a 10,000 connection cap. Traefik was CPU-bound at 240% while Node.js sat at 4%.
2. **Self-inflicted outage amplification:** Rate limiting was "fail-closed" — when Valkey had transient errors under load, ALL API requests received 429 (Too Many Requests), turning a partial degradation into a total outage.
3. **Unbounded resource consumption:** No WebSocket connection limit, no event-loop backpressure, 600MB upload limit, per-worker health checks all hitting DB simultaneously.

All three layers have been addressed in this audit.

---

## Blockers (User Action Required)

These cannot be fixed in code — they require infrastructure changes:

| # | Blocker | Action | Where |
|---|---------|--------|-------|
| 1 | **Hetzner LB connection cap (10k)** | Upgrade LB from lb11 to lb21 (25k) or lb31 (50k) | Hetzner Cloud Console → Load Balancers → Resize |
| 2 | **Traefik GOMAXPROCS not set** | Add `GOMAXPROCS=16` to Traefik env | Coolify → Server → Proxy → Environment |
| 3 | **Traefik transport not attached** | Add serversTransport label to app service | Coolify → App → Edit Labels |
| 4 | **Container fd limits** | Set ulimits nofile to 1000000 | Coolify → App → Docker settings |
| 5 | **Kernel tuning (both servers)** | Run `scripts/linux-production-tuning.sh` | SSH to each server |
| 6 | **Bypass-LB test must pass first** | Run `scripts/k6-bypass-lb.js` against server IP | k6 load generator machine |

See `docs/PRODUCTION_GUIDE.md` for exact commands and configuration.

---

## Root Causes Found

### Backend Code Issues (Fixed)

| Issue | Severity | File | Fix |
|-------|----------|------|-----|
| Rate limiting fail-closed: Valkey error → 429 ALL requests | **CRITICAL** | `server/lib/valkey.ts` | Changed `valkeyRateCheck` to throw, so middleware falls back to local rate limiter |
| Direct callers of `valkeyRateCheck` didn't handle throw | **CRITICAL** | `server/routes/feed.ts`, `misc.ts`, `checkout.ts` | Added try-catch with fallback to local rate limiting |
| WS rate check fail-closed: Valkey error → deny all WS events | **HIGH** | `server/websocket/index.ts` | Changed to fail-open with logging |
| No WebSocket connection limit | **HIGH** | `server/websocket/index.ts` | Added `MAX_WS_CONNECTIONS` (default 10,000) |
| No event-loop backpressure | **HIGH** | `server/index.ts` | Added lag monitor + 503 when lag > 500ms |
| Health cache per-worker (16 independent DB pings) | **MEDIUM** | `server/index.ts` | Shared across workers via Valkey |
| 600MB upload limit | **MEDIUM** | `server/index.ts` | Reduced to 100MB |
| Graceful shutdown swallows errors | **LOW** | `server/index.ts` | Now logs errors during shutdown |
| `acquireCacheBuildLock` silent catch | **LOW** | `server/lib/valkey.ts` | Now logs when Valkey unavailable |
| `waitForCachePopulate` empty catch | **LOW** | `server/lib/valkey.ts` | Now logs poll errors |
| `deleteVideoFromDb` rollback catch silent | **LOW** | `server/lib/postgres.ts` | Now logs rollback failures |
| Battle score rollback catches silent | **LOW** | `server/lib/postgres.ts` | Now logs rollback failures |
| Chat message rollback catch silent | **LOW** | `server/lib/postgres.ts` | Now logs rollback failures |

### Frontend Issues (Not Fixed — UI Frozen Per Rules)

These are code-level issues that don't affect load test performance but affect production quality:

| Issue | File |
|-------|------|
| Gift catalog API error returns empty array silently | `src/lib/giftsCatalog.ts` |
| Live stream list failure shows empty, no error | `src/pages/LiveDiscover.tsx` |
| `enrichUserWithProfile` failure is `.catch(() => {})` | `src/store/useAuthStore.ts` |
| WebSocket `onerror` handler is empty | `src/lib/websocket.ts` |
| All feed tracking uses `.catch(() => {})` | `src/store/useVideoStore.ts` |
| OAuth callback ignores the `code` parameter | `src/store/useAuthStore.ts` |

### Infrastructure Issues (Guidance Provided)

| Issue | Severity |
|-------|----------|
| Hetzner LB tier lb11 caps at 10k connections | **CRITICAL** |
| Traefik GOMAXPROCS not set → may use fewer cores | **HIGH** |
| Traefik highconcurrency transport not attached to app | **HIGH** |
| No container ulimit configuration | **MEDIUM** |
| Dockerfile runs as root (no USER directive) | **LOW** |
| No CI/CD pipeline | **LOW** |

---

## Files Changed

| File | Changes |
|------|---------|
| `server/lib/valkey.ts` | `valkeyRateCheck` now throws instead of returning false; `acquireCacheBuildLock` logs on error; `waitForCachePopulate` logs poll errors |
| `server/middleware/rateLimit.ts` | Updated log message (catch path was already correct) |
| `server/websocket/index.ts` | Added `MAX_WS_CONNECTIONS` limit (configurable, default 10k); `wsRateCheck` now fail-open on Valkey error |
| `server/index.ts` | Added event-loop backpressure middleware (503 at >500ms lag); shared health cache via Valkey; reduced upload limit to 100MB; graceful shutdown logs errors |
| `server/lib/postgres.ts` | All rollback catches now log errors instead of swallowing |
| `server/routes/feed.ts` | `allowViewRateLimit` handles `valkeyRateCheck` throw |
| `server/routes/misc.ts` | `checkRateLimit` handles `valkeyRateCheck` throw |
| `server/routes/checkout.ts` | `checkRateLimit` handles `valkeyRateCheck` throw |
| `scripts/k6-bypass-lb.js` | **NEW** — k6 script targeting server IP directly (bypasses LB) |
| `scripts/k6-staged-0-1k-5k-10k-20k.js` | **UPDATED** — definitive staged test: 500→1k→2k→5k→8k→10k→15k→20k→30k→40k |
| `docs/PRODUCTION_GUIDE.md` | **UPDATED** — complete infrastructure guide with LB upgrade, GOMAXPROCS, Traefik transport, testing procedure |

---

## Testing Procedure

### Sequence

1. **Deploy code changes** — push to main, Coolify rebuilds
2. **Apply kernel tuning** — run `scripts/linux-production-tuning.sh` on both servers
3. **Configure Traefik** — dynamic config + GOMAXPROCS + labels (see PRODUCTION_GUIDE.md)
4. **Bypass-LB test** — `scripts/k6-bypass-lb.js` → proves app works independently
5. **Upgrade LB** — Hetzner Console → resize to lb21 or lb31
6. **Full staged test** — `scripts/k6-staged-0-1k-5k-10k-20k.js` through LB

### Expected Outcomes After Fixes

| VU Level | Before Fixes | After Code Fixes | After Infrastructure |
|----------|-------------|-------------------|---------------------|
| 500 | 100% fail | Should pass | Should pass |
| 1k | 100% fail | Should pass | Should pass |
| 5k | 100% fail | Should pass | Should pass |
| 10k | 100% fail | Depends on LB tier | Should pass with lb21 |
| 20k | 100% fail | LB caps at 10k | Should pass with lb21+ |
| 40k | 100% fail | LB caps at 10k | Needs lb31 + possibly more servers |

The 100% failure at 100 VUs was caused by rate limiting fail-closed — when load testing drove Valkey to hiccup, every subsequent request got 429. This is now fixed (fail-open to local rate limiter).

---

## Remaining Limits

| Limit | Value | Bottleneck |
|-------|-------|------------|
| Hetzner LB lb11 | 10,000 simultaneous connections | Hard cap — upgrade required |
| Hetzner LB lb21 | 25,000 simultaneous connections | Upgrade option |
| Hetzner LB lb31 | 50,000 simultaneous connections | Upgrade option |
| Neon Postgres | ~80 pool connections total (across workers) | Increase `PG_POOL_MAX` or use connection pooler |
| Single k6 machine | ~8k-10k VUs before OOM | Use distributed k6 (multiple runners) |
| WebSocket per worker | 10,000 connections (configurable) | Increase `MAX_WS_CONNECTIONS` |

---

## What Was NOT Changed

- **No UI changes** — all screens, layouts, spacing, styling untouched
- **No navigation changes** — all routes preserved exactly
- **No file renames or moves** — project structure preserved
- **No new dependencies** — all fixes use existing libraries
- **No database schema changes** — all queries preserved
- **No infrastructure changes** — all infra work is documented guidance for the user
- **No Traefik container recreation** — only dynamic config file guidance

---
---

# Round 2 — Scalability Hardening & Test Coverage (July 18, 2026)

**Scope:** Eliminate the pub/sub and hot-path DB bottlenecks that cap horizontal
scaling, add automated coverage for the changes, and extend the load-test suite
to the authenticated/wallet/purchase paths.

## Fixes implemented this round

| Issue | Severity | File(s) | Root cause | Fix | Tests |
|-------|----------|---------|-----------|-----|-------|
| Global `PSUBSCRIBE room:*` / `user:*` — every instance received **every** room's and user's cross-instance traffic and discarded non-local messages | **HIGH** (scaling) | `server/lib/valkey.ts`, `server/websocket/index.ts` | Pattern subscription fans all matching publishes to all instances → O(instances × total traffic); the dominant cross-instance cost at high fan-out | Channel-routed subscribe: one shared `message` dispatcher + dynamic `SUBSCRIBE`/`UNSUBSCRIBE`; an instance subscribes to `room:{id}`/`user:{id}` only while it hosts a local client there. Added `valkeyUnsubscribe`, ref-counted handler registry, reconnect re-subscribe. | `server/lib/valkeyPubSub.test.ts` (7) |
| `dbUpdateViewerCount` executed on **every** join/leave | **HIGH** (scaling) | `server/websocket/index.ts`, `server/lib/coalescedWriter.ts` | One DB `UPDATE` per membership event × many concurrent viewers hammered Postgres on hot rooms | Realtime count still broadcast immediately from Valkey `SCARD`; DB persistence coalesced per-room to a single trailing write (latest value) via reusable `createCoalescedWriter`; flushed when a room empties | `server/lib/coalescedWriter.test.ts` (5) |

**Verification:** `npm run check` (tsc) clean; full suite **52 tests passing**
(40 prior + 12 new). Committed on `main`.

## Why these matter for horizontal scaling

- **Pub/sub:** Before, adding an instance did **not** reduce per-instance pub/sub
  load — each instance still processed all room/user traffic. After, per-instance
  pub/sub work is proportional to the rooms/users that instance actually serves,
  so the cluster scales close to linearly with added workers/instances.
- **Viewer-count writes:** Removed the single largest per-event DB write from the
  live hot path. DB write volume for viewer counts is now bounded by
  `(#active rooms ÷ 3s)` instead of `(#join+leave events)`.

## Protected area — plan presented, awaiting approval

**Session validation is a per-request DB query.** `sessionGuard` (every
authenticated `/api` request) and the WS connect handler both call
`checkSessionState`, which runs a Postgres query (`elix_auth_sessions` +
`profiles`). At tens of thousands of concurrent users this is the highest-volume
DB read on the platform.

Because this is auth/security-sensitive, **no code was changed** — see the
proposed plan under "Pending — session-validation cache" below. It must be
approved before implementation.

## Load-test suite status

The existing k6 suite (`loadtest/`) already covers WS concurrency, single-room
viewer counts, chat, gift dedup, feed/HTTP, and reconnection storms, and is
compatible with the current WS protocol. Added this round:

- `loadtest/test7-auth-wallet.js` — **NEW.** Ramps authenticated VUs across
  `/api/wallet/`, `/api/wallet/transactions`, `/api/progression/me`, and
  `/api/shop/items`. This is the primary signal for the sessionGuard/auth hot
  path and wallet read latency. Wired into `test-all.ps1` / `test-all.sh`.
- **Purchases:** charge paths (Stripe checkout-session creation, Google/Apple
  IAP verification) are deliberately excluded from load tests against production
  and must be validated in the respective **sandbox** environments.

**Honest limitation:** real 59k-concurrent metrics cannot be produced from this
workspace — they require a deployed staging environment plus a distributed k6
runner (single machine tops out ~8–10k VUs). The harness, thresholds, staged
profiles, distributed-runner instructions (`docs/K6_40K_DISTRIBUTED.md`), and
server-side monitoring commands are all in place to capture those metrics on
staging. The load-test report template lives in `loadtest/README.md` ("Final
Verdict Template") and should be filled from a staging run before certifying 59k.

## Remaining blockers to a 59k certification

1. **Infrastructure (unchanged from Round 1):** Hetzner LB tier, Traefik
   GOMAXPROCS/transport, container fd limits, kernel tuning — see the Blockers
   table above and `docs/PRODUCTION_GUIDE.md`.
2. **Session-validation cache (pending approval):** required to keep the DB off
   the authenticated hot path at target scale.
3. **Staging load run:** the architecture changes above must be validated with a
   distributed k6 run on staging and the metrics documented; static review
   cannot certify 59k.
4. **Neon pooling:** confirm the pooled endpoint (`-pooler`) and `PG_POOL_MAX`
   sizing across cluster workers (warning already emitted in `postgres.ts`).

## Pending — session-validation cache (proposed, NOT yet implemented)

Design for approval:

- **Cache key:** `sess:{sha256(token)}` in Valkey storing `{ state, userId }`.
- **TTL:** short (e.g. 30–60s) so bans/revocations propagate quickly; never
  longer than the token's own expiry.
- **Read path:** `checkSessionState` checks Valkey first; on miss, runs the
  existing DB query and populates the cache. DB remains the source of truth.
- **Invalidation:** on logout, session revoke, ban/suspend, and account delete,
  `DEL sess:{hash}` (and the existing `disconnectUserSessions` WS force-close
  already fires for bans). Banned/`unavailable` states are **not** cached, or
  cached only for a very short window, so enforcement never weakens.
- **Fail-open/closed:** preserve current behavior exactly — Valkey miss/error
  falls back to the DB query (never grants access on cache error).
- **Tests:** cache hit/miss, TTL expiry, invalidation on logout/ban, and a
  regression test asserting a ban is enforced within the TTL window.

This changes behavior in a security-sensitive path, so it is held for explicit
approval per the protected-areas policy.
