# Live connection map (authoritative — rebuild in progress)

**Repo:** `C:\Users\Absm Construction\Desktop\Elix Star Live` only  
**Status:** `LIVE DELETE-AND-REBUILD — IN PROGRESS`  
**Method:** inspect → preserve UI/contracts → delete Live logic → build clean → wire UI → purge → verify → STOP  
**Out of scope:** `VideoCall` / `call_*` rooms  

---

## 1. Routes

| Path | Entry | Role |
| --- | --- | --- |
| `/live` | `LiveDiscover.tsx` | Lobby |
| `/live/broadcast` | `LiveStream.tsx` → host UI | Host go-live |
| `/live/:streamId` | `LiveStreamGuard` | Own id → host; else → `/watch` unless `?battle=1` |
| `/watch/:streamId` | `SpectatorPage.tsx` → spectator UI | Watch / cohost |
| For You live | `VideoFeed` + `InlineLiveViewer` | Preview → `/watch/:key` |

## 2. Owners after rebuild (only these)

| Concern | Owner |
| --- | --- |
| `new Room()` | `src/lib/liveKitSession.ts` only |
| Room connect/end | `src/lib/live/liveRoomLifecycle.ts` |
| REST live | `src/lib/live/liveApi.ts` |
| WS transport | `src/lib/websocket.ts` |
| WS bind (battle/room/cohost) | `src/features/live/ws/bindLive*.ts` |
| Paid gifts | `src/lib/giftSend.ts` + `src/features/live/gifts/sendLiveGift.ts` |
| Wallet | `src/store/useWalletStore.ts` |
| Test coins | `src/lib/testCoins.ts` (local only) |
| Host orchestration | `src/features/live/host/*` (new) |
| Spectator orchestration | `src/features/live/spectator/*` (new) |
| Inline preview | `src/features/live/inline/*` (new) |

## 3. REST (preserve)

- `POST /api/live/start` · `POST /api/live/end` · `GET /api/live/token` · `GET /api/live/streams`
- `POST /api/live/moderation/check` · `POST /api/live-share`
- `GET /api/gifts/catalog` · `POST /api/gifts/send` (via giftSend only)
- `GET /api/wallet/` · progression / engagement / membership / rankings / follow / report as today

## 4. WebSocket (preserve)

Connect: `{getWsUrl()}/live/{roomId}?token=...` via `websocket.connect`

**Out:** `ping`, `stream_start`, `stream_end`, `chat_message`, `heart_sent`, `gift_sent` (test coins only), gift goals, battle_*, cohost_*, booster/mist, engagement_*  

**In:** `connected`, `room_state`, `user_joined`/`left`, `viewer_count`, `stream_ended`, `chat_message`, `heart_sent`, `gift_sent`, `gift_goal_sync`, `battle_state_sync`, `battle_tick`, `battle_score`, `battle_ended`, battle invite*, cohost_*, booster_*, mist_*, engagement_*  

Feed presence: `/live/__admin_feed__` path via `connectLiveFeedPresence` (existing).

## 5. LiveKit (preserve)

- Host: start → token/url → connect → publish camera/mic  
- Spectator: token publish=0 → subscribe  
- Cohost / battle joiner: publish=1 as today  
- Only one Room construction site: `liveKitSession.ts`

## 6. UI controls (preserve behaviour)

Camera, mic, flip, end live, gifts (paid + test), chat, hearts, cohost invite/accept, battle invite/start/vote, rankings/share/report panels — same actions, same look.

## 7. Delete targets (orchestration monoliths)

- `useLiveHostController.tsx` (relocated old host logic) — DELETE and replace
- `useLiveSpectatorController.tsx` (relocated old spectator logic) — DELETE and replace
- Any parallel Room / gift / WS paths outside owners above

UI shells (`LiveHostScreen.tsx`, `SpectatorLiveScreen.tsx`) keep JSX/styling; they consume the new controllers only.
