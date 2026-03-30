/**
 * k6: two-step ramp — **0 → 100** VUs, then **100 → 5,000** VUs.
 *
 * Optional: --env FAST=1 → shorter ramps/holds.
 *
 * BYPASS_KEY must match server LOADTEST_BYPASS_SECRET (see docs/LOAD_TEST_STAGING.md).
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

/** Step 1: 0→100. Step 2: 100→5000. Then short hold at 5k. */
const stagesFull = [
  { duration: "2m", target: 100 },
  { duration: "1m", target: 100 },
  { duration: "4m", target: 5000 },
  { duration: "2m", target: 5000 },
];

const stagesFast = [
  { duration: "30s", target: 100 },
  { duration: "20s", target: 100 },
  { duration: "90s", target: 5000 },
  { duration: "45s", target: 5000 },
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
