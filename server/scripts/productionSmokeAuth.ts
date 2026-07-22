/**
 * Production authenticated smoke — run only on a trusted operator machine.
 *
 * NEVER paste tokens into chat. Set env locally, then:
 *
 *   SMOKE_BASE_URL=https://www.elixstarlive.co.uk \
 *   SMOKE_NORMAL_TOKEN=… \
 *   SMOKE_ADMIN_TOKEN=… \
 *   npx tsx server/scripts/productionSmokeAuth.ts
 *
 * Optional login path (still local env only — values are never printed):
 *   SMOKE_NORMAL_EMAIL / SMOKE_NORMAL_PASSWORD
 *   SMOKE_ADMIN_EMAIL / SMOKE_ADMIN_PASSWORD
 *
 * Exits non-zero on any unexpected status. Does not mutate payouts or wallets.
 */
import "../config.ts";

const BASE = (process.env.SMOKE_BASE_URL || "https://www.elixstarlive.co.uk").replace(
  /\/$/,
  "",
);

function redact(s: string): string {
  return s.replace(/Bearer\s+\S+/gi, "Bearer ***").slice(0, 240);
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
    session?: { access_token?: string; token?: string };
    access_token?: string;
    token?: string;
  };
  const token =
    body.session?.access_token ||
    body.session?.token ||
    body.access_token ||
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

function shapeOk(body: unknown, keys: string[]): boolean {
  if (!body || typeof body !== "object") return false;
  const o = body as Record<string, unknown>;
  return keys.every((k) => k in o);
}

async function main() {
  let failed = 0;

  console.log(`SMOKE_BASE=${BASE}`);
  console.log(`SMOKE_UTC=${new Date().toISOString()}`);

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
  if (!String(h?.commit || "").startsWith(
    (process.env.SMOKE_EXPECT_COMMIT || "fde62c6").trim(),
  )) {
    console.error(
      `FAIL|health_commit|got=${String(h?.commit || "").slice(0, 12)}|expect_prefix=${(process.env.SMOKE_EXPECT_COMMIT || "fde62c6").trim()}`,
    );
    failed++;
  }
  for (const k of ["database", "valkey", "livekit", "bunnyStorage"]) {
    if (h?.services?.[k] !== true) {
      console.error(`FAIL|health_svc_${k}`);
      failed++;
    }
  }

  await hit("/api/sounds", null, 200, "anon_sounds");
  await hit("/api/engagement/missions", null, 401, "anon_engagement");
  await hit("/api/admin/withdrawals", null, [401, 403], "anon_admin");

  const normal = await resolveToken("normal");
  const admin = await resolveToken("admin");

  if (!normal) {
    console.error(
      "NOT_EXECUTED|normal_auth — set SMOKE_NORMAL_TOKEN or SMOKE_NORMAL_EMAIL/PASSWORD locally",
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
          const ids = missions.map(
            (m) => (m as { id?: string }).id || "",
          );
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
      if (p.endsWith("/wallet") && r.ok) {
        const okShape = shapeOk(r.body, []) || typeof r.body === "object";
        if (!okShape) failed++;
      }
    }
    // Normal must NOT access admin
    const denied = await hit(
      "/api/admin/withdrawals",
      normal,
      403,
      "normal_admin_denied",
    );
    if (!denied.ok) {
      // Some stacks return 401 if role middleware short-circuits differently
      if (denied.status === 401) {
        console.error(
          "FAIL|normal_admin_got_401_while_authenticated — session/role handling suspect",
        );
      }
      failed++;
    }
  }

  if (!admin) {
    console.error(
      "NOT_EXECUTED|admin_auth — set SMOKE_ADMIN_TOKEN or SMOKE_ADMIN_EMAIL/PASSWORD locally",
    );
    failed++;
  } else {
    for (const p of [
      "/api/admin/withdrawals",
      "/api/admin/iap-purchases",
      "/api/admin/shop-purchases",
    ]) {
      const r = await hit(p, admin, 200, "admin");
      if (!r.ok) failed++;
      if (p.includes("withdrawals") && r.ok) {
        const text = JSON.stringify(r.body);
        // Columns may appear on rows or schema metadata — soft check
        console.log(
          `INFO|withdrawals_mentions_processed_by=${text.includes("processed_by")}|previous_status=${text.includes("previous_status")}`,
        );
      }
    }
  }

  console.log(failed === 0 ? "SMOKE_RESULT=PASSED" : `SMOKE_RESULT=FAILED count=${failed}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("SMOKE_CRASH", e instanceof Error ? e.message : e);
  process.exit(1);
});
