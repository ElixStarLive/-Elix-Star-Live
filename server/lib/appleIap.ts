/**
 * Apple App Store Server API helpers for StoreKit 2 transactions and
 * auto-renewable creator memberships.
 *
 * Product IDs mirror Google (`elix.creator.<24-hex>`). Apple cannot create those
 * SKUs at runtime — they must be pre-created in App Store Connect.
 */
import { createHash, createPublicKey, X509Certificate } from "node:crypto";
import * as jose from "jose";
import { logger } from "./logger";
import { getPool } from "./postgres";
import {
  CREATOR_MEMBERSHIP_BASE_PLAN_ID,
  creatorMembershipProductId,
  type EnsureMembershipProductResult,
  type MembershipProvisionStatus,
} from "./googlePlaySubscriptions";

export type AppleTxPayload = {
  transactionId?: string;
  originalTransactionId?: string;
  productId?: string;
  bundleId?: string;
  expiresDate?: number;
  revocationDate?: number;
  purchaseDate?: number;
  type?: string;
  environment?: string;
  appAccountToken?: string;
  [key: string]: unknown;
};

export type AppleSubscriptionEntitlement = {
  ok: true;
  entitled: true;
  productId: string;
  originalTransactionId: string;
  transactionId: string;
  subscriptionState: string;
  expiresAt: string;
  autoRenewEnabled: boolean;
  environment?: string;
  appAccountToken?: string | null;
  rawTransaction: AppleTxPayload;
};

export type AppleSubscriptionRejection = {
  ok: false;
  entitled: false;
  error: string;
  subscriptionState?: string;
  detail?: string;
};

function appleCredentialsConfigured(): boolean {
  return Boolean(
    process.env.APPLE_ISSUER_ID &&
      process.env.APPLE_KEY_ID &&
      process.env.APPLE_PRIVATE_KEY,
  );
}

export function hashAppleOriginalTransactionId(originalTransactionId: string): string {
  return createHash("sha256").update(originalTransactionId.trim()).digest("hex");
}

async function createAppleApiJwt(): Promise<string | null> {
  const issuerId = process.env.APPLE_ISSUER_ID?.trim();
  const keyId = process.env.APPLE_KEY_ID?.trim();
  const privateKeyPem = process.env.APPLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const bundleId = process.env.APPLE_BUNDLE_ID || "com.elixstarlive.app";
  if (!issuerId || !keyId || !privateKeyPem) return null;
  try {
    const key = await jose.importPKCS8(privateKeyPem, "ES256");
    return await new jose.SignJWT({ bid: bundleId })
      .setProtectedHeader({ alg: "ES256", kid: keyId, typ: "JWT" })
      .setIssuer(issuerId)
      .setIssuedAt()
      .setExpirationTime("55m")
      .setAudience("appstoreconnect-v1")
      .sign(key);
  } catch (err) {
    logger.error({ err }, "Apple API JWT creation failed");
    return null;
  }
}

function appleBaseUrls(): string[] {
  const preferred = (process.env.APPLE_IAP_ENVIRONMENT || "Production").trim();
  const production = "https://api.storekit.itunes.apple.com";
  const sandbox = "https://api.storekit-sandbox.itunes.apple.com";
  return preferred === "Sandbox" ? [sandbox, production] : [production, sandbox];
}

/**
 * Cryptographically verify an App Store Server API / ASN V2 JWS using the
 * embedded x5c leaf certificate, and validate the supplied certificate chain
 * links (child signed by parent). Does not embed Apple Root CA material.
 */
