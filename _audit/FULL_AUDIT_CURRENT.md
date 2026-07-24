# Elix Star Live — Full Application Audit (fresh pass)
Generated: 2026-07-24T15:51:15.213Z

## 1. Files inspected
| Category | Count |
|---|---:|
| src ts/tsx | 192 |
| server ts | 141 |
| migrations sql | 40 (+1 this pass = 41 on disk after fix) |
| test files | 21 |
| android app src | 17 |
| android gradle/props | 11 |
| ios App sampled | 10 |
| scripts | 15 |
| docs | 16 |
| **Exact inspected set** | **433** (192+141+40+17+11+10+15+16; tests overlap src/server) |

## 2. Feature inventory (40)
| Feature | Status |
|---|---|
| Auth register/login/logout/session restore | PASS |
| Auth email verification (SendGrid + migration) | PASS |
| Auth forgot/reset password | PASS |
| Auth Apple Sign-In | PARTIAL |
| Auth guest (prod disabled) | PASS |
| Auth delete account | PASS |
| Auth 2FA | NOT IMPLEMENTED |
| Profile view/edit/avatar/follow/block | PASS |
| Feed For You / Following / Friends / Stem / Music / Hashtag / Saved | PASS |
| Search users/videos | PARTIAL |
| Discover | PASS |
| Stories | PASS |
| Upload / Create / camera | PASS |
| AI Studio local filters | PARTIAL |
| Comments / likes / share | PASS |
| Report / Support | PASS |
| Inbox DM chat | PASS |
| 1:1 Video calls | PASS |
| LIVE start/end LiveKit | PASS |
| LIVE spectator chat gifts hearts | PASS |
| LIVE battle + reconnect | PASS |
| LIVE cohost / gift goals / boosters / mist | PASS |
| LIVE engagement polls/mystery | PASS |
| Wallet real coins + Google IAP verify path | PASS |
| Apple IAP coins device path | PARTIAL |
| Test coins local-only | PASS |
| Shop Stripe checkout + webhook | PASS |
| Membership / Promote IAP | PASS |
| Creator payout request + admin workflow | PASS |
| Admin users/reports/economy/purchases/progression/rising-stars | PASS |
| Admin moderation logs UI | PASS |
| Engagement hub/missions/daily/collections | PASS |
| Rising Stars | PASS |
| Push FCM | PASS |
| Push APNS | NOT IMPLEMENTED |
| Notification prefs server sync | PARTIAL |
| Analytics | PASS |
| Sentry monitoring | NOT VERIFIED |
| Ban appeals | NOT IMPLEMENTED |
| Dedicated /api/search | NOT IMPLEMENTED |

### Status totals
- NOT IMPLEMENTED: 4
- NOT VERIFIED: 1
- PARTIAL: 5
- PASS: 30

