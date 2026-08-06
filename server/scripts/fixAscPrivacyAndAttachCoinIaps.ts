/**
 * Fix ASC blockers that prevent coin IAPs from becoming StoreKit-available:
 * 1) Set en-GB Privacy Policy URL on App Information
 * 2) Create a draft iOS review submission and attach the app version + all coin IAPs
 * Does NOT auto-submit the app for App Review (no submitted:true).
 */
import "dotenv/config";
import { SignJWT, importPKCS8 } from "jose";
import { writeFileSync } from "node:fs";

const APP_ID = "6794781473";
const VERSION_ID = "2eed2666-f7d3-42a2-91b7-3a90aa5b2b0d";
const APP_INFO_LOC_ID = "96d14de4-9a41-4d68-9e5f-e6ce5adbb3f8";
const PRIVACY_URL = "https://www.elixstarlive.co.uk/privacy";
const SUPPORT_URL = "https://www.elixstarlive.co.uk/support";

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
  const issuerId = process.env.APP_STORE_CONNECT_ISSUER_ID!.trim();
  const keyId = process.env.APP_STORE_CONNECT_KEY_ID!.trim();
  const privateKey = await importPKCS8(
    await normalizePem(process.env.APP_STORE_CONNECT_PRIVATE_KEY!),
    "ES256",
  );
  const now = Math.floor(Date.now() / 1000);
  const jwt = await new SignJWT({ aud: "appstoreconnect-v1" })
    .setProtectedHeader({ alg: "ES256", kid: keyId, typ: "JWT" })
    .setIssuer(issuerId)
    .setIssuedAt(now - 30)
    .setExpirationTime(now + 1800)
    .sign(privateKey);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${jwt}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  const out: Record<string, unknown> = { at: new Date().toISOString() };

  // 1) Privacy policy URL
  const patchLoc = await fetch(
    `https://api.appstoreconnect.apple.com/v1/appInfoLocalizations/${APP_INFO_LOC_ID}`,
    {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        data: {
          type: "appInfoLocalizations",
          id: APP_INFO_LOC_ID,
          attributes: {
            privacyPolicyUrl: PRIVACY_URL,
          },
        },
      }),
    },
  );
  out.privacyPolicyPatch = {
    http: patchLoc.status,
    body: (await patchLoc.text()).slice(0, 800),
  };

  // Also set support URL on version localization if present / missing
  const verLocs = await fetch(
    `https://api.appstoreconnect.apple.com/v1/appStoreVersions/${VERSION_ID}/appStoreVersionLocalizations`,
    { headers },
  );
  const verLocJson = (await verLocs.json()) as {
    data?: Array<{
      id: string;
      attributes?: Record<string, unknown>;
    }>;
  };
  out.versionLocalizations = (verLocJson.data ?? []).map((l) => ({
    id: l.id,
    attrs: l.attributes,
  }));

  const supportPatches: Array<Record<string, unknown>> = [];
  for (const loc of verLocJson.data ?? []) {
    const attrs = loc.attributes ?? {};
    const needsSupport = !attrs.supportUrl;
    const needsDesc = !attrs.description;
    const needsKeywords = !attrs.keywords;
    const needsWhatsNew = !attrs.whatsNew;
    if (!needsSupport && !needsDesc) continue;
    const patchAttrs: Record<string, string> = {};
    if (needsSupport) patchAttrs.supportUrl = SUPPORT_URL;
    if (needsDesc) {
      patchAttrs.description =
        "Elix Star Live is a live streaming and short-video social app. Go live, watch creators, send gifts, and connect with the community.";
    }
    if (needsKeywords) patchAttrs.keywords = "live,streaming,video,social,gifts,creator";
    if (needsWhatsNew) {
      patchAttrs.whatsNew = "Bug fixes and performance improvements.";
    }
    // marketingUrl optional
    if (!attrs.marketingUrl) patchAttrs.marketingUrl = "https://www.elixstarlive.co.uk";
    const pr = await fetch(
      `https://api.appstoreconnect.apple.com/v1/appStoreVersionLocalizations/${loc.id}`,
      {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          data: {
            type: "appStoreVersionLocalizations",
            id: loc.id,
            attributes: patchAttrs,
          },
        }),
      },
    );
    supportPatches.push({
      id: loc.id,
      http: pr.status,
      body: (await pr.text()).slice(0, 500),
      patchAttrs,
    });
  }
  out.versionLocalizationPatches = supportPatches;

  // 2) List coin IAPs
  const listRes = await fetch(
    `https://api.appstoreconnect.apple.com/v1/apps/${APP_ID}/inAppPurchasesV2?limit=50`,
    { headers },
  );
  const listJson = (await listRes.json()) as {
    data?: Array<{
      id: string;
      attributes?: { productId?: string; state?: string };
    }>;
  };
  const coins = (listJson.data ?? []).filter((p) =>
    String(p.attributes?.productId ?? "").startsWith("coins"),
  );
  out.coins = coins.map((c) => ({
    id: c.id,
    productId: c.attributes?.productId,
    state: c.attributes?.state,
  }));

  // 3) Create or reuse draft review submission
  const existing = await fetch(
    `https://api.appstoreconnect.apple.com/v1/reviewSubmissions?filter[app]=${APP_ID}&filter[platform]=IOS&limit=10`,
    { headers },
  );
  const existingJson = (await existing.json()) as {
    data?: Array<{ id: string; attributes?: { state?: string } }>;
  };
  let submissionId = (existingJson.data ?? []).find((s) => {
    const st = String(s.attributes?.state ?? "");
    return st !== "COMPLETE" && st !== "CANCELLED";
  })?.id;

  if (!submissionId) {
    const create = await fetch(
      "https://api.appstoreconnect.apple.com/v1/reviewSubmissions",
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          data: {
            type: "reviewSubmissions",
            attributes: { platform: "IOS" },
            relationships: {
              app: { data: { type: "apps", id: APP_ID } },
            },
          },
        }),
      },
    );
    const createText = await create.text();
    out.createSubmission = { http: create.status, body: createText.slice(0, 800) };
    try {
      submissionId = (JSON.parse(createText) as { data?: { id?: string } }).data
        ?.id;
    } catch {
      submissionId = undefined;
    }
  }
  out.submissionId = submissionId ?? null;

  const items: Array<Record<string, unknown>> = [];
  if (submissionId) {
    const versionItem = await fetch(
      "https://api.appstoreconnect.apple.com/v1/reviewSubmissionItems",
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          data: {
            type: "reviewSubmissionItems",
            relationships: {
              reviewSubmission: {
                data: { type: "reviewSubmissions", id: submissionId },
              },
              appStoreVersion: {
                data: { type: "appStoreVersions", id: VERSION_ID },
              },
            },
          },
        }),
      },
    );
    items.push({
      kind: "appStoreVersion",
      http: versionItem.status,
      body: (await versionItem.text()).slice(0, 500),
    });

    for (const c of coins) {
      const item = await fetch(
        "https://api.appstoreconnect.apple.com/v1/reviewSubmissionItems",
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            data: {
              type: "reviewSubmissionItems",
              relationships: {
                reviewSubmission: {
                  data: { type: "reviewSubmissions", id: submissionId },
                },
                inAppPurchase: {
                  data: { type: "inAppPurchases", id: c.id },
                },
              },
            },
          }),
        },
      );
      items.push({
        kind: "iap",
        productId: c.attributes?.productId,
        http: item.status,
        body: (await item.text()).slice(0, 400),
      });
    }
  }
  out.items = items;

  // Retry standalone IAP submission for coins100 (expect first-consumable-on-version until version is submitted)
  const retrySubmit = await fetch(
    "https://api.appstoreconnect.apple.com/v1/inAppPurchaseSubmissions",
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        data: {
          type: "inAppPurchaseSubmissions",
          relationships: {
            inAppPurchaseV2: {
              data: { type: "inAppPurchases", id: "6797675268" },
            },
          },
        },
      }),
    },
  );
  out.retryIapSubmit = {
    http: retrySubmit.status,
    body: (await retrySubmit.text()).slice(0, 1200),
  };

  // Verify privacy URL stuck
  const verifyLoc = await fetch(
    `https://api.appstoreconnect.apple.com/v1/appInfoLocalizations/${APP_INFO_LOC_ID}`,
    { headers },
  );
  out.privacyVerify = JSON.parse(await verifyLoc.text());

  const path = `docs/evidence/asc-privacy-and-iap-attach-${Date.now()}.json`;
  writeFileSync(path, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  console.log("WROTE", path);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
