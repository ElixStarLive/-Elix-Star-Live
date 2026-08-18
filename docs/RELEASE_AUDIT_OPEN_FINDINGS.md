# Release audit — carried open findings

Ledger of findings raised in one audit step whose fix belongs to a later step.
A finding leaves this file only when it is fixed, with the commit recorded.

## Carried to Step 19 (auth / security)

### OPEN — P3 — process-local send throttle

`server/routes/liveShareInbox.ts` — `postRate` Map plus a module `setInterval`.

Always process-local by design (it never consults Valkey), so it is not a
Valkey-failure fallback and cannot manufacture business state. With more than one
instance the effective live-share send limit is multiplied by the instance count.
Spam control only, no money. Fixing it means introducing a Valkey-backed limiter
and choosing fail-open vs fail-closed, which is a Step 19 decision.

### OPEN — P3 — process-local mint-password lockout

`server/routes/testCoins.ts` — `failByUser` / `failByIp`.

Brute-force lockout (5 failures → 15 min) for the test-coin issue password, held
per process, so N instances allow N × 5 attempts per window. Gates £0 QA issuance
only; the balance itself is Valkey-authoritative (`test_coins:balances`, HINCRBY)
and never touches the wallet, ledger, Stripe or IAP. Also review whether these
routes should sit behind the shared Express limiter.

### OPEN — boot validation of `PEX_API_KEY`

Raised during the Step 6 sweep. Needs the Step 19 env/secret pass to decide
whether a missing value should fail boot or degrade a named feature.

## Carried to Step 10 (co-host architecture)

### OPEN — alleged co-host accept / publish-grant defects

Reported by an audit subagent, **not yet confirmed from source**. Do not accept
the finding without reading the accept and grant paths directly.

Step 7 established one related fact from source: `effectiveStreamId` is derived
only from route params and the signed-in user id in both live controllers, so a
spectator becoming a co-host does **not** change or reconnect the WebSocket room.
Publish permission is a LiveKit concern. That part is not a defect.

## Closed

### CLOSED in Step 6 — P2 — production rate-limit fallback

`server/routes/misc.ts` — `checkRateLimit` used `try Valkey → catch → local Map`,
multiplying the real hourly limit by the instance count on `iap:verify`,
`promote:iap` and `membership:iap`.

Fixed in `7df58f55` (Step 6, before Step 7 began): production fails closed and
logs; the local window is gated behind `allowLocalRateLimit`, matching
`server/middleware/rateLimit.ts` and `wsRateCheck`. Behavioural coverage in
`server/routes/iapRateLimitFailClosed.test.ts`.

This entry is kept because the Step 7 brief still listed it as open. The two
process-local throttles above are the remaining rate-limit work for Step 19.
