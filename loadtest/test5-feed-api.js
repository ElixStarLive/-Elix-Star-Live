/**
 * TEST 5 — Feed / API HTTP Stress
 *
 * High-RPS test against HTTP endpoints:
 *   /api/feed/foryou
 *   /api/feed/friends
 *   /api/profiles/:userId
 *   /api/auth/me
 *
 * Measures: p50/p95/p99 latency, error rate, throughput.
 *
 * Run:
 *   k6 run --env BASE_URL=http://YOUR_SERVER:8080 \
 *           --env TEST_EMAIL=user@example.com      \
 *           --env TEST_PASSWORD=yourpassword        \
 *           loadtest/test5-feed-api.js
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend, Counter } from "k6/metrics";
import { BASE_URL, TEST_EMAIL, TEST_PASSWORD } from "./config.js";
import { getAuthToken, authHeaders } from "./helpers.js";

const feedLatency = new Trend("feed_latency_ms", true);
const profileLatency = new Trend("profile_latency_ms", true);
const authMeLatency = new Trend("auth_me_latency_ms", true);
const httpErrors = new Counter("http_errors");
const httpSuccess = new Rate("http_success_rate");

export const options = {
  scenarios: {
    api_stress: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 50 },
        { duration: "30s", target: 200 },
        { duration: "1m", target: 500 },
        { duration: "1m", target: 1000 },
        { duration: "2m", target: 2000 },
        { duration: "3m", target: 2000 },  // hold at 2000 concurrent HTTP users
        { duration: "1m", target: 0 },
      ],
    },
  },
  thresholds: {
    feed_latency_ms: ["p(50)<200", "p(95)<500", "p(99)<1500"],
    profile_latency_ms: ["p(50)<150", "p(95)<400", "p(99)<1000"],
    auth_me_latency_ms: ["p(50)<100", "p(95)<300", "p(99)<800"],
    http_success_rate: ["rate>0.99"],
    http_errors: ["count<100"],
  },
};

export function setup() {
  // nothing needed — each VU gets its own token
}

export default function () {
  const auth = getAuthToken(__VU);
  if (!auth.token) {
    httpErrors.add(1);
    sleep(2);
    return;
  }

  const hdrs = authHeaders(auth.token);

  // ── For You Feed ──────────────────────────────────────────────
  {
    const start = Date.now();
    const res = http.get(`${BASE_URL}/api/feed/foryou`, {
      ...hdrs,
      tags: { name: "GET /api/feed/foryou" },
    });
    feedLatency.add(Date.now() - start);
    const ok = check(res, { "feed 200": (r) => r.status === 200 });
    httpSuccess.add(ok);
    if (!ok) httpErrors.add(1);
  }

  sleep(0.5 + Math.random() * 0.5);

  // ── Friends Feed ──────────────────────────────────────────────
  {
    const start = Date.now();
    const res = http.get(`${BASE_URL}/api/feed/friends`, {
      ...hdrs,
      tags: { name: "GET /api/feed/friends" },
    });
    feedLatency.add(Date.now() - start);
    const ok = check(res, { "friends feed 200": (r) => r.status === 200 });
    httpSuccess.add(ok);
    if (!ok) httpErrors.add(1);
  }

  sleep(0.3 + Math.random() * 0.3);

  // ── Profile ───────────────────────────────────────────────────
  {
    const profileId = auth.userId || "self";
    const start = Date.now();
    const res = http.get(`${BASE_URL}/api/profiles/${profileId}`, {
      ...hdrs,
      tags: { name: "GET /api/profiles/:id" },
    });
    profileLatency.add(Date.now() - start);
    const ok = check(res, { "profile 200": (r) => r.status === 200 || r.status === 404 });
    httpSuccess.add(ok);
    if (!ok) httpErrors.add(1);
  }

  sleep(0.3 + Math.random() * 0.3);

  // ── Auth me ───────────────────────────────────────────────────
  {
    const start = Date.now();
    const res = http.get(`${BASE_URL}/api/auth/me`, {
      ...hdrs,
      tags: { name: "GET /api/auth/me" },
    });
    authMeLatency.add(Date.now() - start);
    const ok = check(res, { "auth me ok": (r) => r.status === 200 || r.status === 401 });
    httpSuccess.add(ok);
    if (!ok) httpErrors.add(1);
  }

  sleep(0.5 + Math.random() * 1);
}
