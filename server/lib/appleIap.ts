/**
 * Apple App Store Server API helpers for StoreKit 2 transactions and
 * auto-renewable creator memberships.
 *
 * iOS uses one shared auto-renewable SKU in App Store Connect (all creators).
 * Android keeps per-creator IDs (`elix.creator.<24-hex>`).
 */
import { createHash, X509Certificate } from "node:crypto";
import * as jose from "jose";
import { logger } from "./logger";
import { getPool } from "./postgres";
import {
  CREATOR_MEMBERSHIP_BASE_PLAN_ID,
  type EnsureMembershipProductResult,
  type MembershipProvisionStatus,
} from "./googlePlaySubscriptions";
import { normalizePrivateKeyPem } from "./serviceAccountEnv";

/** Single App Store Connect subscription product for all creator memberships on iOS. */
export const APPLE_CREATOR_MEMBERSHIP_PRODUCT_ID =
  process.env.APPLE_CREATOR_MEMBERSHIP_PRODUCT_ID?.trim() || "com.elixstarlive.membership";

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

type AppleSubscriptionEntitlement = {
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

type AppleSubscriptionRejection = {
  ok: false;
  entitled: false;
  error: string;
  /** "unavailable" means no verdict was reached — the caller must allow a retry. */
  reason: "invalid" | "not_entitled" | "unavailable";
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

/** The one app this server accepts Apple money for. */
export function appleBundleId(): string {
  return process.env.APPLE_BUNDLE_ID?.trim() || "com.elixstarlive.app";
}

/**
 * The one Apple environment this server settles. A Sandbox/TestFlight purchase
 * costs nobody anything, so accepting it here would mint real paid coins and a
 * real GBP lot for money Apple never took.
 */
export function expectedAppleEnvironment(): "Production" | "Sandbox" {
  return (process.env.APPLE_IAP_ENVIRONMENT || "Production").trim().toLowerCase() ===
    "sandbox"
    ? "Sandbox"
    : "Production";
}

/**
 * Assert that verified transaction evidence belongs to this app and this
 * environment. Apple's own library rejects on both, and both must be present:
 * a payload that simply omits them is not evidence that they match.
 * Returns null when the identity is good, else the rejection detail.
 */
export function appleTransactionIdentityError(
  payload: Record<string, unknown> | null | undefined,
): string | null {
  if (!payload) return "apple-transaction-missing";
  const bundleId = typeof payload.bundleId === "string" ? payload.bundleId.trim() : "";
  if (!bundleId) return "apple-transaction-missing-bundle-id";
  if (bundleId !== appleBundleId()) return "apple-transaction-bundle-mismatch";
  const environment =
    typeof payload.environment === "string" ? payload.environment.trim() : "";
  if (!environment) return "apple-transaction-missing-environment";
  if (environment.toLowerCase() !== expectedAppleEnvironment().toLowerCase()) {
    return "apple-transaction-environment-mismatch";
  }
  return null;
}

export function hashAppleOriginalTransactionId(originalTransactionId: string): string {
  return createHash("sha256").update(originalTransactionId.trim()).digest("hex");
}

async function createAppleApiJwt(): Promise<string | null> {
  const issuerId = process.env.APPLE_ISSUER_ID?.trim();
  const keyId = process.env.APPLE_KEY_ID?.trim();
  const privateKeyPem = normalizePrivateKeyPem(process.env.APPLE_PRIVATE_KEY);
  const bundleId = appleBundleId();
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
  const production = "https://api.storekit.itunes.apple.com";
  const sandbox = "https://api.storekit-sandbox.itunes.apple.com";
  // Apple's documented order: try the expected environment, then the other on
  // 404, because a transaction id alone does not say which one it belongs to.
  // The environment the payload reports is then checked against ours.
  return expectedAppleEnvironment() === "Sandbox"
    ? [sandbox, production]
    : [production, sandbox];
}

/**
 * Cryptographically verify an App Store Server API / ASN V2 JWS.
 * Trusts only chains that terminate at Apple Root CA - G3 (published Apple PKI).
 *
 * Signature only. This same function verifies transaction info, renewal info and
 * notification envelopes, and only transaction info carries bundleId/environment,
 * so app and environment identity is asserted by `appleTransactionIdentityError`
 * at each transaction boundary instead of being half-checked here.
 */
const APPLE_ROOT_CA_G3_PEM = `-----BEGIN CERTIFICATE-----
MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwS
QXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9u
IEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcN
MTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBS
b290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9y
aXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49
AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtf
TjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517
IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySr
MA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gA
MGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4
at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM
6BgD56KyKA==
-----END CERTIFICATE-----`;

/** SHA-256 of Apple Root CA - G3 DER (Apple PKI / Apple Support root list). */
const APPLE_ROOT_CA_G3_SHA256 =
  "63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179";

function sha256Hex(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

function appleRootCaG3(): X509Certificate {
  const root = new X509Certificate(APPLE_ROOT_CA_G3_PEM);
  if (sha256Hex(root.raw) !== APPLE_ROOT_CA_G3_SHA256) {
    throw new Error("embedded Apple Root CA G3 fingerprint mismatch");
  }
  return root;
}

function chainTerminatesAtAppleRootG3(certs: X509Certificate[]): boolean {
  const root = appleRootCaG3();
  const last = certs[certs.length - 1];
  if (!last) return false;
  if (sha256Hex(last.raw) === APPLE_ROOT_CA_G3_SHA256) return true;
  return last.verify(root.publicKey);
}

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
    if (!chainTerminatesAtAppleRootG3(certs)) {
      logger.warn("Apple JWS chain does not terminate at Apple Root CA G3");
      return null;
    }

    // `leaf.publicKey` is already a public KeyObject, and Node's createPublicKey
    // only accepts a private KeyObject — passing it through there threw
    // ERR_CRYPTO_INVALID_KEY_OBJECT_TYPE for every Apple JWS. jose verifies
    // against the KeyObject directly.
    const { payload } = await jose.jwtVerify(jws, leaf.publicKey, {
      algorithms: ["ES256"],
    });
    return payload as AppleTxPayload;
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

type AppleTransactionLookup =
  | { valid: true; productId: string; payload: AppleTxPayload; detail: string }
  | {
      valid: false;
      /**
       * "invalid" — Apple answered and this transaction is not acceptable.
       * "unavailable" — we could not reach a verdict (credentials, upstream,
       * timeout). The caller must offer a retry, never a permanent refusal.
       */
      reason: "invalid" | "unavailable";
      productId?: string;
      payload?: AppleTxPayload;
      detail: string;
    };

/**
 * A non-2xx App Store Server API answer is only the customer's problem when
 * Apple says the transaction does not exist or is malformed. Our own missing
 * credentials, a 401/403, a throttle or a 5xx are our outage, and calling those
 * "invalid receipt" tells a paying customer their purchase was rejected.
 */
function appleApiFailureReason(status: number): "invalid" | "unavailable" {
  if (status === 400 || status === 404) return "invalid";
  return "unavailable";
}

export async function fetchAppleTransaction(
  transactionId: string,
): Promise<AppleTransactionLookup> {
  if (!appleCredentialsConfigured()) {
    return {
      valid: false,
      reason: "unavailable",
      detail: "APPLE_CREDENTIALS_NOT_CONFIGURED",
    };
  }
  const tid = transactionId.trim();
  if (!tid) return { valid: false, reason: "invalid", detail: "missing_transaction_id" };

  const resp = await appleApiGet(`/inApps/v1/transactions/${encodeURIComponent(tid)}`);
  if (!resp.ok) {
    return {
      valid: false,
      reason: appleApiFailureReason(resp.status),
      detail: `apple-api-${resp.status}: ${resp.text || ""}`,
    };
  }
  const signed =
    resp.json &&
    typeof resp.json === "object" &&
    typeof (resp.json as { signedTransactionInfo?: string }).signedTransactionInfo === "string"
      ? (resp.json as { signedTransactionInfo: string }).signedTransactionInfo
      : "";
  const payload = signed ? await verifyAppleJwsPayload(signed) : null;
  if (!payload?.productId) {
    return { valid: false, reason: "invalid", detail: "apple-jws-missing-or-malformed" };
  }
  const identity = appleTransactionIdentityError(payload);
  if (identity) {
    logger.warn(
      {
        transactionId: tid,
        bundleId: payload.bundleId,
        environment: payload.environment,
        expectedEnvironment: expectedAppleEnvironment(),
        identity,
      },
      "Apple transaction rejected — wrong app or wrong environment",
    );
    return { valid: false, reason: "invalid", payload, detail: identity };
  }
  return {
    valid: true,
    productId: String(payload.productId),
    payload,
    detail: JSON.stringify(payload),
  };
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
  if (tx.valid === false) {
    return {
      ok: false,
      entitled: false,
      error: tx.detail || "apple_verify_failed",
      reason: tx.reason,
    };
  }
  const productId = String(tx.payload.productId || "");
  if (productId !== expectedProductId) {
    return {
      ok: false,
      entitled: false,
      error: "product_mismatch",
      reason: "invalid",
      detail: productId,
    };
  }
  const originalTransactionId = String(
    tx.payload.originalTransactionId || tx.payload.transactionId || "",
  ).trim();
  if (!originalTransactionId) {
    return {
      ok: false,
      entitled: false,
      error: "missing_original_transaction",
      reason: "invalid",
    };
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
      reason: "not_entitled",
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
  const productId = APPLE_CREATOR_MEMBERSHIP_PRODUCT_ID;
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
