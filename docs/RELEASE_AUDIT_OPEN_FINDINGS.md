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

## Carried to Step 13 (other live indicators) — raised in Step 8

### OPEN — P2 — live indicators that snapshot once and never refresh

For You and Live Discover share one presence authority (authoritative
`/api/live/streams` snapshot + `stream_started` / `stream_ended` +
`reconcileLivePresence` + the ordering gate). These surfaces read the same REST
authority but take a single snapshot when they open and never subscribe to
`stream_ended`, so a creator who ends while the surface is open keeps a LIVE ring
until it is reopened:

- `src/components/EnhancedVideoPlayer.tsx` — creator ring per active slide, and
  the `isLiveHint` it passes into `UserProfileModal`
- `src/components/UserProfileModal.tsx` — ring + Watch Live (open-time fetch)
- `src/components/ShareModal.tsx` — contact rings (open-time fetch)
- `src/pages/ChatThread.tsx` — "live now" row (mount only)
- `src/components/RankingPanel.tsx` — LIVE Popular tab (mount only)
- `src/pages/Inbox.tsx` — follower / suggested circles (mount only; the
  notification filter is applied at load)
- `src/pages/alerts/AlertsPage.tsx` — live rows (page load)
- host + spectator share panels via `loadSharePanelContactsWithLive`
- `src/components/LiveNotifyBanner.tsx` — the *started* banner has no
  `stream_ended` handler (auto-dismisses after 6s)

None of these invent live truth: every one derives from the same server
snapshot, and none persists it to storage. The gap is refresh, not authority.
Closing it means subscribing more surfaces to feed presence, which changes what
those screens re-render and when — a decision for the Step 13 pass, not a
drive-by.

`src/pages/Profile.tsx` repost tiles use `is_live` / `content_kind` from the
reposts API rather than the live registry. That is a stored property of the
reposted item, not a presence claim; confirm the product intent in Step 13.

### OPEN — P3 — host-disconnect grace has source-contract tests only

`scheduleHostDisconnectStreamEnd` in `server/websocket/index.ts` is private and
its re-verification chain (local room map → Valkey `room:members` →
`isUserPublishingInRoom` → `roomHasActivePublisher` → `isStreamHost` → creator
role room) was verified by reading the source. Coverage in
`server/websocket/liveBattleStateContract.test.ts` asserts the source contract,
not behaviour. Making it behavioural means restructuring a correct live-lifecycle
path purely for testability, which is not a Step 8 fix.

### OPEN — P3 — `server/scripts/_env.ts` orphan approved for deletion in Step 4

Still present, still has no importers. Approved for removal by the owner in
Step 4; not deleted here because Step 8 must not carry unrelated changes.

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
