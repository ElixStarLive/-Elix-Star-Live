# Elix Star Live Rebuild Status

> Authoritative rebuild table. Updated as each page/overlay/flow is processed.

## Final verdict

```
NOT RELEASE READY
```

## Page inventory (discovered from OLD routes)

Actual routed pages discovered: **58** (master instruction referenced approximately 78; this is the real route count from `src/App.tsx` and supporting lazy imports).

| Page | Route | Agent | OLD inspected | NEW implemented | UI parity | Behaviour parity | Contracts | Tests | Runtime | Device | Commit | Verdict |
| ---- | ----- | ----- | ------------- | --------------- | --------- | ---------------- | --------- | ----- | ------- | ------ | ------ | ------- |
| PAGE-001 — Login | `/login` | Devin | Yes | Yes | No | No | Partial | 14 unit | No | No | c8720c9 | NOT VERIFIED |
| PAGE-002 — Register | `/register` | Devin | Yes | In Progress | No | No | Partial | 0 | No | No | 2c3ee39 WIP | NOT VERIFIED |
| PAGE-003 — Verification | `/auth/callback` / `/?token=...` | Devin | No | No | No | No | No | 0 | No | No | n/a | NOT BUILT |
| PAGE-004 — Forgot Password | `/forgot-password` | Devin | No | No | No | No | No | 0 | No | No | n/a | NOT BUILT |
| PAGE-005 — Reset Password | `/reset-password` | Devin | No | No | No | No | No | 0 | No | No | n/a | NOT BUILT |
| PAGE-006 — App Shell | `/` shell | Devin | No | No | No | No | No | 0 | No | No | n/a | NOT BUILT |
| PAGE-007 — Terms of Service | `/terms` | Devin | No | No | No | No | No | 0 | No | No | n/a | NOT BUILT |
| PAGE-008 — Privacy Policy | `/privacy` | Devin | No | No | No | No | No | 0 | No | No | n/a | NOT BUILT |
| PAGE-009 — Copyright | `/copyright` | Devin | No | No | No | No | No | 0 | No | No | n/a | NOT BUILT |
| PAGE-010 — Legal Hub | `/legal` | Devin | No | No | No | No | No | 0 | No | No | n/a | NOT BUILT |
| PAGE-011 — Legal Audio | `/legal/audio` | Devin | No | No | No | No | No | 0 | No | No | n/a | NOT BUILT |
| PAGE-012 — Legal UGC | `/legal/ugc` | Devin | No | No | No | No | No | 0 | No | No | n/a | NOT BUILT |
| PAGE-013 — Legal Affiliate | `/legal/affiliate` | Devin | No | No | No | No | No | 0 | No | No | n/a | NOT BUILT |
| PAGE-014 — Legal DMCA | `/legal/dmca` | Devin | No | No | No | No | No | 0 | No | No | n/a | NOT BUILT |
| PAGE-015 — Legal Safety | `/legal/safety` | Devin | No | No | No | No | No | 0 | No | No | n/a | NOT BUILT |
| PAGE-016 — Legal Supplier | `/legal/supplier` | Devin | No | No | No | No | No | 0 | No | No | n/a | NOT BUILT |
| PAGE-017 — Community Guidelines | `/guidelines` | Devin | No | No | No | No | No | 0 | No | No | n/a | NOT BUILT |
| PAGE-018 — How It Works | `/how-it-works` | Devin | No | No | No | No | No | 0 | No | No | n/a | NOT BUILT |
| PAGE-019 — Support | `/support` | Devin | No | No | No | No | No | 0 | No | No | n/a | NOT BUILT |
| PAGE-020 — For You Feed | `/feed` | Devin | No | No | No | No | No | 0 | No | No | n/a | NOT BUILT |
| PAGE-021 — STEM Feed | `/stem` | Devin | No | No | No | No | No | 0 | No | No | n/a | NOT BUILT |
| PAGE-022 — Following Feed | `/following` | Devin | No | No | No | No | No | 0 | No | No | n/a | NOT BUILT |
| PAGE-023 — Search | `/search` | Devin | No | No | No | No | No | 0 | No | No | n/a | NOT BUILT |
| PAGE-024 — Discover | `/discover` | Devin | No | No | No | No | No | 0 | No | No | n/a | NOT BUILT |
| PAGE-025 — Rising Stars | `/rising-stars` | Devin | No | No | No | No | No | 0 | No | No | n/a | NOT BUILT |
| PAGE-026 — Rising Stars Challenge | `/rising-stars/challenge/:challengeId` | Devin | No | No | No | No | No | 0 | No | No | n/a | NOT BUILT |
| PAGE-027 — Engagement Hub | `/engagement` | Devin | No | No | No | No | No | 0 | No | No | n/a | NOT BUILT |
| PAGE-028 — Engagement Missions | `/engagement/missions` | Devin | No | No | No | No | No | 0 | No | No | n/a | NOT BUILT |
| PAGE-029 — Engagement Fan Level | `/engagement/fan-level` | Devin | No | No | No | No | No | 0 | No | No | n/a | NOT BUILT |
| PAGE-030 — Engagement MVP | `/engagement/mvp` | Devin | No | No | No | No | No | 0 | No | No | n/a | NOT BUILT |
| PAGE-031 — Engagement Achievements | `/engagement/achievements` | Devin | No | No | No | No | No | 0 | No | No | n/a | NOT BUILT |
| PAGE-032 — Engagement Rewards | `/engagement/rewards` | Devin | No | No | No | No | No | 0 | No | No | n/a | NOT BUILT |
| PAGE-033 — Engagement Daily Login | `/engagement/daily-login` | Devin | No | No | No | No | No | 0 | No | No | n/a | NOT BUILT |
| PAGE-034 — Engagement Collections | `/engagement/collections` | Devin | No | No | No | No | No | 0 | No | No | n/a | NOT BUILT |
| PAGE-035 — Hashtag | `/hashtag/:tag` | Devin | No | No | No | No | No | 0 | No | No | n/a | NOT BUILT |
| PAGE-036 — Report | `/report` | Devin | No | No | No | No | No | 0 | No | No | n/a | NOT BUILT |
| PAGE-037 — Video View | `/video/:videoId` | Devin | No | No | No | No | No | 0 | No | No | n/a | NOT BUILT |
| PAGE-038 — Live Discover | `/live` | Devin | No | No | No | No | No | 0 | No | No | n/a | NOT BUILT |
| PAGE-039 — Creator Live | `/live/broadcast` | Devin | No | No | No | No | No | 0 | No | No | n/a | NOT BUILT |
| PAGE-040 — Spectator Live | `/watch/:streamId` | Devin | No | No | No | No | No | 0 | No | No | n/a | NOT BUILT |
| PAGE-041 — Live Stream | `/live/:streamId` | Devin | No | No | No | No | No | 0 | No | No | n/a | NOT BUILT |
| PAGE-042 — Profile | `/profile`, `/profile/:userId` | Devin | No | No | No | No | No | 0 | No | No | n/a | NOT BUILT |
| PAGE-043 — Friends Feed | `/friends` | Devin | No | No | No | No | No | 0 | No | No | n/a | NOT BUILT |
| PAGE-044 — Saved Videos | `/saved` | Devin | No | No | No | No | No | 0 | No | No | n/a | NOT BUILT |
| PAGE-045 — Music Feed | `/music`, `/music/:songId` | Devin | No | No | No | No | No | 0 | No | No | n/a | NOT BUILT |
| PAGE-046 — Create | `/create` | Devin | No | No | No | No | No | 0 | No | No | n/a | NOT BUILT |
| PAGE-047 — Creator Login Details | `/creator/login-details` | Devin | No | No | No | No | No | 0 | No | No | n/a | NOT BUILT |
| PAGE-048 — Inbox | `/inbox` | Devin | No | No | No | No | No | 0 | No | No | n/a | NOT BUILT |
| PAGE-049 — Alerts | `/alerts` | Devin | No | No | No | No | No | 0 | No | No | n/a | NOT BUILT |
| PAGE-050 — Chat Thread | `/inbox/:threadId` | Devin | No | No | No | No | No | 0 | No | No | n/a | NOT BUILT |
| PAGE-051 — Upload | `/upload` | Devin | No | No | No | No | No | 0 | No | No | n/a | NOT BUILT |
| PAGE-052 — Edit Profile | `/edit-profile` | Devin | No | No | No | No | No | 0 | No | No | n/a | NOT BUILT |
| PAGE-053 — Settings | `/settings` | Devin | No | No | No | No | No | 0 | No | No | n/a | NOT BUILT |
| PAGE-054 — Creator Payout | `/settings/payout` | Devin | No | No | No | No | No | 0 | No | No | n/a | NOT BUILT |
| PAGE-055 — Blocked Accounts | `/settings/blocked` | Devin | No | No | No | No | No | 0 | No | No | n/a | NOT BUILT |
| PAGE-056 — Safety Center | `/settings/safety` | Devin | No | No | No | No | No | 0 | No | No | n/a | NOT BUILT |
| PAGE-057 — Security Settings | `/settings/security` | Devin | No | No | No | No | No | 0 | No | No | n/a | NOT BUILT |
| PAGE-058 — Notification Settings | `/settings/notifications` | Devin | No | No | No | No | No | 0 | No | No | n/a | NOT BUILT |
| PAGE-059 — Followers | `/profile/:userId/followers` | Devin | No | No | No | No | No | 0 | No | No | n/a | NOT BUILT |
| PAGE-060 — Following | `/profile/:userId/following` | Devin | No | No | No | No | No | 0 | No | No | n/a | NOT BUILT |
| PAGE-061 — Purchase Coins | `/purchase-coins` | Devin | No | No | No | No | No | 0 | No | No | n/a | NOT BUILT |
| PAGE-062 — Shop | `/shop`, `/shop/:itemId` | Devin | No | No | No | No | No | 0 | No | No | n/a | NOT BUILT |
| PAGE-063 — Video Call | `/call` | Devin | No | No | No | No | No | 0 | No | No | n/a | NOT BUILT |
| PAGE-064 — AI Studio | `/ai-studio` | Devin | No | No | No | No | No | 0 | No | No | n/a | NOT BUILT |
| PAGE-065 — Admin Dashboard | `/admin` | Devin | No | No | No | No | No | 0 | No | No | n/a | NOT BUILT |
| PAGE-066 — Admin Users | `/admin/users` | Devin | No | No | No | No | No | 0 | No | No | n/a | NOT BUILT |
| PAGE-067 — Admin Reports | `/admin/reports` | Devin | No | No | No | No | No | 0 | No | No | n/a | NOT BUILT |
| PAGE-068 — Admin Economy | `/admin/economy` | Devin | No | No | No | No | No | 0 | No | No | n/a | NOT BUILT |
| PAGE-069 — Admin Monetisation | `/admin/monetisation` | Devin | No | No | No | No | No | 0 | No | No | n/a | NOT BUILT |
| PAGE-070 — Admin Purchases | `/admin/purchases` | Devin | No | No | No | No | No | 0 | No | No | n/a | NOT BUILT |
| PAGE-071 — Admin Withdrawals | `/admin/withdrawals` | Devin | No | No | No | No | No | 0 | No | No | n/a | NOT BUILT |
| PAGE-072 — Admin Rising Stars | `/admin/rising-stars` | Devin | No | No | No | No | No | 0 | No | No | n/a | NOT BUILT |
| PAGE-073 — Admin Progression | `/admin/progression` | Devin | No | No | No | No | No | 0 | No | No | n/a | NOT BUILT |

