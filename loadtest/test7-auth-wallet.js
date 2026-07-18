/**
 * TEST 7 — Auth + Wallet + Purchase-read Stress
 *
 * Exercises the authenticated hot path that every request pays for:
 *   - auth register/login throughput (helpers.getAuthToken)
 *   - GET /api/wallet/                 (wallet balance read)
 *   - GET /api/wallet/transactions     (wallet ledger read)
 *   - GET /api/progression/me          (coins/XP read)
 *   - GET /api/shop/items              (purchase-adjacent catalog read)
 *
 * Every authenticated request runs through sessionGuard -> checkSessionState,
 * so this test is the primary signal for whether session validation is a
 * bottleneck under load (motivates the Valkey session cache).
 *
 * NOTE ON PURCHASES: the actual charge paths are intentionally NOT hammered
 * here. Stripe checkout-session creation and Google/Apple IAP verification must
 * be load-tested against their SANDBOX environments, never against production
 * payment providers. This test covers the read/catalog side of purchases; the
 * write/charge side is validated separately in a payments sandbox (see report).
 *
 * Run:
 *   k6 run --env BASE_URL=http://YOUR_SERVER:8080 \
 *           --env BYPASS_KEY=$LOADTEST_BYPASS_SECRET \
 *           loadtest/test7-auth-wallet.js
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend, Counter } from "k6/metrics";
import { BASE_URL } from "./config.js";
import { getAuthToken, authHeaders } from "./helpers.js";

const authLatency = new Trend("auth_latency_ms", true);
const walletLatency = new Trend("wallet_latency_ms", true);
const txLatency = new Trend("wallet_tx_latency_ms", true);
const progressionLatency = new Trend("progression_latency_ms", true);
const shopLatency = new Trend("shop_latency_ms", true);
const httpErrors = new Counter("http_errors");
const httpSuccess = new Rate("http_success_rate");
const authSuccess = new Rate("auth_success_rate");

export const options = {
  scenarios: {
    auth_wallet_stress: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 50 },
        { duration: "30s", target: 200 },
        { duration: "1m", target: 500 },
        { duration: "1m", target: 1000 },
        { duration: "2m", target: 2000 },
        { duration: "3m", target: 2000 }, // hold at 2000 concurrent authed users
        { duration: "1m", target: 0 },
      ],
    },
  },
  thresholds: {
    auth_latency_ms: ["p(95)<800", "p(99)<2000"],
    wallet_latency_ms: ["p(50)<150", "p(95)<400", "p(99)<1000"],
    progression_latency_ms: ["p(50)<150", "p(95)<400", "p(99)<1000"],
    shop_latency_ms: ["p(50)<200", "p(95)<500", "p(99)<1500"],
    http_success_rate: ["rate>0.99"],
    auth_success_rate: ["rate>0.98"],
    http_errors: ["count<200"],
  },
};

export default function () {
  // ── Auth (register/login) ─────────────────────────────────────
  const authStart = Date.now();
  const auth = getAuthToken(__VU);
  authLatency.add(Date.now() - authStart);
  if (!auth.token) {
    authSuccess.add(false);
    httpErrors.add(1);
    sleep(2);
    return;
  }
  authSuccess.add(true);

  const hdrs = authHeaders(auth.token);

  // ── Wallet balance ────────────────────────────────────────────
  {
    const start = Date.now();
    const res = http.get(`${BASE_URL}/api/wallet/`, {
      ...hdrs,
      tags: { name: "GET /api/wallet/" },
    });
    walletLatency.add(Date.now() - start);
    const ok = check(res, { "wallet 200": (r) => r.status === 200 });
    httpSuccess.add(ok);
    if (!ok) httpErrors.add(1);
  }

  sleep(0.3 + Math.random() * 0.4);

  // ── Progression (coins / XP) ──────────────────────────────────
  {
    const start = Date.now();
    const res = http.get(`${BASE_URL}/api/progression/me`, {
      ...hdrs,
      tags: { name: "GET /api/progression/me" },
    });
    progressionLatency.add(Date.now() - start);
    const ok = check(res, { "progression 200": (r) => r.status === 200 });
    httpSuccess.add(ok);
    if (!ok) httpErrors.add(1);
  }

  sleep(0.3 + Math.random() * 0.4);

  // ── Wallet transactions (ledger) ──────────────────────────────
  {
    const start = Date.now();
    const res = http.get(`${BASE_URL}/api/wallet/transactions`, {
      ...hdrs,
      tags: { name: "GET /api/wallet/transactions" },
    });
    txLatency.add(Date.now() - start);
    const ok = check(res, { "wallet tx 200": (r) => r.status === 200 });
    httpSuccess.add(ok);
    if (!ok) httpErrors.add(1);
  }

  sleep(0.3 + Math.random() * 0.4);

  // ── Shop catalog (purchase-adjacent read) ─────────────────────
  {
    const start = Date.now();
    const res = http.get(`${BASE_URL}/api/shop/items`, {
      ...hdrs,
      tags: { name: "GET /api/shop/items" },
    });
    shopLatency.add(Date.now() - start);
    const ok = check(res, { "shop 200": (r) => r.status === 200 });
    httpSuccess.add(ok);
    if (!ok) httpErrors.add(1);
  }

  sleep(0.5 + Math.random() * 1);
}
