# 02 — Feature Parity Specification (the contract)

Derived from Phase 1 docs `01`, `02_COMPONENTS`, `03`–`07`. Reference commit `013c722`.

**This document is the contract.** Any future clean codebase must satisfy every row here before it can be considered for replacement. A feature missing from the new app is a regression, not a simplification.

## How to read a spec block

| Field | Meaning |
|-------|---------|
| Behaviour | what the user observes today |
| In / Out | required inputs and outputs |
| API / DB / RT / Native | dependencies (RT = realtime) |
| Permissions | who may perform it |
| Edge cases | must be handled, not deferred |
| UI | expected visual result — **reference the old screen; no reinterpretation** |

Universal UI rule for every feature below: **the rendered result must be pixel-equivalent to the old app.** Layout, spacing, colours, typography, icons, animation timing and navigation appearance are locked. This is never restated per feature; it always applies.

---

# A. Authentication and session

## A1 — Email login

| | |
|---|---|
| Behaviour | User enters email + password, is signed in, lands on `/feed` |
| In | email, password |
| Out | `{ user, accessToken }`; persisted session |
| API | `POST /api/auth/login` |
| DB | `elix_auth_users`, `elix_auth_sessions` |
| RT | none at login; presence socket starts after |
| Native | Capacitor `Preferences` for persistence; `CapacitorHttp` for the request |
| Permissions | public |
| UI | `src/pages/Login.tsx` |

Edge cases (all currently handled):

- Wrong credentials → visible error, no session written
- Unverified email → resend path via `POST /api/auth/resend-confirmation`
- Offline → error surfaced, existing persisted session untouched
- Already authenticated visiting `/login` → redirect to `/feed` (`App.tsx:352-358`)

## A2 — Registration

`POST /api/auth/register`, then `POST /api/profiles` to create the profile row. Both must succeed for a usable account. Edge case: profile creation failing after user creation must not leave a silently broken account.

## A3 — Apple Sign-In (native)

`@capgo/capacitor-social-login`, dynamically imported → `POST /api/auth/apple/native`. Gated by `VITE_APPLE_SIGN_IN_ENABLED`. Edge cases: user cancels the native sheet (no error toast); plugin unavailable on web (button must not appear).

## A4 — Session restore

**Contract:** wait for persist hydration before calling `GET /api/auth/me`.

| Condition | Required result |
|-----------|-----------------|
| Hydrated, valid token | user restored |
| Hydrated, 401 | session cleared, redirect to `/login` |
| **Network error + persisted session** | **stay logged in** |
| Hydration slow | 3s failsafe clears `isLoading` |

The third row is the one that breaks in naive rewrites. It is explicitly tested for in the old app's behaviour and must be verified in the new one.

## A5 — Sign out

`POST /api/auth/logout`; local clear must happen even if the request fails. Also triggered by WS `force_disconnect` and `user_banned`.

## A6 — Password reset

`POST /api/auth/forgot-password` → email → `/reset-password` → `POST /api/auth/reset-password`. Depends on `VITE_EMAIL_CONFIGURED` and server email config.

## A7 — Account deletion

`POST /api/auth/delete`. Required for App Store compliance. A public `delete-account.html` also exists in the web bundle. Both must survive.

---

# B. Money — the highest-risk domain

> Rebuild rule for this section: port the server-side contract tests (`moneySafetyContract.test.ts`, `moneyIntegration.test.ts`, `starterCoinsXpContract.test.ts`) **before** writing any feature code. They are the acceptance criteria.

## B1 — Coin purchase via IAP

| | |
|---|---|
| Behaviour | User taps a coin pack, native store sheet opens, purchase completes, balance increases |
| In | product id from `IAP_PRODUCTS` |
| Out | `{ success, newBalance }` |
| API | `POST /api/verify-purchase` |
| DB | `elix_wallet_balances`, `elix_wallet_ledger`, `elix_coin_packages` |
| Native | `@capgo/native-purchases` (StoreKit 2 / Play Billing) |
| Permissions | authenticated user, own account only |
| UI | `src/pages/PurchaseCoins.tsx`, `src/components/BuyCoinsModal.tsx` |

Mandatory behaviours:

