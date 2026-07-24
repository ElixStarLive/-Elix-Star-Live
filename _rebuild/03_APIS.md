# 03 — HTTP API Surface

Sources: [`server/routes/index.ts`](../server/routes/index.ts), [`server/index.ts`](../server/index.ts), [`_audit/be_full_paths.txt`](../_audit/be_full_paths.txt) at commit `013c722`.

**Total: 212 HTTP endpoints across 23 mounted routers plus webhooks.**

## Mount order (must be preserved)

`server/index.ts` mounts in a specific order that is functionally significant:

1. **Raw-body webhooks first** — Stripe, LiveKit, Google Play, Apple IAP. These need the unparsed body for signature verification, so they must be registered before the JSON body parser.
2. `/api/upload/video` — separate multipart handling
3. `mountRoutes(app)` — all standard JSON routers
4. `/gifts` static → Bunny CDN redirect (`server/index.ts:451-457`)
5. `/health`, `/api/health`

Reordering these breaks webhook signature verification. This is a **contract**, not a style choice.

## Router mounts

| Prefix | Router module |
|--------|---------------|
| `/api/auth` | `auth.router.ts` |
| `/api/live` | `live.router.ts` |
| `/api/gifts` | `gifts.router.ts` |
| `/api/sounds` | `gifts.router.ts` (`soundsRouter`) |
| `/api/music` | `music.router.ts` |
| `/api/feed` | `feed.router.ts` |
| `/api/chat` | `chat.router.ts` |
| `/api/profiles` | `profiles.router.ts` |
| `/api/wallet` | `wallet.router.ts` |
| `/api/shop` | `shop.router.ts` |
| `/api/coin-packages` | `shop.router.ts` (`coinPackagesRouter`) |
| `/api/creator` | `payout.router.ts` (`creatorRouter`) |
| `/api/admin` | `payout.router.ts` (`adminPayoutRouter`) |
| `/api/admin` | `adminActions.ts` |
| `/api/admin/rising-stars` | `adminRisingStars.router.ts` |
| `/api/admin/progression` | `adminProgression.router.ts` |
| `/api/rising-stars` | `risingStars.router.ts` |
| `/api/progression` | `progression.router.ts` |
| `/api/engagement` | `engagement.router.ts` |
| `/api/videos` | `videos.router.ts` |
| `/api/stories` | `stories.router.ts` |
| `/api/media` | `media.router.ts` |
| `/api` (catch-all, last) | `misc.router.ts` |

`/api/admin` is mounted **twice** (payout + adminActions). Express merges these by trying each in order. Intentional but fragile — flagged for Phase 3 as `REVIEW`.

### Non-production only

`/api/test-coins/balance|mint|score` are mounted **only when `NODE_ENV !== "production"`** (`server/routes/index.ts:52-56`). The source comment explains why: shipped store builds keep test coins in localStorage, so a live mint endpoint would be an abuse surface. This guard is a security control and must be carried forward exactly.

## Endpoint groups (212 total)

| Group | Count | Examples |
|-------|-------|----------|
| Admin | 46 | `/api/admin/users`, `/api/admin/payout/:id/approve`, `/api/admin/progression/*` |
| Rising Stars | 27 | `/api/rising-stars/challenges/:id/leaderboard`, `/api/admin/rising-stars/*` |
| Videos | 20 | `/api/videos/:id/like`, `/api/videos/:id/comments`, `/api/videos/:id/download` |
| Engagement | 16 | `/api/engagement/hub`, `/api/engagement/treasure/:chestId/open` |
| Auth | 12 | `/api/auth/login`, `/api/auth/register`, `/api/auth/apple/native` |
| Profiles | 8 | `/api/profiles/:userId/follow`, `/api/profiles/by-username/:username` |
| Chat | 7 | `/api/chat/threads/:threadId/messages` |
| Music | 7 | `/api/music/global`, `/api/music/tracks/:trackId/preview` |
| Progression | 5 | `/api/progression/me`, `/api/progression/xp-history` |
| Live | 4 | `/api/live/token`, `/api/live/start`, `/api/live/end`, `/api/live/streams` |
| Wallet/economy | 6 | `/api/wallet`, `/api/gifts/send`, `/api/coin-packages` |
| Creator payout | 6 | `/api/creator/withdraw`, `/api/creator/balance` |
| Media/upload | 4 | `/api/media/upload-file`, `/api/stickers/upload` |
| Other | 44 | stories, hashtags, rankings, notifications, reports, blocks, membership, hearts, boosters |

Full method+path list: [`_audit/be_full_paths.txt`](../_audit/be_full_paths.txt).

## Client networking layer

| Module | Role |
|--------|------|
| [`src/lib/api.ts`](../src/lib/api.ts) | resolves base URL from `VITE_API_URL` / `window.__ENV` / production origin fallback `https://www.elixstarlive.co.uk` |
| [`src/lib/apiClient.ts`](../src/lib/apiClient.ts) | `request()` wrapper, typed `api.*` surface, uses `CapacitorHttp` on native to bypass WebView CORS |
| [`src/lib/authApiContract.ts`](../src/lib/authApiContract.ts) | explicit auth response normalization |

Base URL resolution order matters for Capacitor: `capacitor.config.ts` deliberately does **not** set `server.hostname`, with a source comment explaining that doing so makes Capacitor intercept the host and login `/api` calls never reach the real backend. Preserve this.

## FE calls with no static BE match (3)

From [`_audit/fe_api_unmatched.txt`](../_audit/fe_api_unmatched.txt). All three are template-literal false positives, not broken calls:

| FE pattern | Reality |
|------------|---------|
| `/api/admin/reports${queryParam}` | matches `GET /api/admin/reports` |
| `/api/engagement/creator-cards${q}` | matches `GET /api/engagement/creator-cards` |
| `/api/media/public/${storagePath}` | dynamic media passthrough |

No genuinely orphaned client calls. Verify `/api/media/public/*` handling explicitly during Phase 2.

## BE endpoints with no FE caller (12)

From [`_audit/be_possibly_unused.txt`](../_audit/be_possibly_unused.txt):

```
GET  /api/admin/moderation/logs
GET  /api/creator/earnings
GET  /api/engagement/flags
GET  /api/music/collections
GET  /api/music/status
GET  /api/progression/starter-history
GET  /api/progression/users/:userId/status
GET  /api/progression/xp-history
GET  /api/rising-stars/rewards
POST /api/admin/chargeback
POST /api/admin/unfreeze/:userId
POST /api/auth/guest
```

Prior audit classified these as **RETAINED WITH REASON** (operational/admin tooling reachable outside the app UI). They are not dead by default. Each needs an explicit owner KEEP/REMOVE in Phase 3 — do not silently drop them in a rebuild.

## Security properties observed

- Server-side validation on gift send (`server/routes/gifts.ts` header comment: "validate, debit, and deliver gift in-room")
- Webhook signature verification requires raw body (mount order dependency above)
- Test-coin routes environment-gated
- Production boot fails closed without payment/live/storage credentials — see [`06_NATIVE_ENV_SERVICES.md`](06_NATIVE_ENV_SERVICES.md)

These are the correct behaviours and are all `KEEP BEHAVIOUR`.
