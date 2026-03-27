/**
 * Shared helpers for k6 load tests.
 * - login/register to get a JWT token
 * - generate unique user data per VU
 */
import http from "k6/http";
import { check } from "k6";
import { BASE_URL } from "./config.js";

/**
 * Register a unique load-test user, return { token, userId }.
 * Falls back to login if user already exists.
 */
export function getAuthToken(vuId) {
  const email = `loadtest_vu${vuId}_${Date.now()}@test.local`;
  const password = "LoadTest_Pass_42!";
  const username = `lt_vu${vuId}_${Date.now()}`;

  let res = http.post(
    `${BASE_URL}/api/auth/register`,
    JSON.stringify({ email, password, username }),
    { headers: { "Content-Type": "application/json" }, tags: { name: "auth_register" } },
  );

  if (res.status === 200 || res.status === 201) {
    const body = safeJson(res);
    if (body && body.token) return { token: body.token, userId: body.user?.id || "", email };
  }

  res = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ email, password }),
    { headers: { "Content-Type": "application/json" }, tags: { name: "auth_login" } },
  );

  if (res.status === 200) {
    const body = safeJson(res);
    if (body && body.token) return { token: body.token, userId: body.user?.id || "", email };
  }

  return { token: "", userId: "", email };
}

/**
 * Login with a fixed test account (all VUs share this account for
 * simple HTTP tests that don't need unique users).
 */
export function loginShared(email, password) {
  const res = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ email, password }),
    { headers: { "Content-Type": "application/json" }, tags: { name: "auth_login_shared" } },
  );
  if (res.status === 200) {
    const body = safeJson(res);
    if (body && body.token) return body.token;
  }
  return "";
}

export function authHeaders(token) {
  return {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  };
}

function safeJson(res) {
  try {
    return res.json();
  } catch {
    return null;
  }
}
