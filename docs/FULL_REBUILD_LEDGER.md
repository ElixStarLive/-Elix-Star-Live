# Full app rebuild ledger (proper owners — no patches)

**Repository:** existing `Elix Star Live`  
**Rule:** fix at owning layer; same UI/routes/APIs; no fake success; no client shims  
**Chrome pass (001–336):** closed separately — this ledger is systems

## Status: FULL COMPLETE

| Priority | System | Status |
| --- | --- | --- |
| P0 | Gift send single owner | PASS |
| P0 | LiveKitSession + room socket | PASS |
| P0 | IAP credit honesty | PASS |
| P0 | Live end honesty | PASS |
| P1 | Auth edges | PASS |
| P1 | apiClient dual transport | PASS |
| P1 | Wallet owner + live UI sync | PASS |
| P2 | Video store honesty | PASS |
| P2 | Chat DM owner + realtime | PASS — `chatMessages.ts`; server emits `dm_message` / `dm_thread_updated` via `sendToUserGlobal`; ChatThread + Inbox subscribe; Share/Profile use `sendDmToUser`; 30s poll fallback only |
| P3 | Upload bake + Bunny | PASS |
| P3 | Gift catalog load | PASS |
| P3 | Shop Stripe return | PASS — session verify endpoint + client `paid` check |
| P3 | Guest fake wallet | PASS |
| P3 | Share/DM honesty | PASS |
| P3 | Live wallet load failure | PASS — toast when wallet fetch fails (non-test) |

---

Definition of done for this ledger: every required system row is PASS; no PARTIAL; no known fake-success money/auth/live/chat paths.

Typecheck: run `npx tsc --noEmit` after each landing.
