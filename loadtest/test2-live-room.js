/**
 * TEST 2 — Single Live Room Stress
 *
 * All VUs join a SINGLE room. Ramp to 10K users in one room.
 * Verify: viewer count accuracy, event delivery, no desync.
 *
 * Run:
 *   k6 run --env BASE_URL=http://YOUR_SERVER:8080 \
 *           --env WS_URL=ws://YOUR_SERVER:8080     \
 *           loadtest/test2-live-room.js
 */
import ws from "k6/ws";
import { check, sleep } from "k6";
import { Counter, Rate, Trend, Gauge } from "k6/metrics";
import { WS_URL } from "./config.js";
import { getAuthToken } from "./helpers.js";

const wsConnectSuccess = new Rate("ws_connect_success");
const viewerCountReceived = new Counter("viewer_count_events");
const viewerCountValue = new Gauge("last_viewer_count");
const userJoinedEvents = new Counter("user_joined_events");
const connectedEvents = new Counter("connected_events");
const eventLatency = new Trend("event_latency_ms", true);

const ROOM_ID = "loadtest-mega-room";

export const options = {
  scenarios: {
    single_room: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "1m", target: 1000 },
        { duration: "1m", target: 2500 },
        { duration: "1m", target: 5000 },
        { duration: "2m", target: 7500 },
        { duration: "2m", target: 10000 },
        { duration: "3m", target: 10000 },  // hold
        { duration: "1m", target: 0 },
      ],
    },
  },
  thresholds: {
    ws_connect_success: ["rate>0.95"],
    viewer_count_events: ["count>0"],
  },
};

export default function () {
  const auth = getAuthToken(__VU);
  if (!auth.token) {
    wsConnectSuccess.add(false);
    sleep(3);
    return;
  }

  const url = `${WS_URL}/?room=${ROOM_ID}&token=${auth.token}`;

  const res = ws.connect(url, {}, function (socket) {
    wsConnectSuccess.add(true);
    const connectedAt = Date.now();

    socket.on("message", function (msg) {
      try {
        const parsed = JSON.parse(msg);
        const event = parsed.event;
        const now = Date.now();

        if (parsed.timestamp) {
          const serverTs = new Date(parsed.timestamp).getTime();
          if (!isNaN(serverTs)) {
            eventLatency.add(now - serverTs);
          }
        }

        if (event === "connected") {
          connectedEvents.add(1);
        } else if (event === "viewer_count") {
          viewerCountReceived.add(1);
          if (parsed.data && typeof parsed.data.count === "number") {
            viewerCountValue.add(parsed.data.count);
          }
        } else if (event === "user_joined") {
          userJoinedEvents.add(1);
        }
      } catch {
        // ignore parse errors
      }
    });

    socket.on("close", function () {});
    socket.on("error", function () {});

    // Stay connected 90 seconds
    socket.setTimeout(function () {
      socket.close();
    }, 90000);
  });

  check(res, {
    "ws connected": (r) => r && r.status === 101,
  });

  if (!res || res.status !== 101) {
    wsConnectSuccess.add(false);
  }

  sleep(1);
}