| Requirement | Non-negotiable because |
|-------------|------------------------|
| Credit only after server verification | client receipts are forgeable |
| Duplicate taps cannot double-purchase | in-flight guard in `iap.ts` |
| Re-verifying a credited transaction returns the same balance, credits nothing | replay safety |
| Refunded/revoked consumables never credit | `misc.ts:307` |
| Stuck "already owned" reconciled on login and foreground | users must not lose paid coins |
| `restoredOwned` distinguishes reconcile from fresh purchase | correct messaging |
| Server refuses to boot without Google service account | never charge while verify is down |
| **Stripe is never used here** | platform policy |

## B2 — Shop checkout (Stripe)

`POST /api/shop/checkout` → Stripe session → webhook (raw body, signature verified, mounted before JSON parser) → `elix_shop_purchases`. Tables `shop_items`, cart in `useCartStore`. **Never** routed through IAP. Edge cases: user abandons checkout, webhook arrives before/after return, duplicate webhook delivery.

## B3 — Gift send

| | |
|---|---|
| In | gift id, room id, recipient, client `transaction_id` |
| Out | authoritative new balance for whichever currency was used |
| API | `POST /api/gifts/send` |
| DB | `elix_gifts`, `elix_gift_transactions`, `elix_wallet_*`, `starter_coin_*`, `promotional_coin_*`, `elix_creator_earnings`, `gift_logs` |
| RT | WS `gift_sent` out to room |
| UI | `GiftPanel` → `GiftOverlay` + `GiftAnimationOverlay` + `LiveGiftFeedStack` |

Contract:

1. Missing `transaction_id` → **400**
2. Currency priority: starter → promotional → real wallet
3. Every write idempotent on `client_transaction_id`
4. Debit sender and credit creator atomically
5. Server returns the balance; client never computes it
6. Insufficient funds → clear error, no partial write

Delivery contract — all three paths required:

| Path | Requirement |
|------|-------------|
| Local echo | sender's own gift appears immediately, no server round trip |
| REST broadcast | every viewer receives it |
| WS `gift_sent` | low latency |
| De-dup | each `transaction_id` renders exactly once, for everyone |

**Verification for the new app:** send one gift; assert exactly one banner, one video play, one stack entry, one ledger row. Then send from two devices simultaneously and assert no cross-contamination.

## B4 — Separate currencies

`realCoins`, `starterCoins`, `promotionalCoins`, `testCoins` are four distinct balances with distinct tables (test coins have no production table at all). They must never merge. Test coins are local-only and their endpoints are compiled out of production.

## B5 — Creator earnings and payout

`GET /api/creator/balance`, `/earnings`, `/payout-methods`, `/payouts`; `POST /api/creator/payout-method`, `/withdraw`. Admin approval chain: `review` → `approve` → `mark-paid`, plus `reject` / `cancel`, all audited in `elix_payout_audit`. UI: `src/pages/CreatorPayout.tsx`, `src/pages/admin/Withdrawals.tsx`.

## B6 — Membership and promote

`GET /api/membership/:creatorId[/status]`, `POST /api/membership/iap-complete`, `POST /api/promote-iap-complete`. Both IAP-backed. Tables `elix_membership_purchases`, `elix_creator_membership_products`, `elix_promote_purchases`. UI: `PromotePanel`.

---

# C. Live streaming

## C1 — Start a stream (host)

`POST /api/live/start` (validated) → `GET /api/live/token?publish=1` → LiveKit connect → WS `stream_start`. UI: `src/pages/LiveStream.tsx`. Edge cases: camera/mic permission denied, LiveKit unreachable, host backgrounds the app, duplicate start.

## C2 — Publish authorization

**Server-authoritative.** Publish tokens issued only to: room host, holder of a battle publish grant, holder of a co-host publish grant, or either party in a `call_*` room. Everything else → 403.

Parity test: request a publish token for a room you do not host and assert **403**.

## C3 — Watch a stream

`/watch/:streamId` → `SpectatorPageKeyed`, full remount per stream → subscribe-only token → WS join. Receives `room_state`, `user_joined`, `user_left`, `chat_message`, `gift_sent`, `heart_sent`, `battle_*`, `engagement_*`, `stream_ended`.

Edge cases: stream already ended (no dead page), host reconnects, spectator backgrounds and returns, battle redirect `/watch/B` → `/watch/A` must not carry stale state.

## C4 — Stream discovery

`GET /api/live/streams`. **A stream is listed only if it has an active publisher.** This prevents ghost cards and must be reproduced.

## C5 — End

`POST /api/live/end` + WS `stream_end` → `stream_ended` to viewers. LiveKit webhook reconciles rooms that die without a clean end.

## C6 — Battles

