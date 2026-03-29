/**
 * k6: staged ramp 500 → 40,000 VUs (edit `stages` below to shorten/lengthen).
 *
 * Requires the same secret as server LOADTEST_BYPASS_SECRET on every request,
 * or you will hit 429 (200 req/min per IP) almost immediately.
 *
 * Run on a machine with enough RAM/CPU for high VUs (often a separate box from the app).
 *
 *   k6 run --env BASE_URL=https://www.elixstarlive.co.uk \
 *     --env BYPASS_KEY='YOUR_LOADTEST_BYPASS_SECRET' \
 *     scripts/k6-staged-500-to-40k.js
 *
 * Optional:
 *   --env COMPACT=1   → fewer stages (500 → 5k → 15k → 40k), shorter total time
 */
import http from "k6/http";
import { check, sleep } from "k6";

const BASE = __ENV.BASE_URL || "https://www.elixstarlive.co.uk";
const BYPASS = __ENV.BYPASS_KEY || "";
const COMPACT = __ENV.COMPACT === "1";

const params = {
  headers: {
    ...(BYPASS ? { "x-loadtest-key": BYPASS } : {}),
  },
  timeout: "30s",
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

export const options = {
  scenarios: {
    staged_load: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: COMPACT ? stagesCompact : stagesFull,
      gracefulRampDown: "30s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.02"],
    http_req_duration: ["p(95)<5000"],
  },
};
