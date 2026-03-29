# Coolify deployment

## Migrations (required — do not skip)

If workers crash-loop with `MIGRATIONS_REQUIRED: public.elix_schema_migrations is missing`, the database has not been migrated for this release.

**Configure Coolify so migrations run once per deploy before any container starts:**

| Setting | Value |
|--------|--------|
| **Release command** (or pre-deploy / deploy command) | `npm run migrate` |
| **Start command** | `npm run start:prod` |
| **Working directory** | `/app` (default for this Dockerfile) |

- **Release command** must have **`DATABASE_URL`** (and same Neon connectivity as runtime). It runs **once** per deployment, not on every replica restart.
- **Do not** scale/restart the app repeatedly until `npm run migrate` has succeeded at least once for that environment.
- **One-time manual fix** on the server/container shell: `cd /app && npm run migrate`, then redeploy or `npm run start:prod`.

The production image runs `npm run start:prod` (see `Dockerfile` `CMD`). Migrations are **not** in `CMD` so multiple replicas do not race on DDL.

---

**Use the Dockerfile build pack so the build succeeds.**

Coolify defaults to **Nixpacks**, which runs `npm ci` and can fail with “Missing: … from lock file”. This repo is set up to build with the root **Dockerfile** instead.

## Option A — Use Dockerfile (recommended)

1. Open your application → **Build** (or **Build Pack**).
2. Change the build pack from **Nixpacks** to **Dockerfile**.
3. Dockerfile path: `Dockerfile` or `./Dockerfile`.
4. Save and **Redeploy**.

## Option B — Keep Nixpacks but fix the build

If you cannot change the build pack, add this **build-time** environment variable in Coolify:

- **Name:** `NIXPACKS_INSTALL_CMD`
- **Value:** `npm install`
- **Available at Buildtime:** Yes

Then **Redeploy**. Nixpacks may use this instead of `npm ci`. If it still fails, use Option A.

## Base directory

Set **Base Directory** to the repo root (empty or `/` or `.`). If it points to a subfolder (e.g. `server`), the build will fail with "No inputs were found" because `src` won't be in the context.

## Port

The app listens on **8080**. In Coolify → your app → **Network**, set the port to **8080** if it is not already.

## Env

See **DEPLOY.md** for required environment variables (LiveKit, Bunny, JWT_SECRET, etc.).
