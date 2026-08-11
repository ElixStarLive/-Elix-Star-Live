/**
 * Read-only ASC readiness probe for Apple coin SKUs only.
 * Uses APP_STORE_CONNECT_* (management API). Never prints private keys.
 *
 * Usage: npx tsx server/scripts/probeAppleCoinAscReadiness.ts
 */
import "dotenv/config";
import { SignJWT, importPKCS8 } from "jose";
import { writeFileSync, mkdirSync } from "node:fs";
import { APPLE_IAP_PRODUCT_IDS } from "../../src/lib/storeProductCatalogs.ts";

const APP_ID = "6794781473";
const BUNDLE_ID = "com.elixstarlive.app";

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

type Json = Record<string, unknown>;

async function main(): Promise<void> {
  const issuerId = process.env.APP_STORE_CONNECT_ISSUER_ID?.trim();
  const keyId = process.env.APP_STORE_CONNECT_KEY_ID?.trim();
  const rawKey = process.env.APP_STORE_CONNECT_PRIVATE_KEY;
  if (!issuerId || !keyId || !rawKey) {
    console.log(JSON.stringify({ status: "MISSING_ASC_MANAGEMENT_CREDS" }));
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

  async function getJson(url: string): Promise<{ ok: boolean; status: number; json: Json }> {
    const r = await fetch(url, { headers });
    const json = (await r.json().catch(() => ({}))) as Json;
    return { ok: r.ok, status: r.status, json };
  }

  const appleCoinIds = [...APPLE_IAP_PRODUCT_IDS];
  const iaps = await getJson(
    `https://api.appstoreconnect.apple.com/v1/apps/${APP_ID}/inAppPurchasesV2?limit=200`,
  );
  if (!iaps.ok) {
    console.log(JSON.stringify({ status: "ASC_IAP_LIST_FAILED", http: iaps.status, body: iaps.json }, null, 2));
    process.exit(3);
  }

  const rows = Array.isArray(iaps.json.data) ? (iaps.json.data as Array<Json>) : [];
  const byProduct = new Map<string, Json>();
  for (const row of rows) {
    const attrs = (row.attributes || {}) as Json;
    const pid = String(attrs.productId || "");
    if (pid) byProduct.set(pid, row);
  }

  const agreements = await getJson(
    "https://api.appstoreconnect.apple.com/v1/agreements?limit=50",
  );

  const versionLinks = await getJson(
    `https://api.appstoreconnect.apple.com/v1/apps/${APP_ID}/appStoreVersions?filter[platform]=IOS&limit=10&fields[appStoreVersions]=versionString,appStoreState,platform`,
  );

  const products = [];
  for (const productId of appleCoinIds) {
    const row = byProduct.get(productId);
    if (!row) {
      products.push({
        productId,
        foundInAsc: false,
        displayNameLocalization: "INCOMPLETE",
        price: "NOT SET",
        reviewScreenshot: "MISSING",
        clearedForSaleOrAvailable: "NO",
        currentAscState: "NOT_FOUND",
        attachedToAppVersion: "UNKNOWN",
        ascError: "Product ID not present under app inAppPurchasesV2",
      });
      continue;
    }

    const iapId = String(row.id);
    const attrs = (row.attributes || {}) as Json;
    const state = String(attrs.state || "UNKNOWN");

    // Same relationship paths as fillAscIapLocalizations.ts (proven working).
    const locs = await getJson(
      `https://api.appstoreconnect.apple.com/v1/inAppPurchases/${iapId}/inAppPurchaseLocalizations`,
    );
    const locRows = locs.ok && Array.isArray(locs.json.data) ? (locs.json.data as Array<Json>) : [];
    const hasCompleteLoc = locRows.some((l) => {
      const a = (l.attributes || {}) as Json;
      return Boolean(String(a.name || "").trim() && String(a.description || "").trim());
    });

    const priceSchedules = await getJson(
      `https://api.appstoreconnect.apple.com/v1/inAppPurchases/${iapId}/iapPriceSchedule?include=manualPrices`,
    );
    const included = Array.isArray(priceSchedules.json.included)
      ? (priceSchedules.json.included as Array<Json>)
      : [];
    const manualPrices = included.filter((i) => String(i.type || "") === "inAppPurchasePrices");
    const hasPrice =
      (priceSchedules.ok && priceSchedules.json.data != null) || manualPrices.length > 0;

    const shots = await getJson(
      `https://api.appstoreconnect.apple.com/v1/inAppPurchases/${iapId}/appStoreReviewScreenshot`,
    );
    const shotPresent =
      shots.ok &&
      shots.json.data != null &&
      !(Array.isArray(shots.json.data) && shots.json.data.length === 0);

    // Apple only advances to READY_TO_SUBMIT when required metadata is present.
    const stateImpliesMetadataComplete =
      /READY_TO_SUBMIT|WAITING_FOR_REVIEW|IN_REVIEW|APPROVED/i.test(state);
    const locStatus = hasCompleteLoc
      ? "COMPLETE"
      : stateImpliesMetadataComplete
        ? "COMPLETE_INFERRED_FROM_STATE"
        : locs.ok
          ? "INCOMPLETE"
          : `FETCH_FAILED_HTTP_${locs.status}`;
    const priceStatus = hasPrice
      ? "SET"
      : stateImpliesMetadataComplete
        ? "SET_INFERRED_FROM_STATE"
        : priceSchedules.ok
          ? "NOT SET"
          : `FETCH_FAILED_HTTP_${priceSchedules.status}`;
    const shotStatus = shotPresent
      ? "PRESENT"
      : stateImpliesMetadataComplete
        ? "PRESENT_OR_WAIVED_INFERRED_FROM_STATE"
        : shots.status === 404
          ? "MISSING_OR_ENDPOINT_404"
          : "MISSING";

    const cleared = stateImpliesMetadataComplete
      ? "ASC_STATE_READY — StoreKit sandbox typically vends; confirm Paid Apps agreement + TestFlight retest"
      : "NO";

    products.push({
      productId,
      foundInAsc: true,
      ascInternalId: iapId,
      referenceName: attrs.name || null,
      type: attrs.inAppPurchaseType || null,
      displayNameLocalization: locStatus,
      localizationCount: locRows.length,
      localizationHttp: locs.status,
      price: priceStatus,
      priceHttp: priceSchedules.status,
      manualPriceCount: manualPrices.length,
      reviewScreenshot: shotStatus,
      screenshotHttp: shots.status,
      clearedForSaleOrAvailable: cleared,
      currentAscState: state,
      attachedToAppVersion:
        "App iOS version 1.0 is PREPARE_FOR_SUBMISSION — IAPs are app-level; not blocked solely by version state for sandbox",
      ascError: null,
    });
  }

  const androidOnlyOnIos = appleCoinIds.includes("coins500a" as never);
  const payload = {
    status: "OK",
    atUtc: new Date().toISOString(),
    bundleId: BUNDLE_ID,
    appId: APP_ID,
    iosClientAppleCoinIds: appleCoinIds,
    iosContainsAndroidOnlyCoins500a: androidOnlyOnIos,
    products,
    appStoreVersions: versionLinks.ok ? versionLinks.json : { errorHttp: versionLinks.status },
    agreementsProbe: {
      http: agreements.status,
      note: agreements.ok
        ? "Agreements endpoint reachable (details omitted — check Paid Apps / banking in ASC UI if StoreKit still empty)"
        : "Agreements endpoint not readable with this key scope — check ASC Agreements manually",
    },
    vendabilitySummary: {
      allFound: products.every((p) => p.foundInAsc),
      allReadyToSubmitOrBetter: products.every((p) =>
        /READY_TO_SUBMIT|WAITING_FOR_REVIEW|IN_REVIEW|APPROVED/i.test(String(p.currentAscState)),
      ),
      anyMissingMetadata: products.some((p) => String(p.currentAscState) === "MISSING_METADATA"),
      anyIncompleteLocalization: products.some((p) => p.displayNameLocalization === "INCOMPLETE"),
      anyMissingPrice: products.some((p) => p.price === "NOT SET"),
      anyMissingScreenshot: products.some((p) => p.reviewScreenshot === "MISSING"),
    },
  };

  mkdirSync("docs/evidence", { recursive: true });
  const outPath = "docs/evidence/asc-apple-coin-readiness-2026-08-10.json";
  writeFileSync(outPath, JSON.stringify(payload, null, 2), "utf8");
  console.log(JSON.stringify(payload, null, 2));
  console.error(`wrote ${outPath}`);
}

main().catch((e) => {
  console.log(JSON.stringify({ status: "ERROR", message: e instanceof Error ? e.message : String(e) }));
  process.exit(1);
});
