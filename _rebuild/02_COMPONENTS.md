# 02 — Components, Stores and Libraries

Source: `src/components` (56 `.tsx`), `src/store` (7), `src/hooks` (1), `src/lib` (59) at commit `013c722`.
Usage counts produced by scanning every `.ts`/`.tsx` under `src` for each component identifier, excluding the component's own file.

## Components by usage

### Global chrome (mounted in App.tsx)

| Component | Used by |
|-----------|---------|
| `TopNav` | App + 11 pages |
| `BottomNav` | App, VideoFeed, VideoCall, EnhancedVideoPlayer |
| `OfflineBanner` | App |
| `IncomingCallModal` | App |
| `LiveNotifyBanner` | App |
| `ErrorBoundary` | App, main.tsx |
| `RequireAuth` / `RequireAdmin` | App |

### Live surface (shared by LiveStream + SpectatorPage)

These 14 components are used by **both** the host and spectator pages. Any rebuild must keep host/spectator parity where it exists today.

| Component | Purpose |
|-----------|---------|
| `GiftOverlay` | full-screen gift video player |
| `GiftAnimationOverlay` | red top gift banner + `pushLocalGiftPill` local echo |
| `LiveGiftFeedStack` | left card stack with xN multiplier |
| `GiftPanel` | gift picker sheet |
| `GiftGoalGallery` | gift goal picker |
| `LiveGiftGoalBar` | goal progress bar |
| `ChatOverlay` | live chat |
| `RankingPanel` | weekly/daily/gifters rankings |
| `CyclingRankBadge` | rotating rank pill |
| `LiveMarkedTopUi` | shared top UI primitives (Follow pill, top gifter avatar, Diamond League, combo column) |
| `LiveEngagementOverlay` | engagement HUD |
| `LiveSideMissionStack` | side mission tabs |
| `BattleEnergyBoostControls`, `BattleTauntOverlays`, `BattleVfxOverlays` | battle layer |
| `EngagementDrawer` | side drawer |
| `PromotePanel`, `ReportModal`, `ShareModal` | shared actions |

Host-only: `FaceARGift`, `LiveFaceEffectsLayer`.

### Feed / video

`EnhancedVideoPlayer` (used by VideoFeed, StemFeed, FollowingFeed, FriendsFeed, VideoView), `EnhancedCommentsModal`, `EnhancedLikesModal`, `UserProfileModal`, `TrendingSnapFeed`, `InlineLiveViewer`, `StoryGoldRingAvatar`.

### Create / upload

`ElixCameraLayout`, `CaptureShutterButton`, `MediaEditorPanel`, `SoundPickerPanel`, `AIToolsPanel`.

### Shared primitives

`AvatarRing` (20 usages), `LevelBadge` (7), `LevelIcon`, `SettingsOptionSheet` (13), `NativeDialog` (6), `LanguagePickerSheet`, `BuyCoinsModal`, `royce` (52 — icon/asset system), `ui/badge`, `ui/button`, `ui/dialog`.

## Orphan components — zero usages

Confirmed by full-tree identifier scan. Matches [`_audit/CONNECTION_AUDIT.md`](../_audit/CONNECTION_AUDIT.md).

| Component | Usages | Status |
|-----------|--------|--------|
| `ForYouStoriesStrip` | 0 | CANDIDATE REMOVE — awaiting owner decision |
| `GoldProfileFrame` | 0 | CANDIDATE REMOVE — awaiting owner decision |
| `LiveAIFilters` | 0 | CANDIDATE REMOVE — awaiting owner decision |

Owner has not yet issued KEEP/REMOVE. These are **not** to be deleted from the old app and **not** to be carried into a new app without an explicit decision.

## State stores (Zustand)

| Store | File | Responsibility |
|-------|------|----------------|
| `useAuthStore` | `src/store/useAuthStore.ts` | session, user, persisted via Capacitor Preferences, SocialLogin |
| `useVideoStore` | `src/store/useVideoStore.ts` | feed video state |
| `useCallStore` | `src/store/useCallStore.ts` | video call state |
| `useCartStore` | `src/store/useCartStore.ts` | shop cart |
| `useSettingsStore` | `src/store/useSettingsStore.ts` | user settings |
| `useSafetyStore` | `src/store/useSafetyStore.ts` | safety prefs |
| `useLivePromoStore` | `src/store/useLivePromoStore.ts` | live promo state |

Only one hook exists: `src/hooks/useLiveEngagement.ts`.

## Library modules (59) grouped by domain

| Domain | Modules |
|--------|---------|
| Networking | `api.ts`, `apiClient.ts`, `authApiContract.ts`, `websocket.ts` |
| Auth | `authFeatures.ts`, `deepLinks.ts` |
| Gifts / economy | `giftsCatalog.ts`, `liveGiftGoal.ts`, `liveBattleGiftTarget.ts`, `testCoins.ts`, `iap.ts` |
| Live | `liveEngagement.ts`, `liveCreatorDisplay.ts`, `liveRuntimeCaps.ts` (+ test), `prepareLiveVideoEl.ts`, `cameraStream.ts` |
| Face / AR | `faceARRenderer.ts`, `faceLandmarks.ts`, `commercialFaceEffects.ts`, `liveFaceEffectsProvider.ts` |
| Media | `bunnyStorage.ts`, `videoUpload.ts`, `videoDownloadClient.ts`, `mediaBake.ts`, `recordedMediaCache.ts`, `avatarUpload.ts`, `avatarUploadService.ts`, `soundLibrary.ts` |
| AI | `ai/` (8 modules: background, captions, enhance, filters, index, subtitles, thumbnails, voice) |
| Social | `storiesApi.ts`, `openDmThread.ts`, `sharePanelContacts.ts`, `callService.ts` |
| Presentation | `levelColors.ts`, `profileFrame.ts`, `userCircleGlow.ts`, `royceAssets.ts`, `languages.ts`, `i18n.ts`, `toast.ts`, `utils.ts` |
| Platform | `platform.ts`, `lazyWithRetry.ts`, `notifications.ts`, `analytics.ts`, `crashReporting.ts` |
| Feed logic | `fypEligibility.ts`, `interactionTracker.ts`, `videoCollectionEvents.ts`, `suggestiveCaption.ts` |
| Battle | `battleTaunts.ts` |

Only one client test file exists: `src/lib/liveRuntimeCaps.test.ts`. Client test coverage is effectively absent — a genuine gap for the rebuild, and one of the few areas where the new app should exceed the old rather than match it.

## Size hotspots (rebuild risk)

The two live pages are by far the largest modules and carry the most historical patching:

| File | Approx. lines |
|------|---------------|
| `src/pages/LiveStream.tsx` | ~8,780 |
| `src/pages/SpectatorPage.tsx` | ~5,490 |

Both mount the same overlay set and duplicate similar WebSocket handling. This duplication is the single biggest structural target for `REIMPLEMENT CLEANLY` — but only behind an identical rendered result.
