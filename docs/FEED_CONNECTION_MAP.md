# Feed / video connection map

**Status:** IN PROGRESS — store + comments + discover + profile/saved wired to `feedApi`; some callers still inline  
**UI:** VideoFeed, FriendsFeed, EnhancedVideoPlayer, comments/likes — frozen  

## Owners after rebuild

| Concern | Owner | Status |
| --- | --- | --- |
| Feed list / like / follow / comment / view (store) | `src/features/feed/feedApi.ts` → `useVideoStore` | **CONNECTED** |
| FYP analytics (watch time, track-interaction) | `src/lib/interactionTracker.ts` | **CONNECTED** (unchanged) |
| Comments modal REST | `src/components/EnhancedCommentsModal.tsx` | **CONNECTED** |
| Discover feed REST | `src/pages/Discover.tsx` | **CONNECTED** (videos/like/save) |
| Profile and SavedVideos lists | `src/pages/Profile.tsx`, `src/pages/SavedVideos.tsx` | **CONNECTED** |
| FollowList / Search / friends-following profile lists | respective pages | **CONNECTED (profiles fetch via feedApi)** |
| HTTP transport | `src/lib/apiClient.ts` | **CONNECTED** |
| Live cards in feed | `InlineLiveViewer` + `lib/live` presence | **CONNECTED** |

## REST (preserve — used by feedApi / store)

| Endpoint | Method | Used by |
| --- | --- | --- |
| `/api/feed/foryou` | GET | `apiFetchForYouFeed` |
| `/api/feed/friends` | GET | `apiFetchFriendsFeed` |
| `/api/videos` | GET | `apiFetchAllVideos` (Stem) |
| `/api/videos/:id` | GET | `apiFetchVideoById` |
| `/api/videos/:id` | DELETE | `apiDeleteVideo` |
| `/api/videos/:id/like` \| `/unlike` | POST | `apiToggleVideoLike` |
| `/api/videos/:id/save` \| `/unsave` | POST | `apiToggleVideoSave` |
| `/api/videos/:id/comments` | POST | `apiPostVideoComment` |
| `/api/videos/:id/comments/:cid` | DELETE | `apiDeleteVideoComment` |
| `/api/videos/:id/comments/:cid/like` \| `/unlike` | POST | `apiToggleCommentLike` |
| `/api/profiles/:id/following` | GET | `apiFetchFollowingIds` |
| `/api/profiles/:id/follow` \| `/unfollow` | POST | `apiToggleFollow` |
| `/api/feed/track-view` | POST | `apiTrackFeedView` (+ interactionTracker watch payload) |
| `/api/feed/track-interaction` | POST | interactionTracker only |

## Remaining gaps

- `FollowList` still fetches per-user profile details inline (`/api/profiles/:id`) after id list
- Video upload / FYP boost paths stay in `lib/videoUpload.ts` (create flow, not feed store)
- No pagination wiring beyond page 1 in For You fetch

## Out of scope

- Live host/spectator internals  
- Server route changes  
