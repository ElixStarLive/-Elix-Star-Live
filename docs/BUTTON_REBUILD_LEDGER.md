# Button-by-button rebuild ledger

**Repository:** `Elix Star Live` (existing app only)  
**Process:** read → implement clean code → delete old path → continue to next

---

## Controls 001–007 — For You top bar (COMPLETED)

### Files changed
- `src/components/TopNav.tsx`

### Removed
- Inline mixed `if (live) navigate(replace) else navigate(path)` onClick
- Inline Search navigate lambda

### Implemented
| ID | Control | New owner | Contract |
| --- | --- | --- | --- |
| 001 | LIVE | `goLive` | `/live` + `replace: true` |
| 002 | STEM | `goStem` | `/stem` |
| 003 | Explore | `goExplore` | `/discover` |
| 004 | Following | `goFollowing` | `/following` |
| 005 | Shop | `goShop` | `/shop` |
| 006 | For You | `goForYou` | `/feed` |
| 007 | Search | `goSearch` | `/search` |

UI markup / styles / icons / order unchanged. Dispatcher: `onTabPress`.

---

## Control 008 — For You Like button (COMPLETED)

### Control Identity
| Field | Value |
| --- | --- |
| Screen | For You / feed video chrome |
| Button | Like (sidebar Heart) + double-tap like on video |
| Components | `src/components/EnhancedVideoPlayer.tsx` |
| Store owner | `src/store/useVideoStore.ts` → `toggleLike` |

### Original Connections
```text
Tap Like (or double-tap video)
→ handleLike
→ toggleLike(videoId)
→ optimistic store update + publishVideoCollection
→ POST /api/videos/:id/like | /unlike
→ on failure revert + publish revert
→ trackLike / refreshVideoFypStatus on success
→ Heart UI from video.isLiked + stats.likes
```

### Removed
- Loose `handleLike` declared after `handleVideoClick` (ordering hazard)
- Untracked `setTimeout` for heart animation (no cleanup)
- Unprotected rapid `toggleLike` (duplicate POSTs possible)

### Implemented
- `handleLike` via `useCallback` (single owner for button + double-tap)
- `pulseHeartAnimation` with `heartHideTimerRef` + unmount cleanup
- `likeInFlight` Set in store — one in-flight like/unlike per `videoId`
- Same API contracts: `POST .../like` and `POST .../unlike`
- Same optimistic UI + revert on error

### Shared code note (`toggleLike`)
- Only UI caller: `EnhancedVideoPlayer` (grep confirmed)
- Friends/Following feeds use same player → same improved path (required)

### Behaviour confirmation
- Same Heart button position / icons / count — unchanged JSX chrome
- Same endpoints and optimistic behaviour
- Device E2E — pending owner

---

## Controls 009–013 — For You video sidebar (COMPLETED)

### Files changed
- `src/components/EnhancedVideoPlayer.tsx` only (handlers)

### Removed
- Loose `const handleX = () =>` handlers without stable identity / dependency clarity

### Implemented (same UI buttons, same actions)
| ID | Control | New owner | Behaviour preserved |
| --- | --- | --- | --- |
| 009 | Comment | `handleComment` useCallback | opens `EnhancedCommentsModal`, analytics |
| 010 | Share | `handleShare` useCallback | opens ShareModal, analytics |
| 011 | Save | `handleSave` useCallback | `toggleSave` + analytics |
| 012 | Follow | `handleFollow` useCallback | `toggleFollow` + analytics |
| 013 | Profile avatar | `handleProfileClick` useCallback | opens UserProfileModal, analytics |

Modal markup / API paths inside modals **not** rebuilt in this step (next controls if damaged).

---

## Control 014 — Comment modal send (COMPLETED)

### Files changed
- `src/components/EnhancedCommentsModal.tsx`

### Removed
- Unused `_token` auth subscription
- Unprotected double-submit on send (rapid Enter / tap)

### Implemented
- `posting` gate on `handleAddComment`
- Same contract: `POST /api/videos/:id/comments` + reload via GET
- Same toast on failure; server-owned comment list (no invented rows)

---

## Controls 015–016 — Music chip + More open (COMPLETED)

### Files changed
- `src/components/EnhancedVideoPlayer.tsx`

### Removed
- Loose `handleMusicClick` / misnamed `handleReport` (opened More, not Report)

### Implemented
| ID | Control | New owner | Contract |
| --- | --- | --- | --- |
| 015 | Music chip (sidebar) | `handleMusicClick` useCallback | `/music/:id` + analytics |
| 016 | More (⋯) | `openMoreMenu` | opens More Options sheet |

---

## Controls 017–027 — More Options sheet + Report submit (COMPLETED)

### Files changed
- `src/components/EnhancedVideoPlayer.tsx`
- `src/components/ReportModal.tsx`

### Removed
- Dead `_handleQRCode`
- Inline More-sheet `onClick` lambdas
- Report dual-submit fallback (`request` then `api.reports.create`)
- Dead unused Report delete path (`_handleDelete`, owner fetch, `_authToken`)

### Implemented
| ID | Control | New owner |
| --- | --- | --- |
| 017 | Backdrop close | `closeMoreMenu` |
| 018 | Copy Link | `moreCopyLink` |
| 019 | Download | `moreDownload` |
| 020 | Duet | `moreDuet` → `/upload?duet=` |
| 021 | QR Code | `moreToggleQr` |
| 022 | Delete video | `handleDeleteVideo` |
| 023 | Share | `moreShare` |
| 024 | Save | `moreSave` |
| 025 | Follow | `moreFollow` |
| 026 | Promote | `morePromote` |
| 027 | Report + Submit | `moreReport` + `api.reports.create` → `POST /api/report` |

UI markup / styles unchanged.

---

## Controls 028–032 — Bottom nav (COMPLETED)

### Files changed
- `src/components/BottomNav.tsx`

### Removed
- Inline `onClick={() => navigate(path)}`

### Implemented
| ID | Control | New owner | Contract |
| --- | --- | --- | --- |
| 028 | Home | `goHome` | `/feed` |
| 029 | Friends | `goFriends` | `/friends` |
| 030 | Create | `goCreate` | `/create` |
| 031 | Inbox | `goInbox` | `/inbox` |
| 032 | Profile | `goProfile` | `/profile` |

Dispatcher: `onTabPress`. UI / hide-on-live behaviour unchanged.

---

## Controls 033–045 — Create screen chrome (COMPLETED)

### Files changed
- `src/pages/Create.tsx`

