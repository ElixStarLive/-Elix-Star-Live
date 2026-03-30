/**
 * k6: staged ramp 0 → 1,000 → 5,000 → 10,000 → 20,000 VUs.
 *
 * Interprets "5 to 10" and "10 to 20" as **5k→10k** and **10k→20k** (thousands).
 * First block is **0 to 1000** VUs, then ramps to 5k, then 5k→10k, then 10k→20k.
 *
 * Same bypass as other k6 scripts: --env BYPASS_KEY must match server LOADTEST_BYPASS_SECRET.
 * See docs/LOAD_TEST_STAGING.md and scripts/k6-staged-500-to-40k.js header for run examples.
 *
 * Optional:
 *   --env FAST=1  → shorter ramps/holds (smoke / smaller generators)
 */
import http from "k6/http";
import { check, sleep } from "k6";

const BASE = __ENV.BASE_URL || "https://www.elixstarlive.co.uk";
const BYPASS = __ENV.BYPASS_KEY || "";
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

/** ~25–35 min typical. */
const stagesFull = [
  { duration: "2m", target: 1000 },
  { duration: "90s", target: 1000 },
  { duration: "3m", target: 5000 },
  { duration: "90s", target: 5000 },
  { duration: "3m", target: 10000 },
  { duration: "90s", target: 10000 },
  { duration: "3m", target: 20000 },
  { duration: "2m", target: 20000 },
];

/** Shorter ramps/holds. */
const stagesFast = [
  { duration: "45s", target: 1000 },
  { duration: "30s", target: 1000 },
  { duration: "60s", target: 5000 },
  { duration: "30s", target: 5000 },
  { duration: "60s", target: 10000 },
  { duration: "30s", target: 10000 },
  { duration: "90s", target: 20000 },
  { duration: "45s", target: 20000 },
];

function pickStages() {
  return FAST ? stagesFast : stagesFull;
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
