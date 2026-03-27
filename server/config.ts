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
if (placeholdersRemoved > 0) {
  console.log(`[config] Removed ${placeholdersRemoved} Coolify placeholder env var(s)`);
}

if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath, override: false });
  console.log(`[config] Loaded .env (NODE_ENV=${process.env.NODE_ENV || nodeEnv})`);
}
if ((process.env.NODE_ENV || nodeEnv) === 'production' && fs.existsSync(envProdPath)) {
  dotenv.config({ path: envProdPath, override: true });
  console.log('[config] Loaded .env.production (overrides)');
}
if (!fs.existsSync(envPath) && !fs.existsSync(envProdPath)) {
  console.log('[config] No .env or .env.production found, using system env');
}
