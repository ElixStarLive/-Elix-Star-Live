import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Counter } from "k6/metrics";

const BASE = __ENV.BASE_URL || "https://www.elixstarlive.co.uk";

const feedOk = new Rate("ep_feed_ok");
const healthOk = new Rate("ep_health_ok");
const errReset = new Counter("err_conn_reset");
const errTimeout = new Counter("err_timeout");

const endpoints = [
  { path: "/api/health",        weight: 25, metric: healthOk },
  { path: "/api/feed/foryou",   weight: 30, metric: feedOk },
  { path: "/api/profiles",      weight: 15, metric: null },
  { path: "/api/live/streams",  weight: 15, metric: null },
  { path: "/api/gifts/catalog", weight: 10, metric: null },
  { path: "/api/coin-packages", weight: 5,  metric: null },
];

function pick() {
  const r = Math.random() * 100;
  let a = 0;
  for (const e of endpoints) { a += e.weight; if (r <= a) return e; }
  return endpoints[0];
}

export default function () {
  const ep = pick();
  const res = http.get(`${BASE.replace(/\/$/, "")}${ep.path}`, { timeout: "15s" });
  if (ep.metric) ep.metric.add(res.status === 200);
  if (res.error) {
    const e = String(res.error);
    if (e.includes("reset") || e.includes("refused")) errReset.add(1);
    if (e.includes("timeout")) errTimeout.add(1);
  }
  check(res, { "status 200": (r) => r.status === 200 });
  sleep(Math.random() * 0.3 + 0.1);
}

export const options = {
  scenarios: {
    quick: {
      executor: "ramping-vus",
      startVUs: 100,
      stages: [
        { duration: "15s", target: 1000 },
        { duration: "1m",  target: 1000 },
        { duration: "15s", target: 5000 },
        { duration: "1m",  target: 5000 },
        { duration: "15s", target: 10000 },
        { duration: "1m",  target: 10000 },
        { duration: "15s", target: 20000 },
        { duration: "1m",  target: 20000 },
        { duration: "30s", target: 0 },
      ],
      gracefulRampDown: "10s",
    },
  },
  thresholds: {
    http_req_failed: [{ threshold: "rate<0.05", abortOnFail: false }],
    http_req_duration: ["p(95)<10000"],
  },
};
