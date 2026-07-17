/**
 * Creator-specific Google Play subscription verification (subscriptionsv2).
 * Reuses google-auth-library JWT + GOOGLE_SERVICE_ACCOUNT_JSON (androidpublisher scope).
 * Raw purchase tokens are never persisted — callers store sha256 hashes only.
 */

import { createHash } from "node:crypto";
import { JWT } from "google-auth-library";
import { logger } from "./logger";

const ANDROID_PUBLISHER_SCOPE = "https://www.googleapis.com/auth/androidpublisher";
const ANDROID_PUBLISHER_BASE = "https://androidpublisher.googleapis.com/androidpublisher/v3";

export const CREATOR_MEMBERSHIP_PRODUCT_PREFIX = "elix.creator.";
export const CREATOR_MEMBERSHIP_BASE_PLAN_ID = "monthly";

/** Entitling states after normalization (SUBSCRIPTION_STATE_ prefix stripped). */
const ENTITLED_STATES = new Set(["ACTIVE", "IN_GRACE_PERIOD", "CANCELED"]);

export function googlePlayPackageName(): string {
  return process.env.GOOGLE_PLAY_PACKAGE_NAME || "com.elixstarlive.app";
}

export function hashPurchaseToken(purchaseToken: string): string {
  return createHash("sha256").update(purchaseToken).digest("hex");
}

/**
 * Deterministic Play product ID for a creator's membership subscription:
 * `elix.creator.` + first 24 lowercase hex chars of SHA-256(creatorId).
 * Valid Play product ID (lowercase letters, digits, periods).
 */
export function creatorMembershipProductId(creatorId: string): string {
  const digest = createHash("sha256").update(creatorId).digest("hex").toLowerCase();
  return `${CREATOR_MEMBERSHIP_PRODUCT_PREFIX}${digest.slice(0, 24)}`;
}

export type GoogleSubscriptionEntitlement = {
  ok: true;
  entitled: true;
  productId: string;
  basePlanId: string | null;
  /** Normalized state, e.g. "ACTIVE", "IN_GRACE_PERIOD", "CANCELED". */
  subscriptionState: string;
  /** ISO timestamp of the located line item's expiry. */
  expiresAt: string;
  autoRenewEnabled: boolean;
  /** Normalized, e.g. "ACKNOWLEDGED" / "PENDING". */
  acknowledgementState: string | null;
  latestOrderId: string | null;
  /** sha256 hex of linkedPurchaseToken when Google reports one (upgrades/re-signups). */
  linkedPurchaseTokenHash: string | null;
  /** obfuscatedExternalAccountId when the purchase was tagged with one. */
  externalAccountId: string | null;
};

export type GoogleSubscriptionRejection = {
  ok: false;
  entitled: false;
  error:
    | "malformed_payload"
    | "product_mismatch"
    | "missing_expiry"
    | "not_entitled"
    | "google_not_configured"
    | "google_auth_failed"
    | "google_http_error";
  /** Normalized state when the payload was readable (e.g. "EXPIRED", "ON_HOLD"). */
  subscriptionState?: string;
  detail?: string;
};

export type GoogleSubscriptionResult = GoogleSubscriptionEntitlement | GoogleSubscriptionRejection;

function normalizeEnum(value: unknown, prefix: string): string | null {
  if (typeof value !== "string" || !value) return null;
  return value.startsWith(prefix) ? value.slice(prefix.length) : value;
}

/**
 * Pure parser for a Play `purchases.subscriptionsv2` payload.
 * Fails closed: malformed payload, wrong product, missing/invalid expiry, and
 * non-entitling states (EXPIRED, ON_HOLD, PAUSED, PENDING, …) all reject.
 * CANCELED is entitled only while expiry is still in the future.
 */
