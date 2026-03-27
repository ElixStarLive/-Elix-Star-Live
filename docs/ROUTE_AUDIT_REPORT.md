# Route Audit Report

**Date:** 2025-03-15  
**Scope:** Frontend routes (App.tsx), backend API routes (server/index.ts), and navigation/API usage across the codebase.

---

## Dead route criteria (checked)

A route/endpoint is considered **dead** when it:

- ❌ **Is not linked in navigation** — no `navigate()`, `<Link to>`, or `href` points to it.
- ❌ **Is not called by frontend/API** — no `fetch()`, `apiUrl()`, or server-side call.
- ❌ **Is not used in redirects** — not the target of `<Navigate to>` or `redirect()`.
- ❌ **Is left from old features** — no current feature or external integration uses it.

**Practice:** Before deleting, mark as deprecated and check 404 logs; remove only after confirming no external callers.

---

## Route map (high level)

```
/                     → redirect /feed | /login
/login, /register     → auth
/auth/callback        → OAuth
/terms, /privacy, /copyright
/legal, /legal/*      → legal hub + subpages
/guidelines, /support
/forgot-password, /reset-password

/feed                 → main feed (BottomNav)
/stem, /following     → feed tabs (TopNav)
/search, /discover
/hashtag/:tag
/report

/video/:videoId
/live                 → live discover
/live/:streamId       → guard → /watch or LiveStream
/live/start           → redirect /live
/live/broadcast       → creator stream
/live/watch/:streamId → creator stream (alternate; no in-app link) ⚠ low-use
/watch/:streamId      → spectator

/profile, /profile/:userId
/friends, /saved      → BottomNav + profile
/music/:songId
/create               → BottomNav
/creator/login-details
/inbox, /inbox/:threadId
/upload
/edit-profile
/settings, /settings/blocked, /settings/safety
/purchase-coins
/shop, /shop/:itemId
/call
/ai-studio

/admin                → admin dashboard
/admin/users, /admin/reports, /admin/economy
(no /admin/videos)    → link removed (was dead)

*                     → catch-all → /feed
```

---

## 1. Frontend routes scanned

All routes are defined in `src/App.tsx`:

| Path | Component | Status |
|------|-----------|--------|
| `/` | Redirect to /feed or /login | ✅ Kept |
| `/login` | Login | ✅ Kept (linked from Register, ForgotPassword, etc.) |
| `/register` | Register | ✅ Kept |
| `/auth/callback` | AuthCallback | ✅ Kept (OAuth) |
| `/terms` | Terms | ✅ Kept (Settings, Register, Support) |
| `/privacy` | Privacy | ✅ Kept (Settings, Support, PurchaseCoins) |
| `/copyright` | Copyright | ✅ Kept (Support, Legal) |
| `/legal` | Legal | ✅ Kept (hub for legal subpages) |
| `/legal/audio` | LegalAudio | ✅ Kept (Legal hub) |
| `/legal/ugc` | LegalUGC | ✅ Kept (Legal hub) |
| `/legal/affiliate` | LegalAffiliate | ✅ Kept (Legal hub) |
| `/legal/dmca` | LegalDMCA | ✅ Kept (Legal hub, Copyright, LegalUGC) |
| `/legal/safety` | LegalSafety | ✅ Kept (Legal hub) |
| `/guidelines` | Guidelines | ✅ Kept (Settings, Support, SafetyCenter) |
| `/support` | Support | ✅ Kept (Settings, SafetyCenter) |
| `/forgot-password` | ForgotPassword | ✅ Kept (Login) |
| `/reset-password` | ResetPassword | ✅ Kept (email flow) |
| `/feed` | VideoFeed | ✅ Kept (default, BottomNav) |
| `/stem` | StemFeed | ✅ Kept (VideoFeed, TopNav, StemFeed) |
| `/following` | FollowingFeed | ✅ Kept (VideoFeed, TopNav, StemFeed) |
| `/search` | SearchPage | ✅ Kept (VideoFeed, StemFeed, Inbox) |
| `/discover` | Discover | ✅ Kept (VideoFeed, StemFeed) |
| `/hashtag/:tag` | Hashtag | ✅ Kept (dynamic) |
| `/report` | Report | ✅ Kept (SafetyCenter, Guidelines) |
| `/video/:videoId` | VideoView | ✅ Kept (Profile, Search, etc.) |
| `/live` | LiveDiscover | ✅ Kept (VideoFeed, StemFeed) |
| `/live/:streamId` | LiveStreamGuard | ✅ Kept (redirects to /watch for spectators) |
| `/live/start` | Redirect to /live | ✅ Kept (entry point for old links) |
| `/live/broadcast` | LiveStreamKeyed | ✅ Kept (creator go-live) |
| `/live/watch/:streamId` | LiveStreamKeyed | ✅ Kept (alternate URL for creator view; no in-app link but valid for direct/bookmark) |
| `/watch/:streamId` | SpectatorPage | ✅ Kept (LiveDiscover, InlineLiveViewer) |
| `/profile` | Profile | ✅ Kept (BottomNav, Settings) |
| `/profile/:userId` | Profile | ✅ Kept (many links) |
| `/friends` | FriendsFeed | ✅ Kept (BottomNav) |
| `/saved` | SavedVideos | ✅ Kept (standalone page; Profile has inline “Saved” tab) |
| `/music/:songId` | MusicFeed | ✅ Kept (EnhancedVideoPlayer) |
| `/create` | Create | ✅ Kept (BottomNav, Profile, Share panel) |
| `/creator/login-details` | CreatorLoginDetails | ✅ Kept (Profile) |
| `/inbox` | Inbox | ✅ Kept (BottomNav, Profile) |
| `/inbox/:threadId` | ChatThread | ✅ Kept (Inbox, Shop) |
| `/upload` | Upload | ✅ Kept (Create flow) |
| `/edit-profile` | EditProfile | ✅ Kept (Profile, Settings, SafetyCenter) |
| `/settings` | Settings | ✅ Kept (Profile) |
| `/settings/blocked` | BlockedAccounts | ✅ Kept (Settings, SafetyCenter) |
| `/settings/safety` | SafetyCenter | ✅ Kept (Settings, Support) |
| `/purchase-coins` | PurchaseCoins | ✅ Kept (Shop, etc.) |
| `/shop` | Shop | ✅ Kept (Profile, VideoFeed, StemFeed) |
| `/shop/:itemId` | Shop | ✅ Kept (Profile) |
| `/call` | VideoCall | ✅ Kept (incoming call flow) |
| `/ai-studio` | AIStudio | ✅ Kept (Profile) |
| `/admin` | AdminDashboard | ✅ Kept (RequireAdmin) |
| `/admin/users` | AdminUsers | ✅ Kept (Dashboard link) |
| `/admin/reports` | AdminReports | ✅ Kept (Dashboard link) |
| `/admin/economy` | AdminEconomy | ✅ Kept (Dashboard link) |
| `*` | Navigate to /feed | ✅ Kept (catch-all) |

---

## 2. Borderline / deprecation candidates (mark first, delete later)

These routes are **kept** but have no or few in-app links. If you want to trim later, mark deprecated and check 404 logs before removing.

| Path | Notes | Recommendation |
|------|--------|----------------|
| `/live/watch/:streamId` | Alternate URL for creator live view; no `navigate()` or `<Link>` in codebase. May be used by bookmarks or external links. | Mark deprecated in code comment; monitor 404 or analytics; remove in a future release if unused. |
| `/saved` | Standalone Saved Videos page; Profile has an inline “Saved” tab but no “View all” link to `/saved`. | Consider adding “See all” from Profile saved tab to `/saved`, or mark deprecated and monitor before removing. |

