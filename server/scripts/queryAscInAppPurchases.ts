/**
 * Query App Store Connect for the app's full in-app purchase inventory
 * (consumables, non-consumables, subscriptions) and their current state.
 * Read-only. Uses APP_STORE_CONNECT_* from .env.
 * Usage: npx tsx server/scripts/queryAscInAppPurchases.ts
 */
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

interface AscListResponse<T = Record<string, unknown>> {
  data?: T[];
  included?: Array<{ type: string; id: string; attributes?: Record<string, unknown> }>;
  links?: { next?: string };
}

async function main(): Promise<void> {
  const issuerId = process.env.APP_STORE_CONNECT_ISSUER_ID?.trim();
  const keyId = process.env.APP_STORE_CONNECT_KEY_ID?.trim();
  const rawKey = process.env.APP_STORE_CONNECT_PRIVATE_KEY;
  if (!issuerId || !keyId || !rawKey) {
    console.log(JSON.stringify({ status: "MISSING_CREDS" }));
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
  const headers = { Authorization: `Bearer ${jwt}`, Accept: "application/json" };
  const bundleId = "com.elixstarlive.app";

  const appsRes = await fetch(
    `https://api.appstoreconnect.apple.com/v1/apps?filter[bundleId]=${encodeURIComponent(bundleId)}`,
    { headers },
  );
  const appsJson = (await appsRes.json()) as AscListResponse<{ id: string; attributes?: Record<string, unknown> }>;
  const app = appsJson.data?.[0];
  if (!app) {
    console.log(JSON.stringify({ status: "NO_APP_MATCH" }));
    process.exit(3);
  }
  const appId = app.id;

  async function fetchAll(url: string): Promise<{ data: unknown[]; included: unknown[] }> {
    const outData: unknown[] = [];
    const outIncluded: unknown[] = [];
    let next: string | undefined = url;
    while (next) {
      const r = await fetch(next, { headers });
      if (!r.ok) {
        outData.push({ __httpError: r.status, body: (await r.text()).slice(0, 400) });
        break;
      }
      const j = (await r.json()) as AscListResponse;
      if (Array.isArray(j.data)) outData.push(...j.data);
      if (Array.isArray(j.included)) outIncluded.push(...j.included);
      next = j.links?.next;
    }
    return { data: outData, included: outIncluded };
  }

  const iapsV1 = await fetchAll(
    `https://api.appstoreconnect.apple.com/v1/apps/${appId}/inAppPurchasesV2?limit=200`,
  );
  const subs = await fetchAll(
    `https://api.appstoreconnect.apple.com/v1/apps/${appId}/subscriptionGroups?limit=200&include=subscriptions`,
  );

  const iapRows = (iapsV1.data as Array<{
    id: string;
    attributes?: {
      name?: string;
      productId?: string;
      inAppPurchaseType?: string;
      state?: string;
      reviewNote?: string;
      familySharable?: boolean;
    };
  }>).map((row) => ({
    id: row.id,
    productId: row.attributes?.productId,
    name: row.attributes?.name,
    type: row.attributes?.inAppPurchaseType,
    state: row.attributes?.state,
  }));

  const subGroups = (subs.data as Array<{
    id: string;
    attributes?: { referenceName?: string };
    relationships?: { subscriptions?: { data?: Array<{ id: string }> } };
  }>).map((g) => ({
    id: g.id,
    referenceName: g.attributes?.referenceName,
    subscriptionIds: g.relationships?.subscriptions?.data?.map((d) => d.id) ?? [],
  }));

  const subIncluded = (subs.included as Array<{
    id: string;
    type: string;
    attributes?: { productId?: string; name?: string; state?: string; subscriptionPeriod?: string };
  }>).filter((i) => i.type === "subscriptions").map((s) => ({
    id: s.id,
    productId: s.attributes?.productId,
    name: s.attributes?.name,
    state: s.attributes?.state,
    period: s.attributes?.subscriptionPeriod,
  }));

  const clientCoinIds = [
    "coins100", "coins500", "coins500a", "coins1000", "coins5000",
    "coins10000", "coins50000", "coins100000", "coins150000", "coins200000", "coins350000",
  ];
  const clientPromoteIds = [
    "com.elixstarlive.promote_views",
    "com.elixstarlive.promote_likes",
    "com.elixstarlive.promote_profile",
    "com.elixstarlive.promote_followers",
  ];
  const clientMembershipId = "com.elixstarlive.membership";

  const ascProductIds = new Set(iapRows.map((r) => r.productId).filter(Boolean) as string[]);
  const missingCoinIds = clientCoinIds.filter((id) => !ascProductIds.has(id));
  const missingPromoteIds = clientPromoteIds.filter((id) => !ascProductIds.has(id));
  const ascSubIds = new Set(subIncluded.map((s) => s.productId).filter(Boolean) as string[]);
  const membershipPresent = ascSubIds.has(clientMembershipId);

  const payload = {
    status: "OK",
    bundleId,
    appId,
    totals: {
      iapV2Products: iapRows.length,
      subscriptionGroups: subGroups.length,
      subscriptions: subIncluded.length,
    },
    clientExpected: {
      coinProductIds: clientCoinIds,
      promoteProductIds: clientPromoteIds,
      membershipProductId: clientMembershipId,
    },
    clientVsAsc: {
      coinIdsMissingFromAsc: missingCoinIds,
      promoteIdsMissingFromAsc: missingPromoteIds,
      membershipPresent,
      extraAscProductIds: [...ascProductIds].filter(
        (id) => !clientCoinIds.includes(id) && !clientPromoteIds.includes(id),
      ),
    },
    inAppPurchasesV2: iapRows,
    subscriptionGroups: subGroups,
    subscriptions: subIncluded,
  };
  const text = JSON.stringify(payload, null, 2);
  console.log(text);
  const outArg = process.argv[2];
  if (outArg) {
    const fs = await import("fs");
    fs.writeFileSync(outArg, text, "utf8");
    console.error(`wrote ${outArg} (${text.length} bytes)`);
  }
}

main().catch((e) => {
  console.log(JSON.stringify({ status: "ERROR", message: e instanceof Error ? e.message : String(e) }));
  process.exit(1);
});