export function parseGoogleSubscriptionPayload(
  payload: unknown,
  expectedProductId: string,
  nowMs: number = Date.now(),
): GoogleSubscriptionResult {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, entitled: false, error: "malformed_payload" };
  }
  const p = payload as Record<string, unknown>;

  const lineItems = Array.isArray(p.lineItems) ? p.lineItems : [];
  const lineItem = lineItems.find(
    (li): li is Record<string, unknown> =>
      Boolean(li) &&
      typeof li === "object" &&
      (li as Record<string, unknown>).productId === expectedProductId,
  );
  if (!lineItem) {
    return { ok: false, entitled: false, error: "product_mismatch" };
  }

  const subscriptionState =
    normalizeEnum(p.subscriptionState, "SUBSCRIPTION_STATE_") ?? "UNSPECIFIED";

  const expiryRaw = lineItem.expiryTime;
  const expiryMs = typeof expiryRaw === "string" ? Date.parse(expiryRaw) : NaN;
  if (!Number.isFinite(expiryMs)) {
    return { ok: false, entitled: false, error: "missing_expiry", subscriptionState };
  }

  if (!ENTITLED_STATES.has(subscriptionState) || expiryMs <= nowMs) {
    return { ok: false, entitled: false, error: "not_entitled", subscriptionState };
  }

  const autoRenewingPlan =
    lineItem.autoRenewingPlan && typeof lineItem.autoRenewingPlan === "object"
      ? (lineItem.autoRenewingPlan as Record<string, unknown>)
      : null;
  const offerDetails =
    lineItem.offerDetails && typeof lineItem.offerDetails === "object"
      ? (lineItem.offerDetails as Record<string, unknown>)
      : null;
  const externalIds =
    p.externalAccountIdentifiers && typeof p.externalAccountIdentifiers === "object"
      ? (p.externalAccountIdentifiers as Record<string, unknown>)
      : null;

  return {
    ok: true,
    entitled: true,
    productId: expectedProductId,
    basePlanId:
      offerDetails && typeof offerDetails.basePlanId === "string"
        ? offerDetails.basePlanId
        : null,
    subscriptionState,
    expiresAt: new Date(expiryMs).toISOString(),
    autoRenewEnabled: autoRenewingPlan?.autoRenewEnabled === true,
    acknowledgementState: normalizeEnum(p.acknowledgementState, "ACKNOWLEDGEMENT_STATE_"),
    latestOrderId: typeof p.latestOrderId === "string" && p.latestOrderId ? p.latestOrderId : null,
    linkedPurchaseTokenHash:
      typeof p.linkedPurchaseToken === "string" && p.linkedPurchaseToken
        ? hashPurchaseToken(p.linkedPurchaseToken)
        : null,
    externalAccountId:
      externalIds && typeof externalIds.obfuscatedExternalAccountId === "string"
        ? externalIds.obfuscatedExternalAccountId
        : null,
  };
}

let androidPublisherJwt: JWT | null = null;

function getAndroidPublisherJwt(): JWT | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  if (androidPublisherJwt) return androidPublisherJwt;
  try {
    const creds = JSON.parse(raw) as { client_email: string; private_key: string };
    androidPublisherJwt = new JWT({
      email: creds.client_email,
      key: creds.private_key,
      scopes: [ANDROID_PUBLISHER_SCOPE],
    });
    return androidPublisherJwt;
  } catch (e) {
    logger.error({ err: e }, "Invalid GOOGLE_SERVICE_ACCOUNT_JSON");
    return null;
  }
}

async function getAndroidPublisherAccessToken(): Promise<string | null> {
  const jwtClient = getAndroidPublisherJwt();
  if (!jwtClient) return null;
  try {
    const access = await jwtClient.getAccessToken();
    return access.token || null;
  } catch (e) {
    logger.error({ err: e }, "androidpublisher access token request failed");
    return null;
  }
}

/**
 * Verify a subscription purchase token against
 * `purchases/subscriptionsv2/tokens/{token}` and fail closed on any mismatch.
 */
export async function verifyGoogleSubscription(
  purchaseToken: string,
  expectedProductId: string,
): Promise<GoogleSubscriptionResult> {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    logger.error("[IAP] Google service account not configured — rejecting subscription");
    return { ok: false, entitled: false, error: "google_not_configured" };
  }
  const accessToken = await getAndroidPublisherAccessToken();
  if (!accessToken) {
    return { ok: false, entitled: false, error: "google_auth_failed" };
  }
  const packageName = googlePlayPackageName();
  const url = `${ANDROID_PUBLISHER_BASE}/applications/${encodeURIComponent(packageName)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      logger.warn(
        { status: res.status, expectedProductId },
        "Google subscriptionsv2 verify returned non-OK",
      );
      return {
        ok: false,
        entitled: false,
        error: "google_http_error",
        detail: `status_${res.status}${detail ? `: ${detail.slice(0, 300)}` : ""}`,
      };
    }
    const payload = (await res.json()) as unknown;
    return parseGoogleSubscriptionPayload(payload, expectedProductId);
  } catch (e) {
    logger.error({ err: e, expectedProductId }, "Google subscriptionsv2 verify failed");
    return { ok: false, entitled: false, error: "google_http_error", detail: "fetch_failed" };
  }
}

/**
 * Acknowledge a verified subscription purchase so Google does not refund it.
 * Safe to retry: an already-acknowledged purchase returns a 4xx which is
 * reported (not thrown) so callers can log and move on.
 */
export async function acknowledgeGoogleSubscription(
  productId: string,
  purchaseToken: string,
): Promise<{ ok: boolean; detail?: string }> {
  const accessToken = await getAndroidPublisherAccessToken();
  if (!accessToken) {
    return { ok: false, detail: "google_auth_failed" };
  }
  const packageName = googlePlayPackageName();
  const url = `${ANDROID_PUBLISHER_BASE}/applications/${encodeURIComponent(packageName)}/purchases/subscriptions/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      logger.warn({ status: res.status, productId }, "Google subscription acknowledge non-OK");
      return { ok: false, detail: `status_${res.status}${detail ? `: ${detail.slice(0, 300)}` : ""}` };
    }
    return { ok: true };
  } catch (e) {
    logger.error({ err: e, productId }, "Google subscription acknowledge failed");
    return { ok: false, detail: "fetch_failed" };
  }
}
