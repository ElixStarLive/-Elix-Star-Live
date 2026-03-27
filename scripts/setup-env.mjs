#!/usr/bin/env node
/* global console, process */
/**
 * Copy .env.example to .env if .env does not exist.
 * Run: npm run setup:env
 * In production (e.g. Coolify) env comes from the dashboard—no .env file is used.
 */

import { copyFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const envExample = join(root, '.env.example');
const envFile = join(root, '.env');

if (!existsSync(envExample)) {
  console.error('scripts/setup-env.mjs: .env.example not found');
  process.exit(1);
}

if (existsSync(envFile)) {
  console.log('.env already exists; leaving it unchanged.');
  process.exit(0);
}

copyFileSync(envExample, envFile);
console.log('Created .env from .env.example. Edit .env with your values (or use env from Coolify in production).');
