/**
 * Steady ~10k VUs — run on **four** separate machines in parallel for ~40k total.
 * Same BASE_URL / BYPASS_KEY as other k6 scripts.
 *
 *   k6 run --env BASE_URL=https://www.elixstarlive.co.uk \
 *     --env BYPASS_KEY='YOUR_SECRET' \
 *     scripts/k6-steady-10k.js
 *
 * Optional: --env DURATION=10m (default 10m)
 */
import http from "k6/http";
import { check, sleep } from "k6";

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
  check(res, { "status is 200": (r) => r.status === 200 });
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
