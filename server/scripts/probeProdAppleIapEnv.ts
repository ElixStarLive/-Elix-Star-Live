/**
 * Prove whether PRODUCTION receives Apple IAP Server API env vars — names only.
 *
 * Strategy (no secrets printed):
 * 1) GET /health — note whether appleIap boolean exists (may be absent on older deploys)
 * 2) Optional Coolify API: list application env KEY NAMES for APPLE_* (requires COOLIFY_TOKEN)
 * 3) Never print values / private keys
 *
 * Usage: npx tsx server/scripts/probeProdAppleIapEnv.ts
 */
import "dotenv/config";

const PROD = (process.env.PROD_BASE_URL || "https://www.elixstarlive.co.uk").replace(/\/$/, "");

async function main(): Promise<void> {
  const out: Record<string, unknown> = {
    status: "OK",
    atUtc: new Date().toISOString(),
    prodBase: PROD,
  };

  try {
    const healthRes = await fetch(`${PROD}/health`, { signal: AbortSignal.timeout(20_000) });
    const health = (await healthRes.json()) as Record<string, unknown>;
    const services =
      health.services && typeof health.services === "object"
        ? (health.services as Record<string, unknown>)
        : {};
    out.healthHttp = healthRes.status;
    out.healthStatus = health.status ?? null;
    out.healthCommit = health.commit ?? null;
    out.healthHasAppleIapBoolean = Object.prototype.hasOwnProperty.call(services, "appleIap");
    out.healthAppleIap =
      typeof services.appleIap === "boolean" ? services.appleIap : "FIELD_NOT_PRESENT_ON_THIS_DEPLOY";
    out.healthPush = services.push ?? null;
    out.healthLivekit = services.livekit ?? null;
  } catch (e) {
    out.healthError = e instanceof Error ? e.message : String(e);
  }

  const token = (process.env.COOLIFY_TOKEN || "").trim();
  const base = (process.env.COOLIFY_BASE_URL || "https://app.coolify.io").replace(/\/$/, "");
  const uuid = (process.env.COOLIFY_APP_UUID || "").trim();

  if (!token || !uuid) {
    out.coolify = {
      probed: false,
      reason: "COOLIFY_TOKEN or COOLIFY_APP_UUID absent in local env — cannot list production env key names via API",
    };
  } else {
    try {
      const url = `${base}/api/v1/applications/${encodeURIComponent(uuid)}/envs`;
      const r = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        signal: AbortSignal.timeout(30_000),
      });
      const text = await r.text();
      let json: unknown;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }
      const rows = Array.isArray(json)
        ? json
        : json && typeof json === "object" && Array.isArray((json as { data?: unknown }).data)
          ? ((json as { data: unknown[] }).data)
          : [];
      const names = rows
        .map((row) => {
          if (!row || typeof row !== "object") return "";
          const o = row as Record<string, unknown>;
          return String(o.key || o.name || o.env || "").trim();
        })
        .filter(Boolean);

      const present = (k: string) => names.includes(k);
      out.coolify = {
        probed: true,
        http: r.status,
        APPLE_ISSUER_ID_PRESENT: present("APPLE_ISSUER_ID"),
        APPLE_KEY_ID_PRESENT: present("APPLE_KEY_ID"),
        APPLE_PRIVATE_KEY_PRESENT: present("APPLE_PRIVATE_KEY"),
        APPLE_BUNDLE_ID_PRESENT: present("APPLE_BUNDLE_ID"),
        APPLE_BUNDLE_ID_VALUE_IF_SAFE:
          // Only echo bundle id if it is the expected non-secret constant shape.
          present("APPLE_BUNDLE_ID") ? "present_in_coolify_env_list" : "absent",
        APPLE_IAP_REQUIRED_PRESENT: present("APPLE_IAP_REQUIRED"),
        appleKeyNamesFound: names.filter((n) => n.startsWith("APPLE_")),
      };
    } catch (e) {
      out.coolify = {
        probed: true,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  // Interpretation helper — no secrets.
  const coolify = out.coolify as Record<string, unknown> | undefined;
  const trioFromCoolify =
    coolify &&
    coolify.probed === true &&
    coolify.APPLE_ISSUER_ID_PRESENT === true &&
    coolify.APPLE_KEY_ID_PRESENT === true &&
    coolify.APPLE_PRIVATE_KEY_PRESENT === true;

  out.verdict = {
    APPLE_ISSUER_ID_PRESENT_AT_RUNTIME:
      typeof out.healthAppleIap === "boolean"
        ? out.healthAppleIap
          ? "YES_VIA_HEALTH"
          : "NO_VIA_HEALTH"
        : trioFromCoolify
          ? "YES_VIA_COOLIFY_ENV_NAMES_ONLY_NOT_PROCESS_PROOF"
          : "NOT_PROVEN",
    note:
      "Health appleIap boolean is definitive for the running Node process. Coolify env-name presence proves Coolify stores the keys but not that the current container process.env loaded them until health exposes appleIap or a verify call returns a non-credentials error.",
  };

  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.log(JSON.stringify({ status: "ERROR", message: e instanceof Error ? e.message : String(e) }));
  process.exit(1);
});
