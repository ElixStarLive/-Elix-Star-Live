# Deploy — quick steps

## Coolify (recommended)

1. **Push your code** to GitHub (branch `main` or your deploy branch).
2. In Coolify → your app → **Build**:
   - **Build pack:** **Dockerfile** (not Nixpacks).
   - **Dockerfile path:** `Dockerfile` (repo root).
   - **Base directory:** repo root (empty or `.`).
3. **Network:** set port **8080**.
4. **Environment:** set variables from `.env.example` (see [DEPLOY.md](DEPLOY.md) for the full list). At minimum:
   - `PORT=8080`
   - `VITE_API_URL` = your app URL (e.g. `https://www.anberlive.co.uk`)
   - `VITE_WS_URL` = same URL with `wss://` (e.g. `wss://www.anberlive.co.uk`)
   - `VITE_LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`
   - `JWT_SECRET`, `BUNNY_*`, `VITE_BUNNY_CDN_HOSTNAME`
   - `NODE_ENV=production`
5. **Redeploy.**

Details: [COOLIFY.md](COOLIFY.md), [DEPLOY.md](DEPLOY.md).

---

## Docker (manual)

If Docker is installed:

```bash
docker build -t elix-star-live:latest .
docker run -p 8080:8080 --env-file .env elix-star-live:latest
```

Set env vars in `.env` or pass them with `-e`. The app listens on **8080**.

---

## Local production check

```bash
npm install
npm run build
npx tsx server/index.ts
```

Then open `http://localhost:8080`. Ensure `PORT=8080` and any `VITE_*` / `LIVEKIT_*` / `BUNNY_*` are set (e.g. in `.env` or environment).
