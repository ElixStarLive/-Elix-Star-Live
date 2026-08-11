#!/usr/bin/env node
/**
 * Headless runner for the runtime resource audit.
 * Executes instrumented vitest cycles and verifies evidence JSON was written.
 *
 * Usage: node scripts/runtime-resource-audit.mjs
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const evidenceRel = 'docs/evidence/runtime-resource-audit-2026-08-10.json';
const evidencePath = path.join(root, evidenceRel);
const testFile = 'src/lib/live/runtimeResourceAudit.test.ts';

console.log('[runtime-resource-audit] running', testFile);

const result = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['vitest', 'run', testFile],
  {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env },
  },
);

if (result.status !== 0) {
  console.error('[runtime-resource-audit] FAIL — vitest exited', result.status);
  process.exit(result.status ?? 1);
}

if (!fs.existsSync(evidencePath)) {
  console.error('[runtime-resource-audit] FAIL — missing evidence file', evidenceRel);
  process.exit(1);
}

const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
const metrics = Array.isArray(evidence.metrics) ? evidence.metrics : [];
const failed = metrics.filter((m) => !m.pass);

console.log('[runtime-resource-audit] evidence:', evidenceRel);
console.log('[runtime-resource-audit] cycles:', evidence.cycles);
console.log('[runtime-resource-audit] overallPass:', evidence.overallPass);
for (const m of metrics) {
  console.log(`  ${m.pass ? 'PASS' : 'FAIL'} ${m.id} before=${m.before} after=${m.after}`);
}

if (!evidence.overallPass || failed.length) {
  console.error('[runtime-resource-audit] FAIL — metrics not all green');
  process.exit(1);
}

console.log('[runtime-resource-audit] PASS');
process.exit(0);
