/**
 * k6: Staged 2k → 5k → 8k → 10k with holds
 * Each stage holds for 2 minutes for observation.
 * Total: ~14 minutes.
 *
 * Run:
 *   k6 run scripts/k6-staged-2k-to-10k.js \
 *     --env BASE_URL=https://elixstarlive.co.uk \
 *     --insecure-skip-tls-verify \
 *     2>&1 | tee /tmp/k6-staged-$(date +%s).log
 */
import http from "k6/http";
import { check, sleep } from "k6";

const BASE = __ENV.BASE_URL || "https://www.elixstarlive.co.uk";

const endpoints = [
  { path: "/api/health",        weight: 20 },
  { path: "/api/feed/foryou",   weight: 35 },
  { path: "/api/profiles",      weight: 15 },
  { path: "/api/live/streams",  weight: 12 },
  { path: "/api/gifts/catalog", weight: 10 },
  { path: "/api/coin-packages", weight: 8 },
];

function pick() {
  const r = Math.random() * 100;
  let a = 0;
  for (const e of endpoints) { a += e.weight; if (r <= a) return e.path; }
  return endpoints[0].path;
}

export default function () {
  const res = http.get(`${BASE.replace(/\/$/, "")}${pick()}`, { timeout: "30s" });
  check(res, { "status 200": (r) => r.status === 200 });
  sleep(Math.random() * 0.3 + 0.1);
}

export const options = {
  scenarios: {
    staged: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "1m",  target: 2000 },
        { duration: "2m",  target: 2000 },

        { duration: "1m",  target: 5000 },
        { duration: "2m",  target: 5000 },

        { duration: "1m",  target: 8000 },
        { duration: "2m",  target: 8000 },

        { duration: "1m",  target: 10000 },
        { duration: "2m",  target: 10000 },

        { duration: "1m",  target: 0 },
      ],
      gracefulRampDown: "30s",
    },
  },
  thresholds: {
    http_req_failed: [{ threshold: "rate<0.05", abortOnFail: false }],
    http_req_duration: ["p(95)<8000"],
  },
};
