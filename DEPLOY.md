# Deploy Elix Star Live (Coolify + Hetzner + Bunny + LiveKit)

This app is wired for **Coolify** on a **Hetzner** server, with **Bunny** storage and **LiveKit** for streaming.

**Coolify users:** If the build fails with `npm ci` / "Missing: … from lock file", see **[COOLIFY.md](COOLIFY.md)** — switch the build pack to **Dockerfile** and redeploy.

## Stack

| Service    | Purpose |
|-----------|---------|
| **Coolify** | Deploy and run the app on your server |
| **Hetzner** | VPS / server hosting |
| **Bunny**  | Video, avatar, and media storage (Bunny CDN) |
| **LiveKit** | Live streaming (cloud or self-hosted) |

## 1. Repo and build

- **Repository:** [https://github.com/sanda26/Elix-Star-Live](https://github.com/sanda26/Elix-Star-Live)
- **Branch:** `main` or your deployment branch.
- **Build:** Coolify/Nixpacks will run `npm install` and `npm run build`. The server serves the built frontend from `dist/` and runs the Node server (Express + WebSocket).

## 2. Environment variables

Set these in Coolify (or your host) for the app service. Use `.env.example` as a checklist.

### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `PORT` | Server port (Coolify often sets this) | `8080` |
| `API_URL` | Public base URL of your app | `https://your-app.example.com` |
| `VITE_API_URL` | Same as API_URL (used by frontend) | `https://your-app.example.com` |
| `VITE_WS_URL` | WebSocket URL (wss) | `wss://your-app.example.com` |
| `LIVEKIT_URL` | LiveKit server URL | `https://your-livekit.example.com` or LiveKit Cloud URL |
| `LIVEKIT_API_KEY` | LiveKit API key | From LiveKit Cloud or self-hosted |
| `LIVEKIT_API_SECRET` | LiveKit API secret | From LiveKit Cloud or self-hosted |
| `BUNNY_STORAGE_ZONE` | Bunny storage zone name | `elix-star-live` |
| `BUNNY_STORAGE_API_KEY` | Bunny storage API key | From Bunny dashboard |
| `BUNNY_STORAGE_REGION` | Bunny region | `de`, `ny`, `la`, `sg`, etc. |
| `VITE_BUNNY_CDN_HOSTNAME` | Bunny CDN hostname (for public media URLs) | `your-zone.b-cdn.net` |
| `JWT_SECRET` | Secret for auth (use a strong random value) | Long random string |
| `NODE_ENV` | Set to `production` so the app runs in production mode (recommended even if Coolify only has “Developer” environment) | `production` |

### Optional

- **Stripe:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `VITE_STRIPE_PUBLISHABLE_KEY`
- **CORS:** `ALLOWED_ORIGINS` (comma-separated)
- **Database:** `DATABASE_URL` if you add Postgres later

The server exposes `/env.js` and injects `LIVEKIT_URL` as `VITE_LIVEKIT_URL` so the client can connect to LiveKit without hardcoding.

## 3. Coolify setup (high level)

1. **Server:** Add your Hetzner server in Coolify.
2. **Project:** Create a project and add a new application.
3. **Source:** Connect to GitHub → `sanda26/Elix-Star-Live`, select branch (e.g. `main` or `app-delivery`).
4. **Build:**
   - Prefer **Dockerfile**: in Coolify, set build type to **Dockerfile** and use the repo’s root `Dockerfile`. It uses `npm install` (not `npm ci`) so the build succeeds even when the lockfile is out of sync.
   - If you use **Nixpacks** instead, the repo’s `nixpacks.toml` overrides the install step to `npm install`. If you see "Missing: ... from lock file", run locally: `npm install`, commit the updated `package-lock.json`, push, and redeploy; or switch the build to **Dockerfile**.
5. **Run:** Start command can be `npm run start:prod` or `node server/index.js` after build (depending on how you build the server). If you use `npm run build` then the start command should serve from `dist/` and run the Node server (see `package.json` scripts).
6. **Env:** Paste or set all variables from the table above in Coolify’s environment for this service.
7. **Domain:** Point your domain (e.g. `your-app.example.com`) to this service in Coolify and enable HTTPS.

### Coolify only shows “Developer” (no Production option)

Some Coolify setups only offer a **Developer** or **Preview** environment, not a separate **Production** type. You can still run the app in **production mode**:

- In Coolify, open your application → **Environment Variables**.
- Add (or override): **`NODE_ENV`** = **`production`**.

The app uses `NODE_ENV` for caching, security, and logging. With `NODE_ENV=production` set in Coolify, the app behaves as production regardless of Coolify’s “developer” label. No code change is required.

## 4. Bunny (Bunny.net)

1. Create a **Storage Zone** in the desired region (e.g. Germany).
2. Create a **Pull Zone** (CDN) and attach the storage zone, or note the default hostname (e.g. `your-zone.b-cdn.net`).
3. In the app env set:
   - `BUNNY_STORAGE_ZONE` = storage zone name  
   - `BUNNY_STORAGE_API_KEY` = storage zone password/API key  
   - `BUNNY_STORAGE_REGION` = e.g. `de`  
   - `VITE_BUNNY_CDN_HOSTNAME` = pull zone hostname (e.g. `your-zone.b-cdn.net`)

Videos and avatars uploaded by the app will be stored in Bunny and served via this CDN.

## 5. LiveKit

1. Use [LiveKit Cloud](https://cloud.livekit.io) or self-host LiveKit.
2. Create a project and get:
   - **URL** → `LIVEKIT_URL`
   - **API Key** → `LIVEKIT_API_KEY`
   - **API Secret** → `LIVEKIT_API_SECRET`
3. (Optional) In LiveKit Cloud, set the webhook URL to `https://your-app.example.com/api/livekit/webhook` so your app gets room lifecycle events.

The app issues tokens for streamers and viewers and the frontend connects to `LIVEKIT_URL` (via `VITE_LIVEKIT_URL` from `/env.js`).

## 6. After deploy

- Open `https://your-app.example.com` and confirm the UI loads.
- Check `/health` (e.g. `https://your-app.example.com/health`).
- Test login/signup, then upload a video (Bunny) and start a live stream (LiveKit).
- If something fails, check Coolify logs and that all env vars (especially `VITE_*`, `LIVEKIT_*`, and `BUNNY_*`) are set correctly.

## 7. Local development

```bash
cp .env.example .env
# Edit .env: set VITE_API_URL=http://localhost:8080, VITE_WS_URL=ws://localhost:8080,
# LIVEKIT_*, BUNNY_* to your dev values.
npm install
npm run dev        # Frontend (Vite)
npm run dev:server # Backend (Express + WebSocket)
# Or: npm run dev:all (concurrently)
```

Use the same LiveKit and Bunny (or dev) credentials in `.env` so uploads and live streaming work locally.