### Removed
- Inline navigate/mode/editor lambdas on Create chrome

### Implemented (same routes / same UI)
| ID | Control | New owner |
| --- | --- | --- |
| 033 | Close → feed | `goFeedClose` |
| 034 | Add sound | `openSoundPicker` |
| 035 | Clear sound | `clearSelectedSound` |
| 036 | Gallery / upload picker | `openUploadPicker` |
| 037 | Flip camera | `flipCamera` |
| 038 | Timer cycle | `cycleTimer` |
| 039 | Post tab | `selectPostTab` |
| 040 | Create tab | `selectCreateTab` |
| 041 | Live tab | `selectLiveTab` |
| 042 | Text / Stickers / Effects / Filters | named editor openers |
| 043 | Close editor panel | `closeEditorPanel` |
| 044 | Your Story | `goYourStory` (unchanged contract) |
| 045 | Next → upload | `goNextVideoPost` (unchanged contract) |

Camera/record/live stream logic not rewritten this pass.

---

## Controls 046–060 — Inbox chrome (COMPLETED)

### Files changed
- `src/pages/Inbox.tsx`

### Removed
- Inline navigate / filter / panel lambdas on Inbox chrome

### Implemented
| ID | Control | New owner |
| --- | --- | --- |
| 046 | Search | `goSearch` |
| 047 | Close → feed | `goFeedBack` |
| 048 | Shop (notif) | `goShop` |
| 049 | Followers hub | `openNewFollowersPanel` / `closeNewFollowersPanel` |
| 050 | Avatar → profile/live | `openUserOrLive` |
| 051–055 | Filters | `filterMain`…`filterActivity` |
| 056 | Open DM | `openConversation` |
| 057 | Open video | `openVideo` |
| 058 | Watch stream | `openWatchStream` |
| 059 | Notification action | `openActionUrl` |
| 060 | Follower row → profile | `openFollowerProfile` |

Routes unchanged.

---

## Controls 061–075 — Profile chrome (COMPLETED)

### Files changed
- `src/pages/Profile.tsx`

### Removed
- Inline navigate / tab / settings / sign-out lambdas on Profile chrome

### Implemented
| ID | Control | New owner |
| --- | --- | --- |
| 061 | Back / Close | `goBack` |
| 062 | Settings | `goSettings` |
| 063 | Sign out → login | `goLoginAfterSignOut` |
| 064 | AI Studio | `goAiStudio` |
| 065 | Creator login details | `goCreatorLoginDetails` |
| 066 | Shop | `goShop` |
| 067 | Post Story / upload story | `goUploadStory` |
| 068 | Video grid open | `goVideo` |
| 069–070 | Following / Followers counts | `goFollowingList` / `goFollowersList` |
| 071 | Avatar picker | `openAvatarPicker` |
| 072–075 | Profile tabs | `tabVideos`…`tabLiked` |

Message / share / promote paths not fully rewritten this pass.

---

## Controls 076–082 — Friends + Live lobby (COMPLETED)

### Files changed
- `src/pages/FriendsFeed.tsx`
- `src/pages/LiveDiscover.tsx`

### Implemented
| ID | Control | New owner |
| --- | --- | --- |
| 076 | Friends Search | `goSearch` |
| 077 | Friends Back | `goBack` |
| 078 | Add / Post story | `goUploadStory` |
| 079 | Discover CTA | `goDiscover` |
| 080 | Suggested → profile/live | `openUserOrLive` |
| 081 | Close story viewer | `closeStoryViewer` |
| 082 | Live lobby → feed / watch | `goFeed` / `openWatch` |

---

## Controls 083–098 — Settings menu (COMPLETED)

### Files changed
- `src/pages/Settings.tsx`

### Removed
- Inline `navigate(...)` on each Settings row / legal link

### Implemented
Named owners: `goBack`, `goEditProfile`, `goSafety`, `goSecurity`, `goPayout`, `goEngagement`, `goAdmin`, `goNotifications`, `goLikedVideos`, `goSaved`, `goBlocked`, `goHowItWorks`, `goSupport`, `goTerms`, `goPrivacy`, `goGuidelines`, `goLogin` (logout/delete).

Routes unchanged. UI unchanged.

---

## Queue (next)
- 099 Upload publish  
- 100 Watch / live room controls  

---

## Controls 101–130 — Search, Discover, STEM, Following, Saved, Music feeds (COMPLETED)

### Files changed
- `src/pages/SearchPage.tsx`
- `src/pages/Discover.tsx`
- `src/pages/StemFeed.tsx`
- `src/pages/FollowingFeed.tsx`
- `src/pages/SavedVideos.tsx`
- `src/pages/MusicFeed.tsx`

### Removed
- Inline `onClick={() => navigate(...)}` on page chrome and list/grid rows
- Loose panel/tab/search lambdas without stable `useCallback` owners

### Implemented
| ID | Screen | Control | New owner | Contract |
| --- | --- | --- | --- | --- |
| 101 | Search | Backdrop / Cancel / Back | `closePanel` | `navigate(-1)` after dismiss animation |
| 102 | Search | Clear query | `clearQuery` | clears input |
| 103 | Search | Category chips | `selectCategory` | sets `activeCategory` |
| 104 | Search | User result row | `openUserProfile` | `/profile/:id` |
| 105 | Search | Video result row | `openVideo` | `/video/:id` |
| 106 | Search | Submit search | `handleSearch` | URL `?q=` replace + recent storage |
| 107 | Search | Swipe dismiss | `handleTouchEnd` | calls `closePanel` |
| 108 | Discover | Header search icon | `focusSearch` | focuses `#discover-search` |
| 109 | Discover | Back | `goBack` | `navigate(-1)` |
| 110 | Discover | Clear search | `clearSearchQuery` | clears `searchQuery` |
| 111 | Discover | Trending tab | `tabTrending` | `activeTab = trending` |
| 112 | Discover | Top 99 tab | `tabRanking` | `activeTab = ranking` |
| 113 | Discover | Tags tab | `tabHashtags` | `activeTab = hashtags` |
| 114 | Discover | Rising tab | `goRisingStars` | `/rising-stars` |
| 115 | Discover | Music quick tab | `searchMusic` | query + search tab |
| 116 | Discover | Comedy quick tab | `searchComedy` | query + search tab |
| 117 | Discover | Gaming quick tab | `searchGaming` | query + search tab |
| 118 | Discover | Dance quick tab | `searchDance` | query + search tab |
| 119 | Discover | Ranking row | `openCreatorProfile` | `/profile/:id` |
| 120 | Discover | Video tile open | `openVideo` | `/video/:id` |
| 121 | Discover | Video like | `handleLike` | `POST .../like` |
| 122 | Discover | Video save | `handleSave` | `POST .../save` |
| 123 | Discover | Video share | `handleShare` | native share + toast |
| 124 | Discover | Video more / comment | `openVideoMore` / `openVideoComment` | `/video/:id` |
| 125 | Discover | Search user row | `openUserProfile` | `/profile/:id` |
| 126 | Discover | Search follow chip | `handleFollow` | `POST .../follow` |
| 127 | Discover | Hashtag row | `openHashtag` | `/hashtag/:tag` + analytics |
| 128 | STEM | Search | `goSearch` | `/search` |
| 129 | STEM | Back | `goBack` | `navigate(-1)` |
| 130 | STEM | Empty refresh | `refreshStem` | `fetchStemVideos()` |

