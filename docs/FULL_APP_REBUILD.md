# Full app rebuild — same UI, same server

**Repo only:** `C:\Users\Absm Construction\Desktop\Elix Star Live`  
**Method (every feature):** map → preserve UI/contracts → delete logic → build clean → wire UI → purge → verify → next feature  

## Feature order

| # | Feature | Status |
| --- | --- | --- |
| 1 | Live (host/spectator/inline/lobby) | IN PROGRESS — owners/binds wired; host/spectator controllers converted off direct `request(...)`, but still large orchestration files |
| 2 | Auth / session | COMPLETE (client) — `src/features/auth/authSession.ts` |
| 3 | Feed / video / likes / comments | IN PROGRESS — `feedApi` wired across store/comments/discover/profile/saved/social lists; residual page-level calls remain |
| 4 | Chat DM + VideoCall | IN PROGRESS — `chatApi` wired; calls unchanged |
| 5 | Wallet / IAP coins + Shop Stripe | IN PROGRESS — `walletApi` + IAP/Stripe separation kept |
| 6 | Upload / Create | IN PROGRESS — upload create/FYP endpoints now owned by `src/features/upload/uploadApi.ts` |
| 7 | Profile / social / search | IN PROGRESS — profile/saved/chat-open + follow/search social list wiring done |
| 8 | Notifications / settings / admin / legal | COMPLETE (client owner pass) |

### Latest gates

- `tsc --noEmit`: PASS  
- vitest: 129 PASS  
- `npm run build`: PASS  
- device: NOT RUN  

## Rules

- No NEW app folder  
- No UI redesign  
- No invented server contracts  
- No fake COMPLETE / no fake device PASS  
- Test coins local-only; IAP ≠ Stripe  

## Current honest blockers

- Live monolith file-size cleanup remains (`useLiveHostController.tsx`, `useLiveSpectatorController.tsx`).
- Final owner pass still needed for remaining inline `request(...)` usage outside admin/settings/engagement/live-controller scopes.
- Real device/live verification still pending.
