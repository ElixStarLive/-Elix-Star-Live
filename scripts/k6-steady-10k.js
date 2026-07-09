/**
 * Steady ~10k VUs — run on **four** separate machines in parallel for ~40k total.
 * Same BASE_URL / BYPASS_KEY as other k6 scripts. Set BYPASS_KEY to the same value as
 * API env LOADTEST_BYPASS_SECRET (Coolify / server env — not stored in git); see docs/LOAD_TEST_STAGING.md.
 *
 *   k6 run --env BASE_URL=https://www.elixstarlive.co.uk \
 *     --env BYPASS_KEY='YOUR_SECRET' \
 *     scripts/k6-steady-10k.js
 *
 * Optional: --env DURATION=10m (default 10m)
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
const DURATION = __ENV.DURATION || "10m";
const TARGET = Number(__ENV.VUS) || 10_000;
const TIMEOUT = __ENV.HTTP_TIMEOUT || "60s";

const params = {
  headers: {
    ...(BYPASS ? { "x-loadtest-key": BYPASS } : {}),
  },
  timeout: TIMEOUT,
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
  check(res, { "status 2xx": (r) => r.status >= 200 && r.status < 300 });
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

export const options = {
  scenarios: {
    steady: {
      executor: "constant-vus",
      vus: TARGET,
      duration: DURATION,
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.02"],
    http_req_duration: ["p(95)<5000"],
  },
};
