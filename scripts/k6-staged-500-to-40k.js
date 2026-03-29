/**
 * k6: staged ramp 500 → 40,000 VUs (edit `stages` below to shorten/lengthen).
 *
 * Requires the same secret as server LOADTEST_BYPASS_SECRET on every request,
 * or you will hit 429 (200 req/min per IP) almost immediately.
 *
 * Run on a machine with enough RAM/CPU for high VUs (often a separate box from the app).
 *
 * Linux/macOS (bash): end each line with ONE backslash, NOT PowerShell backticks (`).
 * Do not paste markdown or prose into the shell — only the command lines.
 *
 * Clone from GitHub (hyphen folder name breaks "git clone ... -Elix-Star-Live" — git sees -E as a flag).
 * Use double-dash, or clone into a safe directory name:
 *   git clone https://github.com/ElixStarLive/-Elix-Star-Live.git -- -Elix-Star-Live
 *   git clone https://github.com/ElixStarLive/-Elix-Star-Live.git elix-star-live
 * Bash "cd" into hyphen folder from HOME only:
 *   cd ./-Elix-Star-Live
 * If your shell prompt already ends with ~/-Elix-Star-Live, you are INSIDE the repo —
 * do NOT run "cd ./-Elix-Star-Live" again (that looks for a nested folder that does not exist).
 * Check: pwd && ls scripts/k6-staged-500-to-40k.js — if missing, run: git pull origin main
 *
 * From repo root (where package.json and scripts/ live), native k6:
 *
 *   k6 run --env BASE_URL=https://www.elixstarlive.co.uk \
 *     --env BYPASS_KEY='PASTE_LOADTEST_BYPASS_SECRET' \
 *     --env FAST=1 \
 *     ./scripts/k6-staged-500-to-40k.js
 *
 * One line:
 *
 *   cd ./-Elix-Star-Live && k6 run --env BASE_URL=https://www.elixstarlive.co.uk --env BYPASS_KEY='SECRET' --env FAST=1 ./scripts/k6-staged-500-to-40k.js
 *
 * Docker (mount repo root; script path inside container is /work/scripts/...).
 * If you see "permission denied", add --user root:
 *
 *   cd ./-Elix-Star-Live && docker run --rm -i --user root \
 *     -v "$(pwd):/work" -w /work grafana/k6 run \
 *     --env BASE_URL=https://www.elixstarlive.co.uk \
 *     --env BYPASS_KEY='SECRET' \
 *     --env FAST=1 \
 *     /work/scripts/k6-staged-500-to-40k.js
 *
 * Windows PowerShell uses backtick ` for line continuation — do not use that on Linux.
 *
 * Optional:
 *   --env COMPACT=1   → fewer stages (500 → 5k → 15k → 40k), ~15 min total
 *   --env FAST=1      → aggressive ramp + short holds, ~5–6 min to 40k (stress / CI)
 *
 * For ~40k total VUs, one machine often tops out ~10k — use four runners:
 *   docs/K6_40K_DISTRIBUTED.md  and  scripts/k6-steady-10k.js
 *
 * If k6 dies with "Killed" around 10k+ VUs on a 16GB load box, that is usually OOM — cap load with
 *   scripts/k6-steady-10k.js  and  --env VUS=8000  (tune down until stable), or add runners.
 */
import http from "k6/http";
import { check, sleep } from "k6";

const BASE = __ENV.BASE_URL || "https://www.elixstarlive.co.uk";
const BYPASS = __ENV.BYPASS_KEY || "";
const COMPACT = __ENV.COMPACT === "1";
const FAST = __ENV.FAST === "1";

const params = {
  headers: {
    ...(BYPASS ? { "x-loadtest-key": BYPASS } : {}),
  },
  timeout: __ENV.HTTP_TIMEOUT || "30s",
};

const endpoints = [
  { path: "/api/feed/foryou", weight: 40 },
  { path: "/api/health", weight: 20 },
  { path: "/api/live/streams", weight: 15 },
  { path: "/api/gifts/catalog", weight: 10 },
  { path: "/api/profiles", weight: 10 },
  { path: "/api/coin-packages", weight: 5 },
];

function pickPath() {
  const r = Math.random() * 100;
  let acc = 0;
  for (const e of endpoints) {
    acc += e.weight;
    if (r <= acc) return e.path;
  }
  return endpoints[0].path;
}

export default function () {
  const path = pickPath();
  const res = http.get(`${BASE.replace(/\/$/, "")}${path}`, params);
  check(res, {
    "status is 200": (r) => r.status === 200,
  });
  sleep(Math.random() * 0.35 + 0.08);
}

/** Full ladder: ~45–60+ min depending on k6. */
const stagesFull = [
  { duration: "1m", target: 500 },
  { duration: "90s", target: 500 },
  { duration: "2m", target: 2000 },
  { duration: "90s", target: 2000 },
  { duration: "2m", target: 5000 },
  { duration: "90s", target: 5000 },
  { duration: "3m", target: 10000 },
  { duration: "90s", target: 10000 },
  { duration: "3m", target: 15000 },
  { duration: "90s", target: 15000 },
  { duration: "3m", target: 20000 },
  { duration: "90s", target: 20000 },
  { duration: "3m", target: 25000 },
  { duration: "90s", target: 25000 },
  { duration: "3m", target: 30000 },
  { duration: "90s", target: 30000 },
  { duration: "3m", target: 35000 },
  { duration: "90s", target: 35000 },
  { duration: "4m", target: 40000 },
  { duration: "2m", target: 40000 },
];

/** Shorter run for smoke / smaller generators. */
const stagesCompact = [
  { duration: "1m", target: 500 },
  { duration: "60s", target: 500 },
  { duration: "2m", target: 5000 },
  { duration: "90s", target: 5000 },
  { duration: "3m", target: 15000 },
  { duration: "90s", target: 15000 },
  { duration: "4m", target: 40000 },
  { duration: "2m", target: 40000 },
];

/** Fast ramp — short holds; total ~5–6 min to 40k + graceful stop. */
const stagesFast = [
  { duration: "20s", target: 500 },
  { duration: "15s", target: 500 },
  { duration: "30s", target: 5000 },
  { duration: "30s", target: 5000 },
  { duration: "45s", target: 15000 },
  { duration: "30s", target: 15000 },
  { duration: "60s", target: 40000 },
  { duration: "45s", target: 40000 },
];

function pickStages() {
  if (FAST) return stagesFast;
  if (COMPACT) return stagesCompact;
  return stagesFull;
}

export const options = {
  scenarios: {
    staged_load: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: pickStages(),
      gracefulRampDown: "30s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.02"],
    http_req_duration: ["p(95)<5000"],
  },
};