WS: `battle_create`, `battle_join`, `battle_invite_send|accept|decline`, `battle_spectator_vote`, `battle_end`, `battle_get_state`. Server emits `battle`, `battle_state_sync`, `battle_score`, `battle_tick`, `battle_countdown`, `battle_ready_state`, `battle_ended`, `battle_error`, and the invite acks.

**Scoring is server-derived from verified gift transactions.** `battle_gift_score` must never be client-driven. Tables: `battle_energy_*`, `battle_fan_energy`, `battle_creator_buckets`.

## C7 — Co-host

`cohost_invite_send|accept`, `cohost_request_send|accept|decline`, `cohost_layout_sync`. Publish grant required before a co-host can publish. Layout sync keeps both sides' arrangement identical.

## C8 — Live chat, hearts, goals, boosters, moderation

| Feature | Events / API | Notes |
|---------|--------------|-------|
| Live chat | WS `chat_message` | capped by `LIVE_CHAT_MESSAGE_CAP` |
| Hearts | WS `heart_sent`, `GET/POST /api/hearts/daily` | table `daily_hearts` |
| Gift goals | WS `gift_goal_set|clear` → `gift_goal_sync` | `LiveGiftGoalBar`, `GiftGoalGallery` |
| Boosters / mist | WS `booster_activated`, `mist_activated`, `booster_caught` | `booster_config`, `booster_catch_logs` |
| Moderation | `POST /api/live/moderation/check`; WS `moderation_warning|pause|suspend` | `live_moderation_log` |
| Live share | `POST /api/live-share`, `GET /api/inbox/live-share-requests` | `live_share_inbox` |

## C9 — 1:1 video calls

WS `call_invite|accepted|rejected|ended` delivered over the `__feed__` presence socket → `IncomingCallModal` → `/call` → mutual publish tokens in `call_<uuid>`.

**The presence socket is a hard dependency.** Without it, incoming calls silently stop working while the user browses.

---

# D. Video and feed

## D1 — For You feed

`GET /api/feed/foryou` (Valkey-cached) → `EnhancedVideoPlayer`. Tracking: `POST /api/feed/track-view`, `/track-interaction`. Edge cases: empty feed, offline, video fails to load, rapid scroll cancelling in-flight loads.

## D2 — Feed variants

`/stem` (StemFeed), `/following` (FollowingFeed), `/friends` (`GET /api/feed/friends`), `/music`, `/hashtag/:tag`, `/saved`, `/discover`, `/search`.

## D3 — Interactions

Like/unlike, save/unsave, comments (create, edit, delete, like, unlike), share, report, download (`GET /api/videos/:id/download`). Tables `likes`, `saves`, `comments`, `comment_likes`, `video_views`, `video_scores`.

## D4 — Upload

Stages: validating → compressing → uploading → processing → complete. Path `videos/${userId}/${videoId}/original.${ext}` on Bunny. Then `POST /api/videos`, then `POST /api/videos/:id/fyp`.

| Edge case | Required behaviour |
|-----------|--------------------|
| Not logged in | blocked with a clear message |
| Bunny not configured | **503, visible failure** — never fake success |
| Thumbnail generation fails | video still publishes |
| File too large / wrong type | rejected in synchronous validation |
| App backgrounded mid-upload | progress state must not corrupt |

## D5 — Stories

`GET /api/stories`, `/api/stories/user/:userId`, `POST /api/stories`. 24h expiry. UI: `StoryGoldRingAvatar`. Note `ForYouStoriesStrip` currently has **zero usages**.

## D6 — Create and media editing

`ElixCameraLayout`, `CaptureShutterButton`, `MediaEditorPanel`, `SoundPickerPanel`, `AIToolsPanel`. Camera via `src/lib/cameraStream.ts`. Face AR (`faceARRenderer`, `faceLandmarks`, `commercialFaceEffects`) is optional and must degrade cleanly when `VITE_DEEPAR_LICENSE_KEY` / `VITE_BANUBA_CLIENT_TOKEN` are absent.

---

# E. Social

Profiles (`GET/PATCH /api/profiles/:userId`, by-username lookup), follow/unfollow, follower and following lists, blocking (`POST /api/block-user`, `/api/unblock-user`, `GET /api/blocked-users`), reporting (`POST /api/report` → `elix_reports`), DM chat (threads, messages, read receipts, thread ensure), notifications (`GET /api/notifications`, `POST /api/notifications/read`, device token registration).

**Blocking must be enforced server-side**, not merely hidden in the UI.

Push: FCM configured, **APNS is not**. Carry this gap forward as a known state, do not silently change it.