## 3. Frontend screens
Routes: 77; page modules: 69
All App.tsx routes map to lazy page components; catch-all -> /feed.
- `*` CONNECTED
- `/` CONNECTED
- `/admin` CONNECTED
- `/admin/economy` CONNECTED
- `/admin/progression` CONNECTED
- `/admin/purchases` CONNECTED
- `/admin/reports` CONNECTED
- `/admin/rising-stars` CONNECTED
- `/admin/users` CONNECTED
- `/admin/withdrawals` CONNECTED
- `/ai-studio` CONNECTED
- `/auth/callback` CONNECTED
- `/call` CONNECTED
- `/copyright` CONNECTED
- `/create` CONNECTED
- `/creator/login-details` CONNECTED
- `/discover` CONNECTED
- `/edit-profile` CONNECTED
- `/engagement` CONNECTED
- `/engagement/achievements` CONNECTED
- `/engagement/collections` CONNECTED
- `/engagement/daily-login` CONNECTED
- `/engagement/fan-level` CONNECTED
- `/engagement/missions` CONNECTED
- `/engagement/mvp` CONNECTED
- `/engagement/rewards` CONNECTED
- `/feed` CONNECTED
- `/following` CONNECTED
- `/forgot-password` CONNECTED
- `/friends` CONNECTED
- `/guidelines` CONNECTED
- `/hashtag/:tag` CONNECTED
- `/how-it-works` CONNECTED
- `/inbox` CONNECTED
- `/inbox/:threadId` CONNECTED
- `/legal` CONNECTED
- `/legal/affiliate` CONNECTED
- `/legal/audio` CONNECTED
- `/legal/dmca` CONNECTED
- `/legal/safety` CONNECTED
- `/legal/supplier` CONNECTED
- `/legal/ugc` CONNECTED
- `/live` CONNECTED
- `/live/:streamId` CONNECTED
- `/live/broadcast` CONNECTED
- `/live/start` CONNECTED
- `/live/watch/:streamId` CONNECTED
- `/login` CONNECTED
- `/music` CONNECTED
- `/music/:songId` CONNECTED
- `/privacy` CONNECTED
- `/profile` CONNECTED
- `/profile/:userId` CONNECTED
- `/profile/:userId/followers` CONNECTED
- `/profile/:userId/following` CONNECTED
- `/purchase-coins` CONNECTED
- `/register` CONNECTED
- `/report` CONNECTED
- `/reset-password` CONNECTED
- `/rising-stars` CONNECTED
- `/rising-stars/challenge/:challengeId` CONNECTED
- `/saved` CONNECTED
- `/search` CONNECTED
- `/settings` CONNECTED
- `/settings/blocked` CONNECTED
- `/settings/notifications` CONNECTED
- `/settings/payout` CONNECTED
- `/settings/safety` CONNECTED
- `/settings/security` CONNECTED
- `/shop` CONNECTED
- `/shop/:itemId` CONNECTED
- `/stem` CONNECTED
- `/support` CONNECTED
- `/terms` CONNECTED
- `/upload` CONNECTED
- `/video/:videoId` CONNECTED
- `/watch/:streamId` CONNECTED