### Also completed (no new IDs — same pass)
- **FollowingFeed:** `goSearch`, `goBack`, `goDiscover`, `openFollowingUser`, `handleScroll`, `handleVideoEnd`
- **SavedVideos:** `goBack`, `openVideo`, `loadMore` (alongside existing `load`)
- **MusicFeed:** `goSearch`, `goBack`, `toggleSaveTrack`, `selectPlaylist`, `openTrack`, `openVideoFromSound`, `togglePreview`

UI markup / styles / routes unchanged on all six screens.

### Queue (next)
- 099 Upload publish  
- 100 Watch / live room controls  
- Discover search input `onChange` debounce owner (low priority — not a button)  
- SearchPage `TrendingSnapFeed` inner tile handlers (child component — separate pass if needed)

---

## Controls 131–160 — ChatThread, Shop, PurchaseCoins, EditProfile, AIStudio (COMPLETED)

### Files changed
- `src/pages/ChatThread.tsx`
- `src/pages/Shop.tsx`
- `src/pages/PurchaseCoins.tsx`
- `src/pages/EditProfile.tsx`
- `src/pages/AIStudio.tsx`

### Removed
- Inline `navigate(...)` lambdas on chrome and link-preview actions
- Loose async purchase / restore handlers without stable identity (PurchaseCoins)
- Inline cart/create/modal open-close lambdas (Shop)
- Inline sheet close / avatar-picker lambdas (EditProfile, AIStudio)

### Implemented
| ID | Screen | Control | New owner | Contract |
| --- | --- | --- | --- | --- |
| 131 | ChatThread | Back → inbox (system) | `goInbox` | `/inbox` |
| 132 | ChatThread | Video call | `handleVideoCall` | initiateCall → `/call` |
| 133 | ChatThread | Back → inbox (DM header) | `goInbox` | `/inbox` |
| 134 | ChatThread | Live row → watch | `openWatchLive` | `/watch/:roomKey` |
| 135 | ChatThread | Profile preview card | `openProfile` | `/profile/:id` |
| 136 | ChatThread | Video/live preview card | `openPreviewMedia` | `/video/:id` or `/watch/:id` |
| 137 | ChatThread | Message app-link taps | `openAppLink` | dynamic in-app route |
| 138 | Shop | Sell (+) | `openCreateListing` | opens create sheet |
| 139 | Shop | Search | `goSearch` | `/search` |
| 140 | Shop | Basket open | `openCart` | opens cart sheet |
| 141 | Shop | Back | `goBack` | `navigate(-1)` |
| 142 | Shop | See all live | `goLiveDiscover` | `/live` |
| 143 | Shop | Live circle → watch | `openWatchLive` | `/watch/:streamKey` |
| 144 | Shop | Category filters | `selectFilter` | local filter state |
| 145 | Shop | Empty state sell CTA | `openCreateListing` | opens create sheet |
| 146 | Shop | Item menu toggle | `toggleItemMenu` | local menu state |
| 147 | Shop | Close item menu | `closeItemMenu` | clears menu |
| 148 | Shop | Message seller | `handleMessageSeller` | ensureThread → `/inbox/:id` |
| 149 | Shop | Add to basket | `handleAddToCart` | cart store add |
| 150 | Shop | Remove from basket (grid) | `handleRemoveFromCart` | cart store remove |
| 151 | Shop | Create sheet backdrop close | `closeCreateListing` | closes create sheet |
| 152 | Shop | Cart backdrop / X close | `closeCart` | closes cart sheet |
| 153 | Shop | Cart line remove | `handleRemoveFromCart` | cart store remove |
| 154 | Shop | Checkout with Stripe | `handleCheckoutCart` | `POST /api/shop/checkout` → external Stripe URL |
| 155 | PurchaseCoins | Back → feed | `goFeed` | `/feed` |
| 156 | PurchaseCoins | Coin pack purchase | `handleNativePurchase` | platform IAP only |
| 157 | PurchaseCoins | Restore purchases | `handleRestore` | IAP restore |
| 158 | PurchaseCoins | Terms link | `goTerms` | `/terms` |
| 159 | PurchaseCoins | Privacy link | `goPrivacy` | `/privacy` |
| 160 | EditProfile | Sheet close | `goBack` | `navigate(-1)` |

**Also wrapped (same pass, no new IDs):** EditProfile `handleSave`, `openAvatarPicker`; AIStudio `goBack`, `openFilePicker`, `openTools`, `closeTools`, `handleReset`, `togglePlayback`, `handleAutoEnhance`, `handleExport`.

Payment separation preserved: Shop checkout stays Stripe-only; coin packs stay IAP-only. UI / layout unchanged.

---

## Controls 161–180 — Live broadcast + watch chrome (COMPLETED)

### Files changed
- `src/pages/LiveStream.tsx`
- `src/pages/SpectatorPage.tsx`

### Removed
- Inline navigate / open-panel / close-panel lambdas on live broadcast + watch chrome (gift/share/more/report/ranking/viewers/profile)

### Implemented — LiveStream (broadcast)
| ID | Control | New owner | Contract |
| --- | --- | --- | --- |
| 161 | Close / leave | `closeLiveWithSlide` | **RETAINED** — battle/co-host exit + feed or stop broadcast |
| 162 | Open gift panel | `openGiftPanel` | clears co-host gift target, opens panel |
| 163 | Close gift panel | `closeGiftPanel` | closes panel + clears co-host gift target |
| 164 | Open share | `openSharePanel` | opens share sheet |
| 165 | Close share | `closeSharePanel` | closes share sheet |
| 166 | Open more | `openMoreMenu` | opens more sheet |
| 167 | Close more | `closeMoreMenu` | closes more backdrop/sheet |
| 168 | Report | `moreReport` / `shareReport` / `closeReportModal` | opens ReportModal; same `/api/report` via modal |
| 169 | Mini profile → profile | `goMiniProfileFromMini` | `/profile/:id` after close mini profile |
| 170 | Co-host tile → gift | `openGiftPanelForCohost` | sets co-host gift target + opens panel |

