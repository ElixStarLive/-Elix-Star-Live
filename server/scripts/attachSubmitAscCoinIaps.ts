/**
 * Attach/submit coin IAPs so StoreKit can vend them in TestFlight.
 * Uses APP_STORE_CONNECT_* from .env.
 */
import "dotenv/config";
import { SignJWT, importPKCS8 } from "jose";
import { writeFileSync } from "node:fs";
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
  const issuerId = requireEnv("APP_STORE_CONNECT_ISSUER_ID").trim();
  const keyId = requireEnv("APP_STORE_CONNECT_KEY_ID").trim();
  const privateKey = await importPKCS8(
    await normalizePem(requireEnv("APP_STORE_CONNECT_PRIVATE_KEY")),
    "ES256",
  );
  const now = Math.floor(Date.now() / 1000);
  const jwt = await new SignJWT({ aud: "appstoreconnect-v1" })
    .setProtectedHeader({ alg: "ES256", kid: keyId, typ: "JWT" })
    .setIssuer(issuerId)
    .setIssuedAt(now)
    .setExpirationTime(now + 1800)
    .sign(privateKey);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${jwt}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  const appId = "6794781473";
  const versionId = "2eed2666-f7d3-42a2-91b7-3a90aa5b2b0d";

  const listRes = await fetch(
    `https://api.appstoreconnect.apple.com/v1/apps/${appId}/inAppPurchasesV2?limit=50`,
    { headers },
  );
  const listJson = (await listRes.json()) as {
    data?: Array<{
      id: string;
      attributes?: { productId?: string; state?: string };
      links?: { self?: string };
    }>;
  };
  const all = listJson.data ?? [];
  const coins = all.filter((p) =>
    String(p.attributes?.productId ?? "").startsWith("coins"),
  );

  const out: Record<string, unknown> = {
    at: new Date().toISOString(),
    iapCount: all.length,
    coinCount: coins.length,
    coinStates: coins.map((c) => ({
      id: c.id,
      productId: c.attributes?.productId,
      state: c.attributes?.state,
    })),
  };

  // Ensure baseTerritory GBR on each coin price schedule
  const baseTerritoryResults: Array<Record<string, unknown>> = [];
  for (const c of coins) {
    const getBt = await fetch(
      `https://api.appstoreconnect.apple.com/v1/inAppPurchasePriceSchedules/${c.id}/baseTerritory`,
      { headers },
    );
    const btText = await getBt.text();
    let current: string | null = null;
    try {
      current = (JSON.parse(btText) as { data?: { id?: string } }).data?.id ?? null;
    } catch {
      current = null;
    }

    let setHttp: number | null = null;
    let setBody = "";
    if (current !== "GBR") {
      // PATCH schedule base territory via relationship
      const patch = await fetch(
        `https://api.appstoreconnect.apple.com/v1/inAppPurchasePriceSchedules/${c.id}/relationships/baseTerritory`,
        {
          method: "PATCH",
          headers,
          body: JSON.stringify({
            data: { type: "territories", id: "GBR" },
          }),
        },
      );
      setHttp = patch.status;
      setBody = (await patch.text()).slice(0, 400);
      if (patch.status >= 400) {
        // alternate: create/replace schedule
        const create = await fetch(
          "https://api.appstoreconnect.apple.com/v1/inAppPurchasePriceSchedules",
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              data: {
                type: "inAppPurchasePriceSchedules",
                relationships: {
                  inAppPurchase: {
                    data: { type: "inAppPurchases", id: c.id },
                  },
                  baseTerritory: {
                    data: { type: "territories", id: "GBR" },
                  },
                },
              },
            }),
          },
        );
        setHttp = create.status;
        setBody = (await create.text()).slice(0, 400);
      }
    }
    baseTerritoryResults.push({
      productId: c.attributes?.productId,
      current,
      setHttp,
      setBody,
    });
  }
  out.baseTerritory = baseTerritoryResults;

  // Submit each READY coin via inAppPurchaseSubmissions
  const submitResults: Array<Record<string, unknown>> = [];
  for (const c of coins) {
    if (c.attributes?.state !== "READY_TO_SUBMIT") {
      submitResults.push({
        productId: c.attributes?.productId,
        skipped: c.attributes?.state,
      });
      continue;
    }
    const sr = await fetch(
      "https://api.appstoreconnect.apple.com/v1/inAppPurchaseSubmissions",
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          data: {
            type: "inAppPurchaseSubmissions",
            relationships: {
              inAppPurchaseV2: {
                data: { type: "inAppPurchases", id: c.id },
              },
            },
          },
        }),
      },
    );
    const st = await sr.text();
    let stateAfter: string | null = null;
    if (c.links?.self) {
      const self = await fetch(c.links.self, { headers });
      const sj = (await self.json()) as {
        data?: { attributes?: { state?: string } };
      };
      stateAfter = sj.data?.attributes?.state ?? null;
    }
    submitResults.push({
      productId: c.attributes?.productId,
      http: sr.status,
      body: st.slice(0, 350),
      stateAfter,
    });
  }
  out.submissions = submitResults;

  // Create (draft) review submission and attach coin IAPs — do NOT auto-submit app for review
  const existingSubs = await fetch(
    `https://api.appstoreconnect.apple.com/v1/reviewSubmissions?filter[app]=${appId}&filter[platform]=IOS&limit=10`,
    { headers },
  );
  const existingJson = (await existingSubs.json()) as {
    data?: Array<{ id: string; attributes?: { state?: string } }>;
  };
  out.existingReviewSubmissions = (existingJson.data ?? []).map((s) => ({
    id: s.id,
    state: s.attributes?.state,
  }));

  let reviewSubmissionId =
    (existingJson.data ?? []).find((s) =>
      ["READY_FOR_REVIEW", "UNRESOLVED_ISSUES", "WAITING_FOR_REVIEW"].includes(
        String(s.attributes?.state ?? ""),
      ),
    )?.id ??
    (existingJson.data ?? []).find(
      (s) => String(s.attributes?.state ?? "") === "READY_FOR_REVIEW",
    )?.id;

  if (!reviewSubmissionId) {
    // Prefer an open draft if any
    const open = (existingJson.data ?? []).find((s) => {
      const st = String(s.attributes?.state ?? "");
      return st !== "COMPLETE" && st !== "CANCELLED";
    });
    reviewSubmissionId = open?.id;
  }

  if (!reviewSubmissionId) {
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
              app: { data: { type: "apps", id: appId } },
            },
          },
        }),
      },
    );
    const createText = await create.text();
    out.createReviewSubmission = {
      http: create.status,
      body: createText.slice(0, 800),
    };
    try {
      reviewSubmissionId = (
        JSON.parse(createText) as { data?: { id?: string } }
      ).data?.id;
    } catch {
      reviewSubmissionId = undefined;
    }
  }

  out.reviewSubmissionId = reviewSubmissionId ?? null;

  const itemResults: Array<Record<string, unknown>> = [];
  if (reviewSubmissionId) {
    // Also try attaching the app store version
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
                data: { type: "reviewSubmissions", id: reviewSubmissionId },
              },
              appStoreVersion: {
                data: { type: "appStoreVersions", id: versionId },
              },
            },
          },
        }),
      },
    );
    itemResults.push({
      kind: "appStoreVersion",
      http: versionItem.status,
      body: (await versionItem.text()).slice(0, 400),
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
                  data: {
                    type: "reviewSubmissions",
                    id: reviewSubmissionId,
                  },
                },
                inAppPurchase: {
                  data: { type: "inAppPurchases", id: c.id },
                },
              },
            },
          }),
        },
      );
      itemResults.push({
        kind: "inAppPurchase",
        productId: c.attributes?.productId,
        http: item.status,
        body: (await item.text()).slice(0, 400),
      });
    }
  }
  out.reviewSubmissionItems = itemResults;

  // Refresh final states
  const refresh = await fetch(
    `https://api.appstoreconnect.apple.com/v1/apps/${appId}/inAppPurchasesV2?limit=50`,
    { headers },
  );
  const refreshJson = (await refresh.json()) as typeof listJson;
  out.finalStates = (refreshJson.data ?? []).map((p) => ({
    productId: p.attributes?.productId,
    state: p.attributes?.state,
  }));

  const path = `docs/evidence/asc-iap-attach-submit-${Date.now()}.json`;
  writeFileSync(path, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  console.log("WROTE", path);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