## 4. Frontend API <-> backend
FE /api refs: 200; unmatched automated: 0
- `/api/activity`
- `/api/admin/gifts/catalog/${encodeURIComponent(giftId)}`
- `/api/admin/iap-purchases`
- `/api/admin/moderation/logs`
- `/api/admin/payout/${id}/${action}`
- `/api/admin/payouts`
- `/api/admin/progression/${endpoint}`
- `/api/admin/progression/audit-history`
- `/api/admin/progression/battle-energy-caps`
- `/api/admin/progression/config`
- `/api/admin/progression/daily-rewards`
- `/api/admin/progression/daily-rewards/policy`
- `/api/admin/progression/feature-flags`
- `/api/admin/progression/levels`
- `/api/admin/progression/missions`
- `/api/admin/progression/missions/${encodeURIComponent(m.id)}`
- `/api/admin/progression/missions/${encodeURIComponent(m.id)}/archive`
- `/api/admin/progression/users/${encodeURIComponent(userId.trim())}`
- `/api/admin/purchases`
- `/api/admin/reports`
- `/api/admin/reports${queryParam}`
- `/api/admin/reports/${encodeURIComponent(reportId)}`
- `/api/admin/rising-stars/audit`
- `/api/admin/rising-stars/categories`
- `/api/admin/rising-stars/challenges`
- `/api/admin/rising-stars/challenges/${id}/snapshot`
- `/api/admin/rising-stars/challenges/${id}/status`
- `/api/admin/rising-stars/regions`
- `/api/admin/rising-stars/seasons`
- `/api/admin/shop-purchases`
- `/api/admin/stats/dau`
- `/api/admin/users`
- `/api/admin/users/${encodeURIComponent(userId)}/ban`
- `/api/analytics/track`
- `/api/auth/apple/native`
- `/api/auth/delete`
- `/api/auth/forgot-password`
- `/api/auth/login`
- `/api/auth/logout`
- `/api/auth/me`
- `/api/auth/register`
- `/api/auth/resend-confirmation`
- `/api/auth/reset-password`
- `/api/auth/verify-email`
- `/api/block-user`
- `/api/blocked-users`
- `/api/boosters/catalog`
- `/api/camera-filters`
- `/api/chat/threads`
- `/api/chat/threads/${encodeURIComponent(conv.id)}`
- `/api/chat/threads/${encodeURIComponent(threadId)}/messages`
- `/api/chat/threads/${threadId}/messages`
- `/api/chat/threads/${threadId}/read`
- `/api/chat/threads/ensure`
- `/api/coin-packages`
- `/api/creator/balance`
- `/api/creator/payout-method`
- `/api/creator/payout-methods`
- `/api/creator/payouts`
- `/api/creator/withdraw`
- `/api/device-tokens`
- `/api/engagement/achievements`
- `/api/engagement/battle-energy/boost`
- `/api/engagement/battle-energy/earn`
- `/api/engagement/battle-energy/fan`
- `/api/engagement/creator-cards`
- `/api/engagement/creator-cards${q}`
- `/api/engagement/daily-login`
- `/api/engagement/daily-login/claim`
- `/api/engagement/fan-level`
- `/api/engagement/hub`
- `/api/engagement/missions`
- `/api/engagement/missions/${id}/claim`
- `/api/engagement/mvp`
- `/api/engagement/progress`
- `/api/engagement/stickers`
- `/api/engagement/treasure`
- `/api/engagement/treasure/${id}/open`
- `/api/engagement/wallet`
- `/api/feed/foryou`
- `/api/feed/friends`
- `/api/feed/score/${videoId}`
- `/api/feed/track-interaction`
- `/api/feed/track-view`
- `/api/gifts/catalog`
- `/api/gifts/send`
- `/api/hashtags/${encodeURIComponent(tag.toLowerCase())}`
- `/api/hashtags/${encodeURIComponent(tag.toLowerCase())}/videos`
- `/api/hearts/daily`
- `/api/hearts/daily/${hostUserId}`
- `/api/inbox/live-share-requests`
- `/api/live-share`
- `/api/live/end`
- `/api/live/moderation/check`
- `/api/live/start`
- `/api/live/streams`
- `/api/live/token`
- `/api/media/delete`
- `/api/media/public/${storagePath}`
- `/api/media/upload-file`
- `/api/membership/${encodeURIComponent(creatorId)}/status`
- `/api/membership/${user.id}`
- `/api/membership/iap-complete`
- `/api/music/global`
- `/api/music/playlists`
- `/api/music/search`
- `/api/music/tracks/${encodeURIComponent(track.id)}/preview`
- `/api/music/tracks/${encodeURIComponent(trackId)}/preview`
- `/api/music/tracks/:id/preview`
- `/api/notifications`
- `/api/notifications/read`
- `/api/profiles`
- `/api/profiles/${authUser.id}/following`
- `/api/profiles/${effectiveUserId}`
- `/api/profiles/${encodeURIComponent(authUser.id)}/following`
- `/api/profiles/${encodeURIComponent(card.userId)}`
- `/api/profiles/${encodeURIComponent(creator.userId)}`
- `/api/profiles/${encodeURIComponent(currentUserId)}/followers`
- `/api/profiles/${encodeURIComponent(currentUserId)}/following`
- `/api/profiles/${encodeURIComponent(effectiveStreamId)}`
- `/api/profiles/${encodeURIComponent(id)}`
- `/api/profiles/${encodeURIComponent(item.id)}`
- `/api/profiles/${encodeURIComponent(oppId)}`
- `/api/profiles/${encodeURIComponent(opts.userId)}`
- `/api/profiles/${encodeURIComponent(targetId)}/follow`
- `/api/profiles/${encodeURIComponent(targetId)}/unfollow`
- `/api/profiles/${encodeURIComponent(targetUserId)}/follow`
- `/api/profiles/${encodeURIComponent(targetUserId)}/unfollow`
- `/api/profiles/${encodeURIComponent(uid)}`
- `/api/profiles/${encodeURIComponent(user.id)}`
- `/api/profiles/${encodeURIComponent(user.id)}/following`
- `/api/profiles/${encodeURIComponent(userId)}`
- `/api/profiles/${encodeURIComponent(userId)}/followers`
- `/api/profiles/${encodeURIComponent(userId)}/following`
- `/api/profiles/${encodeURIComponent(viewerId)}`
- `/api/profiles/${targetProfileId}/follow`
- `/api/profiles/${targetProfileId}/unfollow`
- `/api/profiles/${user.id}`
- `/api/profiles/${user.id}/following`
- `/api/profiles/${user.user_id}/follow`
- `/api/profiles/${userId}`
- `/api/profiles/${userId}/follow`
- `/api/profiles/${userId}/unfollow`
- `/api/profiles/by-username/${encodeURIComponent(miniProfile.username)}`
- `/api/profiles/by-username/${encodeURIComponent(username)}`
- `/api/profiles/by-username/${encodeURIComponent(usernameClean)}`
- `/api/progression/me`
- `/api/promote-iap-complete`
- `/api/rankings/daily`
- `/api/rankings/weekly`
- `/api/report`
- `/api/rising-stars/badges/user/${encodeURIComponent(effectiveUserId)}`
- `/api/rising-stars/categories`
- `/api/rising-stars/challenges`
- `/api/rising-stars/challenges/${challengeId}`
- `/api/rising-stars/challenges/${challengeId}/enter`
- `/api/rising-stars/challenges/${challengeId}/entries`
- `/api/rising-stars/entries/${entryId}/vote`
- `/api/rising-stars/regions`
- `/api/rising-stars/seasons/${s.id}/standings`
- `/api/rising-stars/seasons/current`
- `/api/rising-stars/teams`
- `/api/shop/checkout`
- `/api/shop/items`
- `/api/shop/items/${encodeURIComponent(id)}`
- `/api/sounds`
- `/api/speed-options`
- `/api/sticker-options`
- `/api/stickers/${id}`
- `/api/stickers/${user.id}`
- `/api/stickers/upload`
- `/api/stories`
- `/api/unblock-user`
- `/api/verify-purchase`
- `/api/videos`
- `/api/videos/${encodeURIComponent(id)}`
- `/api/videos/${encodeURIComponent(item.id)}`
- `/api/videos/${encodeURIComponent(videoId)}`
- `/api/videos/${encodeURIComponent(videoId)}/comments`
- `/api/videos/${encodeURIComponent(videoId)}/comments/${encodeURIComponent(commentId)}`
- `/api/videos/${encodeURIComponent(videoId)}/comments/${encodeURIComponent(commentId)}/${action}`
- `/api/videos/${finalId}/fyp`
- `/api/videos/${safeId}/download`
- `/api/videos/${video.id}/like`
- `/api/videos/${video.id}/save`
- `/api/videos/${videoId}`
- `/api/videos/${videoId}/comments`
- `/api/videos/${videoId}/comments/${commentId}`
- `/api/videos/${videoId}/comments/${commentId}/${action}`
- `/api/videos/${videoId}/fyp`
- `/api/videos/${videoId}/like`
- `/api/videos/${videoId}/likes`
- `/api/videos/${videoId}/save`
- `/api/videos/${videoId}/unlike`
- `/api/videos/${videoId}/unsave`
- `/api/videos/liked/list`
- `/api/videos/saved/list`
- `/api/videos/user/${effectiveUserId}`
- `/api/videos/user/${user.id}`
- `/api/wallet/`

