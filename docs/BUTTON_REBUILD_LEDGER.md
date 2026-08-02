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

## Queue (next when continuing)
- 009 Comment button  
- 010 Share  
- 011 Save / Bookmark  
- 012 Follow on video  
- 013 Profile avatar on video  
