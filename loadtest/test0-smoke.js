/**
 * TEST 0 — Smoke Test
 *
 * Quick sanity check: 10 VUs, verify auth works, WS connects,
 * HTTP endpoints respond. Run this FIRST before any heavy tests.
 *
 * Run:
 *   k6 run --env BASE_URL=http://YOUR_SERVER:8080 \
 *           --env WS_URL=ws://YOUR_SERVER:8080     \
 *           loadtest/test0-smoke.js
 */
import http from "k6/http";
import ws from "k6/ws";
import { check, sleep } from "k6";
import { Rate, Counter } from "k6/metrics";
import { BASE_URL, WS_URL } from "./config.js";
import { getAuthToken, authHeaders } from "./helpers.js";

const checks = new Rate("checks");
const errors = new Counter("errors");

export const options = {
  vus: 10,
  duration: "30s",
  thresholds: {
    checks: ["rate>0.90"],
    errors: ["count<5"],
  },
};

export default function () {
  const auth = getAuthToken(__VU);

  // ── Auth check ────────────────────────────────────────────────
  const authOk = check(auth, {
    "got auth token": (a) => a.token.length > 0,
  });
  checks.add(authOk);
  if (!authOk) {
    errors.add(1);
    sleep(2);
    return;
  }

  // ── HTTP: feed ────────────────────────────────────────────────
  {
    const res = http.get(`${BASE_URL}/api/feed/foryou`, authHeaders(auth.token));
    const ok = check(res, {
      "feed status 200": (r) => r.status === 200,
      "feed has body": (r) => r.body && r.body.length > 0,
    });
    checks.add(ok);
    if (!ok) errors.add(1);
  }

  sleep(0.5);

  // ── HTTP: profile ─────────────────────────────────────────────
  {
    const res = http.get(`${BASE_URL}/api/profiles/${auth.userId || "self"}`, authHeaders(auth.token));
    const ok = check(res, {
      "profile responds": (r) => r.status === 200 || r.status === 404,
    });
    checks.add(ok);
    if (!ok) errors.add(1);
  }

  sleep(0.5);

  // ── WebSocket: connect + receive connected event ──────────────
  {
    const roomId = `smoke-test-${__VU}`;
    const url = `${WS_URL}/?room=${roomId}&token=${auth.token}`;
    let gotConnected = false;

    const res = ws.connect(url, {}, function (socket) {
      socket.on("message", function (msg) {
        try {
          const parsed = JSON.parse(msg);
          if (parsed.event === "connected") gotConnected = true;
        } catch {}
      });

      socket.setTimeout(function () {
        socket.close();
      }, 5000);
    });

    const wsOk = check(res, {
      "ws status 101": (r) => r && r.status === 101,
    });
    checks.add(wsOk);
    if (!wsOk) errors.add(1);
  }

  sleep(1);
}