## 5. Backend routes
Inventoried method paths: 212
Possibly unused / admin-alias / no direct FE string (11):
- `GET /api/creator/earnings`
- `GET /api/engagement/flags`
- `GET /api/music/collections`
- `GET /api/music/status`
- `GET /api/progression/starter-history`
- `GET /api/progression/users/:userId/status`
- `GET /api/progression/xp-history`
- `GET /api/rising-stars/rewards`
- `POST /api/admin/chargeback`
- `POST /api/admin/unfreeze/:userId`
- `POST /api/auth/guest`
Note: creator payout admin actions ARE used via `/api/admin/payout/:id/*` (Withdrawals). Duplicate `/api/creator/payout/:id/*` aliases in unused list are false positives from mount mapping.

## 6. Database
Migrations applied before this pass: 40. New migration added: 20260723170000_elix_reports_review_columns.sql
Tables/relations in migration SQL: 91

## 7. External integrations (verified 2026-07-24)
| Service | Status |
|---|---|
| Neon | PASS (health + migrate) |
| Valkey | PASS |
| LiveKit | PASS |
| Bunny | PASS |
| Stripe | PASS |
| SendGrid | PASS |
| FCM Firebase 86271 | PASS (health.push=true + token) |
| Google Play SA | PASS (creds parse) |
| APNS | NOT IMPLEMENTED |
| Sentry | NOT VERIFIED (no DSN) |
| Epidemic/PEX/Loudly | PASS keys; deep NOT VERIFIED |

