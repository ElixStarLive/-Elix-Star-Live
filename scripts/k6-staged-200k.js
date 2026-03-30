/**
 * k6: staged ramp to 200,000 VUs.
 *
 * 200k VUs requires distributed load generation — one machine handles ~8-10k.
 * You need ~20-25 load generator machines (or use Grafana Cloud k6).
 *
 * Option A: Grafana Cloud k6 (easiest for 200k)
 *   k6 cloud ./scripts/k6-staged-200k.js
 *
 * Option B: Distributed k6 on multiple machines
 *   Run this same script on 20+ machines, each with --env MAX_VUS=10000
 *   to cap per-machine load. Combined = 200k.
 *
 * Run (single machine, will cap at machine limits):
 *   k6 run --env BASE_URL=https://www.elixstarlive.co.uk \
 *     --env BYPASS_KEY='PASTE_LOADTEST_BYPASS_SECRET' \
 *     ./scripts/k6-staged-200k.js
 *
 * Per-machine distributed run (20 machines x 10k = 200k):
 *   k6 run --env BASE_URL=https://www.elixstarlive.co.uk \
 *     --env BYPASS_KEY='SECRET' \
 *     --env MAX_VUS=10000 \
 *     ./scripts/k6-staged-200k.js
 */
import http from "k6/http";
import { check, sleep } from "k6";

const BASE = __ENV.BASE_URL || "https://www.elixstarlive.co.uk";
const BYPASS = __ENV.BYPASS_KEY || "";
const MAX_VUS = parseInt(__ENV.MAX_VUS || "200000", 10);

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
  sleep(Math.random() * 0.5 + 0.1);
}

function scale(target) {
  return Math.min(target, MAX_VUS);
}

export const options = {
  scenarios: {
    staged_load: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "1m",  target: scale(1000) },
        { duration: "1m",  target: scale(1000) },
        { duration: "2m",  target: scale(5000) },
        { duration: "1m",  target: scale(5000) },
        { duration: "2m",  target: scale(10000) },
        { duration: "1m",  target: scale(10000) },
        { duration: "3m",  target: scale(25000) },
        { duration: "1m",  target: scale(25000) },
        { duration: "3m",  target: scale(50000) },
        { duration: "2m",  target: scale(50000) },
        { duration: "3m",  target: scale(100000) },
        { duration: "2m",  target: scale(100000) },
        { duration: "4m",  target: scale(150000) },
        { duration: "2m",  target: scale(150000) },
        { duration: "4m",  target: scale(200000) },
        { duration: "3m",  target: scale(200000) },
        { duration: "2m",  target: 0 },
      ],
      gracefulRampDown: "30s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.05"],
    http_req_duration: ["p(95)<8000"],
  },
};
