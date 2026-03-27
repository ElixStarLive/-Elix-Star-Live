# Production WebSocket (battle, chat, gifts)

The realtime client uses **`getWsUrl()`** in `src/lib/api.ts`, then connects to:

```text
${getWsUrl()}/live/${roomId}?token=${encodeURIComponent(token)}
```

If this URL is wrong or the proxy does not upgrade WebSockets, **PK scores, chat, and gifts** will not sync. LiveKit (`VITE_LIVEKIT_URL`) is **separate** — video only.

---

## 1. Set the WebSocket origin

| Mechanism | Example |
|-----------|---------|
| **Build-time** | `VITE_WS_URL=wss://www.elixstarlive.co.uk` (no path, no trailing slash) |
| **Runtime** | `window.__ENV.VITE_WS_URL` if you inject `env.js` / `index.html` (same value) |

**Rules:**

- Must be the **same host** (or explicit host) that **Traefik/Coolify routes to your Node** process that runs `server/index.ts`.
- Use **`wss://`** on HTTPS sites. `getWsUrl()` normalizes `http` → `ws` / `https` → `wss`.
- **Local dev:** hostname `localhost` / `127.0.0.1` uses **same-origin** `ws(s)://` + `window.location.host` — no `VITE_WS_URL` needed.

After changing `VITE_*`, **rebuild and redeploy** (Vite embeds at build time unless you only use runtime `__ENV`).

---

## 2. Coolify / Traefik (Hetzner)

### Container and TLS

- The Node process listens on **`PORT`** (default **8080** in `server/index.ts`). Inside the container, **8080** is correct.
- **Traefik** (managed by Coolify) terminates **TLS** on the public host (`https://www.elixstarlive.co.uk` → **`wss://`** to the client). You do **not** expose 8080 on the public internet; only **443** (and **80** if you redirect) need to be open on the Hetzner firewall toward Coolify.

### `/live/*` WebSockets

- The app WebSocket server is attached to the **same HTTP(S) server** as Express (`WebSocketServer({ server })`). Paths like **`/live/<roomId>?token=...`** are handled on that single listener.
- **Traefik** forwards the request to your container; for WebSocket it must pass through **`Connection: Upgrade`** and **`Upgrade: websocket`**. Coolify’s default HTTP router usually does this automatically for the same service that serves `/api/*` and static SPA — **no separate “WebSocket port”** is required.
- Ensure you do **not** add middleware that **strips `/live`** or **buffers** the entire body before upgrade (rare). If `/api/*` works but **`wss://…/live/…`** fails with **502** or no **101**, check Coolify **labels / reverse proxy** for that resource and confirm traffic hits the **same** application that runs `server/index.ts`.

### Deploy steps (summary)

1. **Build:** Dockerfile buildpack, base directory repo root (`COOLIFY.md`).
2. **Network:** Map public HTTPS → container port **8080**.
3. **Env:** Set `VITE_WS_URL`, `VITE_API_URL`, `JWT_SECRET`, `PORT=8080` if needed, LiveKit, DB, etc. (`DEPLOY.md` / Coolify env UI).
4. **Redeploy** after env changes that affect the **built** frontend (`VITE_*`).

---

## 3. JWT / token

- Query string: **`?token=...`** must match what `decodeUserIdFromToken` expects in `server/index.ts`.
- Invalid token → connection closed (e.g. **1008**). Check server logs.

---

## 4. Raw `wscat` test

Replace `YOUR_STREAM_ROOM_ID` with a real stream key (same as `websocket.connect(roomId, token)`). Replace `YOUR_JWT` with a valid session token.

```bash
npx wscat -c "wss://www.elixstarlive.co.uk/live/YOUR_STREAM_ROOM_ID?token=YOUR_JWT"
```

- **Stays open** → path, host, proxy, token OK.
- **Instant close / 1008** → token or server rejection.
- **404 / 502** → wrong host or `/live/` not routed to Node.