## 8. WS
Server events: 36
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
Client send missing on server: none. Server-only: battle_gift_score (gift_sent path also scores).

## 9-15. See chat report.

## 16. Connection / Integration Audit
Generated with inventory + orphan scan + WS cross-match.

### Summary buckets
- disconnected UI controls found: **0 empty onClick** (inventory); mute/notifications/settings switches **CONNECTED**
- disconnected routes found: **0** (all App.tsx routes map to pages)
- unreachable screens found: **0**
- unused APIs found (no FE string; retained with reason): see list below
- missing backend integrations found: **0 unmatched FE→BE** after template-string false positives
- unused backend routes found: **11** possibly-unused (ops/aliases — retained)
- orphan database code found: **NOT VERIFIABLE** without live DB usage metrics
- unused services found: none required removed this pass
- unused components found: **3 REMOVED** (ForYouStoriesStrip, GoldProfileFrame, LiveAIFilters)
- dead code found: intentional stub `battle_gift_score` (server ignores insecure client scoring)
- unused dependencies found: `@capacitor/clipboard` was registered but unused → **FIXED** (wired via `copyTextToClipboard`)
- unused native modules found: Clipboard was orphan → **FIXED**
- broken realtime connections found: none (client send missing on server: 0)
- broken notification connections found: prefs local **CONNECTED** to `notifications.ts` + LiveNotifyBanner; APNS **NOT IMPLEMENTED**

### Decision log
| Item | Decision |
|---|---|
| Admin `GET /api/admin/moderation/logs` | **FIXED** — wired into Admin Reports |
| `ForYouStoriesStrip` / `GoldProfileFrame` / `LiveAIFilters` | **REMOVED** — zero imports |
| `@capacitor/clipboard` | **FIXED** — connected through `copyTextToClipboard` |
| Inventory false `GET /api/admin/balance` etc. | **FIXED** (scanner) — was `*Router.get` false positive |
| WS `battle_gift_score` | **RETAINED WITH REASON** — deprecated insecure; scoring via `gift_sent` |
| `GET /api/creator/earnings` | **RETAINED WITH REASON** — balance UI uses `/balance` (`total_earned`); earnings is detail API |
| `GET /api/engagement/flags` | **RETAINED WITH REASON** — flags also returned by hub; used server-side |
| `GET /api/music/collections` + `/status` | **RETAINED WITH REASON** — SoundPicker uses global/playlists/search; status is ops |
| Progression starter/xp history + user status | **RETAINED WITH REASON** — history APIs; hub/progress covers UX |
| `GET /api/rising-stars/rewards` | **RETAINED WITH REASON** — catalog API; admin grant UI elsewhere |
| `POST /api/admin/chargeback` + `unfreeze` | **RETAINED WITH REASON** — admin ops APIs; no dedicated UI control yet |
| `POST /api/auth/guest` | **RETAINED WITH REASON** — intentionally disabled in production |
| FE template API strings unmatched | **RETAINED WITH REASON** — scanner false positives (`${queryParam}` etc.) |
| Auth 2FA / Ban appeals / APNS / dedicated search | **NOT VERIFIABLE** as required product features — **NOT IMPLEMENTED** |
| Dirty WIP (Upload/SoundPicker/Settings/HowItWorks uncommitted) | **NOT VERIFIABLE** — do not ship blindly |

### Production connection target
NO required feature left disconnected in this pass for inventoried UI/routes/WS.
Ops-only admin APIs retained with reason rather than deleted.
