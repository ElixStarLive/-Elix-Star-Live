import "dotenv/config";
import { SignJWT, importPKCS8 } from "jose";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

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
    .setIssuedAt(now - 60)
    .setExpirationTime(now + 1200)
    .sign(privateKey);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${jwt}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  async function api(method: string, url: string, body?: unknown) {
    const r = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const t = await r.text();
    let j: any;
    try {
      j = JSON.parse(t);
    } catch {
      j = { raw: t.slice(0, 400) };
    }
    return { status: r.status, j };
  }

  const buf = readFileSync("docs/evidence/_asc_assets/ipad129.png");
  console.log("ipad bytes", buf.length);

  const ipadSetId = "39dd1048-5846-4125-9c0a-a63aaff5a0a8";
  const reserve = await api("POST", "https://api.appstoreconnect.apple.com/v1/appScreenshots", {
    data: {
      type: "appScreenshots",
      attributes: { fileName: "ipad129.png", fileSize: buf.length },
      relationships: {
        appScreenshotSet: { data: { type: "appScreenshotSets", id: ipadSetId } },
      },
    },
  });
  console.log("reserve", reserve.status, reserve.j?.data?.id, reserve.j?.errors?.[0]?.detail);

  for (const op of reserve.j?.data?.attributes?.uploadOperations ?? []) {
    const opHeaders: Record<string, string> = {};
    for (const hh of op.requestHeaders ?? []) opHeaders[hh.name] = hh.value;
    const part = buf.subarray(op.offset, op.offset + op.length);
    const up = await fetch(op.url, { method: op.method, headers: opHeaders, body: part });
    console.log("up", up.status);
  }

  if (reserve.j?.data?.id) {
    const checksum = createHash("md5").update(buf).digest("hex");
    const commit = await api(
      "PATCH",
      `https://api.appstoreconnect.apple.com/v1/appScreenshots/${reserve.j.data.id}`,
      {
        data: {
          type: "appScreenshots",
          id: reserve.j.data.id,
          attributes: { uploaded: true, sourceFileChecksum: checksum },
        },
      },
    );
    console.log(
      "commit",
      commit.status,
      commit.j?.data?.attributes?.assetDeliveryState?.state,
      commit.j?.errors,
    );
  }

  const newPriceId = "${price1}";
  const freeId = "eyJzIjoiNjc5NDc4MTQ3MyIsInQiOiJHQlIiLCJwIjoiMTAwMDAifQ";
  const priceCreate = await api("POST", "https://api.appstoreconnect.apple.com/v1/appPriceSchedules", {
    data: {
      type: "appPriceSchedules",
      relationships: {
        app: { data: { type: "apps", id: "6794781473" } },
        baseTerritory: { data: { type: "territories", id: "GBR" } },
        manualPrices: { data: [{ type: "appPrices", id: newPriceId }] },
      },
    },
    included: [
      {
        type: "appPrices",
        id: newPriceId,
        attributes: { startDate: null },
        relationships: {
          appPricePoint: { data: { type: "appPricePoints", id: freeId } },
        },
      },
    ],
  });
  console.log("priceCreate", priceCreate.status, JSON.stringify(priceCreate.j).slice(0, 700));

  const cat = await api(
    "PATCH",
    "https://api.appstoreconnect.apple.com/v1/appInfos/dfa4a62d-48d9-4c3b-98f9-f48223b65afc",
    {
      data: {
        type: "appInfos",
        id: "dfa4a62d-48d9-4c3b-98f9-f48223b65afc",
        relationships: {
          primaryCategory: { data: { type: "appCategories", id: "ENTERTAINMENT" } },
        },
      },
    },
  );
  console.log("cat", cat.status, cat.j?.errors?.[0]?.detail || "ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
