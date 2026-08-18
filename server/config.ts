import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.join(__dirname, '..');
const envPath = path.join(rootDir, '.env');
const envProdPath = path.join(rootDir, '.env.production');
const nodeEnv = process.env.NODE_ENV || 'development';

// Coolify injects placeholder values like "Set JWT_SECRET in Coolify"
// for any env var the user hasn't configured. These break the app.
// Remove them so dotenv can fill in the real values from .env file.
let placeholdersRemoved = 0;
for (const [key, val] of Object.entries(process.env)) {
  if (typeof val === 'string' && val.startsWith('Set ') && val.toLowerCase().includes('coolify')) {
    delete process.env[key];
    placeholdersRemoved++;
  }
}
if (placeholdersRemoved > 0 && nodeEnv !== 'production') {
  console.log(`[config] Removed ${placeholdersRemoved} Coolify placeholder env var(s)`);
}

if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath, override: false });
  if (nodeEnv !== 'production') {
    console.log(`[config] Loaded .env (NODE_ENV=${process.env.NODE_ENV || nodeEnv})`);
  }
}

// Local PC cannot resolve Coolify-internal Valkey hostnames. Opt in with
// ELIX_LOCAL_NO_VALKEY=1 for single-instance auth/API testing against Neon.
//
// This flag must never rewrite NODE_ENV. It used to force 'development' when the
// environment said production, which in one variable skipped production env
// validation, skipped the Valkey boot gate, downgraded every shared rate limit to
// a per-process in-memory counter and opened the CORS allowlist to dev origins.
// A local run has to say it is local: set NODE_ENV=development explicitly.
if (process.env.ELIX_LOCAL_NO_VALKEY === '1' || process.env.ELIX_LOCAL_NO_VALKEY === 'true') {
  if ((process.env.NODE_ENV || nodeEnv) === 'production') {
    console.error(
      '[config] FATAL: ELIX_LOCAL_NO_VALKEY is a development-only flag and cannot be combined with ' +
        'NODE_ENV=production. Set NODE_ENV=development for local single-instance runs, or unset ' +
        'ELIX_LOCAL_NO_VALKEY so this deployment uses its shared Valkey.',
    );
    process.exit(1);
  }
  delete process.env.VALKEY_URL;
  delete process.env.REDIS_URL;
  console.log('[config] ELIX_LOCAL_NO_VALKEY=1 — Valkey disabled for local single-instance mode');
}
if ((process.env.NODE_ENV || nodeEnv) === 'production' && fs.existsSync(envProdPath)) {
  dotenv.config({ path: envProdPath, override: true });
  if (nodeEnv !== 'production') {
    console.log('[config] Loaded .env.production (overrides)');
  }
}
if (!fs.existsSync(envPath) && !fs.existsSync(envProdPath) && nodeEnv !== 'production') {
  console.log('[config] No .env or .env.production found, using system env');
}