## Overlay inventory (partial, from `src/components`)

| Overlay | Component file | Verdict |
| ------- | -------------- | ------- |
| Battle Taunt | `src/components/BattleTauntOverlays.tsx` | NOT BUILT |
| Battle VFX | `src/components/BattleVfxOverlays.tsx` | NOT BUILT |
| Buy Coins | `src/components/BuyCoinsModal.tsx` | NOT BUILT |
| Chat | `src/components/ChatOverlay.tsx` | NOT BUILT |
| Enhanced Comments | `src/components/EnhancedCommentsModal.tsx` | NOT BUILT |
| Enhanced Likes | `src/components/EnhancedLikesModal.tsx` | NOT BUILT |
| Feed Story Circles | `src/components/FeedStoryCirclesOverlay.tsx` | NOT BUILT |
| Gift Animation | `src/components/GiftAnimationOverlay.tsx` | NOT BUILT |
| Gift | `src/components/GiftOverlay.tsx` | NOT BUILT |
| Incoming Call | `src/components/IncomingCallModal.tsx` | NOT BUILT |
| Language Picker | `src/components/LanguagePickerSheet.tsx` | NOT BUILT |
| Live Engagement | `src/components/LiveEngagementOverlay.tsx` | NOT BUILT |
| Live Notify Banner | `src/components/LiveNotifyBanner.tsx` | NOT BUILT |
| Native Dialog | `src/components/NativeDialog.tsx` | NOT BUILT |
| Offline Banner | `src/components/OfflineBanner.tsx` | NOT BUILT |
| Report | `src/components/ReportModal.tsx` | NOT BUILT |
| Settings Option | `src/components/SettingsOptionSheet.tsx` | NOT BUILT |
| Share | `src/components/ShareModal.tsx` | NOT BUILT |
| User Profile | `src/components/UserProfileModal.tsx` | NOT BUILT |

