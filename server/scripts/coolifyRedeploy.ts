/**
 * Trigger Coolify redeploy when credentials are present.
 * Env: COOLIFY_TOKEN, COOLIFY_BASE_URL (default https://app.coolify.io), COOLIFY_APP_UUID
 * Never prints token.
 */
import "../config.ts";

async function main() {
  const token = (process.env.COOLIFY_TOKEN || "").trim();
  const base = (process.env.COOLIFY_BASE_URL || "https://app.coolify.io").replace(/\/$/, "");
  const uuid = (process.env.COOLIFY_APP_UUID || "").trim();
  if (!token || !uuid) {
    console.log(
      JSON.stringify({
        ok: false,
        error: "MISSING_COOLIFY_CREDENTIALS",
        hasToken: !!token,
        hasUuid: !!uuid,
        baseHost: new URL(base).host,
      }),
    );
    process.exit(2);
  }
  const url = `${base}/api/v1/deploy?uuid=${encodeURIComponent(uuid)}&force=true`;
  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  const text = await res.text();
  console.log(
    JSON.stringify({
      ok: res.ok,
      status: res.status,
      bodySnippet: text.slice(0, 300),
    }),
  );
  process.exit(res.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
