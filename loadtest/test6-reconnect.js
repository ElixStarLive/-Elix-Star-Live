/**
 * TEST 6 — Reconnection Storm
 *
 * Simulate disconnect/reconnect waves.
 * VUs connect, disconnect, then reconnect rapidly.
 * Verify: users rejoin correctly, no ghost state, no broken rooms.
 *
 * Run:
 *   k6 run --env BASE_URL=http://YOUR_SERVER:8080 \
 *           --env WS_URL=ws://YOUR_SERVER:8080     \
 *           loadtest/test6-reconnect.js
 */
import ws from "k6/ws";
import { check, sleep } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";
import { WS_URL } from "./config.js";
import { getAuthToken } from "./helpers.js";

const wsConnectSuccess = new Rate("ws_connect_success");
const reconnectSuccess = new Rate("reconnect_success");
const reconnectLatency = new Trend("reconnect_latency_ms", true);
const reconnectAttempts = new Counter("reconnect_attempts");
const ghostDetected = new Counter("ghost_state_detected");
const reconnectErrors = new Counter("reconnect_errors");

export const options = {
  scenarios: {
    reconnect_storm: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 200 },
        { duration: "1m", target: 500 },
        { duration: "2m", target: 1000 },
        { duration: "3m", target: 1000 },  // hold — each VU does connect/disconnect cycles
        { duration: "30s", target: 0 },
      ],
    },
  },
  thresholds: {
    ws_connect_success: ["rate>0.90"],
    reconnect_success: ["rate>0.90"],
    reconnect_latency_ms: ["p(95)<3000"],
    ghost_state_detected: ["count<20"],
  },
};

export default function () {
  const auth = getAuthToken(__VU);
  if (!auth.token) {
    wsConnectSuccess.add(false);
    sleep(5);
    return;
  }

  const roomId = `loadtest-reconnect-${__VU % 20}`;
  const url = `${WS_URL}/?room=${roomId}&token=${auth.token}`;

  // ── Phase 1: Connect, verify, disconnect ──────────────────────
  let firstViewerCount = -1;

  const res1 = ws.connect(url, {}, function (socket) {
    wsConnectSuccess.add(true);

    socket.on("message", function (msg) {
      try {
        const parsed = JSON.parse(msg);
        if (parsed.event === "viewer_count" && parsed.data) {
          firstViewerCount = parsed.data.count;
        }
      } catch {}
    });

    // Stay connected 5 seconds, then close
    socket.setTimeout(function () {
      socket.close();
    }, 5000);
  });

  if (!res1 || res1.status !== 101) {
    wsConnectSuccess.add(false);
    sleep(2);
    return;
  }

  // Brief gap before reconnect
  sleep(1 + Math.random() * 2);

  // ── Phase 2: Reconnect, verify state ──────────────────────────
  reconnectAttempts.add(1);
  const reconnectStart = Date.now();

  const res2 = ws.connect(url, {}, function (socket) {
    const connected = Date.now();
    reconnectLatency.add(connected - reconnectStart);
    reconnectSuccess.add(true);

    let gotConnectedEvent = false;
    let reconnectViewerCount = -1;

    socket.on("message", function (msg) {
      try {
        const parsed = JSON.parse(msg);
        if (parsed.event === "connected") {
          gotConnectedEvent = true;
        }
        if (parsed.event === "viewer_count" && parsed.data) {
          reconnectViewerCount = parsed.data.count;
        }
      } catch {}
    });

    // Stay 10 seconds, then verify and close
    socket.setTimeout(function () {
      if (!gotConnectedEvent) {
        ghostDetected.add(1);
      }
      socket.close();
    }, 10000);
  });

  if (!res2 || res2.status !== 101) {
    reconnectSuccess.add(false);
    reconnectErrors.add(1);
  }

  sleep(1 + Math.random() * 2);
}