**Also wired (same pass):** `openGiftPanelIfSpectator`, `openDailyRanking`, `openWeeklyRanking`, `openFindCreatorsFromHeader`, `closeViewerList`, `openGiftFromRanking`, `openWeeklyRankingFromGift`, `openMembershipFromGift`, `moreShare`, `moreToggleChat`. Header membership uses existing `_openMembershipBar`.

**Retained existing owners:** `openSpectatorsPanel`, `openTopGiftersPanel`, `handleSendGift`, `handleMiniProfileFollowToggle`, `handleMiniProfileShare`, battle/co-host/mic/cam WS owners unchanged.

### Implemented — SpectatorPage (watch)
| ID | Control | New owner | Contract |
| --- | --- | --- | --- |
| 171 | Leave stream | `leaveStreamWithSlide` | **RETAINED** — disconnect + `/feed` |
| 172 | Go back (offline) | `goFeed` | `/feed` replace |
| 173 | Retry connection | `retryStreamConnection` | resets stream check + retry key |
| 174 | Open gift panel | `openGiftPanel` | clears co-host gift target, opens panel |
| 175 | Close gift panel | `closeGiftPanel` | closes panel + clears co-host gift target |
| 176 | Share open/close | `openSharePanel` / `closeSharePanel` | share sheet |
| 177 | More open/close | `openMoreMenu` / `closeMoreMenu` | more sheet |
| 178 | Report | `moreReport` / `shareReport` / `closeReportModal` | ReportModal unchanged |
| 179 | Viewers panel | `openViewersPanelFromHeader` / `closeViewersPanel` / `openViewerProfile` | list from room viewers → profile |
| 180 | Chat profile tap | `openChatProfile` | host/self profile or `/search?q=` |

**Also wired (same pass):** `goLoginFromWatch`, `goLiveLobby`, `openDailyRanking`, `openWeeklyRanking`, `openMembershipFromHeader`, `openGiftFromRanking`, `openGiftPanelForCohost`, `openGiftFromFanClub`, `moreShare`, `moreToggleChat`.

**Retained existing owners:** `sendCohostJoinRequest`, `handleSpectatorVote`, `handleSendGift`, `followHost`, `handleLikeTap`, LiveKit/WS gift send unchanged.

UI markup / styles / routes / API contracts unchanged.

### Queue (next)
- 181+ Remaining live room controls (battle/co-host inline, poll, test coins, share channel actions)

---

## Controls 181–230 — Engagement, Rising Stars, settings, auth, support (COMPLETED)

### Files changed
- `src/pages/engagement/EngagementHub.tsx`
- `src/pages/engagement/EngagementShell.tsx`
- `src/pages/RisingStars.tsx`
- `src/pages/RisingStarsChallenge.tsx`
- `src/pages/Hashtag.tsx`
- `src/pages/VideoView.tsx`
- `src/pages/VideoCall.tsx`
- `src/pages/CreatorPayout.tsx`
- `src/pages/settings/BlockedAccounts.tsx`
- `src/pages/settings/SafetyCenter.tsx`
- `src/pages/settings/SecuritySettings.tsx`
- `src/pages/settings/NotificationSettings.tsx`
- `src/pages/Support.tsx`
- `src/pages/HowItWorks.tsx`
- `src/pages/Report.tsx`
- `src/pages/FollowList.tsx`
- `src/pages/Login.tsx`
- `src/pages/ResetPassword.tsx`
- `src/pages/CreatorLoginDetails.tsx`

### Removed
- Inline `navigate(...)` lambdas on primary chrome / sheet close / list row navigation across engagement hub, Rising Stars, hashtag/video views, settings sub-screens, support/report flows, and auth chrome