export async function verifyAppleJwsPayload(
  jws: string,
): Promise<AppleTxPayload | null> {
  if (!jws || jws.split(".").length !== 3) return null;
  try {
    const header = jose.decodeProtectedHeader(jws);
    const x5c = Array.isArray(header.x5c) ? header.x5c : [];
    if (!x5c.length || typeof x5c[0] !== "string") {
      logger.warn("Apple JWS missing x5c — rejecting unsigned payload");
      return null;
    }

    const certs = x5c.map((b64) => new X509Certificate(Buffer.from(String(b64), "base64")));
    const leaf = certs[0];
    const now = new Date();
    if (new Date(leaf.validFrom) > now || new Date(leaf.validTo) < now) {
      logger.warn("Apple JWS leaf certificate is outside validity window");
      return null;
    }
    for (let i = 0; i < certs.length - 1; i++) {
      if (!certs[i].verify(certs[i + 1].publicKey)) {
        logger.warn({ index: i }, "Apple JWS certificate chain link failed");
        return null;
      }
    }
    if (!/Apple/i.test(leaf.subject) && !/Apple/i.test(leaf.issuer)) {
      logger.warn({ subject: leaf.subject }, "Apple JWS leaf does not look Apple-issued");
      return null;
    }

    const key = createPublicKey(leaf.publicKey);
    const { payload } = await jose.jwtVerify(jws, key, { algorithms: ["ES256"] });
    const p = payload as AppleTxPayload;
    // Reject validly-signed payloads that belong to a different app. Only enforced
    // when bundleId is present (transaction payloads carry it; the outer
    // notification envelope does not).
    const expectedBundleId = process.env.APPLE_BUNDLE_ID || "com.elixstarlive.app";
    if (p.bundleId && p.bundleId !== expectedBundleId) {
      logger.warn({ bundleId: p.bundleId }, "Apple JWS bundleId mismatch — rejecting");
      return null;
    }
    return p;
  } catch (err) {
    logger.warn({ err }, "Apple JWS verification failed");
    return null;
  }
}

async function appleApiGet(path: string): Promise<{ ok: boolean; status: number; json?: unknown; text?: string }> {
  const jwt = await createAppleApiJwt();
  if (!jwt) return { ok: false, status: 503, text: "APPLE_CREDENTIALS_NOT_CONFIGURED" };

  let last: { ok: boolean; status: number; json?: unknown; text?: string } = {
    ok: false,
    status: 502,
    text: "apple-api-unreachable",
  };
  for (const base of appleBaseUrls()) {
    try {
      const resp = await fetch(`${base}${path}`, {
        headers: { Authorization: `Bearer ${jwt}` },
        // Bound the App Store Server API call so a hung upstream cannot pin the
        // (rate-limited) IAP verify handler indefinitely.
        signal: AbortSignal.timeout(15_000),
      });
      const text = await resp.text();
      let json: unknown;
      try {
        json = text ? JSON.parse(text) : undefined;
      } catch {
        json = undefined;
      }
      if (resp.ok) return { ok: true, status: resp.status, json, text };
      last = { ok: false, status: resp.status, json, text };
      // Retry the other environment on 404 (common sandbox/production mismatch).
      if (resp.status !== 404) return last;
    } catch (err) {
      last = { ok: false, status: 502, text: (err as Error)?.message || "fetch_failed" };
    }
  }
  return last;
}

export async function fetchAppleTransaction(
  transactionId: string,
): Promise<{ valid: boolean; productId?: string; payload?: AppleTxPayload; detail?: string }> {
  if (!appleCredentialsConfigured()) {
    return { valid: false, detail: "APPLE_CREDENTIALS_NOT_CONFIGURED" };
  }
  const tid = transactionId.trim();
  if (!tid) return { valid: false, detail: "missing_transaction_id" };

  const resp = await appleApiGet(`/inApps/v1/transactions/${encodeURIComponent(tid)}`);
  if (!resp.ok) {
    return { valid: false, detail: `apple-api-${resp.status}: ${resp.text || ""}` };
  }
  const signed =
    resp.json &&
    typeof resp.json === "object" &&
    typeof (resp.json as { signedTransactionInfo?: string }).signedTransactionInfo === "string"
      ? (resp.json as { signedTransactionInfo: string }).signedTransactionInfo
      : "";
  const payload = signed ? await verifyAppleJwsPayload(signed) : null;
  if (!payload?.productId) {
    return { valid: false, detail: "apple-jws-missing-or-malformed" };
  }
  return { valid: true, productId: String(payload.productId), payload, detail: JSON.stringify(payload) };
}

