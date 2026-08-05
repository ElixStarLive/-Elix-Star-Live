/**
 * Local API runner: .env often has Coolify Valkey + NODE_ENV=production.
 * Those hostnames do not resolve on a PC, so Vite /api proxy returns HTTP_500.
 * Force single-instance local mode (Neon OK, Valkey skipped).
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
process.env.NODE_ENV = 'development';
process.env.ELIX_LOCAL_NO_VALKEY = '1';

const child = spawn('npx', ['tsx', 'server/index.ts'], {
  cwd: root,
  stdio: 'inherit',
  shell: true,
  env: process.env,
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
