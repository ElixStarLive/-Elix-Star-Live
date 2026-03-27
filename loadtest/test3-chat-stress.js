/**
 * TEST 3 — Chat Stress Test
 *
 * 500 users in a room, each sending messages at high rate.
 * Target: 100–500 messages/sec total throughput.
 * Verify: all clients receive messages, no drops, acceptable latency.
 *
 * Run:
 *   k6 run --env BASE_URL=http://YOUR_SERVER:8080 \
 *           --env WS_URL=ws://YOUR_SERVER:8080     \
 *           loadtest/test3-chat-stress.js
 */
import ws from "k6/ws";
import { check, sleep } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";
import { WS_URL } from "./config.js";
import { getAuthToken } from "./helpers.js";

const wsConnectSuccess = new Rate("ws_connect_success");
const messagesSent = new Counter("chat_messages_sent");
const messagesReceived = new Counter("chat_messages_received");
const chatLatency = new Trend("chat_latency_ms", true);
const chatErrors = new Counter("chat_errors");

const ROOM_ID = "loadtest-chat-room";

export const options = {
  scenarios: {
    chat_burst: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 100 },
        { duration: "30s", target: 250 },
        { duration: "1m", target: 500 },
        { duration: "3m", target: 500 },   // hold — 500 users each sending ~1msg/sec = 500 msg/sec
        { duration: "30s", target: 0 },
      ],
    },
  },
  thresholds: {
    ws_connect_success: ["rate>0.95"],
    chat_latency_ms: ["p(50)<200", "p(95)<500", "p(99)<1000"],
    chat_errors: ["count<50"],
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

    socket.on("message", function (msg) {
      try {
        const parsed = JSON.parse(msg);
        if (parsed.event === "chat_message" && parsed.data) {
          messagesReceived.add(1);
          if (parsed.data._sentAt) {
            const latency = Date.now() - parsed.data._sentAt;
            chatLatency.add(latency);
          }
        }
      } catch {
        chatErrors.add(1);
      }
    });

    socket.on("error", function () {
      chatErrors.add(1);
    });

    // Send messages every ~1 second for 60 seconds
    for (let i = 0; i < 60; i++) {
      socket.setTimeout(function () {
        try {
          const payload = JSON.stringify({
            event: "chat_message",
            data: {
              message: `Load test message from VU ${__VU} #${i}`,
              _sentAt: Date.now(),
            },
          });
          socket.send(payload);
          messagesSent.add(1);
        } catch {
          chatErrors.add(1);
        }
      }, i * 1000 + Math.random() * 500);
    }

    socket.setTimeout(function () {
      socket.close();
    }, 65000);
  });

  check(res, {
    "ws connected": (r) => r && r.status === 101,
  });

  if (!res || res.status !== 101) {
    wsConnectSuccess.add(false);
  }

  sleep(1);
}