> More overlays are expected in `src/features` and `src/lib/overlays`; this is a partial list only.

## Major flow inventory

| Flow | Pages/overlays involved | Verdict |
| ---- | ------------------------ | ------- |
| Account registration | PAGE-002, PAGE-003, PAGE-004, PAGE-005 | NOT BUILT |
| Login / session restore | PAGE-001, PAGE-006 | NOT VERIFIED |
| For You / feed consumption | PAGE-020, PAGE-037, overlays | NOT BUILT |
| Live creation and broadcast | PAGE-038, PAGE-039, overlays | NOT BUILT |
| Live spectating | PAGE-040, PAGE-041, overlays | NOT BUILT |
| Co-host request/invite | live pages, overlays | NOT BUILT |
| Battle | live pages, battle overlays | NOT BUILT |
| Gift sending / boost scenes | live pages, overlays | NOT BUILT |
| Profile / social graph | PAGE-042, PAGE-059, PAGE-060, overlays | NOT BUILT |
| Inbox / chat | PAGE-048, PAGE-049, PAGE-050 | NOT BUILT |
| Upload / create video | PAGE-046, PAGE-051 | NOT BUILT |
| Coin purchase (IAP) | PAGE-061, overlays | NOT BUILT |
| Shop (Stripe) | PAGE-062 | NOT BUILT |
| Admin moderation | PAGE-065–PAGE-073 | NOT BUILT |

## Backend inventory (to be expanded)

| Domain | Owner module(s) in NEW | Verdict |
| ------ | ---------------------- | ------- |
| Auth / session | `server/auth/*`, `server/routes/auth.routes.ts` | Partial |
| Email verification | `server/auth/emailVerification.ts` | Partial |
| Consent | `server/migrations/002_registration.sql` | Schema only |
| Postgres pool | `server/lib/postgres.ts` | Implemented |
| Valkey | `server/lib/valkey.ts` | Implemented |
| Migrations | `server/migrate.ts`, `server/migrations/*.sql` | Partial (001/002) |
| REST routes | `server/routes/auth.routes.ts` | Partial (login/logout/me) |
| WebSocket | Not yet built | NOT BUILT |
| LiveKit | Not yet built | NOT BUILT |
| Bunny Storage / CDN | Not yet built | NOT BUILT |
| Email dispatch | `server/lib/email.ts` | Implemented, not runtime verified |
| Payments / IAP | Not yet built | NOT BUILT |
