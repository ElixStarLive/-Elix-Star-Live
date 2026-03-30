# Elix Star Live — 2-Server Production Deployment

## Architecture

```
                    ┌─────────────────────┐
                    │   Hetzner Load       │
    Users ────────► │   Balancer (HTTPS)   │
                    │   Sticky Sessions    │
                    └────────┬────────────┘
                             │
                ┌────────────┴────────────┐
                │                         │
        ┌───────▼───────┐        ┌────────▼──────┐
        │  CX53 Server 1│        │ CX53 Server 2 │
        │               │        │               │
        │  App (8 wkrs) │        │  App (8 wkrs) │
        │  Valkey/Redis │◄───────│  (connects to │
        │  Job Worker   │        │   Server 1    │
        │               │        │   Valkey)     │
        └───────────────┘        └───────────────┘
                │                         │
                └────────────┬────────────┘
                             │
                     ┌───────▼───────┐
                     │  Neon Postgres │  (cloud)
                     │  Bunny CDN     │  (cloud)
                     │  LiveKit       │  (cloud)
                     └───────────────┘
```

Server 1 = App + Valkey + Background Jobs
Server 2 = App only (connects to Server 1 Valkey)
Load Balancer = distributes traffic, sticky sessions for WebSocket

---

## STEP 1 — Clean Coolify

1. Go to Coolify Cloud → Projects → delete old apps and databases
2. Keep both servers connected (CX53 Server 1 and CX53 Server 2)

---

## STEP 2 — Deploy Valkey on Server 1

1. Coolify → **+ New** → **Database** → **Redis** (or Valkey if listed)
2. Image: `valkey/valkey:8-alpine` (or default Redis image)
3. Server: **CX53 Server 1**
4. Name: `elix-valkey`
5. **Deploy** and wait until green
6. Go to the database settings → **make it accessible** from other servers:
   - Either enable **public port** (note: `SERVER_1_IP:PUBLIC_PORT`)
   - Or use the Coolify private network if both servers share one
7. Write down the connection URL:
   - If public port: `redis://SERVER_1_PUBLIC_IP:PORT`
   - If private network: `redis://elix-valkey:6379`

---

## STEP 3 — Deploy App on Server 1

1. Coolify → **+ New** → connect your **GitHub repo**
2. Server: **CX53 Server 1**
3. Name: `elix-app-1`

### Build Settings

| Setting          | Value          |
|------------------|----------------|
| Build Pack       | **Dockerfile** |
| Dockerfile Path  | `Dockerfile`   |
| Base Directory   | (empty)        |

### Network

| Setting | Value  |
|---------|--------|
| Port    | `8080` |

### Commands

| Setting          | Value              |
|------------------|--------------------|
| Release command  | `npm run migrate`  |
| Start command    | (leave default — Dockerfile CMD handles it) |

### Environment Variables

**IMPORTANT:** Mark every `VITE_*` variable as **"Available at build time"**

```env
# ── Runtime
NODE_ENV=production
PORT=8080
WEB_CONCURRENCY=8
ELIX_JOB_WORKER=1

# ── Database (Neon) — REQUIRED
DATABASE_URL=postgresql://YOUR_NEON_URL_HERE

# ── Auth — REQUIRED
JWT_SECRET=YOUR_64_CHAR_HEX_SECRET_HERE

# ── Valkey — REQUIRED
VALKEY_URL=redis://YOUR_VALKEY_URL_FROM_STEP_2

# ── Bunny Storage — REQUIRED
BUNNY_STORAGE_ZONE=your-storage-zone
BUNNY_STORAGE_API_KEY=your-storage-api-key
BUNNY_STORAGE_HOSTNAME=storage.bunnycdn.com
BUNNY_STORAGE_REGION=de

# ── Bunny Video — REQUIRED
BUNNY_LIBRARY_ID=your-library-id
BUNNY_LIBRARY_API_KEY=your-library-api-key
BUNNY_CDN_HOSTNAME=your-cdn.b-cdn.net

# ── LiveKit — REQUIRED
LIVEKIT_URL=wss://your-livekit.livekit.cloud
LIVEKIT_API_KEY=your-livekit-api-key
LIVEKIT_API_SECRET=your-livekit-api-secret

# ── Stripe (shop only) — REQUIRED
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx

# ── Frontend (MUST be build-time in Coolify)
VITE_API_URL=https://www.elixstarlive.co.uk
VITE_WS_URL=wss://www.elixstarlive.co.uk
VITE_LIVEKIT_URL=wss://your-livekit.livekit.cloud
VITE_BUNNY_CDN_HOSTNAME=your-cdn.b-cdn.net
VITE_BUNNY_STORAGE_ZONE=your-storage-zone
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_xxx
VITE_APP_NAME=Elix Star Live
VITE_CDN_URL=https://your-cdn.b-cdn.net
CLIENT_URL=https://www.elixstarlive.co.uk
```

