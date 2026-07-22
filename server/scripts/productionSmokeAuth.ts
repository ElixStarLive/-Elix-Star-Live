/**
 * Production authenticated smoke — run on a trusted operator machine OR
 * inside the Coolify production container (where SMOKE_* env vars live).
 *
 * Coolify → Application → Terminal / Execute command:
 *
 *   cd /app && SMOKE_BASE_URL=http://127.0.0.1:8080 SMOKE_EXPECT_COMMIT= npm run smoke:prod:auth
 *
 * Or against the public host from Coolify (also fine):
 *
 *   cd /app && SMOKE_BASE_URL=https://www.elixstarlive.co.uk npm run smoke:prod:auth
 *
 * NEVER paste tokens into chat. Do not print SMOKE_* values.
 *
 * Env (any of):
 *   SMOKE_NORMAL_TOKEN / SMOKE_ADMIN_TOKEN
 *   SMOKE_NORMAL_EMAIL + SMOKE_NORMAL_PASSWORD
 *   SMOKE_ADMIN_EMAIL + SMOKE_ADMIN_PASSWORD
 *   SMOKE_BASE_URL (default https://www.elixstarlive.co.uk)
 *   SMOKE_EXPECT_COMMIT (optional prefix; empty = any non-empty commit)
 */
import "../config.ts";

const BASE = (process.env.SMOKE_BASE_URL || "https://www.elixstarlive.co.uk").replace(
  /\/$/,
  "",
);
const EXPECT_COMMIT = (process.env.SMOKE_EXPECT_COMMIT ?? "").trim();

function redact(s: string): string {
  return s
    .replace(/Bearer\s+\S+/gi, "Bearer ***")
    .replace(/"access_token"\s*:\s*"[^"]+"/gi, '"access_token":"***"')
    .replace(/"accessToken"\s*:\s*"[^"]+"/gi, '"accessToken":"***"')
    .replace(/"token"\s*:\s*"[^"]+"/gi, '"token":"***"')
    .slice(0, 240);
}

async function login(email: string, password: string): Promise<string | null> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    console.error(`LOGIN_FAIL status=${res.status}`);
    return null;
  }
  const body = (await res.json()) as {
    session?: { access_token?: string; accessToken?: string; token?: string };
    access_token?: string;
    accessToken?: string;
    token?: string;
  };
  const token =
    body.session?.access_token ||
    body.session?.accessToken ||
    body.session?.token ||
    body.access_token ||
    body.accessToken ||
    body.token ||
    null;
  return token;
}

async function resolveToken(
  kind: "normal" | "admin",
): Promise<string | null> {
  const direct =
    kind === "normal"
      ? process.env.SMOKE_NORMAL_TOKEN
      : process.env.SMOKE_ADMIN_TOKEN;
  if (direct?.trim()) return direct.trim();
  const email =
    kind === "normal"
      ? process.env.SMOKE_NORMAL_EMAIL
      : process.env.SMOKE_ADMIN_EMAIL;
  const password =
    kind === "normal"
      ? process.env.SMOKE_NORMAL_PASSWORD
      : process.env.SMOKE_ADMIN_PASSWORD;
  if (email && password) return login(email, password);
  return null;
}

async function hit(
  path: string,
  token: string | null,
  expect: number | number[],
  label: string,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { headers });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* keep text */
  }
  const expected = Array.isArray(expect) ? expect : [expect];
  const ok = expected.includes(res.status);
  const snip =
    typeof body === "string"
      ? redact(body)
      : redact(JSON.stringify(body));
  console.log(
    `${ok ? "PASS" : "FAIL"}|${label}|${path}|HTTP ${res.status}|expect ${expected.join(",")}|${snip}`,
  );
  return { ok, status: res.status, body };
}

