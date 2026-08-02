# Chat / calls connection map

**Status:** IN PROGRESS — DM REST owner wired for Inbox/ChatThread; calls unchanged  
**UI:** Inbox, ChatThread, VideoCall, IncomingCallModal — frozen  

## Owners

| Concern | Owner | Status |
| --- | --- | --- |
| DM REST (threads/messages/read/delete) | `src/features/chat/chatApi.ts` | **CONNECTED** |
| DM helpers (legacy import path) | `src/lib/chatMessages.ts` → re-exports chatApi | **CONNECTED** |
| Inbox thread list / delete | `Inbox.tsx` → chatApi | **CONNECTED** |
| ChatThread load/send/read | `ChatThread.tsx` → chatApi + chatMessages | **CONNECTED** |
| Open DM from profile/share | `lib/openDmThread.ts` → chatMessages | **CONNECTED** |
| Voice/video call signaling | `lib/callService.ts` (WebSocket) | **CONNECTED** (unchanged) |
| LiveKit media room | `VideoCall.tsx` + LiveKit token flow | **CONNECTED** (unchanged) |

## REST

| Endpoint | Method | Owner |
| --- | --- | --- |
| `/api/chat/threads` | GET | `apiListChatThreads` |
| `/api/chat/threads/ensure` | POST | `apiEnsureDmThread` |
| `/api/chat/threads/:id` | DELETE | `apiDeleteChatThread` |
| `/api/chat/threads/:id/messages` | GET / POST | `apiFetchThreadMessages` / `apiSendThreadMessage` |
| `/api/chat/threads/:id/read` | POST | `apiMarkThreadRead` |

## WebSocket (callService — not chatApi)

| Event | Direction | Purpose |
| --- | --- | --- |
| `call_invite` | out/in | Start incoming call UI |
| `call_accepted` | out/in | Callee accepted |
| `call_rejected` | out/in | Decline |
| `call_ended` | out/in | Hang up |
| `dm_message` | in | Realtime DM (ChatThread listener) |
| `dm_thread_updated` | in | Thread list refresh (if subscribed) |

## Remaining gaps

- `Shop.tsx` contact seller uses `api.chat.ensureThread` from apiClient helper
- Inbox notifications/activity/followers REST not in chatApi (inbox-specific, not DM)
- No chat store — state remains page-local + WS events

## Out of scope

- Server chat route changes  
- LiveKit server token routes (live feature)  
