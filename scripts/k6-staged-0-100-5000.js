/**
 * k6: two-step ramp — **0 → 100** VUs, then **100 → 5,000** VUs.
 *
 * Optional: --env FAST=1 → shorter ramps/holds.
 *
 * BYPASS_KEY must match server LOADTEST_BYPASS_SECRET (see docs/LOAD_TEST_STAGING.md).
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Counter } from "k6/metrics";

const err429 = new Counter("err_rate_limited");
const err503 = new Counter("err_backpressure");
const err5xx = new Counter("err_server_5xx");
const errReset = new Counter("err_conn_reset");
const errTimeout = new Counter("err_timeout");

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
    "status 2xx": (r) => r.status >= 200 && r.status < 300,
  });
  if (res.status === 429) err429.add(1);
  else if (res.status === 503) err503.add(1);
  else if (res.status >= 500) err5xx.add(1);
  if (res.error) {
    const e = String(res.error);
    if (e.includes("reset") || e.includes("refused")) errReset.add(1);
    if (e.includes("timeout")) errTimeout.add(1);
  }
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