### Implemented
| ID | Screen | Control | New owner | Contract |
| --- | --- | --- | --- | --- |
| 181 | EngagementHub | Back | `goBack` | `navigate(-1)` |
| 182 | EngagementHub | Claim daily login | `goDailyLogin` | `/engagement/daily-login` |
| 183 | EngagementHub | Hub link rows | `openEngagementPath` | dynamic `/engagement/*` |
| 184 | EngagementShell | Back (shared sub-pages) | `goBack` | `backTo` prop (default `/engagement`) |
| 185 | RisingStars | Back | `goBack` | `navigate(-1)` |
| 186 | RisingStars | Challenge row | `openChallenge` | `/rising-stars/challenge/:id` |
| 187 | RisingStars | Standing profile row | `openCreatorProfile` | `/profile/:id` |
| 188 | RisingStarsChallenge | Back | `goBack` | `navigate(-1)` |
| 189 | RisingStarsChallenge | Qualifier / Final live | `openWatchLive` | `/watch/:roomId` |
| 190 | RisingStarsChallenge | Create video CTA | `goCreate` | `/create` |
| 191 | RisingStarsChallenge | Entry creator avatar | `openCreatorProfile` | `/profile/:id` |
| 192 | RisingStarsChallenge | Entry username/video | `openVideo` | `/video/:id` |
| 193 | Hashtag | Back to For You | `goFeed` | `/feed` |
| 194 | Hashtag | Video grid tile | `openVideo` | `/video/:id` |
| 195 | VideoView | Back / close (all states) | `goBack` | `navigate(-1)` |
| 196 | VideoCall | Post-end redirect | `goBackAfterCall` | `navigate(-1)` after 3s |
| 197 | CreatorPayout | Back | `goBack` | `navigate(-1)` |
| 198 | BlockedAccounts | Sheet close | `goBack` | `navigate(-1)` |
| 199 | SafetyCenter | Sheet close | `goBack` | `navigate(-1)` |
| 200 | SafetyCenter | Blocked accounts | `goBlocked` | `/settings/blocked` |
| 201 | SafetyCenter | Report a problem | `goReport` | `/report?type=support&id=support_ticket` |
| 202 | SafetyCenter | Account privacy | `goEditProfile` | `/edit-profile` |
| 203 | SafetyCenter | Data & personalization | `goPrivacy` | `/privacy` |
| 204 | SafetyCenter | Guidelines / safety tips | `goGuidelines` | `/guidelines` |
| 205 | SafetyCenter | Contact support | `goSupport` | `/support` |
| 206 | SecuritySettings | Sheet close | `goBack` | `navigate(-1)` |
| 207 | SecuritySettings | Password reset | `goForgotPassword` | `/forgot-password` |
| 208 | SecuritySettings | Blocked accounts | `goBlocked` | `/settings/blocked` |
| 209 | NotificationSettings | Sheet close | `goBack` | `navigate(-1)` |
| 210 | Support | Sheet close (all views) | `goBack` | `navigate(-1)` |
| 211 | Support | Open contact form | `openContactForm` | local sheet state |
| 212 | Support | Safety Center link | `goSafety` | `/settings/safety` |
| 213 | Support | Guidelines link | `goGuidelines` | `/guidelines` |
| 214 | Support | Terms link | `goTerms` | `/terms` |
| 215 | Support | Privacy link | `goPrivacy` | `/privacy` |
| 216 | Support | Copyright link | `goCopyright` | `/copyright` |
| 217 | HowItWorks | Sheet close | `goBack` | `navigate(-1)` |
| 218 | HowItWorks | Open Engagement Hub CTA | `goEngagement` | `/engagement` |
| 219 | HowItWorks | Help & Support CTA | `goSupport` | `/support` |
| 220 | HowItWorks | Community Guidelines CTA | `goGuidelines` | `/guidelines` |
| 221 | Report | Sheet close (all views) | `goBack` | `navigate(-1)` |
| 222 | FollowList | Back | `goBack` | `navigate(-1)` |
| 223 | FollowList | Profile row | `openProfile` | `/profile/:id` |
| 224 | FollowList | Follow when logged out | `goLogin` | `/login` |
| 225 | Login | Sign up chrome button | `goRegister` | `/register` |
| 226 | ResetPassword | Post-reset redirect | `goLogin` | `/login` replace |
| 227 | CreatorLoginDetails | Close | `goBack` | `navigate(-1)` |
| 228 | CreatorLoginDetails | Sign out | `handleSignOut` | signOut + `/creator/login-details` replace |
| 229 | CreatorLoginDetails | Post-auth redirect | `goProfile` | `/profile` replace |
| 230 | RisingStarsChallenge | Vote/enter auth gate | `goLogin` | `/login` |

**Also wrapped (same pass, no new IDs):** RisingStarsChallenge `share` → `useCallback`; Support/Report post-submit timeout uses `goBack`; Login post-submit `navigate(from)` retained inline (form success path, not chrome).

UI markup / styles / routes / API contracts unchanged.

### Queue (next)
- 231+ Upload chrome (`/create`, `/feed`, `/ai-studio` close/nav)
- 231+ Legal stack (`Legal.tsx`, `LegalDMCA`, `LegalSafety`, `LegalAudio`, `LegalAffiliate`, `LegalUGC`, `LegalSupplier`, `Copyright`, `Privacy`, `Guidelines`)
- 231+ `AuthCallback.tsx` login retry button
- Admin pages (skipped — quick queue only): `admin/Dashboard`, `admin/Users`, `admin/RisingStars`, `admin/Progression`, `admin/Purchases`, `admin/Withdrawals`, `admin/Reports`
- LiveStream battle/co-host inline controls (retained from 181 queue)
- ForgotPassword — uses `<Link>` only; no inline navigate chrome

---

## Controls 231–250 — Legal stack, auth callback, profile message (COMPLETED)

### Files changed
- `src/pages/Guidelines.tsx`
- `src/pages/Privacy.tsx`
- `src/pages/Copyright.tsx`
- `src/pages/Legal.tsx`
- `src/pages/LegalDMCA.tsx`
- `src/pages/LegalSafety.tsx`
- `src/pages/LegalAudio.tsx`
- `src/pages/LegalAffiliate.tsx`
- `src/pages/LegalUGC.tsx`
- `src/pages/LegalSupplier.tsx`
- `src/pages/AuthCallback.tsx`
- `src/pages/Profile.tsx`

### Removed
- Inline `navigate(...)` lambdas on legal/policy sheet close, back buttons, list rows, DMCA links, settings/report CTAs, auth retry, and profile message/inbox chrome

### Implemented
| ID | Screen | Control | New owner | Contract |
| --- | --- | --- | --- | --- |
| 231 | Guidelines | Sheet close | `goBack` | `navigate(-1)` |
| 232 | Guidelines | Report a Violation | `goReport` | `/report` |
| 233 | Guidelines | Go to Settings | `goSettings` | `/settings` |
| 234 | Privacy | Sheet close | `goBack` | `navigate(-1)` |
| 235 | Privacy | Go to Settings | `goSettings` | `/settings` |
| 236 | Copyright | Sheet close | `goBack` | `navigate(-1)` |
| 237 | Copyright | DMCA Policy link | `goDmca` | `/legal/dmca` |
| 238 | Legal | Back | `goBack` | `navigate(-1)` |
| 239 | Legal | Policy list row | `openLegalItem` | dynamic `/terms`, `/privacy`, `/legal/*`, etc. |
| 240 | LegalDMCA | Back | `goBack` | `navigate(-1)` |
| 241 | LegalSafety | Back | `goBack` | `navigate(-1)` |
| 242 | LegalAudio | Back | `goBack` | `navigate(-1)` |
| 243 | LegalAffiliate | Back | `goBack` | `navigate(-1)` |
| 244 | LegalUGC | Back | `goBack` | `navigate(-1)` |
| 245 | LegalUGC | DMCA Policy link | `goDmca` | `/legal/dmca` |
| 246 | LegalSupplier | Back | `goBack` | `navigate(-1)` |
| 247 | AuthCallback | Go to Login (error) | `goLogin` | `/login` replace |
| 248 | Profile | Message (other profile) | `openThread` | ensureThread → `/inbox/:id` |
| 249 | Profile | Message fallback | `goInbox` | `/inbox` |
| 250 | Profile | Add story (+ on avatar ring) | `goUploadStoryFromRing` | stopPropagation + `/upload?type=story` |

**Also retained (not rebuilt):** AuthCallback post-verify `navigate('/profile')` in effect (post-auth success path); Profile existing `goUploadStory` for action bar.

**Scan result (`onClick={() => navigate(`):** no remaining user-facing chrome matches outside admin pages.

UI markup / styles / routes / API contracts unchanged.

