/**
 * Shared config for all k6 load tests.
 *
 * Set via environment variables:
 *   BASE_URL      — http(s)://your-server:port  (default: http://localhost:8080)
 *   WS_URL        — ws(s)://your-server:port    (default: ws://localhost:8080)
 *   TEST_EMAIL    — existing test user email
 *   TEST_PASSWORD — existing test user password
 */

export const BASE_URL = __ENV.BASE_URL || "http://localhost:8080";
export const WS_URL = __ENV.WS_URL || "ws://localhost:8080";
export const TEST_EMAIL = __ENV.TEST_EMAIL || "loadtest@test.com";
export const TEST_PASSWORD = __ENV.TEST_PASSWORD || "loadtest123456";

export const THRESHOLDS = {
  http_req_duration: ["p(50)<200", "p(95)<500", "p(99)<1000"],
  http_req_failed: ["rate<0.01"],
  ws_connecting: ["p(95)<1000"],
};
