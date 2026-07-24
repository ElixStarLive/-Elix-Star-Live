# Connection / Integration Audit
Generated: 2026-07-24  
App HEAD: `be44657` (source = `08915cb` + Android version bump)  
Rule: **no UI/layout changes**; **no removals until owner confirms**.

## Owner decisions pending

Reply with KEEP / REMOVE / CONNECT for each **CANDIDATE** / **NEEDS CONNECT** item below.  
Nothing will be deleted or visually changed until you say so.

---

## Summary buckets

| Bucket | Count / status |
|---|---|
| Disconnected UI controls (empty onClick) | **0** |
| Disconnected routes | **0** (77 App routes registered) |
| Unreachable screens | **0** (69 pages reachable) |
| FE API → BE unmatched (real) | **0** (3 template-string false positives) |
| Unused / no-FE backend routes | **12** (see decisions) |
| Orphan components (zero imports) | **3** |
| Orphan libs | **0** |
| Broken WS (client send missing on server) | **0** |
| WS server-only never sent by client | **1** (`battle_gift_score`) |
| Unused native modules | **NOT VERIFIABLE** this pass (Clipboard package present; FE uses `navigator.clipboard` at this restore) |
| Unused packages | **NOT VERIFIABLE** without depcheck install |
| Orphan DB tables | **NOT VERIFIABLE** without live usage metrics |
| Broken notifications | Prefs **CONNECTED** locally; APNS **NOT IMPLEMENTED** |

---

## Decision log (every item)

### Routes / screens
| Item | Status |
|---|---|
| All `App.tsx` routes → page modules | **CONNECTED** |
| All page modules reachable from App | **CONNECTED** |

### Interactive controls
| Item | Status |
|---|---|
| Empty `onClick={}` inventory | **CONNECTED** (0 found) |
| Mute all sounds → settings store → video player | **CONNECTED** |
| Notification toggles → store → `notifications.ts` / LiveNotifyBanner | **CONNECTED** |
| Live Follow / Membership Join on spectator | **CONNECTED** |
| Live host Join capsule (`isBroadcast`) | **RETAINED WITH REASON** at `08915cb` (intentionally hidden on own live in that commit) — say CONNECT if you want it back |

### Frontend ↔ backend APIs
| Item | Status |
|---|---|
| FE `/api/...` strings vs BE mounts | **CONNECTED** (199 refs; unmatched are `${}` scanner noise) |
| `GET /api/admin/moderation/logs` | **NEEDS CONNECT** (BE exists, no FE call) — connecting needs an admin UI surface; **waiting for your OK** (would touch admin Reports layout) |
| `GET /api/creator/earnings` | **RETAINED WITH REASON** — payout UI uses `/api/creator/balance` |
| `GET /api/engagement/flags` | **RETAINED WITH REASON** — also returned via hub; server uses flags |
| `GET /api/music/collections` | **RETAINED WITH REASON** — SoundPicker uses global/playlists/search |
| `GET /api/music/status` | **RETAINED WITH REASON** — ops/health style |
| `GET /api/progression/starter-history` | **RETAINED WITH REASON** — history API; hub/progress covers UX |
| `GET /api/progression/xp-history` | **RETAINED WITH REASON** — same |
| `GET /api/progression/users/:userId/status` | **RETAINED WITH REASON** — status helper |
| `GET /api/rising-stars/rewards` | **RETAINED WITH REASON** — catalog; admin grants elsewhere |
| `POST /api/admin/chargeback` | **CANDIDATE** — ops API, no admin button; **wait for KEEP/REMOVE/CONNECT** |
| `POST /api/admin/unfreeze/:userId` | **CANDIDATE** — ops API, no admin button; **wait for KEEP/REMOVE/CONNECT** |
| `POST /api/auth/guest` | **RETAINED WITH REASON** — intentionally disabled in production |

### WebSocket
| Item | Status |
|---|---|
| Client emits vs server handlers | **CONNECTED** (no missing server handlers) |
| `battle_gift_score` | **RETAINED WITH REASON** — deprecated insecure; scoring via `gift_sent` |

### Orphan components (zero imports)
| Item | Status |
|---|---|
| `ForYouStoriesStrip.tsx` | **CANDIDATE REMOVE** — stub returns `null`, not mounted (For You video-only at this restore) |
| `GoldProfileFrame.tsx` | **CANDIDATE REMOVE** — replaced by `AvatarRing` usage |
| `LiveAIFilters.tsx` | **CANDIDATE REMOVE** — LiveStream has its own filter UI |

### Known NOT IMPLEMENTED (product, not orphans)
| Item | Status |
|---|---|
| Auth 2FA | **NOT VERIFIABLE** as required |
| Ban appeals | **NOT VERIFIABLE** as required |
| APNS | **NOT IMPLEMENTED** |
| Dedicated `/api/search` | **NOT IMPLEMENTED** (SearchPage uses other endpoints) |

---

## End-to-end chains (spot check)

| Feature | Chain |
|---|---|
| Gifts (real) | UI → WS/REST → wallet debit → DB → animation **CONNECTED** |
| Test coins | Local only → WS `test_coins` → battle points, no money **CONNECTED** (at `08915cb` era; later REST reject commits were rolled back with full restore) |
| Upload video | UI → validate → Bunny → `/api/videos` **CONNECTED** |
| Shop | UI → Stripe checkout session → webhook **CONNECTED** |
| IAP coins | UI → native purchases → `/api/verify-purchase` **CONNECTED** (Apple path PARTIAL historically) |
| Live For You | Card → token → LiveKit → reveal frames **CONNECTED** (`08915cb` fix) |
| Push | FCM register → device token API **CONNECTED**; APNS no |

---

## What I will NOT do until you reply

- No UI/layout edits  
- No icon inventing  
- No deleting orphans or ops APIs  
- No wiring admin moderation logs (needs UI permission)

## Suggested reply format

```
KEEP: chargeback, unfreeze, guest, earnings, flags, music/*, progression/*, rising-stars/rewards, battle_gift_score
REMOVE: ForYouStoriesStrip, GoldProfileFrame, LiveAIFilters
CONNECT: admin moderation logs (OK to add section on Admin Reports)
CONNECT: host Join membership on own live
```

Or edit that list as you want.
