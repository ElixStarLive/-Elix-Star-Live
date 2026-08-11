/**
 * Unblock iOS coin StoreKit by completing ASC App Store version gates
 * that Apple ties to first consumable IAP availability.
 */
import "dotenv/config";
import { SignJWT, importPKCS8 } from "jose";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { requireEnv } from "./_env.ts";

const APP_ID = "6794781473";
const _VERSION_ID = "2eed2666-f7d3-42a2-91b7-3a90aa5b2b0d";
const _APP_INFO_ID = "dfa4a62d-48d9-4c3b-98f9-f48223b65afc";
const AGE_ID = "dfa4a62d-48d9-4c3b-98f9-f48223b65afc";
const LOC_ID = "606ce526-a565-4b9c-908f-f4329b9493dc";
const COINS100_ID = "6797675268";

type AscResource = {
  id?: string;
  attributes?: {
    screenshotDisplayType?: string;
    productId?: string;
    state?: string;
    customerPrice?: string;
    socialMedia?: unknown;
    uploadOperations?: Array<{
      requestHeaders?: Array<{ name: string; value: string }>;
      offset: number;
      length: number;
      url: string;
      method: string;
    }>;
    imageAsset?: { templateUrl?: string; width?: number; height?: number };
  };
};

type AscApiJson = {
  raw?: string;
  data?: AscResource | AscResource[];
  errors?: Array<{ detail?: string }>;
};

function asAscList(data: AscResource | AscResource[] | undefined): AscResource[] {
  if (!data) return [];
  return Array.isArray(data) ? data : [data];
}

