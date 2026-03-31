/**
 * k6: Bypass Hetzner Load Balancer — hit a single server directly.
 *
 * PURPOSE: Prove the Node.js app + Traefik can handle load independently
 * of the LB, isolating where the bottleneck is.
 *
 * USAGE (from the k6 load-generator machine):
 *
 *   k6 run --env SERVER_IP=<server-public-ip> \
 *     --env BYPASS_KEY='PASTE_LOADTEST_BYPASS_SECRET' \
 *     --insecure-skip-tls-verify \
 *     ./scripts/k6-bypass-lb.js
 *
 * The script uses HTTPS to the server IP on port 443, which hits Traefik
 * directly (TLS termination still happens in Traefik, same as production).
 * --insecure-skip-tls-verify is needed because the cert is for the domain,
 * not the IP.
 *
 * Set the Host header so Traefik routes to the correct app container.
 *
 * Stages: 100 → 500 → 1k → 2k → 5k → 8k → 10k (each with hold)
 * Total: ~12 minutes
 *
 * Optional:
 *   --env HOST=elixstarlive.co.uk   (override Host header)
 *   --env MAX_VU=5000               (cap at lower VU level)
 *   --env FAST=1                    (shorter holds, ~5 min)
 */
import http from "k6/http";
import { check, sleep } from "k6";

const SERVER_IP = __ENV.SERVER_IP || "";
if (!SERVER_IP) {
  throw new Error("SERVER_IP is required — set --env SERVER_IP=<ip>");
}

const BASE = `https://${SERVER_IP}`;
const HOST = __ENV.HOST || "elixstarlive.co.uk";
const BYPASS = __ENV.BYPASS_KEY || "";
const FAST = __ENV.FAST === "1";
const MAX_VU = __ENV.MAX_VU ? parseInt(__ENV.MAX_VU, 10) : 10000;

const params = {
  headers: {
    Host: HOST,
    ...(BYPASS ? { "x-loadtest-key": BYPASS } : {}),
  },
  timeout: "15s",
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
  const res = http.get(`${BASE}${path}`, params);
  check(res, {
    "status 2xx": (r) => r.status >= 200 && r.status < 300,
  });
  sleep(Math.random() * 0.3 + 0.05);
}

function cap(target) {
  return Math.min(target, MAX_VU);
}

const stagesNormal = [
  { duration: "30s", target: cap(100) },
  { duration: "1m", target: cap(100) },
  { duration: "30s", target: cap(500) },
  { duration: "1m", target: cap(500) },
  { duration: "30s", target: cap(1000) },
  { duration: "1m", target: cap(1000) },
  { duration: "30s", target: cap(2000) },
  { duration: "1m", target: cap(2000) },
  { duration: "45s", target: cap(5000) },
  { duration: "1m", target: cap(5000) },
  { duration: "45s", target: cap(8000) },
  { duration: "1m", target: cap(8000) },
  { duration: "1m", target: cap(10000) },
  { duration: "1m", target: cap(10000) },
  { duration: "30s", target: 0 },
];

const stagesFast = [
  { duration: "15s", target: cap(500) },
  { duration: "30s", target: cap(500) },
  { duration: "20s", target: cap(2000) },
  { duration: "30s", target: cap(2000) },
  { duration: "30s", target: cap(5000) },
  { duration: "30s", target: cap(5000) },
  { duration: "30s", target: cap(10000) },
  { duration: "45s", target: cap(10000) },
  { duration: "20s", target: 0 },
];

export const options = {
  scenarios: {
    bypass_lb: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: FAST ? stagesFast : stagesNormal,
      gracefulRampDown: "15s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.05"],
    http_req_duration: ["p(95)<3000"],
  },
  insecureSkipTLSVerify: true,
};