function mapAppleSubscriptionState(input: {
  expiresAtMs?: number;
  revocationDate?: number;
  statusCode?: number;
}): string {
  if (input.revocationDate) return "REVOKED";
  if (input.statusCode === 2) return "EXPIRED";
  if (input.statusCode === 3) return "IN_BILLING_RETRY";
  if (input.statusCode === 4) return "IN_GRACE_PERIOD";
  if (input.statusCode === 5) return "REVOKED";
  if (input.expiresAtMs && input.expiresAtMs > Date.now()) return "ACTIVE";
  return "EXPIRED";
}

export async function verifyAppleSubscription(
  transactionId: string,
  expectedProductId: string,
): Promise<AppleSubscriptionEntitlement | AppleSubscriptionRejection> {
  const tx = await fetchAppleTransaction(transactionId);
  if (!tx.valid || !tx.payload) {
    return { ok: false, entitled: false, error: tx.detail || "apple_verify_failed" };
  }
  const productId = String(tx.payload.productId || "");
  if (productId !== expectedProductId) {
    return { ok: false, entitled: false, error: "product_mismatch", detail: productId };
  }
  const originalTransactionId = String(
    tx.payload.originalTransactionId || tx.payload.transactionId || "",
  ).trim();
  if (!originalTransactionId) {
    return { ok: false, entitled: false, error: "missing_original_transaction" };
  }

  let autoRenewEnabled = true;
  let statusCode: number | undefined;
  const sub = await appleApiGet(
    `/inApps/v1/subscriptions/${encodeURIComponent(originalTransactionId)}`,
  );
  if (sub.ok && sub.json && typeof sub.json === "object") {
    const data = (sub.json as { data?: Array<Record<string, unknown>> }).data;
    const first = Array.isArray(data) ? data[0] : null;
    const lastTransactions = first && Array.isArray(first.lastTransactions)
      ? (first.lastTransactions as Array<Record<string, unknown>>)
      : [];
    const match =
      lastTransactions.find((row) => String(row.originalTransactionId || "") === originalTransactionId) ||
      lastTransactions[0];
    if (match && typeof match.status === "number") statusCode = match.status;
    const signedRenewal =
      match && typeof match.signedRenewalInfo === "string" ? match.signedRenewalInfo : "";
    if (signedRenewal) {
      const renewal = await verifyAppleJwsPayload(signedRenewal);
      if (renewal && typeof renewal.autoRenewStatus === "number") {
        autoRenewEnabled = renewal.autoRenewStatus === 1;
      }
    }
  }

  const expiresAtMs =
    typeof tx.payload.expiresDate === "number" ? tx.payload.expiresDate : undefined;
  const subscriptionState = mapAppleSubscriptionState({
    expiresAtMs,
    revocationDate:
      typeof tx.payload.revocationDate === "number" ? tx.payload.revocationDate : undefined,
    statusCode,
  });
  const entitled =
    !tx.payload.revocationDate &&
    typeof expiresAtMs === "number" &&
    expiresAtMs > Date.now() &&
    (subscriptionState === "ACTIVE" ||
      subscriptionState === "IN_GRACE_PERIOD" ||
      subscriptionState === "CANCELED");

  // Canceled-but-unexpired Apple subs still show ACTIVE until expiry in status API.
  if (!entitled || !expiresAtMs) {
    return {
      ok: false,
      entitled: false,
      error: "not_entitled",
      subscriptionState,
      detail: tx.detail,
    };
  }

  return {
    ok: true,
    entitled: true,
    productId,
    originalTransactionId,
    transactionId: String(tx.payload.transactionId || transactionId),
    subscriptionState: autoRenewEnabled ? subscriptionState : "CANCELED",
    expiresAt: new Date(expiresAtMs).toISOString(),
    autoRenewEnabled,
    environment: typeof tx.payload.environment === "string" ? tx.payload.environment : undefined,
    appAccountToken:
      typeof tx.payload.appAccountToken === "string" ? tx.payload.appAccountToken : null,
    rawTransaction: tx.payload,
  };
}