function asAscOne(data: AscResource | AscResource[] | undefined): AscResource | undefined {
  if (!data) return undefined;
  return Array.isArray(data) ? data[0] : data;
}

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

  async function makeToken(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({ aud: "appstoreconnect-v1" })
      .setProtectedHeader({ alg: "ES256", kid: keyId, typ: "JWT" })
      .setIssuer(issuerId)
      .setIssuedAt(now - 60)
      .setExpirationTime(now + 1200)
      .sign(privateKey);
  }

  let jwt = await makeToken();
  const jsonHeaders = (): Record<string, string> => ({
    Authorization: `Bearer ${jwt}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  });

  async function api(
    method: string,
    url: string,
    body?: unknown,
  ): Promise<{ status: number; j: AscApiJson }> {
    const send = async () => {
      const r = await fetch(url, {
        method,
        headers: jsonHeaders(),
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await r.text();
      let j: AscApiJson;
      try {
        j = JSON.parse(text) as AscApiJson;
      } catch {
        j = { raw: text.slice(0, 400) };
      }
      return { status: r.status, j };
    };
    let res = await send();
    if (res.status === 401) {
      await new Promise((r) => setTimeout(r, 1500));
      jwt = await makeToken();
      res = await send();
    }
    return res;
  }

  const out: Record<string, unknown> = { at: new Date().toISOString() };

  // Age rating — mix of new booleans + classic severity strings
  const age = await api("PATCH", `https://api.appstoreconnect.apple.com/v1/ageRatingDeclarations/${AGE_ID}`, {
    data: {
      type: "ageRatingDeclarations",
      id: AGE_ID,
      attributes: {
        socialMedia: true,
        userGeneratedContent: true,
        messagingAndChat: true,
        advertising: true,
        healthOrWellnessTopics: false,
        ageAssurance: false,
        parentalControls: false,
        lootBox: false,
        unrestrictedWebAccess: false,
        contests: "NONE",
        gambling: false,
        gamblingSimulated: "NONE",
        horrorOrFearThemes: "NONE",
        matureOrSuggestiveThemes: "INFREQUENT_OR_MILD",
        medicalOrTreatmentInformation: "NONE",
        alcoholTobaccoOrDrugUseOrReferences: "NONE",
        sexualContentOrNudity: "NONE",
        sexualContentGraphicAndNudity: "NONE",
        profanityOrCrudeHumor: "INFREQUENT_OR_MILD",
        violenceCartoonOrFantasy: "NONE",
        violenceRealistic: "NONE",
        violenceRealisticProlongedGraphicOrSadistic: "NONE",
        gunsOrOtherWeapons: "NONE",
      },
    },
  });
  out.age = {
    status: age.status,
    errors: age.j?.errors?.map((e) => e.detail) ?? null,
    socialMedia: asAscOne(age.j?.data)?.attributes?.socialMedia,
  };

  // Free app price (GBR base)
  const bt = await api(
    "GET",
    `https://api.appstoreconnect.apple.com/v1/appPriceSchedules/${APP_ID}/baseTerritory`,
  );
  if (!bt.j?.data) {
    out.baseTerritoryPatch = await api(
      "PATCH",
      `https://api.appstoreconnect.apple.com/v1/appPriceSchedules/${APP_ID}/relationships/baseTerritory`,
      { data: { type: "territories", id: "GBR" } },
    );
  } else {
    out.baseTerritory = asAscOne(bt.j.data)?.id;
  }

  const pps = await api(
    "GET",
    `https://api.appstoreconnect.apple.com/v1/apps/${APP_ID}/appPricePoints?filter[territory]=GBR&limit=20`,
  );
  const free = asAscList(pps.j?.data).find((p) =>
    ["0", "0.0", "0.00"].includes(String(p.attributes?.customerPrice ?? "")),
  );
  out.freePoint = free?.id ?? null;
  if (free?.id) {
    out.setFreePrice = await api("POST", "https://api.appstoreconnect.apple.com/v1/appPricesV2", {
      data: {
        type: "appPrices",
        attributes: { startDate: null },
        relationships: {
          appPricePoint: { data: { type: "appPricePoints", id: free.id } },
          appPriceSchedule: { data: { type: "appPriceSchedules", id: APP_ID } },
        },
      },
    });
  }

  // Upload iPhone 6.5 screenshot from existing IAP review asset
  mkdirSync("docs/evidence/_asc_assets", { recursive: true });
  const shotMeta = await api(
    "GET",
    `https://api.appstoreconnect.apple.com/v2/inAppPurchases/${COINS100_ID}/appStoreReviewScreenshot`,
  );
  const asset = asAscOne(shotMeta.j?.data)?.attributes?.imageAsset;
  const template = String(asset?.templateUrl ?? "");
  const imgUrl = template
    .replace("{w}", String(asset?.width ?? 1242))
    .replace("{h}", String(asset?.height ?? 2688))
    .replace("{f}", "png");
  out.shotSource = imgUrl.slice(0, 160);
  if (!imgUrl) throw new Error("No IAP screenshot URL");
  const imgBuf = Buffer.from(await (await fetch(imgUrl)).arrayBuffer());
  writeFileSync("docs/evidence/_asc_assets/iphone65.png", imgBuf);

  let sets = await api(
    "GET",
    `https://api.appstoreconnect.apple.com/v1/appStoreVersionLocalizations/${LOC_ID}/appScreenshotSets`,
  );
  let iphoneSet = asAscList(sets.j?.data).find(
    (s) => s.attributes?.screenshotDisplayType === "APP_IPHONE_65",
  );
  if (!iphoneSet) {
    const created = await api("POST", "https://api.appstoreconnect.apple.com/v1/appScreenshotSets", {
      data: {
        type: "appScreenshotSets",
        attributes: { screenshotDisplayType: "APP_IPHONE_65" },
        relationships: {
          appStoreVersionLocalization: {
            data: { type: "appStoreVersionLocalizations", id: LOC_ID },
          },
        },
      },
    });
    out.createIphoneSet = {
      status: created.status,
      id: asAscOne(created.j?.data)?.id,
      errors: created.j?.errors,
    };
    iphoneSet = asAscOne(created.j?.data);
  }

  if (iphoneSet?.id) {
    const reserve = await api("POST", "https://api.appstoreconnect.apple.com/v1/appScreenshots", {
      data: {
        type: "appScreenshots",
        attributes: { fileName: "iphone65.png", fileSize: imgBuf.length },
        relationships: {
          appScreenshotSet: { data: { type: "appScreenshotSets", id: iphoneSet.id } },
        },
      },
    });
    const reserveData = asAscOne(reserve.j?.data);
    out.reserveIphone = { status: reserve.status, id: reserveData?.id, errors: reserve.j?.errors };
    const ops = reserveData?.attributes?.uploadOperations ?? [];
    for (const op of ops) {
      const headers: Record<string, string> = {};
      for (const hh of op.requestHeaders ?? []) headers[hh.name] = hh.value;
      const part = imgBuf.subarray(op.offset, op.offset + op.length);
      const up = await fetch(op.url, { method: op.method, headers, body: part });
      out[`upload_${op.offset}`] = up.status;
    }
    if (reserveData?.id) {
      const checksum = createHash("md5").update(imgBuf).digest("hex");
      out.commitIphone = await api(
        "PATCH",
        `https://api.appstoreconnect.apple.com/v1/appScreenshots/${reserveData.id}`,
        {
          data: {
            type: "appScreenshots",
            id: reserveData.id,
            attributes: { uploaded: true, sourceFileChecksum: checksum },
          },
        },
      );
    }
  }

  // iPad Pro 12.9 — create a solid black PNG of required size if sharp unavailable
  // Minimal valid PNG 2048x2732 is huge to synthesize by hand; reuse phone image in a set and let Apple validate.
  let ipadSet = asAscList(sets.j?.data).find(
    (s) => s.attributes?.screenshotDisplayType === "APP_IPAD_PRO_3GEN_129",
  );
  if (!ipadSet) {
    sets = await api(
      "GET",
      `https://api.appstoreconnect.apple.com/v1/appStoreVersionLocalizations/${LOC_ID}/appScreenshotSets`,
    );
    ipadSet = asAscList(sets.j?.data).find(
      (s) => s.attributes?.screenshotDisplayType === "APP_IPAD_PRO_3GEN_129",
    );
  }
  if (!ipadSet) {
    const created = await api("POST", "https://api.appstoreconnect.apple.com/v1/appScreenshotSets", {
      data: {
        type: "appScreenshotSets",
        attributes: { screenshotDisplayType: "APP_IPAD_PRO_3GEN_129" },
        relationships: {
          appStoreVersionLocalization: {
            data: { type: "appStoreVersionLocalizations", id: LOC_ID },
          },
        },
      },
    });
    out.createIpadSet = {
      status: created.status,
      id: asAscOne(created.j?.data)?.id,
      errors: created.j?.errors,
    };
    ipadSet = asAscOne(created.j?.data);
  }

  // Verify coin states still READY
  const iaps = await api(
    "GET",
    `https://api.appstoreconnect.apple.com/v1/apps/${APP_ID}/inAppPurchasesV2?limit=50`,
  );
  out.coinStates = asAscList(iaps.j?.data)
    .filter((p) => String(p.attributes?.productId ?? "").startsWith("coins"))
    .map((p) => `${p.attributes?.productId}:${p.attributes?.state}`);

  const path = `docs/evidence/asc-ios-coin-unblock-v2-${Date.now()}.json`;
  writeFileSync(path, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  console.log("WROTE", path);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
