# Release audit — carried open findings

Ledger of findings raised in one audit step whose fix belongs to a later step.
A finding leaves this file only when it is fixed, with the commit recorded.

## Still open

### OPEN — P2 — live indicators that snapshot once and never refresh

Raised in Step 8, assigned to Step 13. **Needs an owner decision before it can be
fixed**, for the reason below.

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
- `src/pages/Inbox.tsx` — follower / suggested circles (mount only)
- `src/pages/alerts/AlertsPage.tsx` — live rows (page load)
- host + spectator share panels via `loadSharePanelContactsWithLive`
- `src/components/LiveNotifyBanner.tsx` — the *started* banner has no
  `stream_ended` handler (auto-dismisses after 6s)

None of these invent live truth: every one derives from the same server snapshot,
and none persists it to storage. The gap is refresh, not authority.

Why it is still open after the Steps 1–10 cleanup gate: the fix has to be
app-wide (a per-screen version is exactly the piecemeal behaviour the owner
banned), and two of the nine surfaces are under owner locks that say never touch
the file — `src/pages/Inbox.tsx` and `src/pages/ChatThread.tsx`. Subscribing them
to `stream_ended` also changes when those screens re-render. Both need the owner
to say go, naming those files.

`src/pages/Profile.tsx` repost tiles use `is_live` / `content_kind` from the
reposts API rather than the live registry. That is a stored property of the
reposted item, not a presence claim; confirm the product intent in Step 13.

## Closed

### CLOSED in Step 6 — P2 — production rate-limit fallback

`server/routes/misc.ts` — `checkRateLimit` used `try Valkey → catch → local Map`,
multiplying the real hourly limit by the instance count on `iap:verify`,
`promote:iap` and `membership:iap`.

Fixed in `7df58f55`: production fails closed and logs; the local window is gated
behind `allowLocalRateLimit`, matching `server/middleware/rateLimit.ts` and
`wsRateCheck`. Behavioural coverage in
`server/routes/iapRateLimitFailClosed.test.ts`.

### CLOSED in the Steps 1–10 cleanup gate — P3 — process-local send throttle

`server/routes/liveShareInbox.ts` held its send window in a process-local Map, so
the real limit was the ceiling times the instance count. Now a Valkey window
(`rl:live-share:{userId}`) that fails closed in production, with the local window
kept only for single-instance development. Behavioural coverage in
`server/routes/liveShareRateLimit.test.ts`.

### CLOSED in the Steps 1–10 cleanup gate — P3 — process-local mint lockout

`server/routes/testCoins.ts` counted wrong-password attempts per process, so N
instances allowed N × 5 tries per window. The counters now live in Valkey
(`test_coins:fail:{scope}:{id}`) and fail closed in production. Behavioural
coverage in `server/routes/testCoins.issue.test.ts`.

### CLOSED in the Steps 1–10 cleanup gate — boot validation of `PEX_API_KEY`

A missing key made the upload audio fingerprint scan allow every video silently.
Production now refuses to boot without it unless `AUDIO_SCAN_ENABLED=0` says
out loud that scanning is off. Coverage in `server/lib/envValidate.test.ts`.

### CLOSED in Step 10 — alleged co-host accept / publish-grant defects

Confirmed from source and fixed: the invite no longer grants publish (the grant
moved to accept), accept verifies the invite the host actually issued, seats are
claimed under a per-room Valkey lock, and a declined or undeliverable invite
gives its seat back. Commits `87d5f811`, `1bc58d66`.

### CLOSED in the Steps 1–10 cleanup gate — P3 — `server/scripts/_env.ts` orphan

Deleted. No importers, approved for removal by the owner in Step 4.

### CLOSED in the Steps 1–10 cleanup gate — P3 — host-disconnect grace behaviour

The concern was that a deferred end had source-contract tests only. The gap that
mattered turned out to be real and is now fixed: both deferred end paths (host
disconnect grace and the LiveKit `room_finished` grace) remember which live they
were scheduled for and refuse to end a live that has since been restarted in the
same room id. Behavioural coverage in
`server/routes/liveCohostSessionCleanup.test.ts`.
