# Live rebuild report

**Status:** `IN PROGRESS` — not COMPLETE  
**Repo:** `C:\Users\Absm Construction\Desktop\Elix Star Live` only  

## Done (owners exist + wired)

| Owner | Path |
| --- | --- |
| Host LiveKit session | `src/features/live/host/session/useHostLiveSession.ts` |
| Spectator LiveKit session | `src/features/live/spectator/session/useSpectatorLiveSession.ts` |
| Battle WS out | `src/features/live/battle/liveBattleActions.ts` |
| Battle score helpers | `src/features/live/battle/liveBattleScore.ts` |
| Battle invite handshake | `src/features/live/battle/liveBattleInviteHandshake.ts` |
| Cohost WS out | `src/features/live/cohost/liveCohostActions.ts` |
| Chat / heart WS out | `src/features/live/chat/liveChatActions.ts` |
| Gift goal + test gift_sent WS | `src/features/live/gifts/liveGiftWsActions.ts` |
| Paid gifts | `src/features/live/gifts/sendLiveGift.ts` → `giftSend` |
| Room stream/booster/mist WS | `src/features/live/room/liveRoomActions.ts` |
| Room / battle / cohost / invite / moderation binds | `src/features/live/ws/bindLive*.ts` |
| Inline preview binds | `InlineLiveViewer` → bind helpers |
| Wallet balance in live | `apiFetchWallet` |
| Room construction | `src/lib/liveKitSession.ts` only |

## Grep proof

- `websocket.send(` under `src/features/live/**` → **0**
- `new Room(` under `src/**` → **1** (`liveKitSession.ts`)
- `request(` under `src/features/live/host/useLiveHostController.tsx` → **0**
- `request(` under `src/features/live/spectator/useLiveSpectatorController.tsx` → **0**

## Blocks COMPLETE

- `useLiveHostController.tsx` / `useLiveSpectatorController.tsx` still hold giant UI orchestration. API/WS ownership cleanup is done, but full file-level breakup/deletion is still pending.
- Device / real LiveKit session: **NOT RUN**