4. **Deploy** and wait until healthy (green dot, logs show "Server running successfully")
5. Test: visit `http://SERVER_1_IP:8080/health` — should return JSON with `"status":"ok"`

---

## STEP 4 — Deploy App on Server 2

1. Coolify → **+ New** → connect **same GitHub repo**
2. Server: **CX53 Server 2**
3. Name: `elix-app-2`

### Build Settings — SAME as Server 1

| Setting          | Value          |
|------------------|----------------|
| Build Pack       | **Dockerfile** |
| Dockerfile Path  | `Dockerfile`   |
| Base Directory   | (empty)        |
| Port             | `8080`         |
| Release command  | `npm run migrate` |

### Environment Variables — SAME as Server 1 EXCEPT:

```env
ELIX_JOB_WORKER=0
```

Everything else is **identical** to Server 1. Same JWT_SECRET, same DATABASE_URL, same VALKEY_URL (pointing to Server 1 Valkey).

4. **Deploy** and wait until healthy
5. Test: visit `http://SERVER_2_IP:8080/health` — should return `"status":"ok"`

---

## STEP 5 — Create Hetzner Load Balancer

Go to **Hetzner Cloud Console** (https://console.hetzner.cloud)

1. **Load Balancers** → **Create Load Balancer**
2. **Location**: same region as your servers (e.g. Falkenstein, Nuremberg, Helsinki)
3. **Targets**: Add both CX53 Server 1 and CX53 Server 2
4. **Services**:

| Frontend      | Backend       | Notes                          |
|---------------|---------------|--------------------------------|
| HTTPS (443)   | HTTP (8080)   | Add your SSL certificate       |
| HTTP (80)     | HTTP (8080)   | Optional redirect to HTTPS     |

5. **Health Check**:

| Setting   | Value            |
|-----------|------------------|
| Protocol  | HTTP             |
| Port      | 8080             |
| Path      | `/health`        |
| Interval  | 10 seconds       |
| Timeout   | 5 seconds        |
| Retries   | 3                |

6. **Algorithm**: Round Robin
7. **Sticky Sessions**: **ENABLED** (cookie-based) — required for WebSocket
8. **Create**
9. Note the **Load Balancer IP** (shown in the dashboard after creation)

### SSL Certificate

In Hetzner Load Balancer → Certificates:
- Option A: **Let's Encrypt** — Hetzner can auto-provision if DNS points to the LB
- Option B: Upload your own cert

---

## STEP 6 — Update DNS

At your domain registrar, update the A record:

| Type | Name                    | Value                  |
|------|-------------------------|------------------------|
| A    | www.elixstarlive.co.uk  | LOAD_BALANCER_IP       |
| A    | elixstarlive.co.uk      | LOAD_BALANCER_IP       |

Wait for DNS propagation (usually 5-15 minutes, sometimes up to 1 hour).

---

## STEP 7 — Verify Everything

1. Visit `https://www.elixstarlive.co.uk` — app should load
2. Visit `https://www.elixstarlive.co.uk/health` — should return:
   ```json
   {
     "status": "ok",
     "services": {
       "database": true,
       "valkey": true,
       "livekit": true,
       "bunnyStorage": true
     }
   }
   ```
3. Check Coolify — both apps should show green
4. Check Hetzner LB — both targets should show healthy
5. Test login, test live streaming, test a gift

---

## Troubleshooting

### App crashes immediately
Check Coolify logs. Common causes:
- `FATAL: DATABASE_URL is required` → DATABASE_URL not set
- `FATAL: JWT_SECRET must be at least 32 characters` → JWT_SECRET missing/too short
- `FATAL: VALKEY_URL or REDIS_URL is required` → VALKEY_URL not set
- `MIGRATIONS_REQUIRED` → Release command `npm run migrate` didn't run

### App shows logo but then dies
- Valkey not reachable from the app container
- Check VALKEY_URL points to correct IP/port
- Check Valkey service is running and healthy in Coolify

### WebSocket disconnects frequently
- Sticky sessions not enabled on Hetzner LB
- Enable cookie-based sticky sessions

### Server 2 can't reach Valkey on Server 1
- Valkey needs a public port exposed, or both servers on same private network
- Test: SSH into Server 2 and run `redis-cli -h SERVER_1_IP -p PORT ping`

### 502 Bad Gateway
- App container not running or still starting
- Check port is 8080 in both Coolify and LB config

---

## Quick reference

| Component       | Location              | Access                     |
|-----------------|-----------------------|----------------------------|
| App (primary)   | CX53 Server 1        | :8080                      |
| App (secondary) | CX53 Server 2        | :8080                      |
| Valkey          | CX53 Server 1        | :6379 (internal or public) |
| Database        | Neon (cloud)          | via DATABASE_URL           |
| Load Balancer   | Hetzner LB            | :443 (public)              |
| Domain          | www.elixstarlive.co.uk| → Load Balancer IP         |
| Job Worker      | Server 1 only         | ELIX_JOB_WORKER=1          |
| Workers/server  | 8 each (16 total)     | WEB_CONCURRENCY=8          |
