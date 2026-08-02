# Wallet / shop connection map

**Status:** IN PROGRESS — wallet store wired; IAP + shop checkout unchanged  
**UI:** BuyCoinsModal, PurchaseCoins, Shop, live gift wallet — frozen  

## Owners

| Concern | Owner | Status |
| --- | --- | --- |
| Paid/starter/promo balances (REST) | `src/features/wallet/walletApi.ts` → `useWalletStore` | **CONNECTED** |
| Mobile coin purchases (IAP only) | `src/lib/iap.ts` | **CONNECTED** (unchanged) |
| Test coins (local UI/gift testing) | `src/lib/testCoins.ts` | **CONNECTED** — never merged with wallet store |
| Shop physical goods checkout (Stripe) | `src/pages/Shop.tsx` → `POST /api/shop/checkout` | **CONNECTED** (inline; Stripe URL redirect) |
| IAP verify + credit | `iap.ts` → `POST /api/verify-purchase` | **CONNECTED** |
| Membership IAP | `iap.ts` → `/api/membership/*` | **CONNECTED** |
| Promote IAP | `iap.ts` → native purchase + server complete elsewhere | **CONNECTED** |

## REST

| Endpoint | Method | Owner |
| --- | --- | --- |
| `/api/wallet/` | GET | `walletApi.apiFetchWallet` |
| `/api/verify-purchase` | POST | `iap.ts` (not walletApi) |
| `/api/shop/checkout` | POST | `Shop.tsx` (Stripe — shop only) |

## Separation rules (enforced)

- IAP ≠ Stripe — coin buttons use platform billing only
- Test coins ≠ real wallet — local state only
- Shop checkout opens external Stripe URL — not used for in-app coins

## Remaining gaps

- No `shopApi.ts` — Shop checkout stays inline in `Shop.tsx` (clear Stripe path already)
- Coin package listing may still hit REST outside walletApi (catalog pages)
- Live gift spend uses wallet store + WS; not moved to walletApi

## Out of scope

- Server payment verification routes  
- Stripe webhook / shop inventory backend  