---

## 5. Not the battle room socket

| URL | Purpose |
|-----|---------|
| `wss://…/live/__feed__?token=…` | Feed / discover only (`VideoFeed`, `LiveDiscover`) |
| `wss://…/live/<streamRoomId>?token=…` | **This** is what PK / live / watch use |
| `wss://…livekit…/rtc/…` | LiveKit video — **not** app battle events |

---

## 6. PK score sync (server)

- Battles are keyed by **host `hostRoomId`** (see comment on `battles` in `server/index.ts`).
- `broadcastToRoom(hostRoom)` + `broadcastToBattleParticipants` also targets **`opponentRoomId`** for the same payload.

---

## 8. Battle score flow (sender → correct room → opponent / spectators)

### ASCII diagram

```text
Sender taps / gifts
        |
        v
Server receives event (gift_sent / battle:tap / battle_spectator_vote)
        |
        v
Resolve canonical battle session (host-keyed)
  session = resolveBattleSessionForRoom(client.roomId)
  // battle row is stored in: battles.get(session.hostRoomId)
        |
        v
Update the correct team buckets (server-authoritative)
  teamA = A1 + A2
  teamB = B1 + B2
        |
        v
Broadcast to BOTH streams
  broadcastToRoom(session.hostRoomId, "battle:score_update", payload)
  broadcastToRoom(session.opponentRoomId, "battle:score_update", payload)
  // plus global sends for any participant not already reached
        |
        v
Clients (host + opponent + spectators) receive the same payload
  UI updates both sides + spectators in real time
```

### Server pseudocode (canonical room ids)

```ts
function handleBattleAction(client, target, points) {
  // Never use `client.roomId` as the battles-map key.
  // Resolve via host-keyed session and update using `session.hostRoomId`.
  const session = resolveBattleSessionForRoom(client.roomId);
  if (!session || session.status !== "ACTIVE") return;

  // Apply score to server buckets:
  // - teamA = hostScore (A1) + player3Score (A2)
  // - teamB = opponentScore (B1) + player4Score (B2)
  applyPointsToSessionBuckets(session, target, points);

  const payload = buildBattleScoreUpdatePayload(session);
  broadcastToRoom(session.hostRoomId, "battle:score_update", payload);
  if (session.opponentRoomId) {
    broadcastToRoom(session.opponentRoomId, "battle:score_update", payload);
  }
}
```

### Critical rule to prevent misrouting

- Always resolve the battle session via `resolveBattleSessionForRoom(...)` and update using the canonical `session.hostRoomId` key.
- Broadcast `battle:score_update` to both `session.hostRoomId` and `session.opponentRoomId`.
- Never look up `battles.get(client.roomId)` when the socket might be on the opponent stream.

---

## 7. Debug logs

- Server **non-production** (`NODE_ENV !== production`) or `DEBUG_BATTLE_SCORE=1`: `UPDATE AFTER`, `EMITTING`, `ROOM SIZE` in server logs.
- **`CLIENT RECEIVED`** in the browser is **`import.meta.env.DEV` only** in the current instrumentation — for production, use **server logs** or add a temporary prod-safe log if needed.

---

## Quick checklist

| Step | Done |
|------|------|
| `VITE_WS_URL` or `__ENV.VITE_WS_URL` = correct `wss://` origin for Node | ☐ |
| Coolify port **8080**, HTTPS routes to app | ☐ |
| Browser Network → WS → `/live/<streamRoom>` → **101** and stays open | ☐ |
| `wscat` to same URL succeeds | ☐ |
| PK test: server logs show `UPDATE AFTER` / `EMITTING` with correct totals | ☐ |

---

## Related docs

- `COOLIFY.md` — Dockerfile buildpack, port 8080  
- `DEPLOY-COOLIFY-STEPS.txt` — Nixpacks vs Dockerfile  
