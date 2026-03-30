/**
 * k6: Definitive staged proof test
 * Stages: 500 → 1k → 2k → 5k → 8k → 10k → 15k → 20k
 * Each stage ramps for 1 min then holds for 2 min.
 * Total: ~24 minutes.
 *
 * Tracks per-endpoint success rates and error categories.
 *
 * Pre-requisites on k6 server:
 *   ulimit -n 500000
 *   sysctl -w fs.file-max=1000000
 *   sysctl -w net.ipv4.ip_local_port_range="1024 65535"
 *   sysctl -w net.core.somaxconn=65535
 *   sysctl -w net.ipv4.tcp_tw_reuse=1
 *
 * Run:
 *   k6 run scripts/k6-proof-staged.js \
 *     --env BASE_URL=https://elixstarlive.co.uk \
 *     --insecure-skip-tls-verify \
 *     2>&1 | tee /tmp/k6-proof-$(date +%s).log
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";

const BASE = __ENV.BASE_URL || "https://www.elixstarlive.co.uk";

const healthOk = new Rate("ep_health_ok");
const feedOk = new Rate("ep_feed_ok");
const profilesOk = new Rate("ep_profiles_ok");
const streamsOk = new Rate("ep_streams_ok");
const giftsOk = new Rate("ep_gifts_ok");
const coinsOk = new Rate("ep_coins_ok");
const errReset = new Counter("err_conn_reset");
const errTimeout = new Counter("err_timeout");
const errDialTimeout = new Counter("err_dial_timeout");
const latencyFeed = new Trend("latency_feed", true);
const latencyHealth = new Trend("latency_health", true);

const endpoints = [
  { path: "/api/health",        weight: 20, metric: healthOk, lat: latencyHealth },
  { path: "/api/feed/foryou",   weight: 30, metric: feedOk,   lat: latencyFeed },
  { path: "/api/profiles",      weight: 15, metric: profilesOk, lat: null },
  { path: "/api/live/streams",  weight: 15, metric: streamsOk,  lat: null },
  { path: "/api/gifts/catalog", weight: 10, metric: giftsOk,   lat: null },
  { path: "/api/coin-packages", weight: 10, metric: coinsOk,   lat: null },
];

function pickEndpoint() {
  const r = Math.random() * 100;
  let acc = 0;
  for (const ep of endpoints) {
    acc += ep.weight;
    if (r <= acc) return ep;
  }
  return endpoints[0];
}

export default function () {
  const ep = pickEndpoint();
  const url = `${BASE.replace(/\/$/, "")}${ep.path}`;
  const res = http.get(url, { timeout: "30s" });

  const ok = res.status === 200;
  ep.metric.add(ok);
  if (ep.lat && res.timings.duration) {
    ep.lat.add(res.timings.duration);
  }

  if (res.error) {
    const e = String(res.error);
    if (e.includes("reset") || e.includes("refused")) errReset.add(1);
    if (e.includes("request timeout")) errTimeout.add(1);
    if (e.includes("i/o timeout") || e.includes("dial")) errDialTimeout.add(1);
  }

  check(res, { "status 200": (r) => r.status === 200 });
  sleep(Math.random() * 0.4 + 0.1);
}

export const options = {
  scenarios: {
    proof: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 500 },
        { duration: "2m",  target: 500 },

        { duration: "30s", target: 1000 },
        { duration: "2m",  target: 1000 },

        { duration: "30s", target: 2000 },
        { duration: "2m",  target: 2000 },

        { duration: "1m",  target: 5000 },
        { duration: "2m",  target: 5000 },

        { duration: "1m",  target: 8000 },
        { duration: "2m",  target: 8000 },

        { duration: "1m",  target: 10000 },
        { duration: "2m",  target: 10000 },

        { duration: "1m",  target: 15000 },
        { duration: "2m",  target: 15000 },

        { duration: "1m",  target: 20000 },
        { duration: "2m",  target: 20000 },

        { duration: "1m",  target: 0 },
      ],
      gracefulRampDown: "30s",
    },
  },
  thresholds: {
    http_req_failed: [{ threshold: "rate<0.05", abortOnFail: false }],
    http_req_duration: ["p(95)<10000"],
  },
  summaryTrendStats: ["avg", "min", "med", "max", "p(90)", "p(95)", "p(99)"],
};
