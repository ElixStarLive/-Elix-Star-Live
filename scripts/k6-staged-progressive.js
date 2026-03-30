/**
 * k6: Progressive staged test — 2k → 5k → 10k → 15k → 20k
 *
 * Each stage ramps up, holds for observation, then ramps to next.
 * Total time: ~30 minutes.
 *
 * Run from k6 server:
 *   ulimit -n 250000
 *   sysctl -w net.ipv4.ip_local_port_range="1024 65535"
 *   sysctl -w fs.file-max=500000
 *   sysctl -w net.core.somaxconn=65535
 *
 *   k6 run scripts/k6-staged-progressive.js \
 *     --env BASE_URL=https://elixstarlive.co.uk \
 *     --insecure-skip-tls-verify \
 *     2>&1 | tee /tmp/k6-staged-$(date +%s).log
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";

const BASE = __ENV.BASE_URL || "https://www.elixstarlive.co.uk";

const params = {
  timeout: "30s",
  tags: {},
};

const healthOk = new Rate("health_ok");
const feedOk = new Rate("feed_ok");
const profilesOk = new Rate("profiles_ok");
const streamsOk = new Rate("streams_ok");
const giftsOk = new Rate("gifts_ok");
const coinsOk = new Rate("coins_ok");
const connReset = new Counter("err_conn_reset");
const connTimeout = new Counter("err_conn_timeout");

const endpoints = [
  { path: "/api/health",        weight: 20, metric: healthOk },
  { path: "/api/feed/foryou",   weight: 35, metric: feedOk },
  { path: "/api/profiles",      weight: 15, metric: profilesOk },
  { path: "/api/live/streams",  weight: 12, metric: streamsOk },
  { path: "/api/gifts/catalog", weight: 10, metric: giftsOk },
  { path: "/api/coin-packages", weight: 8,  metric: coinsOk },
];

function pickEndpoint() {
  const r = Math.random() * 100;
  let acc = 0;
  for (const e of endpoints) {
    acc += e.weight;
    if (r <= acc) return e;
  }
  return endpoints[0];
}

export default function () {
  const ep = pickEndpoint();
  const url = `${BASE.replace(/\/$/, "")}${ep.path}`;

  const res = http.get(url, params);

  const ok = res.status === 200;
  ep.metric.add(ok);

  if (res.error) {
    const err = String(res.error);
    if (err.includes("reset") || err.includes("refused")) {
      connReset.add(1);
    }
    if (err.includes("timeout") || err.includes("i/o timeout")) {
      connTimeout.add(1);
    }
  }

  check(res, { "status 200": (r) => r.status === 200 });

  sleep(Math.random() * 0.4 + 0.1);
}

export const options = {
  scenarios: {
    progressive: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        // Stage 1: Ramp to 2k, hold 2min
        { duration: "1m",   target: 2000 },
        { duration: "2m",   target: 2000 },

        // Stage 2: Ramp to 5k, hold 2min
        { duration: "1m30s", target: 5000 },
        { duration: "2m",    target: 5000 },

        // Stage 3: Ramp to 10k, hold 2min
        { duration: "2m",   target: 10000 },
        { duration: "2m",   target: 10000 },

        // Stage 4: Ramp to 15k, hold 2min
        { duration: "2m",   target: 15000 },
        { duration: "2m",   target: 15000 },

        // Stage 5: Ramp to 20k, hold 3min
        { duration: "2m",   target: 20000 },
        { duration: "3m",   target: 20000 },

        // Ramp down
        { duration: "1m",   target: 0 },
      ],
      gracefulRampDown: "30s",
    },
  },
  thresholds: {
    http_req_failed: [{ threshold: "rate<0.05", abortOnFail: false }],
    http_req_duration: ["p(95)<8000"],
  },
  summaryTrendStats: ["avg", "min", "med", "max", "p(90)", "p(95)", "p(99)"],
};
