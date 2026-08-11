import "dotenv/config";
import { SignJWT, importPKCS8 } from "jose";

async function normalizePem(raw: string): Promise<string> {
  const trimmed = raw.trim();
  let text = trimmed;
  if (!text.includes("BEGIN PRIVATE KEY")) {
    try {
      text = Buffer.from(trimmed, "base64").toString("utf-8");
    } catch {
      /* fall through */
    }
  }
  if (!text.includes("BEGIN PRIVATE KEY")) {
    const body = trimmed.replace(/\s+/g, "");
    const lines: string[] = [];
    for (let i = 0; i < body.length; i += 64) lines.push(body.slice(i, i + 64));
    text = `-----BEGIN PRIVATE KEY-----\n${lines.join("\n")}\n-----END PRIVATE KEY-----\n`;
  }
  return text;
}

async function main(): Promise<void> {
  const issuerId = process.env.APP_STORE_CONNECT_ISSUER_ID?.trim();
  const keyId = process.env.APP_STORE_CONNECT_KEY_ID?.trim();
  const rawKey = process.env.APP_STORE_CONNECT_PRIVATE_KEY;
  if (!issuerId || !keyId || !rawKey) {
    console.log(JSON.stringify({ status: "MISSING_CREDS", issuerId: !!issuerId, keyId: !!keyId, privateKey: !!rawKey }));
    process.exit(2);
  }

  const pem = await normalizePem(rawKey);
  const privateKey = await importPKCS8(pem, "ES256");
  const now = Math.floor(Date.now() / 1000);
  const jwt = await new SignJWT({ aud: "appstoreconnect-v1" })
    .setProtectedHeader({ alg: "ES256", kid: keyId, typ: "JWT" })
    .setIssuer(issuerId)
    .setIssuedAt(now)
    .setExpirationTime(now + 900)
    .sign(privateKey);

  const bundleId = "com.elixstarlive.app";
  const headers = { Authorization: `Bearer ${jwt}`, Accept: "application/json" };

  const appsUrl = `https://api.appstoreconnect.apple.com/v1/apps?filter[bundleId]=${encodeURIComponent(bundleId)}`;
  const appsRes = await fetch(appsUrl, { headers });
  if (!appsRes.ok) {
    console.log(JSON.stringify({ status: "APPS_HTTP_" + appsRes.status, body: (await appsRes.text()).slice(0, 500) }));
    process.exit(3);
  }
  const appsJson = (await appsRes.json()) as { data?: Array<{ id: string; attributes?: Record<string, unknown> }> };
  const app = appsJson.data?.[0];
  if (!app) {
    console.log(JSON.stringify({ status: "NO_APP_MATCH", bundleId }));
    process.exit(4);
  }
  const appId = app.id;
  const appName = (app.attributes as { name?: string } | undefined)?.name;

  const buildsUrl = `https://api.appstoreconnect.apple.com/v1/builds?filter[app]=${appId}&sort=-uploadedDate&limit=5&include=preReleaseVersion`;
  const buildsRes = await fetch(buildsUrl, { headers });
  if (!buildsRes.ok) {
    console.log(JSON.stringify({ status: "BUILDS_HTTP_" + buildsRes.status, body: (await buildsRes.text()).slice(0, 500) }));
    process.exit(5);
  }
  const buildsJson = (await buildsRes.json()) as {
    data?: Array<{
      id: string;
      attributes?: {
        version?: string;
        uploadedDate?: string;
        expirationDate?: string;
        expired?: boolean;
        processingState?: string;
        usesNonExemptEncryption?: unknown;
      };
      relationships?: {
        preReleaseVersion?: { data?: { id: string } };
      };
    }>;
    included?: Array<{ type: string; id: string; attributes?: Record<string, unknown> }>;
  };

  const preMap = new Map<string, string>();
  for (const inc of buildsJson.included ?? []) {
    if (inc.type === "preReleaseVersions") {
      const v = (inc.attributes as { version?: string } | undefined)?.version;
      if (v) preMap.set(inc.id, v);
    }
  }

  const rows = (buildsJson.data ?? []).map((b) => {
    const preId = b.relationships?.preReleaseVersion?.data?.id;
    return {
      id: b.id,
      versionShort: preId ? preMap.get(preId) : undefined,
      buildNumber: b.attributes?.version,
      uploaded: b.attributes?.uploadedDate,
      expires: b.attributes?.expirationDate,
      expired: b.attributes?.expired,
      processingState: b.attributes?.processingState,
    };
  });

  console.log(JSON.stringify({ status: "OK", appId, appName, bundleId, builds: rows }, null, 2));
}

main().catch((err) => {
  console.log(JSON.stringify({ status: "ERROR", message: err instanceof Error ? err.message : String(err) }));
  process.exit(1);
});