async function main() {
  let failed = 0;

  console.log(`SMOKE_BASE=${BASE}`);
  console.log(`SMOKE_UTC=${new Date().toISOString()}`);
  console.log(
    `SMOKE_CREDS|normal=${process.env.SMOKE_NORMAL_TOKEN || process.env.SMOKE_NORMAL_EMAIL ? "present" : "missing"}|admin=${process.env.SMOKE_ADMIN_TOKEN || process.env.SMOKE_ADMIN_EMAIL ? "present" : "missing"}`,
  );

  const health = await hit("/health", null, 200, "anon_health");
  if (!health.ok) failed++;
  const h = health.body as {
    status?: string;
    commit?: string;
    services?: Record<string, unknown>;
  };
  if (h?.status !== "ok") {
    console.error("FAIL|health_status");
    failed++;
  }
  const commit = String(h?.commit || "");
  if (!commit) {
    console.error("FAIL|health_commit_missing");
    failed++;
  } else if (EXPECT_COMMIT && !commit.startsWith(EXPECT_COMMIT)) {
    console.error(
      `FAIL|health_commit|got=${commit.slice(0, 12)}|expect_prefix=${EXPECT_COMMIT}`,
    );
    failed++;
  } else {
    console.log(`INFO|health_commit=${commit.slice(0, 12)}`);
  }
  for (const k of ["database", "valkey", "livekit", "bunnyStorage"]) {
    if (h?.services?.[k] !== true) {
      console.error(`FAIL|health_svc_${k}`);
      failed++;
    }
  }

  const sounds = await hit("/api/sounds", null, 200, "anon_sounds");
  if (!sounds.ok) failed++;
  const anonEng = await hit(
    "/api/engagement/missions",
    null,
    401,
    "anon_engagement",
  );
  if (!anonEng.ok) failed++;
  const anonAdmin = await hit(
    "/api/admin/withdrawals",
    null,
    [401, 403],
    "anon_admin",
  );
  if (!anonAdmin.ok) failed++;

  const normal = await resolveToken("normal");
  const admin = await resolveToken("admin");

  if (!normal) {
    console.error(
      "NOT_EXECUTED|normal_auth — SMOKE_NORMAL_TOKEN or SMOKE_NORMAL_EMAIL/PASSWORD missing in this process env",
    );
    failed++;
  } else {
    const paths = [
      "/api/engagement/missions",
      "/api/engagement/hub",
      "/api/engagement/wallet",
      "/api/engagement/fan-level",
      "/api/engagement/achievements",
      "/api/engagement/daily-login",
      "/api/engagement/flags",
    ];
    for (const p of paths) {
      const r = await hit(p, normal, 200, "normal");
      if (!r.ok) failed++;
      if (p.endsWith("/missions") && r.ok) {
        const missions =
          (r.body as { missions?: unknown[] })?.missions ??
          (Array.isArray(r.body) ? r.body : null);
        if (!Array.isArray(missions)) {
          console.error("FAIL|missions_shape");
          failed++;
        } else {
          const ids = missions.map((m) => (m as { id?: string }).id || "");
          const gifts = ids.filter((id) => id === "daily_send_gifts");
          if (gifts.length > 1) {
            console.error("FAIL|duplicate_daily_send_gifts");
            failed++;
          }
          console.log(
            `INFO|missions_count=${missions.length}|daily_send_gifts=${gifts.length}`,
          );
        }
      }
      if (p.endsWith("/flags") && r.ok) {
        const flags =
          (r.body as { flags?: Record<string, boolean> }).flags || {};
        for (const [k, v] of Object.entries(flags)) {
          console.log(`FLAG|${k}=${v}`);
        }
      }
    }
    const denied = await hit(
      "/api/admin/withdrawals",
      normal,
      403,
      "normal_admin_denied",
    );
    if (!denied.ok) {
      if (denied.status === 401) {
        console.error(
          "FAIL|normal_admin_got_401_while_authenticated — session/role handling suspect",
        );
      } else if (denied.status === 200) {
        console.error("FAIL|CRITICAL|normal_user_reached_admin_api");
      }
      failed++;
    }
  }

  if (!admin) {
    console.error(
      "NOT_EXECUTED|admin_auth — SMOKE_ADMIN_TOKEN or SMOKE_ADMIN_EMAIL/PASSWORD missing in this process env",
    );
    failed++;
  } else {
    for (const p of [
      "/api/admin/withdrawals",
      "/api/admin/iap-purchases",
      "/api/admin/shop-purchases",
      "/api/admin/progression/missions",
      "/api/admin/progression/daily-rewards",
      "/api/admin/progression/battle-energy-caps",
      "/api/admin/progression/feature-flags",
      "/api/admin/progression/audit-history?limit=10",
    ]) {
      const r = await hit(p, admin, 200, "admin");
      if (!r.ok) failed++;
      if (p.includes("withdrawals") && r.ok) {
        const text = JSON.stringify(r.body);
        console.log(
          `INFO|withdrawals_mentions_processed_by=${text.includes("processed_by")}|previous_status=${text.includes("previous_status")}`,
        );
      }
      if (p.includes("feature-flags") && r.ok) {
        const flags =
          (r.body as { flags?: Record<string, boolean> }).flags || {};
        for (const [k, v] of Object.entries(flags)) {
          console.log(`ADMIN_FLAG|${k}=${v}`);
        }
      }
    }
  }

  console.log(
    failed === 0
      ? "SMOKE_RESULT=PASSED"
      : `SMOKE_RESULT=FAILED count=${failed}`,
  );
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("SMOKE_CRASH", e instanceof Error ? e.message : e);
  process.exit(1);
});
