/**
 * Dump the raw ASC inAppPurchasesV2 payload for the app so we can see whether
 * any coin/promote products exist under a different attribute path.
 * Read-only.
 */
import "dotenv/config";
import { SignJWT, importPKCS8 } from "jose";
import { requireEnv } from "./_env.ts";

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
  const issuerId = requireEnv("APP_STORE_CONNECT_ISSUER_ID");
  const keyId = requireEnv("APP_STORE_CONNECT_KEY_ID");
  const pem = await normalizePem(requireEnv("APP_STORE_CONNECT_PRIVATE_KEY"));
  const privateKey = await importPKCS8(pem, "ES256");
  const now = Math.floor(Date.now() / 1000);
  const jwt = await new SignJWT({ aud: "appstoreconnect-v1" })
    .setProtectedHeader({ alg: "ES256", kid: keyId, typ: "JWT" })
    .setIssuer(issuerId)
    .setIssuedAt(now)
    .setExpirationTime(now + 900)
    .sign(privateKey);
  const headers = { Authorization: `Bearer ${jwt}`, Accept: "application/json" };
  const appId = "6794781473";

  console.log("--- v1/apps/{id}/inAppPurchasesV2 (raw first response) ---");
  const iapUrl = `https://api.appstoreconnect.apple.com/v1/apps/${appId}/inAppPurchasesV2?limit=200`;
  const iapRes = await fetch(iapUrl, { headers });
  console.log("HTTP", iapRes.status);
  const iapJson = await iapRes.json();
  console.log(JSON.stringify(iapJson, null, 2));

  console.log("\n--- v1/apps/{id}/inAppPurchases (legacy V1 endpoint) ---");
  const iapV1Url = `https://api.appstoreconnect.apple.com/v1/apps/${appId}/inAppPurchases?limit=200`;
  const iapV1Res = await fetch(iapV1Url, { headers });
  console.log("HTTP", iapV1Res.status);
  const iapV1Json = await iapV1Res.json();
  console.log(JSON.stringify(iapV1Json, null, 2));

  console.log("\n--- v1/apps/{id}/appAvailability (region/pricing gate) ---");
  const avRes = await fetch(
    `https://api.appstoreconnect.apple.com/v1/apps/${appId}?include=appInfos,appStoreVersions&fields[appInfos]=state,name&fields[appStoreVersions]=versionString,appStoreState,platform,releaseType`,
    { headers },
  );
  console.log("HTTP", avRes.status);
  const avJson = await avRes.json();
  console.log(JSON.stringify(avJson, null, 2));
}

main().catch((e) => {
  console.log(JSON.stringify({ status: "ERROR", message: e instanceof Error ? e.message : String(e) }));
  process.exit(1);
});