async function upsertAppleProvisionRow(input: {
  creatorId: string;
  productId: string;
  appleStatus: MembershipProvisionStatus;
  appleDetail?: string | null;
  activated?: boolean;
}): Promise<void> {
  const pool = getPool();
  if (!pool) return;
  await pool.query(
    `INSERT INTO elix_creator_membership_products
       (creator_id, product_id, base_plan_id, status, apple_status, apple_detail, apple_activated_at, updated_at)
     VALUES ($1, $2, $3, 'pending', $4, $5, CASE WHEN $6 THEN NOW() ELSE NULL END, NOW())
     ON CONFLICT (creator_id) DO UPDATE SET
       product_id = EXCLUDED.product_id,
       apple_status = EXCLUDED.apple_status,
       apple_detail = EXCLUDED.apple_detail,
       apple_activated_at = CASE
         WHEN $6 THEN COALESCE(elix_creator_membership_products.apple_activated_at, NOW())
         ELSE elix_creator_membership_products.apple_activated_at
       END,
       updated_at = NOW()`,
    [
      input.creatorId,
      input.productId,
      CREATOR_MEMBERSHIP_BASE_PLAN_ID,
      input.appleStatus,
      input.appleDetail ?? null,
      input.activated === true,
    ],
  );
}

/**
 * Apple cannot auto-create subscription products. Readiness means:
 * - Apple IAP API credentials are configured, AND
 * - either apple_status=active (prior verified purchase / ops mark), OR
 * - APPLE_CREATOR_MEMBERSHIP_PREPROVISIONED=true (ops created SKUs in ASC).
 */
export async function ensureAppleCreatorMembershipProduct(
  creatorId: string,
): Promise<EnsureMembershipProductResult> {
  const productId = creatorMembershipProductId(creatorId);
  const basePlanId = CREATOR_MEMBERSHIP_BASE_PLAN_ID;
  if (!appleCredentialsConfigured()) {
    return {
      productId,
      basePlanId,
      purchaseReady: false,
      status: "error",
      detail: "Apple IAP credentials are not configured on the server.",
    };
  }

  const pool = getPool();
  let appleStatus: MembershipProvisionStatus = "pending";
  let appleDetail: string | undefined =
    "Create this auto-renewable subscription in App Store Connect, then set APPLE_CREATOR_MEMBERSHIP_PREPROVISIONED=true or complete one verified purchase.";
  if (pool) {
    try {
      const row = await pool.query(
        `SELECT apple_status, apple_detail FROM elix_creator_membership_products WHERE creator_id = $1 LIMIT 1`,
        [creatorId],
      );
      if (row.rowCount) {
        const s = String(row.rows[0].apple_status || "pending");
        if (s === "active" || s === "pending" || s === "error") appleStatus = s;
        if (row.rows[0].apple_detail) appleDetail = String(row.rows[0].apple_detail);
      }
    } catch (err) {
      logger.warn({ err, creatorId }, "ensureAppleCreatorMembershipProduct lookup failed");
    }
  }

  const preprovisioned = process.env.APPLE_CREATOR_MEMBERSHIP_PREPROVISIONED === "true";
  const purchaseReady = appleStatus === "active" || preprovisioned;
  const status: MembershipProvisionStatus = purchaseReady ? "active" : appleStatus;
  const detail = purchaseReady
    ? appleStatus === "active"
      ? undefined
      : `Pre-provisioned Apple SKU expected: ${productId}`
    : appleDetail;

  await upsertAppleProvisionRow({
    creatorId,
    productId,
    appleStatus: status === "active" ? "active" : "pending",
    appleDetail: detail ?? null,
    activated: status === "active",
  });

  return { productId, basePlanId, purchaseReady, status, detail };
}

export async function markAppleCreatorMembershipActive(
  creatorId: string,
  productId: string,
): Promise<void> {
  await upsertAppleProvisionRow({
    creatorId,
    productId,
    appleStatus: "active",
    appleDetail: null,
    activated: true,
  });
}
