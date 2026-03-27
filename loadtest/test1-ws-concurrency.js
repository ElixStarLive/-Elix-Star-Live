/**
 * TEST 1 — WebSocket Concurrency
 *
 * Gradually ramp connections from 0 → 40,000.
 * Each VU opens a WebSocket, joins a room, stays connected, and
 * measures: connection success, disconnect rate, memory, CPU.
 *
 * Rooms are spread across 100 rooms to simulate realistic distribution.
 *
 * Run:
 *   k6 run --env BASE_URL=http://YOUR_SERVER:8080 \
 *           --env WS_URL=ws://YOUR_SERVER:8080     \
 *           loadtest/test1-ws-concurrency.js
 *
 * For 40K you likely need multiple k6 machines:
 *   k6 run --execution-segment "0:1/4" ...   (on machine 1)
 *   k6 run --execution-segment "1/4:2/4" ... (on machine 2)
 *   etc.
 */
import ws from "k6/ws";
import { check, sleep } from "k6";
import { Counter, Rate, Trend, Gauge } from "k6/metrics";
import { WS_URL } from "./config.js";
import { getAuthToken } from "./helpers.js";

// ── Custom metrics ──────────────────────────────────────────────
const wsConnectSuccess = new Rate("ws_connect_success");
const wsConnectDuration = new Trend("ws_connect_duration", true);
const wsDisconnects = new Counter("ws_disconnects");
const wsMessagesReceived = new Counter("ws_messages_received");
const wsActiveConnections = new Gauge("ws_active_connections");

// ── Load profile ────────────────────────────────────────────────
export const options = {
  scenarios: {
    ramp_ws: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "2m", target: 1000 },
        { duration: "2m", target: 5000 },
        { duration: "2m", target: 10000 },
        { duration: "2m", target: 20000 },
        { duration: "2m", target: 30000 },
        { duration: "3m", target: 40000 },
        { duration: "5m", target: 40000 },   // hold at 40K
        { duration: "2m", target: 0 },       // ramp down
      ],
    },
  },
  thresholds: {
    ws_connect_success: ["rate>0.95"],
    ws_connect_duration: ["p(95)<2000"],
    ws_disconnects: ["count<2000"],
  },
};

export default function () {
  const auth = getAuthToken(__VU);
  if (!auth.token) {
    wsConnectSuccess.add(false);
    sleep(5);
    return;
  }

  const roomId = `loadtest-room-${__VU % 100}`;
  const url = `${WS_URL}/?room=${roomId}&token=${auth.token}`;

  const startTime = Date.now();

  const res = ws.connect(url, {}, function (socket) {
    const connectTime = Date.now() - startTime;
    wsConnectDuration.add(connectTime);
    wsConnectSuccess.add(true);
    wsActiveConnections.add(1);

    socket.on("message", function (msg) {
      wsMessagesReceived.add(1);
    });

    socket.on("close", function () {
      wsDisconnects.add(1);
      wsActiveConnections.add(-1);
    });

    socket.on("error", function (e) {
      wsDisconnects.add(1);
    });

    // Stay connected for ~60 seconds, sending pings
    for (let i = 0; i < 12; i++) {
      socket.setTimeout(function () {
        socket.ping();
      }, i * 5000);
    }

    socket.setTimeout(function () {
      socket.close();
    }, 60000);
  });

  check(res, {
    "ws status is 101": (r) => r && r.status === 101,
  });

  if (!res || res.status !== 101) {
    wsConnectSuccess.add(false);
  }

  sleep(1);
}
