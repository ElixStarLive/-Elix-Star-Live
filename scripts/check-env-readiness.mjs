import fs from "fs";

const raw = fs.readFileSync(".env", "utf8");

function get(k) {
  if (k === "APPLE_PRIVATE_KEY" || k === "GOOGLE_SERVICE_ACCOUNT_JSON") {
    const m = raw.match(new RegExp(k + '="([\\s\\S]*?)"'));
    if (m) return m[1].trim();
    const m2 = raw.match(new RegExp("^" + k + "=(.*)$", "m"));
    return m2 ? m2[1].trim() : null;
  }
  const m = raw.match(new RegExp("^" + k + "=(.*)$", "m"));
  if (!m) return null;
  let v = m[1].trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1);
  }
  return v;
}

function present(k) {
  const v = get(k);
  if (v == null) return { key: k, status: "ABSENT" };
  if (!String(v).trim()) return { key: k, status: "EMPTY" };
  return { key: k, status: "PRESENT", len: String(v).trim().length };
}

function check(k, opts = {}) {
  const base = present(k);
  if (base.status !== "PRESENT") return base;
  const v = get(k);
  const r = { ...base };
  if (opts.uuid) {
    r.format = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
      ? "OK"
      : "BAD_UUID";
  }
  if (opts.pem) {
    r.format =
      v.includes("BEGIN PRIVATE KEY") && v.includes("END PRIVATE KEY") ? "OK" : "BAD_PEM";
  }
  if (opts.exact) {
    r.format = v === opts.exact ? "OK" : "UNEXPECTED_VALUE";
  }
  if (opts.keyId || opts.team) {
    r.format = /^[A-Z0-9]{10}$/.test(v) ? "OK" : "CHECK";
  }
  if (opts.minLen) {
    r.format = v.length >= opts.minLen ? "OK" : "TOO_SHORT";
  }
  if (opts.prefix) {
    r.format = v.startsWith(opts.prefix) ? "OK" : "BAD_PREFIX";
  }
  if (opts.wss) {
    r.format = /^wss:\/\//i.test(v) ? "OK" : "NOT_WSS";
  }
  if (opts.https) {
    r.format = /^https:\/\//i.test(v) ? "OK" : "NOT_HTTPS";
  }
  if (opts.equalsKey) {
    r.format = v === get(opts.equalsKey) ? "OK_MATCH" : "MISMATCH";
  }
  if (opts.json) {
    try {
      JSON.parse(v.replace(/\\n/g, "\n"));
      r.format = "OK_JSON";
    } catch {
      // Often stored as single-line escaped JSON — presence is enough if starts with {
      r.format = v.trim().startsWith("{") ? "JSON_LIKELY" : "BAD_JSON";
    }
  }
  return r;
}

const names = [...raw.matchAll(/^([A-Z0-9_]+)=/gm)].map((m) => m[1]);
const counts = {};
for (const n of names) counts[n] = (counts[n] || 0) + 1;
const dups = Object.entries(counts)
  .filter(([, c]) => c > 1)
  .map(([n, c]) => `${n} x${c}`);

const groups = {
  appleIap: [
    check("APPLE_ISSUER_ID", { uuid: true }),
    check("APPLE_KEY_ID", { keyId: true }),
    check("APPLE_PRIVATE_KEY", { pem: true }),
    check("APPLE_BUNDLE_ID", { exact: "com.elixstarlive.app" }),
    check("APPLE_TEAM_ID", { team: true }),
    check("APPLE_IAP_NOTIFICATION_SECRET"),
    check("APPLE_IAP_REQUIRED"),
  ],
  coreProd: [
    check("DATABASE_URL"),
    check("JWT_SECRET", { minLen: 32 }),
    check("VALKEY_URL"),
    check("LIVEKIT_URL", { wss: true }),
    check("LIVEKIT_API_KEY"),
    check("LIVEKIT_API_SECRET"),
    check("BUNNY_STORAGE_ZONE"),
    check("BUNNY_STORAGE_API_KEY"),
    check("GOOGLE_SERVICE_ACCOUNT_JSON"),
    check("GOOGLE_PLAY_PACKAGE_NAME", { exact: "com.elixstarlive.app" }),
    check("STRIPE_SECRET_KEY", { prefix: "sk_" }),
    check("STRIPE_WEBHOOK_SECRET", { prefix: "whsec_" }),
  ],
  clientVite: [
    check("VITE_API_URL", { https: true }),
    check("VITE_WS_URL"),
    check("VITE_LIVEKIT_URL", { equalsKey: "LIVEKIT_URL" }),
  ],
  optionalWarn: [
    check("GOOGLE_RTDN_WEBHOOK_SECRET"),
    check("BUNNY_STREAM_API_KEY"),
    check("STRIPE_PUBLISHABLE_KEY", { prefix: "pk_" }),
  ],
};

function groupOk(rows, requiredKeys) {
  return requiredKeys.every((k) => {
    const row = rows.find((r) => r.key === k);
    if (!row || row.status !== "PRESENT") return false;
    if (row.format && !String(row.format).startsWith("OK") && row.format !== "JSON_LIKELY" && row.format !== "CHECK") {
      return false;
    }
    return true;
  });
}

const appleRequiredKeys = [
  "APPLE_ISSUER_ID",
  "APPLE_KEY_ID",
  "APPLE_PRIVATE_KEY",
  "APPLE_BUNDLE_ID",
];
const appleReady = groupOk(groups.appleIap, appleRequiredKeys);
const appleIapRequiredFlag = get("APPLE_IAP_REQUIRED");
const coreReady = groupOk(
  groups.coreProd,
  groups.coreProd.map((r) => r.key),
);

const issues = [];
for (const g of Object.values(groups)) {
  for (const r of g) {
    if (r.status !== "PRESENT") issues.push(`${r.key}: ${r.status}`);
    else if (
      r.format &&
      !String(r.format).startsWith("OK") &&
      r.format !== "JSON_LIKELY" &&
      r.format !== "CHECK"
    ) {
      issues.push(`${r.key}: ${r.format}`);
    }
  }
}

console.log(
  JSON.stringify(
    {
      scope: "LOCAL .env only — no secret values",
      duplicates: dups,
      appleIapReady: appleReady,
      appleIapRequiredFlag:
        appleIapRequiredFlag == null
          ? "ABSENT"
          : appleIapRequiredFlag === "1"
            ? "SET_TO_1"
            : `SET_TO_${appleIapRequiredFlag}`,
      coreProdReady: coreReady,
      livekitClientServerMatch: get("LIVEKIT_URL") === get("VITE_LIVEKIT_URL"),
      issues,
      groups,
      note:
        "This does not prove Coolify/runtime. APPLE_IAP_REQUIRED should be 1 in production if you want boot-time fail-closed for Apple.",
    },
    null,
    2,
  ),
);
