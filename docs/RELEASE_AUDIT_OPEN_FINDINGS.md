# Release audit — carried open findings

Ledger of findings raised in one audit step whose fix belongs to a later step.
A finding leaves this file only when it is fixed, with the commit recorded.

## Still open

### OPEN — P3 — live rings inside the host / spectator share panels

The one live-indicator surface Step 13 could not close, with the reason.

`loadSharePanelContactsWithLive` feeds the share panels opened *from inside* a
live (`useLiveHostController`, `useLiveSpectatorController`). Those screens own
the websocket singleton for their live room, and `stream_started` /
`stream_ended` are sent only to `__feed__` subscribers
(`server/websocket/index.ts` registers a feed subscriber only for the `__feed__`
room). `connectLiveFeedPresence` deliberately refuses to steal the socket back
while a live room owns it, so a presence subscription mounted there could never
receive an event — wiring it would have been dead code, not a fix.

Closing this properly needs one of two owner decisions, both outside Step 13:
widen the server's presence fan-out beyond feed subscribers, or give the live
screens a second transport. The rings are correct when the panel opens; a contact
who ends while it is open keeps a ring until it is reopened.

## Closed

### CLOSED in Step 13 — P2 — live indicators that snapshot once and never refresh

Raised in Step 8. The server half was the reason a client-side fix could not
work: `stream_ended` reached the feed with `stream_key` only, and a stream key is
a room name (`POST /api/live/start` accepts one), so no client could tell which
creator had ended. `broadcastStreamEnded` in `server/feedBroadcast.ts` is now the
only way that event is emitted, and it always carries `host_user_id`; all six
emit sites use it.

The client half is `src/hooks/useLivePresence.ts` — one consumer of the existing
authority (`apiLiveStreams` snapshot + `connectLiveFeedPresence` +
`reconcileLivePresence` + the ordering gate), returning live creator ids and live
room names separately so a room name cannot light up another creator's ring. No
polling, no timers, no second architecture. Now reactive while open:
`EnhancedVideoPlayer` (ring + the `isLiveHint` it passes down),
`UserProfileModal` (ring + Watch Live), `ShareModal`, `ChatThread`, `Inbox`
(circles and live rows), `AlertsPage`, and the `LiveNotifyBanner` *started*
banner, which now retires when the server says that live ended instead of
offering a tap into a dead room. Coverage:
`src/hooks/useLivePresence.test.tsx`,
`src/components/LiveNotifyBanner.presence.test.tsx`.

Closed with proof rather than changed: `src/components/RankingPanel.tsx` renders
only inside `LiveHostScreen` / `SpectatorLiveScreen`, which own the socket for
their live room and therefore never receive feed presence events — the same
transport limit as the share panels above; its list reloads whenever the panel is
opened. `src/pages/Profile.tsx` declares `is_live` on the reposts row type but
never reads it: no live ring is rendered from it, and navigation keys off
`content_kind === 'live' && stream_key`, so there is no presence claim to fix.

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