---

# F. Progression, engagement, Rising Stars

## F1 — Progression

`GET /api/progression/me`, `/xp-history`, `/starter-history`, `/users/:userId/status`. Tables `user_progression`, `xp_transactions`, `xp_activity_config`, `xp_level_requirements`, `level_history`. UI: `LevelBadge`, `LevelIcon`, `src/lib/levelColors.ts`.

## F2 — Engagement hub

Eight routes under `/engagement/*` plus 16 API endpoints (hub, missions, achievements, daily login, fan level, MVP, treasure, creator cards, stickers, wallet, battle energy). Live overlay counterparts: `LiveEngagementOverlay`, `LiveSideMissionStack`, `EngagementDrawer`, WS `engagement_*`.

**Feature-flag defaults are part of the contract.** Wallet-affecting engagement features default **off**. A rebuild that ships them on changes the economy.

## F3 — Rising Stars

27 endpoints: seasons, challenges, entries, votes, teams, categories, regions, badges, rewards, leaderboards, live attach. 15 `rs_*` tables. Admin console at `/admin/rising-stars`.

---

# G. Admin

46 admin endpoints behind `RequireAdmin` **and** server-side admin checks. Consoles: Dashboard, Users (ban/unban), Reports, Economy, Purchases, Withdrawals, Rising Stars, Progression.

**Client-side `RequireAdmin` is not a security boundary.** Server authorization is. Both must exist in the new app.

---

# H. Cross-cutting requirements

## H1 — Resilience (Phase 12 of the owner brief)

| Condition | Required behaviour today |
|-----------|--------------------------|
| No internet | `OfflineBanner` shown; persisted session retained |
| Slow internet | progress states; no duplicate submits |
| API timeout | error surfaced, not swallowed |
| Auth expiry | 401 clears session; network error does not |
| Backend failure | visible error; no fake success |
| App restart | session restored from `Preferences` |
| Background → foreground | WS reconnect, session refresh, IAP reconcile |
| Realtime disconnect | reconnect; presence socket re-established within 5s |
| Duplicated requests | idempotency keys on money paths |
| Upload failure | user informed, retry possible |
| Permission denial | handled without crash |
| Chunk load failure | `lazyWithRetry` retries the dynamic import |

## H2 — Security invariants

Never trusted from the client: identity, permissions, ownership, balances, prices, gift values, coin amounts, purchase validity, admin status, publish rights, battle scores.

Additional invariants: webhook signatures verified against raw bodies; test-coin routes absent from production builds; secrets server-side only; rate limiting on upload and other abuse-prone routes; `ALLOW_LOADTEST_IN_PROD` fatal in production.

## H3 — Observability

Sentry client + server, structured logging (`server/lib/logger.ts`), metrics (`server/lib/metrics.ts`, `cacheLayerMetrics.ts`), alerting (`server/lib/alerting.ts`), analytics (`POST /api/analytics/track` → `elix_analytics_events`), crash reporting (`src/lib/crashReporting.ts`).

## H4 — Build and release

Android AAB via `npm run build:android` then `gradlew.bat bundleRelease`. `versionCode` +1 and `versionName` patch +1 per app-facing release. Signing config stays local (`android/gradle.properties`, keystore — never committed). iOS via Xcode with `PrivacyInfo.xcprivacy` present.

---

# Parity acceptance checklist

A new codebase may only be proposed for replacement when **all** of these pass:

| # | Criterion |
|---|-----------|
| 1 | All 77 routes resolve to the same screens |
| 2 | All 212 API endpoints respond with identical contracts |
| 3 | All 36 inbound / 45 outbound WS events behave identically |
| 4 | All 91 tables read/written with no schema change |
| 5 | Gift send: exactly-once render across all three delivery paths |
| 6 | IAP: verify-then-credit, replay-safe, reconcile working |
| 7 | Stripe shop separate from IAP, webhooks verified |
| 8 | Live publish authorization returns 403 for unauthorized publishers |
| 9 | Session survives network blips, clears on real 401 |
| 10 | Upload fails visibly when Bunny is unconfigured |
| 11 | Screen-by-screen visual comparison against the old app shows no differences |
| 12 | Android release build succeeds with the same package id |
| 13 | iOS release build succeeds with the same bundle id |
| 14 | Server contract tests pass |
| 15 | Every deviation documented and owner-approved |

Until every row passes: **NEW CODEBASE NOT READY TO REPLACE OLD APPLICATION.**