## Controls 099–110 — Upload publish chrome (COMPLETED)

### Files changed
- `src/pages/Upload.tsx`

### Implemented
`goLoginFromUpload`, `goCreate`, `goFeed`, `goFriends`, `goAiStudio`, `openMusicModal`, `openAITools`, `clearPostError`, `setDuetSplit`, `setDuetOverlay`, `toggleOriginalMute` — wired over previous inline navigate/modal lambdas. `handlePost` success routes via `goFriends` / `goFeed`.

---

## Controls 251–276 — Terms, admin chrome, live share/poll/panels (COMPLETED)

### Files changed
- `src/pages/Terms.tsx`
- `src/pages/admin/Dashboard.tsx`
- `src/pages/admin/Users.tsx`
- `src/pages/admin/Purchases.tsx`
- `src/pages/admin/Withdrawals.tsx`
- `src/pages/admin/RisingStars.tsx`
- `src/pages/admin/Progression.tsx`
- `src/pages/admin/Reports.tsx`
- `src/pages/LiveStream.tsx`
- `src/pages/SpectatorPage.tsx`

### Removed
- Inline `navigate(...)` on Terms sheet close, admin back/quick-action/profile/report-view chrome
- Inline share-channel lambdas (WhatsApp / Facebook / Copy Link / Promote) on live broadcast + watch share panels
- Inline poll toggle / test-coins modal open-close / battle find-creators panel close / team status & fan club close on live chrome

### Implemented
| ID | Screen | Control | New owner | Contract |
| --- | --- | --- | --- | --- |
| 251 | Terms | Sheet close | `goBack` | `navigate(-1)` |
| 252 | Admin Dashboard | Quick action tiles | `goAdminPath` | dynamic `/admin/*` |
| 253 | Admin Users | View profile | `goProfile` | `/profile/:id` |
| 254 | Admin Purchases | Back | `goAdmin` | `/admin` |
| 255 | Admin Withdrawals | Back | `goAdmin` | `/admin` |
| 256 | Admin RisingStars | Back | `goAdmin` | `/admin` |
| 257 | Admin Progression | Back | `goAdmin` | `/admin` |
| 258 | Admin Reports | View reported target | `openReportTarget` | `/video`, `/profile`, or `/live` by type |
| 259 | LiveStream | Share WhatsApp | `shareWhatsApp` | external WA + engagement progress |
| 260 | LiveStream | Share Facebook | `shareFacebook` | external FB + engagement progress |
| 261 | LiveStream | Share copy link | `shareCopyLink` | clipboard + toast + progress |
| 262 | LiveStream | Share promote | `sharePromote` / `closePromotePanel` | opens/closes PromotePanel |
| 263 | LiveStream | Test coins open/close | `openTestCoinsModal` / `closeTestCoinsModal` | local test-coin modal only |
| 264 | LiveStream | Effects panel open/close | `openLiveEffectsPanel` / `closeLiveEffectsPanel` | backdrop close only |
| 265 | LiveStream | Host poll toggle | `toggleHostPoll` / `toggleHostPollFromMore` | `startPoll` / `endPoll` unchanged |
| 266 | LiveStream | Spectator poll open | `openSpectatorPoll` | dispatches `elix-open-live-poll` |
| 267 | LiveStream | Battle chrome | `openBattleChrome` / `closeFindCreatorsPanel` | toggle battle or open creators sheet |
| 268 | LiveStream | Team / fan club close | `closeTeamStatus` / `closeFanClub` | panel dismiss |
| 269 | SpectatorPage | Share WhatsApp | `shareWhatsApp` | external WA + engagement progress |
| 270 | SpectatorPage | Share Facebook | `shareFacebook` | external FB + engagement progress |
| 271 | SpectatorPage | Share copy link | `shareCopyLink` | clipboard + toast + progress |
| 272 | SpectatorPage | Share promote | `sharePromote` / `closePromotePanel` | opens/closes PromotePanel |
| 273 | SpectatorPage | Test coins open/close | `openTestCoinsModal` / `closeTestCoinsModal` | local test-coin modal only |
| 274 | SpectatorPage | Poll open | `openSpectatorPoll` | dispatches `elix-open-live-poll` |
| 275 | SpectatorPage | Co-host panel close | `closeCoHostPanel` | backdrop dismiss |
| 276 | SpectatorPage | Opponent panel close | `closeOpponentPanel` | backdrop dismiss |

**Also wrapped (same pass, no new IDs):** LiveStream `recordLiveShareProgress`; SpectatorPage `recordWatchShareProgress`.

**Intentional exclusions (not chrome / not rebuilt):**
- Gift send, LiveKit join, wallet deduct, battle API/WS contracts, rematch logic, co-host request send, battle invite accept/decline, filter/effect apply buttons inside effects panel, admin form submit/act handlers, auth post-success redirects in effects.

UI markup / styles / routes / API contracts unchanged.

### Queue (next)
**FULL APP CHROME REBUILD COMPLETE** for user-facing + admin primary chrome.

Remaining non-chrome / out-of-scope (honest):
- Live room deep internals: rematch, battle invite accept/decline, co-host request send, gift combo, filter apply inside effects panel, engagement drawer open from More menu
- Admin Economy.tsx — no navigate chrome (API act buttons only)
- ForgotPassword — `<Link>` only
- Child components (`TrendingSnapFeed`, etc.) — separate pass if needed
- Discover search input debounce — not a button

---

## Controls 277–283 — Component chrome navigate owners (COMPLETED)

### Files changed
- `src/components/TrendingSnapFeed.tsx`
- `src/components/ShareModal.tsx`
- `src/components/UserProfileModal.tsx`
- `src/components/InlineLiveViewer.tsx`
- `src/components/LiveNotifyBanner.tsx`
- `src/components/EnhancedVideoPlayer.tsx`
- `src/components/IncomingCallModal.tsx`

### Removed
- Inline `onClick={() => navigate(...)}` lambdas on feed tiles, share duet, profile modal video grid, inline live tap-to-watch, live notify banner, hashtag chips, and incoming-call accept/auto-route

