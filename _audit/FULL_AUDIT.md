# Elix Star Live — Full Repository Audit
Generated: 2026-07-23T15:57:50.867Z

## 1. Files inspected
| Category | Count |
|---|---|
| src/**/*.ts(x) | 192 |
| server/**/*.ts | 138 |
| server/migrations/*.sql | 40 |
| test files (*.test/spec) | 19 |
| android app src (java/kt/xml) | 17 |
| android app config (gradle/xml/props) | 19 |
| ios App sampled | 80 |
| scripts | 15 |
| docs | 16 |
| **Approx unique inspected** | **~450+** |

## 2. Feature inventory (status)
| Feature | Status |
|---|---|
| Auth: register/login/logout/me | PASS |
| Auth: email verification | PASS |
| Auth: forgot/reset password | PASS |
| Auth: Apple Sign-In | PARTIAL |
| Auth: guest login | PASS |
| Auth: delete account | PASS |
| Auth: 2FA | NOT IMPLEMENTED |
| Profile: view/edit/avatar | PASS |
| Profile: follow/unfollow/lists | PASS |
| Profile: block/unblock | PASS |
| Feed: For You / videos | PASS |
| Feed: Following | PASS |
| Feed: Friends | PASS |
| Feed: Stem | PASS |
| Feed: Music | PASS |
| Feed: Hashtag | PASS |
| Feed: Saved / liked | PASS |
| Search (users/videos client filter) | PARTIAL |
| Discover | PASS |
| Stories | PASS |
| Upload / Create / camera | PASS |
| AI Studio (local filters) | PARTIAL |
| Comments / likes | PASS |
| Share / live share inbox | PASS |
| Report / Support tickets | PASS |
| Inbox / DM chat | PASS |
| 1:1 Video calls | PASS |
| LIVE: start/end + LiveKit | PASS |
| LIVE: spectator watch | PASS |
| LIVE: chat/hearts/gifts | PASS |
| LIVE: battle + reconnect | PASS |
| LIVE: cohost | PASS |
| LIVE: gift goals / boosters / mist | PASS |
| LIVE: engagement polls/mystery | PASS |
| Wallet: real coin balance | PASS |
| Wallet: IAP coin purchase (Google) | PASS |
| Wallet: Apple IAP coins | PARTIAL |
| Wallet: test coins (local only) | PASS |
| Shop: Stripe checkout | PASS |
| Membership IAP | PASS |
| Promote IAP | PASS |
| Creator payout request | PASS |
| Admin: payouts workflow | PASS |
| Admin: users ban/unban | PASS |
| Admin: reports moderation | PASS |
| Admin: economy catalog | PASS |
| Admin: purchases IAP/shop | PASS |
| Admin: progression tools | PASS |
| Admin: rising stars | PASS |
| Admin: moderation logs UI | NOT CONNECTED |
| Engagement hub/missions/daily | PASS |
| Engagement collections/stickers | PASS |
| Rising Stars challenges | PASS |
| Push notifications FCM | FAIL |
| Push notifications APNS | NOT IMPLEMENTED |
| Notification prefs (local) | PARTIAL |
| Analytics track | PASS |
| Sentry crash reporting | NOT VERIFIED |
| Ban appeals | NOT IMPLEMENTED |
| Dedicated search API | NOT IMPLEMENTED |

### Status totals
- FAIL: 1
- NOT CONNECTED: 1
- NOT IMPLEMENTED: 4
- NOT VERIFIED: 1
- PARTIAL: 5
- PASS: 48

## 3. Frontend screens / routes
Routes in App.tsx: **76**
Page modules: **68**

### Routes
- `*`
- `/`
- `/admin`
- `/admin/economy`
- `/admin/progression`
- `/admin/purchases`
- `/admin/reports`
- `/admin/rising-stars`
- `/admin/users`
- `/admin/withdrawals`
- `/ai-studio`
- `/auth/callback`
- `/call`
- `/copyright`
- `/create`
- `/creator/login-details`
- `/discover`
- `/edit-profile`
- `/engagement`
- `/engagement/achievements`
- `/engagement/collections`
- `/engagement/daily-login`
- `/engagement/fan-level`
- `/engagement/missions`
- `/engagement/mvp`
- `/engagement/rewards`
- `/feed`
- `/following`
- `/forgot-password`
- `/friends`
- `/guidelines`
- `/hashtag/:tag`
- `/inbox`
- `/inbox/:threadId`
- `/legal`
- `/legal/affiliate`
- `/legal/audio`
- `/legal/dmca`
- `/legal/safety`
- `/legal/supplier`
- `/legal/ugc`
- `/live`
- `/live/:streamId`
- `/live/broadcast`
- `/live/start`
- `/live/watch/:streamId`
- `/login`
- `/music`
- `/music/:songId`
- `/privacy`
- `/profile`
- `/profile/:userId`
- `/profile/:userId/followers`
- `/profile/:userId/following`
- `/purchase-coins`
- `/register`
- `/report`
- `/reset-password`
- `/rising-stars`
- `/rising-stars/challenge/:challengeId`
- `/saved`
- `/search`
- `/settings`
- `/settings/blocked`
- `/settings/notifications`
- `/settings/payout`
- `/settings/safety`
- `/settings/security`
- `/shop`
- `/shop/:itemId`
- `/stem`
- `/support`
- `/terms`
- `/upload`
- `/video/:videoId`
- `/watch/:streamId`

### Pages
- `src/pages/AIStudio.tsx`
- `src/pages/AuthCallback.tsx`
- `src/pages/ChatThread.tsx`
- `src/pages/Copyright.tsx`
- `src/pages/Create.tsx`
- `src/pages/CreatorLoginDetails.tsx`
- `src/pages/CreatorPayout.tsx`
- `src/pages/Discover.tsx`
- `src/pages/EditProfile.tsx`
- `src/pages/FollowList.tsx`
- `src/pages/FollowingFeed.tsx`
- `src/pages/ForgotPassword.tsx`
- `src/pages/FriendsFeed.tsx`
- `src/pages/Guidelines.tsx`
- `src/pages/Hashtag.tsx`
- `src/pages/Inbox.tsx`
- `src/pages/Legal.tsx`
- `src/pages/LegalAffiliate.tsx`
- `src/pages/LegalAudio.tsx`
- `src/pages/LegalDMCA.tsx`
- `src/pages/LegalSafety.tsx`
- `src/pages/LegalSupplier.tsx`
- `src/pages/LegalUGC.tsx`
- `src/pages/LiveDiscover.tsx`
- `src/pages/LiveStream.tsx`
- `src/pages/Login.tsx`
- `src/pages/MusicFeed.tsx`
- `src/pages/Privacy.tsx`
- `src/pages/Profile.tsx`
- `src/pages/PurchaseCoins.tsx`
- `src/pages/Register.tsx`
- `src/pages/Report.tsx`
- `src/pages/ResetPassword.tsx`
- `src/pages/RisingStars.tsx`
- `src/pages/RisingStarsChallenge.tsx`
- `src/pages/SavedVideos.tsx`
- `src/pages/SearchPage.tsx`
- `src/pages/Settings.tsx`
- `src/pages/Shop.tsx`
- `src/pages/SpectatorPage.tsx`
- `src/pages/StemFeed.tsx`
- `src/pages/Support.tsx`
- `src/pages/Terms.tsx`
- `src/pages/Upload.tsx`
- `src/pages/VideoCall.tsx`
- `src/pages/VideoFeed.tsx`
- `src/pages/VideoView.tsx`
- `src/pages/admin/Dashboard.tsx`
- `src/pages/admin/Economy.tsx`
- `src/pages/admin/Progression.tsx`
- `src/pages/admin/Purchases.tsx`
- `src/pages/admin/Reports.tsx`
- `src/pages/admin/RisingStars.tsx`
- `src/pages/admin/Users.tsx`
- `src/pages/admin/Withdrawals.tsx`
- `src/pages/engagement/EngagementAchievements.tsx`
- `src/pages/engagement/EngagementCollections.tsx`
- `src/pages/engagement/EngagementDailyLogin.tsx`
- `src/pages/engagement/EngagementFanLevel.tsx`
- `src/pages/engagement/EngagementHub.tsx`
- `src/pages/engagement/EngagementMissions.tsx`
- `src/pages/engagement/EngagementMvp.tsx`
- `src/pages/engagement/EngagementRewards.tsx`
- `src/pages/engagement/EngagementShell.tsx`
- `src/pages/settings/BlockedAccounts.tsx`
- `src/pages/settings/NotificationSettings.tsx`
- `src/pages/settings/SafetyCenter.tsx`
- `src/pages/settings/SecuritySettings.tsx`

## 4–5. API surface
Frontend /api string refs: **196**
Backend mounted method paths inventoried: **228**
Automated FE→BE path match unmatched: **0** (prefix-based; see possibly-unused BE list)

### Backend mounts
```
/api/auth
/api/live
/api/gifts
/api/sounds
/api/music
/api/feed
/api/chat
/api/profiles
/api/wallet
/api/shop
/api/coin-packages
/api/creator
/api/admin
/api/admin
/api/admin/rising-stars
/api/admin/progression
/api/rising-stars
/api/progression
/api/engagement
/api/videos
/api/stories
/api/media
/api
```

### Possibly unused / admin-only BE paths (no direct FE string match)
- `GET /api/admin/balance`
- `GET /api/admin/earnings`
- `GET /api/admin/moderation/logs`
- `GET /api/admin/payout-methods`
- `GET /api/creator/earnings`
- `GET /api/creator/shop-purchases`
- `GET /api/engagement/flags`
- `GET /api/music/collections`
- `GET /api/music/status`
- `GET /api/music/tracks/:trackId/preview`
- `GET /api/progression/starter-history`
- `GET /api/progression/users/:userId/status`
- `GET /api/progression/xp-history`
- `GET /api/rising-stars/rewards`
- `POST /api/admin/chargeback`
- `POST /api/admin/payout-method`
- `POST /api/admin/unfreeze/:userId`
- `POST /api/admin/withdraw`
- `POST /api/auth/guest`
- `POST /api/creator/chargeback`
- `POST /api/creator/payout/:id/approve`
- `POST /api/creator/payout/:id/cancel`
- `POST /api/creator/payout/:id/mark-paid`
- `POST /api/creator/payout/:id/reject`
- `POST /api/creator/payout/:id/review`
- `POST /api/creator/unfreeze/:userId`

## 6. Database
Migrations on disk: **40** (all applied on Neon including email_confirmation)
Tables/relations touched in migrations: **91**

## 7. External integrations
| Integration | Status |
|---|---|
| Neon Postgres | PASS (health + migrate) |
| Valkey | PASS (health) |
| LiveKit | PASS (health) |
| Bunny Storage/CDN | PASS (health) |
| Stripe shop + webhook | PASS (keys present; signature required in prod) |
| Google Play IAP verify | PASS (code path; device NOT VERIFIED) |
| Apple IAP | PARTIAL (code present; APNS/device NOT VERIFIED) |
| SendGrid email | PASS (configured) |
| FCM push | FAIL (FIREBASE_SERVICE_ACCOUNT_JSON is google-services.json, not Admin SA) |
| APNS | NOT IMPLEMENTED / missing keys |
| Epidemic/PEX/Loudly music | PASS (keys present; runtime NOT VERIFIED) |
| Sentry | NOT VERIFIED (DSN missing) |

## 8. WebSocket
Server handled events: **36**
- `battle_create`
- `battle_end`
- `battle_get_state`
- `battle_gift_score`
- `battle_invite_accept`
- `battle_invite_decline`
- `battle_invite_send`
- `battle_join`
- `battle_spectator_vote`
- `booster_activated`
- `call_accepted`
- `call_ended`
- `call_invite`
- `call_rejected`
- `chat_message`
- `cohost_invite_accept`
- `cohost_invite_send`
- `cohost_layout_sync`
- `cohost_request_accept`
- `cohost_request_decline`
- `cohost_request_send`
- `engagement_features_set`
- `engagement_get_state`
- `engagement_mystery_start`
- `engagement_poll_end`
- `engagement_poll_set`
- `engagement_poll_vote`
- `engagement_watch_tick`
- `gift_goal_clear`
- `gift_goal_set`
- `gift_sent`
- `heart_sent`
- `mist_activated`
- `ping`
- `stream_end`
- `stream_start`

Also fixed this audit: `ping`, `stream_start` (were client-sent, previously unhandled).

## 9. Placeholders / mocks / TODO / dead
- AI Studio: local CSS/canvas filters only (no server AI) — PARTIAL by design of current UI.
- Search: client-side filter of `/api/profiles` + local video lists — no `/api/search`.
- Security settings explicitly states 2FA not available.
- Notification prefs: device-local store; push delivery separate.
- Guest login disabled in production.
- Test coins: isolated local / non-prod routes only.
- Stripe webhook signature skip is DEV-only (prod requires secret).
- `LiveMarkedTopUi` comment mentions mock photo pill variant (visual only).
- Real TODO/FIXME hits in product code after filtering UI placeholders: essentially none critical; debt scan mostly UI `placeholder=` attrs.

## 10–11. Issues found / fixed / open
See main chat report sections 10–11.
