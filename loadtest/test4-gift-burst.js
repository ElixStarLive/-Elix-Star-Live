/**
 * TEST 4 — Gift / Event Burst
 *
 * Simulate rapid gift sending in a live room.
 * Verify: no duplicate transaction processing, no missed events,
 * consistency across workers.
 *
 * Run:
 *   k6 run --env BASE_URL=http://YOUR_SERVER:8080 \
 *           --env WS_URL=ws://YOUR_SERVER:8080     \
 *           loadtest/test4-gift-burst.js
 */
import ws from "k6/ws";
import { check, sleep } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";
import { WS_URL } from "./config.js";
import { getAuthToken } from "./helpers.js";

const wsConnectSuccess = new Rate("ws_connect_success");
const giftsSent = new Counter("gifts_sent");
const giftEventsReceived = new Counter("gift_events_received");
const giftLatency = new Trend("gift_latency_ms", true);
const duplicateGifts = new Counter("duplicate_gift_events");
const giftErrors = new Counter("gift_errors");

const ROOM_ID = "loadtest-gift-room";

export const options = {
  scenarios: {
    gift_burst: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 50 },
        { duration: "30s", target: 200 },
        { duration: "2m", target: 500 },
        { duration: "3m", target: 500 },  // hold — high gift rate
        { duration: "30s", target: 0 },
      ],
    },
  },
  thresholds: {
    ws_connect_success: ["rate>0.95"],
    gift_latency_ms: ["p(95)<1000"],
    duplicate_gift_events: ["count<10"],
    gift_errors: ["count<50"],
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
  const seenTransactions = {};

  const res = ws.connect(url, {}, function (socket) {
    wsConnectSuccess.add(true);

    socket.on("message", function (msg) {
      try {
        const parsed = JSON.parse(msg);
        if (parsed.event === "gift" || parsed.event === "gift_received" ||
            parsed.event === "gift_sent" || parsed.event === "live_gift") {
          giftEventsReceived.add(1);

          const txnId = parsed.data?.transactionId || parsed.data?.transaction_id;
          if (txnId) {
            if (seenTransactions[txnId]) {
              duplicateGifts.add(1);
            }
            seenTransactions[txnId] = true;
          }

          if (parsed.data?._sentAt) {
            giftLatency.add(Date.now() - parsed.data._sentAt);
          }
        }
      } catch {
        giftErrors.add(1);
      }
    });

    socket.on("error", function () {
      giftErrors.add(1);
    });

    // Send gift events every ~2 seconds for 60 seconds
    for (let i = 0; i < 30; i++) {
      socket.setTimeout(function () {
        try {
          const txnId = `txn_${__VU}_${Date.now()}_${i}`;
          const payload = JSON.stringify({
            event: "send_gift",
            data: {
              giftId: "rose",
              targetUserId: "host-user-id",
              transactionId: txnId,
              quantity: 1,
              _sentAt: Date.now(),
            },
          });
          socket.send(payload);
          giftsSent.add(1);
        } catch {
          giftErrors.add(1);
        }
      }, i * 2000 + Math.random() * 1000);
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