### Implemented
| ID | Screen / component | Control | New owner | Contract |
| --- | --- | --- | --- | --- |
| 277 | TrendingSnapFeed | Video thumbnail tile | `openVideo` | `/video/:id` |
| 278 | ShareModal | Duet action | `goDuet` | close + `/upload?duet=:id` |
| 279 | UserProfileModal | Video grid tile | `openVideoFromGrid` | close + `/video/:id` |
| 280 | InlineLiveViewer | Tap card | `openWatch` | `/watch/:streamKey` |
| 281 | LiveNotifyBanner | Tap banner | `openLiveWatch` | dismiss + `/watch/:room` |
| 282 | EnhancedVideoPlayer | Hashtag chip | `openHashtag` | `/hashtag/:tag` |
| 283 | IncomingCallModal | Accept / auto-connect | `goCall` | `/call` |

**Scan results (honest):**
- `src/pages` — no remaining `onClick={() => navigate(` chrome; page owners already use named `useCallback` handlers (Profile, Inbox, Discover, etc.)
- `src/pages/engagement/` — `EngagementHub` + `EngagementShell` only; both already wrapped
- `src/pages/admin/Economy.tsx` — no navigate chrome (API act buttons only)
- BottomNav / TopNav — already done in prior passes

**Intentional exclusions (not chrome / not rebuilt):**
- Auth post-success redirects (`AuthCallback`, `Login`, `Register` effects)
- LiveStream / SpectatorPage room lifecycle, battle invite accept/decline, co-host deep internals
- ShareModal non-navigate action lambdas (Promote, Report, Download, QR — local/modal only)
- GiftPanel recharge — no router navigate in component

UI markup / styles / routes / API contracts unchanged.

### Queue (next)
- Live room deep internals (rematch, battle invite, co-host request send, filter apply inside effects panel)
- ShareModal / EnhancedVideoPlayer remaining non-navigate inline action lambdas (optional hygiene pass)

---

## Controls 284–307 — LiveStream + SpectatorPage battle/co-host/engagement chrome (COMPLETED)

### Files changed
- `src/pages/LiveStream.tsx`
- `src/pages/SpectatorPage.tsx`

### Removed
- Inline rematch reset + `startBattleWithAcceptedCreators` lambdas on bottom bar and More menu
- Inline battle/co-host invite accept/decline wrappers and join-request accept/decline from viewer list
- Inline spectator co-host request send, engagement drawer open from More/missions, effects filter/face apply, combo tap wrapper
- Inline co-host gift grid taps, MVP top-gifters row opens, SpectatorPage battle invite accept, co-host accept/decline, gift battle target toggles

### Implemented
| ID | Screen | Control | New owner | Contract |
| --- | --- | --- | --- | --- |
| 284 | LiveStream | Rematch (bottom bar) | `triggerRematch` | `startBattleWithAcceptedCreators` + local battle reset |
| 285 | LiveStream | Rematch (More menu) | `triggerRematchFromMore` | same + close More |
| 286 | LiveStream | Start Match (find creators) | `startMatchFromFindCreators` | close panel + `startBattleWithAcceptedCreators` |
| 287 | LiveStream | Battle invite Join | `acceptBattleInviteClick` | `acceptBattleInvite` (WS `battle_invite_accept`) |
| 288 | LiveStream | Battle invite Reject | `declineBattleInvite` | WS `battle_invite_decline` (converted to `useCallback`) |
| 289 | LiveStream | Co-host invite Join | `acceptCohostInviteClick` | `acceptCohostInvite` (WS `cohost_invite_accept`) |
| 290 | LiveStream | Co-host invite Reject | `declineCohostInvite` | local dismiss (converted to `useCallback`) |
| 291 | LiveStream | Join request Accept/Reject | `acceptJoinRequestFromViewerList` / `declineJoinRequestFromViewerList` | WS `cohost_request_accept` / `cohost_request_decline` |
| 292 | LiveStream | Spectator co-host request | `sendSpectatorCohostRequest` | WS `cohost_request_send` |
| 293 | LiveStream | Co-host Invite from viewer row | `inviteCoHostFromViewer` | `inviteCoHost` + close viewer list |
| 294 | LiveStream | Combo tap button | `onComboButtonClick` | `handleComboClick` (gift combo send) |
| 295 | LiveStream | Engagement (More) | `openEngagementFromMore` | opens EngagementDrawer hub |
| 296 | LiveStream | Missions (mission dock) | `openEngagementMissions` | opens EngagementDrawer missions |
| 297 | LiveStream | Effects filter apply | `applyLiveFilterPreset` | `setLiveFilterCss` + close panel |
| 298 | LiveStream | Effects face apply | `applyLiveFaceEffectPreset` | `setActiveLiveFaceEffect` + close panel |
| 299 | LiveStream | More Flip/Mute/Cam | `moreFlipCamera` / `moreToggleMic` / `moreToggleCam` | existing toggle helpers + close More |
| 300 | LiveStream | MVP top gifters rows | `openTopGiftersHost` / `openTopGiftersOpponent` / `openTopGiftersAll` | open top gifters panel |
| 301 | LiveStream | Co-host grid gift tap | `openCoHostGiftFromGrid` | `openGiftPanelForCohost` |
| 302 | LiveStream | Viewer mini profile row | `openViewerMiniProfile` | `openMiniProfile` + close viewer list |
| 303 | SpectatorPage | Battle invite Join/Reject | `acceptBattleInviteFromWatch` / `declineBattleInviteFromWatch` | WS battle invite accept/decline (converted to `useCallback`) |
| 304 | SpectatorPage | Co-host invite Join/Reject | `acceptCohostInviteFromWatch` / `declineCohostInviteFromWatch` | WS `cohost_invite_accept` / local dismiss |
| 305 | SpectatorPage | Co-host request send | `sendCohostJoinRequest` | wired directly (already `useCallback`) |
| 306 | SpectatorPage | Engagement + missions | `openEngagementFromMore` / `openEngagementMissions` | EngagementDrawer open |
| 307 | SpectatorPage | Combo tap + gift battle target | `handleComboClick` / `setGiftBattleTargetHost` / `setGiftBattleTargetOpponent` | combo resend + battle gift side |

**Also wrapped (same pass, no new IDs):** SpectatorPage `openViewersPanelFromMissions`, `openViewersPanelForHostMvp`, `openViewersPanelForOpponentMvp`, `openCohostGiftFromGrid`, `closeFanClub`; LiveStream `resetBattleForRematch`, battle/co-host/join-request core handlers converted to `useCallback`.

**Already proper (not rebuilt):**
- `startBattleWithAcceptedCreators` — retained as battle API owner; rematch buttons call `triggerRematch` which delegates to it
- `handleSendGift`, LiveKit join, wallet deduct, gift send API/WS — untouched
- Mystery timer (M5/M10/M15), booster/glove/mist WS sends in gift panel, mini-profile follow/share, test-coins amount presets, fan-club sticker taps — secondary/deep panel chrome

