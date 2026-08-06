/**
 * Fill missing en-GB localizations on App Store Connect IAPs so StoreKit
 * can return products (fixes MISSING_METADATA / empty products on iOS).
 * Uses APP_STORE_CONNECT_* from .env.
 * Usage: npx tsx server/scripts/fillAscIapLocalizations.ts
 */
import "dotenv/config";
import { SignJWT, importPKCS8 } from "jose";
import { writeFileSync } from "node:fs";

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

const LOC_BY_PRODUCT: Record<string, { name: string; description: string }> = {
  coins100: {
    name: "100 Coins",
    description: "100 coins for gifts and tips in Elix Star Live.",
  },
  coins500: {
    name: "500 Coins",
    description: "500 coins for gifts and tips in Elix Star Live.",
  },
  coins1000: {
    name: "1,000 Coins",
    description: "1,000 coins for gifts and tips in Elix Star Live.",
  },
  coins5000: {
    name: "5,000 Coins",
    description: "5,000 coins for gifts and tips in Elix Star Live.",
  },
  coins10000: {
    name: "10,000 Coins",
    description: "10,000 coins for gifts and tips in Elix Star Live.",
  },
  coins50000: {
    name: "50,000 Coins",
    description: "50,000 coins for gifts and tips in Elix Star Live.",
  },
  coins100000: {
    name: "100,000 Coins",
    description: "100,000 coins for gifts and tips in Elix Star Live.",
  },
  coins150000: {
    name: "150,000 Coins",
    description: "150,000 coins for gifts and tips in Elix Star Live.",
  },
  coins200000: {
    name: "200,000 Coins",
    description: "200,000 coins for gifts and tips in Elix Star Live.",
  },
  coins350000: {
    name: "350,000 Coins",
    description: "350,000 coins for gifts and tips in Elix Star Live.",
  },
  "com.elixstarlive.promote_views": {
    name: "Promote Views",
    description: "Promote your content with views on Elix Star Live.",
  },
  "com.elixstarlive.promote_likes": {
    name: "Promote Likes",
    description: "Promote your content with likes on Elix Star Live.",
  },
  "com.elixstarlive.promote_profile": {
    name: "Promote Profile",
    description: "Promote your profile on Elix Star Live.",
  },
  "com.elixstarlive.promote_followers": {
    name: "Promote Followers",
    description: "Promote your profile to gain followers on Elix Star Live.",
  },
  "com.elixstarlive.membership": {
    name: "Creator Membership",
    description: "Monthly creator membership for Elix Star Live.",
  },
};

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
    .setExpirationTime(now + 1200)
    .sign(privateKey);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${jwt}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  const appsRes = await fetch(
    "https://api.appstoreconnect.apple.com/v1/apps?filter[bundleId]=com.elixstarlive.app",
    { headers },
  );
  const appsJson = (await appsRes.json()) as { data?: Array<{ id: string }> };
  const appId = appsJson.data?.[0]?.id;
  if (!appId) {
    console.log(JSON.stringify({ status: "NO_APP_MATCH" }));
    process.exit(3);
  }

  const products: Array<{
    id: string;
    productId: string;
    state: string;
    name: string;
  }> = [];
  let next: string | undefined =
    `https://api.appstoreconnect.apple.com/v1/apps/${appId}/inAppPurchasesV2?limit=200`;
  while (next) {
    const r = await fetch(next, { headers });
    const j = (await r.json()) as {
      data?: Array<{
        id: string;
        attributes?: { productId?: string; state?: string; name?: string };
      }>;
      links?: { next?: string };
    };
    for (const p of j.data ?? []) {
      products.push({
        id: p.id,
        productId: String(p.attributes?.productId ?? ""),
        state: String(p.attributes?.state ?? ""),
        name: String(p.attributes?.name ?? ""),
      });
    }
    next = j.links?.next;
  }

  const results: Array<Record<string, unknown>> = [];
  for (const p of products) {
    const meta = LOC_BY_PRODUCT[p.productId];
    const row: Record<string, unknown> = {
      productId: p.productId,
      id: p.id,
      stateBefore: p.state,
    };
    if (!meta) {
      row.loc = "no_name_map";
      results.push(row);
      continue;
    }

    const lr = await fetch(
      `https://api.appstoreconnect.apple.com/v1/inAppPurchases/${p.id}/inAppPurchaseLocalizations`,
      { headers },
    );
    const lj = (await lr.json()) as {
      data?: Array<{ attributes?: { locale?: string } }>;
    };
    const locs = lj.data ?? [];
    const hasEn = locs.some((x) =>
      String(x.attributes?.locale ?? "").toLowerCase().startsWith("en"),
    );

    if (hasEn) {
      row.loc = "already";
    } else {
      const body = {
        data: {
          type: "inAppPurchaseLocalizations",
          attributes: {
            name: meta.name,
            locale: "en-GB",
            description: meta.description,
          },
          relationships: {
            inAppPurchaseV2: {
              data: { type: "inAppPurchases", id: p.id },
            },
          },
        },
      };
      const cr = await fetch(
        "https://api.appstoreconnect.apple.com/v1/inAppPurchaseLocalizations",
        { method: "POST", headers, body: JSON.stringify(body) },
      );
      const ct = await cr.text();
      row.loc = cr.status === 201 ? "created" : `fail_${cr.status}`;
      if (cr.status !== 201) row.locBody = ct.slice(0, 300);
    }

    const pr = await fetch(
      `https://api.appstoreconnect.apple.com/v1/inAppPurchases/${p.id}/iapPriceSchedule?include=manualPrices`,
      { headers },
    );
    const pj = (await pr.json()) as { included?: Array<{ type: string }> };
    row.manualPrices = (pj.included ?? []).filter(
      (x) => x.type === "inAppPurchasePrices",
    ).length;

    const rr = await fetch(
      `https://api.appstoreconnect.apple.com/v1/inAppPurchases/${p.id}`,
      { headers },
    );
    const jj = (await rr.json()) as {
      data?: { attributes?: { state?: string } };
    };
    row.stateAfter = jj.data?.attributes?.state ?? null;
    results.push(row);
  }

  // Subscription group products (membership may live here)
  const sgRes = await fetch(
    `https://api.appstoreconnect.apple.com/v1/apps/${appId}/subscriptionGroups?limit=50&include=subscriptions`,
    { headers },
  );
  const sgJson = (await sgRes.json()) as {
    included?: Array<{
      id: string;
      type: string;
      attributes?: { productId?: string; name?: string; state?: string };
    }>;
  };
  const subs = (sgJson.included ?? []).filter((x) => x.type === "subscriptions");
  for (const s of subs) {
    const productId = String(s.attributes?.productId ?? "");
    const meta = LOC_BY_PRODUCT[productId];
    const row: Record<string, unknown> = {
      kind: "subscription",
      productId,
      id: s.id,
      stateBefore: s.attributes?.state,
    };
    if (!meta) {
      row.loc = "no_name_map";
      results.push(row);
      continue;
    }
    const lr = await fetch(
      `https://api.appstoreconnect.apple.com/v1/subscriptions/${s.id}/subscriptionLocalizations`,
      { headers },
    );
    const lj = (await lr.json()) as {
      data?: Array<{ attributes?: { locale?: string } }>;
    };
    const hasEn = (lj.data ?? []).some((x) =>
      String(x.attributes?.locale ?? "").toLowerCase().startsWith("en"),
    );
    if (hasEn) {
      row.loc = "already";
    } else {
      const body = {
        data: {
          type: "subscriptionLocalizations",
          attributes: {
            name: meta.name,
            locale: "en-GB",
            description: meta.description,
          },
          relationships: {
            subscription: {
              data: { type: "subscriptions", id: s.id },
            },
          },
        },
      };
      const cr = await fetch(
        "https://api.appstoreconnect.apple.com/v1/subscriptionLocalizations",
        { method: "POST", headers, body: JSON.stringify(body) },
      );
      const ct = await cr.text();
      row.loc = cr.status === 201 ? "created" : `fail_${cr.status}`;
      if (cr.status !== 201) row.locBody = ct.slice(0, 300);
    }
    results.push(row);
  }

  const out = {
    checkedAt: new Date().toISOString(),
    appId,
    results,
    stillMissingMetadata: results.filter((r) => r.stateAfter === "MISSING_METADATA")
      .map((r) => r.productId),
    readyOrBetter: results.filter(
      (r) =>
        typeof r.stateAfter === "string" &&
        r.stateAfter !== "MISSING_METADATA" &&
        r.stateAfter !== "MISSING_METADATA".toLowerCase(),
    ),
  };
  const path = `docs/evidence/asc-iap-fill-localizations-${Date.now()}.json`;
  writeFileSync(path, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  console.log("WROTE", path);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