No other routes qualified as borderline; everything else is linked or used in redirects/API.

---

## 3. Removed (dead)

| Item | Reason |
|------|--------|
| **“Manage Videos” link** on Admin Dashboard (`/admin/videos`) | No route exists for `/admin/videos` in App.tsx. The link led to a 404 (then catch-all to /feed). Removed the button and kept three Quick Actions: Manage Users, Review Reports, Economy Controls. |

---

## 4. Backend API routes (server/index.ts)

All registered Express routes were cross-checked with frontend and server usage:

- **Auth:** `/api/auth/*`, `/api/profile` — used (useAuthStore, login, register, etc.).
- **Live:** `/api/live/streams`, `/api/live/start`, `/api/live/end`, `/api/live/token`, `/api/live/moderation/check` — used (LiveStream, SpectatorPage, LiveDiscover, etc.).
- **Gifts:** `/api/gifts/send` — used (LiveStream, SpectatorPage).
- **Payments:** `/api/create-checkout-session`, `/api/create-promote-checkout`, `/api/create-payment-intent`, `/api/create-subscription`, `/api/verify-purchase`, `/api/promote-iap-complete` — used (LiveStream, SpectatorPage, PromotePanel, iap, etc.).
- **Analytics:** `/api/analytics`, `/api/analytics/track` — used (analytics.ts).
- **Profiles:** `/api/profiles/*` — used (Profile, LiveStream, SpectatorPage, avatarUpload, etc.).
- **Feed:** `/api/feed/foryou`, `/api/feed/track-view`, `/api/feed/track-interaction`, `/api/feed/score/:videoId` — used (interactionTracker, useVideoStore).
- **Videos:** `/api/videos`, `/api/videos/:id`, `/api/videos/user/:userId`, `/api/videos/:id` (DELETE) — used (videoUpload, fypEligibility, etc.).
- **Creator:** `/api/creator/*` — used (creator flows).
- **Admin:** `/api/admin/*` — used (admin flows).
- **Shop:** `/api/shop/*` — used (Shop).
- **Media:** `/api/media/upload-file`, `/api/media/delete` — used (bunnyStorage).
- **Misc:** `/api/block-user`, `/api/report`, `/api/delete-account`, `/api/test-coins`, `/api/send-notification`, etc. — used from UI or server-side flows.

All endpoints (`/api/sounds`, `/api/device-tokens`, etc.) are served by the Express server via modular routers.

---

## 5. Recommended: 404 logs and lint

- **404 logs:** Log or monitor 404s (frontend and API). Routes that never get hit are candidates for deprecation/removal after a period (e.g. 30 days).
- **Lint / checks:** Add a script or ESLint rule that:
  - Parses route definitions (e.g. from `App.tsx` or a routes config).
  - Greps for path strings in the repo (e.g. `"/admin/videos"`, `navigate('/saved')`).
  - Warns when a defined route has zero references (or only in tests).
- **Deprecation pattern:** For borderline routes, add a comment in `App.tsx` and optionally a deprecation banner in the component, e.g. “This page is deprecated and will be removed on YYYY-MM-DD.”

---

## 6. Verification

- **Build:** `npm run build` completed successfully after removing the dead “Manage Videos” link.
- **Navigation:** All remaining routes have at least one in-app navigation path or redirect, or are intentional entry points (e.g. `/live/start`, `/live/watch/:streamId` for bookmarks/direct links).

---

## 7. Summary

| Action | Count |
|--------|--------|
| Routes scanned (frontend) | 50+ |
| Dead link removed | 1 (Admin “Manage Videos” → `/admin/videos`) |
| Routes removed | 0 (no route definition removed) |
| Backend routes removed | 0 |
| Build/test | ✅ Passed |

All current route definitions are kept. The only change was removing the dead “Manage Videos” admin link that pointed to a non-existent `/admin/videos` route.