UI markup / styles / routes / API contracts unchanged.

---

## Controls 308–330 — Live deep panel + ShareModal + EnhancedVideoPlayer chrome (COMPLETED)

### Files changed
- `src/pages/LiveStream.tsx`
- `src/pages/SpectatorPage.tsx`
- `src/components/ShareModal.tsx`
- `src/components/EnhancedVideoPlayer.tsx`

### Removed
- Inline mystery timer (M5/M10/M15) lambdas in LiveStream More menu
- Inline spectator vote `handleSpectatorVote('…')` wrappers on battle tap overlays
- Inline booster/glove/mist WS send lambdas in SpectatorPage gift chrome
- Inline fan-club emoji sticker send lambdas in SpectatorPage
- Inline test-coins preset/max/submit lambdas on LiveStream + SpectatorPage
- Inline mini-profile follow/share void wrappers on LiveStream
- Inline fan-club sticker delete wrapper on LiveStream
- Inline ShareModal Promote/Report/Download/QR/Share action lambdas
- Inline EnhancedVideoPlayer video `onError` retry + Tap to retry lambdas

### Implemented
| ID | Screen / component | Control | New owner | Contract |
| --- | --- | --- | --- | --- |
| 308 | LiveStream | Mystery M5/M10/M15 (More) | `startMysteryFromMore` | `startMystery(mins, 'poll')` + close More |
| 309 | LiveStream | Test coins preset | `selectTestCoinsPreset` | `setTestCoinsAmount` |
| 310 | LiveStream | Test coins max | `addMaxTestCoinsAtOnce` | `addPersistedTestCoins` (local test only) |
| 311 | LiveStream | Test coins submit | `submitTestCoinsAmount` | form submit unchanged |
| 312 | LiveStream | Fan club sticker delete | `removeFanClubSticker` | `deleteSticker` (API DELETE) |
| 313 | LiveStream | Mini profile Follow | `miniProfileFollowClick` | `handleMiniProfileFollowToggle` |
| 314 | LiveStream | Mini profile Share | `miniProfileShareClick` | `handleMiniProfileShare` |
| 315 | SpectatorPage | Vote host | `voteHost` | `handleSpectatorVote('host')` → WS `battle_spectator_vote` |
| 316 | SpectatorPage | Vote opponent | `voteOpponent` | `handleSpectatorVote('opponent')` |
| 317 | SpectatorPage | Vote player3 | `votePlayer3` | `handleSpectatorVote('player3')` |
| 318 | SpectatorPage | Vote player4 | `votePlayer4` | `handleSpectatorVote('player4')` |
| 319 | SpectatorPage | Send glove booster | `sendGloveBooster` | WS `booster_activated` |
| 320 | SpectatorPage | Send mist fog | `sendMistFog` | WS `mist_activated` |
| 321 | SpectatorPage | Test coins preset | `selectTestCoinsPreset` | `setTestCoinsAmount` |
| 322 | SpectatorPage | Test coins max | `addMaxTestCoinsAtOnce` | `addPersistedTestCoins` (local test only) |
| 323 | SpectatorPage | Test coins submit | `submitTestCoinsAmount` | form submit unchanged |
| 324 | SpectatorPage | Fan club sticker tap | `sendFanClubSticker` | chat message + close panel |
| 325 | ShareModal | Promote open | `openPromotePanel` | close modal + open PromotePanel |
| 326 | ShareModal | Report | `reportFromShare` | close + `onReport` |
| 327 | ShareModal | Download | `downloadFromShare` | `downloadVideoWithoutMusic` |
| 328 | ShareModal | QR open/close | `openQrCode` / `closeQrCode` | local QR panel toggle |
| 329 | EnhancedVideoPlayer | Video error retry | `handleVideoLoadError` / `retryVideoPlayback` | auto-retry + manual tap retry |
| 330 | ShareModal | Native share | `shareNative` | `nativeShareUrl` |

**Intentional exclusions (not chrome / not rebuilt):**
- LiveStream has no spectator glove/mist send UI (SpectatorPage only)
- SpectatorPage fan-club photo upload (file picker) — deep file-input flow
- LiveStream/SpectatorPage test-coins password unlock form — submit still inline (password hash verify only)
- LiveStream mini-profile Make Mod / Block — moderator deep actions
- ShareModal delete-video confirm, social platform `withShareTracking` factories, follower send rows
- Gift send, wallet deduct, LiveKit, battle API core handlers — untouched

UI markup / styles / routes / API contracts unchanged.

---

## Controls 331–336 — Final primary button wrappers (COMPLETED)

### Files changed
- `src/pages/LiveStream.tsx`
- `src/pages/SpectatorPage.tsx`
- `src/components/ShareModal.tsx`

### Removed
- Inline test-coins password unlock submit lambdas on LiveStream + SpectatorPage
- Inline SpectatorPage fan-club custom photo upload file-picker lambda
- Inline LiveStream mini-profile Make Mod / Block lambdas
- Inline ShareModal delete-video confirm lambda

### Implemented
| ID | Screen / component | Control | New owner | Contract |
| --- | --- | --- | --- | --- |
| 331 | LiveStream | Test coins password unlock | `submitTestCoinsPasswordUnlock` | SHA-256 verify → localStorage → amount step |
| 332 | SpectatorPage | Test coins password unlock | `submitTestCoinsPasswordUnlock` | SHA-256 verify → localStorage → amount step |
| 333 | SpectatorPage | Fan club photo upload | `triggerFanClubPhotoUpload` | file input → chat message (subscriber only) |
| 334 | LiveStream | Mini profile Make Mod | `toggleMiniProfileModerator` | local moderators Set toggle |
| 335 | LiveStream | Mini profile Block | `blockMiniProfileUser` | POST `/api/block-user` |
| 336 | ShareModal | Delete video confirm | `confirmDeleteVideo` | `nativeConfirm` → `onDeleteVideo` |

UI markup / styles / routes / API contracts unchanged.

### Queue
**BUTTON REBUILD COMPLETE** for the full app.

Remaining non-button items (intentional, not chrome rebuild scope):
- Auth effect redirects (session bootstrap, protected-route guards)
- Search debounce / filter typing handlers (ShareModal search input, page-level search fields)
- ShareModal `withShareTracking` social row factories (platform share URLs, not discrete button owners)
- Gift send, wallet deduct, LiveKit join, battle API core handlers — untouched infrastructure logic

