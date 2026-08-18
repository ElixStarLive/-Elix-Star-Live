# Release audit — carried open findings

Ledger of findings raised in one audit step whose fix belongs to a later step.
A finding leaves this file only when it is fixed, with the commit recorded.

## Still open

Nothing open.

## Closed

### CLOSED in Step 13 — P3 — live indicators inside live screens

Raised in Step 13 as blocked on transport. The root cause was on the server:
presence was fanned out only to `__feed__` subscribers, so a screen that owned
the websocket for its own live room could not learn that some *other* creator had
started or ended. `connectLiveFeedPresence` correctly refuses to steal the socket
from a live room, so no client-side wiring could have worked.

Fixed by making presence what it already claimed to be — a global server event
stream, not a feed-room feature. `server/websocket/index.ts` now registers every
authenticated connection as a presence subscriber and removes it on close,
whatever room it owns; `server/feedBroadcast.ts` still owns the events and still
names the creator with `host_user_id`. One socket, one presence architecture, no
polling, no timers, no reconnect to subscribe. Room-scoped traffic (chat, gifts,
co-host, battle) is unchanged and still goes to the room.

Surfaces closed on that: the host and spectator share panels now read
`useLivePresence` (`useLiveHostController`, `useLiveSpectatorController`), and
`loadSharePanelContactsWithLive` is deleted — its `apiLiveStreams` call was the
one-shot snapshot the hook replaces. `RankingPanel`'s LIVE Popular tab does make
a presence claim ("Creators live right now"), so it is now filtered by presence
too; the hook reports `ready` so an unanswered snapshot is never read as
"everyone ended". Coverage: `server/livePresenceFanout.test.ts`,
`src/components/RankingPanel.presence.test.tsx`,
`src/hooks/useLivePresence.test.tsx`.

### CLOSED in Step 13 — P1 — battle-result durability proven against real Neon

The persistence path was source-reviewed only, and 31 DB tests were skipped for
want of a database. A dedicated Neon test database now runs them:
`server/websocket/battleResults.db.test.ts` drives finalize → outbox →
`dbInsertBattleResult` against real Neon, covering `battle_results.battle_id`
uniqueness, participant rows, idempotent retry, a duplicate finalizer, a Neon
outage that leaves the result queued, recovery writing the true score, the outbox
clearing only after a confirmed commit, a rematch as its own row, and a
partially-frozen battle never being stored as a final result.

The four existing DB suites were failing when run together because each carried
its own migration bootstrap and they raced (`elix_schema_migrations already
exists`, duplicate type). `server/lib/testMigrationBootstrap.ts` is now the one
bootstrap: a `pg_advisory_lock` serialises the chain and each migration file runs
in its own transaction, matching `server/migrate.ts`.

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

`src/components/RankingPanel.tsx` was deferred here for the transport reason and
is closed above, once presence reached live-room connections.

Closed with proof rather than changed: `src/pages/Profile.tsx` declares `is_live` on the reposts row type but
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
