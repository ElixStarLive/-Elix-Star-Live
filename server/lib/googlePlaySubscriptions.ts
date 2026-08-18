/**
 * Creator-specific Google Play subscription verification (subscriptionsv2)
 * and monetization product provisioning (elix.creator.<hash> + monthly).
 * Reuses google-auth-library JWT + GOOGLE_SERVICE_ACCOUNT_JSON (androidpublisher scope).
 * Raw purchase tokens are never persisted — callers store sha256 hashes only.
 */

import { createHash } from "node:crypto";
import { JWT } from "google-auth-library";
import { logger } from "./logger";
import { getPool } from "./postgres";

const ANDROID_PUBLISHER_SCOPE = "https://www.googleapis.com/auth/androidpublisher";
const ANDROID_PUBLISHER_BASE = "https://androidpublisher.googleapis.com/androidpublisher/v3";
/** Play-supported regions catalog version required by monetization APIs. */
const REGIONS_VERSION = "2022/02";

export const CREATOR_MEMBERSHIP_PRODUCT_PREFIX = "elix.creator.";
export const CREATOR_MEMBERSHIP_BASE_PLAN_ID = "monthly";

export type MembershipProvisionStatus = "pending" | "active" | "error";

export type MoneyParts = { currencyCode: string; units: string; nanos: number };

export type MembershipPriceConfig = {
  regions: Array<{ regionCode: string; price: MoneyParts }>;
  otherUsd: MoneyParts;
  otherEur: MoneyParts;
  title: string;
  benefits: string[];
};

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
  /**
   * "invalid" — Google answered and this token is not acceptable.
   * "not_entitled" — Google answered and the subscription is not currently active.
   * "unavailable" — no verdict was reached (credentials, upstream, timeout).
   * Callers must offer a retry on "unavailable" and must never downgrade a
   * stored entitlement from it.
   */
  reason: "invalid" | "not_entitled" | "unavailable";
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
    return { ok: false, entitled: false, error: "malformed_payload", reason: "invalid" };
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
    return { ok: false, entitled: false, error: "product_mismatch", reason: "invalid" };
  }

  const subscriptionState =
    normalizeEnum(p.subscriptionState, "SUBSCRIPTION_STATE_") ?? "UNSPECIFIED";

  const expiryRaw = lineItem.expiryTime;
  const expiryMs = typeof expiryRaw === "string" ? Date.parse(expiryRaw) : NaN;
  if (!Number.isFinite(expiryMs)) {
    return {
      ok: false,
      entitled: false,
      error: "missing_expiry",
      reason: "invalid",
      subscriptionState,
    };
  }

  if (!ENTITLED_STATES.has(subscriptionState) || expiryMs <= nowMs) {
    return {
      ok: false,
      entitled: false,
      error: "not_entitled",
      reason: "not_entitled",
      subscriptionState,
    };
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
 * A non-2xx androidpublisher answer is only the buyer's problem when Google
 * actually judged the token. 401/403 means our service account is broken,
 * 429 and 5xx mean Google is busy or down: in all of those cases Play has
 * already taken the money and the same token must stay retryable.
 */
function googleApiFailureReason(status: number): "invalid" | "unavailable" {
  if (status === 401 || status === 403 || status === 429 || status >= 500) return "unavailable";
  return "invalid";
}

/**
 * Play one-time product purchase (`purchases.products.get`).
 * `quantity` and `purchaseType` come from Google, never from the client:
 * purchaseType is present only for purchases nobody paid full price for
 * (0 test, 1 promo, 2 rewarded), so settlement must not derive GBP from them.
 */
export type GooglePlayProductPurchase = {
  valid: true;
  productId: string;
  orderId: string | null;
  /** Units bought. Multi-quantity is off unless enabled in Play Console. */
  quantity: number;
  /** 0 test, 1 promo, 2 rewarded, null for a normal paid purchase. */
  purchaseType: number | null;
  acknowledgementState: number | null;
  purchaseTimeMillis: string | null;
  obfuscatedExternalAccountId: string | null;
  payload: Record<string, unknown>;
  detail: string;
};

export type GooglePlayProductLookup =
  | GooglePlayProductPurchase
  | {
      valid: false;
      reason: "invalid" | "unavailable";
      productId?: string;
      detail: string;
    };

export async function verifyGooglePlayProductPurchase(input: {
  productId: string;
  purchaseToken: string;
}): Promise<GooglePlayProductLookup> {
  const productId = String(input.productId || "").trim();
  const purchaseToken = String(input.purchaseToken || "").trim();
  if (!productId || !purchaseToken) {
    return { valid: false, reason: "invalid", detail: "missing_product_or_token" };
  }
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim()) {
    logger.error("[IAP] Google service account not configured — rejecting purchase");
    return { valid: false, reason: "unavailable", detail: "GOOGLE_CREDENTIALS_NOT_CONFIGURED" };
  }
  const accessToken = await getAndroidPublisherAccessToken();
  if (!accessToken) {
    return { valid: false, reason: "unavailable", detail: "google_auth_failed" };
  }
  const packageName = googlePlayPackageName();
  const url = `${ANDROID_PUBLISHER_BASE}/applications/${encodeURIComponent(packageName)}/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}`;
  let payload: Record<string, unknown>;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      return {
        valid: false,
        reason: googleApiFailureReason(res.status),
        productId,
        detail: `google-verify-${res.status}${detail ? `: ${detail}` : ""}`,
      };
    }
    const json = (await res.json()) as unknown;
    if (!json || typeof json !== "object" || Array.isArray(json)) {
      return { valid: false, reason: "invalid", productId, detail: "google-malformed-payload" };
    }
    payload = json as Record<string, unknown>;
  } catch (e) {
    // A timeout or socket error is not a verdict on the purchase.
    return {
      valid: false,
      reason: "unavailable",
      productId,
      detail: e instanceof Error ? e.message : "fetch_failed",
    };
  }

  // purchaseState: 0 purchased, 1 canceled, 2 pending. Pending is not money.
  const purchaseState = Number(payload.purchaseState);
  if (purchaseState !== 0) {
    return {
      valid: false,
      reason: "invalid",
      productId,
      detail: `google-purchase-state-${payload.purchaseState}`,
    };
  }
  // consumptionState: 0 not yet consumed, 1 consumed. An already-consumed token
  // may still settle once — the durable purchase record is the dedupe authority,
  // and our own server consume runs after credit.
  const consumptionState = Number(payload.consumptionState);
  if (consumptionState !== 0 && consumptionState !== 1) {
    return {
      valid: false,
      reason: "invalid",
      productId,
      detail: `google-consumption-state-${payload.consumptionState}`,
    };
  }
  const quantity = Number.isFinite(Number(payload.quantity))
    ? Math.max(1, Math.floor(Number(payload.quantity)))
    : 1;
  // refundableQuantity is what has NOT been refunded. Zero of a bought quantity
  // means Google already gave the money back, so this must never credit.
  if (payload.refundableQuantity != null) {
    const refundable = Math.max(0, Math.floor(Number(payload.refundableQuantity) || 0));
    if (refundable === 0) {
      return { valid: false, reason: "invalid", productId, detail: "google-purchase-refunded" };
    }
  }

  return {
    valid: true,
    productId,
    orderId: typeof payload.orderId === "string" && payload.orderId ? payload.orderId : null,
    quantity,
    purchaseType: Number.isFinite(Number(payload.purchaseType))
      ? Math.floor(Number(payload.purchaseType))
      : null,
    acknowledgementState: Number.isFinite(Number(payload.acknowledgementState))
      ? Math.floor(Number(payload.acknowledgementState))
      : null,
    purchaseTimeMillis:
      typeof payload.purchaseTimeMillis === "string" ? payload.purchaseTimeMillis : null,
    obfuscatedExternalAccountId:
      typeof payload.obfuscatedExternalAccountId === "string" &&
      payload.obfuscatedExternalAccountId
        ? payload.obfuscatedExternalAccountId
        : null,
    payload,
    detail: JSON.stringify({
      orderId: payload.orderId ?? null,
      purchaseState,
      quantity,
      purchaseType: payload.purchaseType ?? null,
    }),
  };
}

export async function consumeGooglePlayProduct(input: {
  productId: string;
  purchaseToken: string;
}): Promise<
  | { ok: true; alreadyConsumed?: boolean }
  | { ok: false; retryable: boolean; status: number; detail: string }
> {
  const productId = String(input.productId || "").trim();
  const purchaseToken = String(input.purchaseToken || "").trim();
  if (!productId || !purchaseToken) {
    return { ok: false, retryable: false, status: 400, detail: "missing_product_or_token" };
  }
  const accessToken = await getAndroidPublisherAccessToken();
  if (!accessToken) {
    return { ok: false, retryable: true, status: 503, detail: "google_auth_failed" };
  }
  const packageName = googlePlayPackageName();
  const url = `${ANDROID_PUBLISHER_BASE}/applications/${encodeURIComponent(packageName)}/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}:consume`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok || res.status === 204) {
      return { ok: true };
    }
    const detail = (await res.text().catch(() => "")).slice(0, 400);
    const already =
      res.status === 410 ||
      /already.?consumed|productNotConsumed/i.test(detail);
    if (already) {
      return { ok: true, alreadyConsumed: true };
    }
    return {
      ok: false,
      retryable: res.status >= 500 || res.status === 429,
      status: res.status,
      detail: `status_${res.status}${detail ? `: ${detail}` : ""}`,
    };
  } catch (e) {
    return {
      ok: false,
      retryable: true,
      status: 502,
      detail: e instanceof Error ? e.message : "fetch_failed",
    };
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
    return {
      ok: false,
      entitled: false,
      error: "google_not_configured",
      reason: "unavailable",
    };
  }
  const accessToken = await getAndroidPublisherAccessToken();
  if (!accessToken) {
    return { ok: false, entitled: false, error: "google_auth_failed", reason: "unavailable" };
  }
  const packageName = googlePlayPackageName();
  const url = `${ANDROID_PUBLISHER_BASE}/applications/${encodeURIComponent(packageName)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15_000),
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
        reason: googleApiFailureReason(res.status),
        detail: `status_${res.status}${detail ? `: ${detail.slice(0, 300)}` : ""}`,
      };
    }
    const payload = (await res.json()) as unknown;
    return parseGoogleSubscriptionPayload(payload, expectedProductId);
  } catch (e) {
    logger.error({ err: e, expectedProductId }, "Google subscriptionsv2 verify failed");
    return {
      ok: false,
      entitled: false,
      error: "google_http_error",
      reason: "unavailable",
      detail: "fetch_failed",
    };
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
      signal: AbortSignal.timeout(15_000),
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

// ── Monetization: get-or-create dynamic creator subscription products ──

/** Parse "4.99" / "4" into Play Money units+nanos. */
export function parseMoneyAmount(raw: string, currencyCode: string): MoneyParts {
  const cleaned = String(raw || "").trim().replace(/[^0-9.]/g, "");
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) {
    return { currencyCode, units: "4", nanos: 990_000_000 };
  }
  const units = Math.floor(n);
  const nanos = Math.round((n - units) * 1_000_000_000);
  return {
    currencyCode,
    units: String(units),
    nanos: Math.min(999_999_999, Math.max(0, nanos)),
  };
}

/**
 * Launch default pricing until per-creator pricing UI exists.
 * Override via Coolify:
 *   CREATOR_MEMBERSHIP_PRICE_GBP=9.99
 *   CREATOR_MEMBERSHIP_PRICE_USD=9.99
 *   CREATOR_MEMBERSHIP_PRICE_EUR=9.99
 *   CREATOR_MEMBERSHIP_REGIONS=GB,US
 */
export function loadMembershipPriceConfig(): MembershipPriceConfig {
  const gbp = parseMoneyAmount(process.env.CREATOR_MEMBERSHIP_PRICE_GBP || "9.99", "GBP");
  const usd = parseMoneyAmount(process.env.CREATOR_MEMBERSHIP_PRICE_USD || "9.99", "USD");
  const eur = parseMoneyAmount(process.env.CREATOR_MEMBERSHIP_PRICE_EUR || "9.99", "EUR");
  const regionsRaw = (process.env.CREATOR_MEMBERSHIP_REGIONS || "GB,US")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const regions = regionsRaw.map((regionCode) => ({
    regionCode,
    price: regionCode === "GB" || regionCode === "UK" ? gbp : usd,
  }));
  return {
    regions: regions.length ? regions : [{ regionCode: "GB", price: gbp }],
    otherUsd: usd,
    otherEur: eur,
    title: (process.env.CREATOR_MEMBERSHIP_TITLE || "Creator Membership").slice(0, 55),
    benefits: [
      "Support this creator every month",
      "Unlock exclusive membership stickers",
    ],
  };
}

function subscriptionResourceUrl(packageName: string, productId: string): string {
  return `${ANDROID_PUBLISHER_BASE}/applications/${encodeURIComponent(packageName)}/subscriptions/${encodeURIComponent(productId)}`;
}

function isBasePlanActive(subscription: unknown): boolean {
  if (!subscription || typeof subscription !== "object") return false;
  const basePlans = Array.isArray((subscription as { basePlans?: unknown }).basePlans)
    ? ((subscription as { basePlans: unknown[] }).basePlans)
    : [];
  const monthly = basePlans.find(
    (bp): bp is Record<string, unknown> =>
      Boolean(bp) &&
      typeof bp === "object" &&
      (bp as Record<string, unknown>).basePlanId === CREATOR_MEMBERSHIP_BASE_PLAN_ID,
  );
  if (!monthly) return false;
  const state = normalizeEnum(monthly.state, "STATE_") || String(monthly.state || "");
  return state === "ACTIVE";
}

async function playGetSubscription(
  accessToken: string,
  packageName: string,
  productId: string,
): Promise<{ status: number; body: unknown; detail?: string }> {
  const res = await fetch(subscriptionResourceUrl(packageName, productId), {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text().catch(() => "");
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }
  return { status: res.status, body, detail: text.slice(0, 400) };
}

async function playCreateSubscription(
  accessToken: string,
  packageName: string,
  productId: string,
  price: MembershipPriceConfig,
): Promise<{ ok: boolean; status: number; body: unknown; detail?: string }> {
  const qs = new URLSearchParams({
    productId,
    "regionsVersion.version": REGIONS_VERSION,
  });
  const url = `${ANDROID_PUBLISHER_BASE}/applications/${encodeURIComponent(packageName)}/subscriptions?${qs.toString()}`;
  const body = {
    packageName,
    productId,
    listings: [
      {
        languageCode: "en-GB",
        title: price.title,
        benefits: price.benefits,
      },
    ],
    basePlans: [
      {
        basePlanId: CREATOR_MEMBERSHIP_BASE_PLAN_ID,
        autoRenewingBasePlanType: {
          billingPeriodDuration: "P1M",
          gracePeriodDuration: "P3D",
          resubscribeState: "RESUBSCRIBE_STATE_ACTIVE",
        },
        regionalConfigs: price.regions.map((r) => ({
          regionCode: r.regionCode === "UK" ? "GB" : r.regionCode,
          newSubscriberAvailability: true,
          price: {
            currencyCode: r.price.currencyCode,
            units: r.price.units,
            nanos: r.price.nanos,
          },
        })),
        otherRegionsConfig: {
          usdPrice: {
            currencyCode: price.otherUsd.currencyCode,
            units: price.otherUsd.units,
            nanos: price.otherUsd.nanos,
          },
          eurPrice: {
            currencyCode: price.otherEur.currencyCode,
            units: price.otherEur.units,
            nanos: price.otherEur.nanos,
          },
          newSubscriberAvailability: true,
        },
      },
    ],
  };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text().catch(() => "");
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }
  return {
    ok: res.ok,
    status: res.status,
    body: parsed,
    detail: text.slice(0, 500),
  };
}

async function playActivateBasePlan(
  accessToken: string,
  packageName: string,
  productId: string,
): Promise<{ ok: boolean; status: number; detail?: string }> {
  const url = `${subscriptionResourceUrl(packageName, productId)}/basePlans/${encodeURIComponent(CREATOR_MEMBERSHIP_BASE_PLAN_ID)}:activate`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
    signal: AbortSignal.timeout(15_000),
  });
  const detail = await res.text().catch(() => "");
  return { ok: res.ok, status: res.status, detail: detail.slice(0, 500) };
}

async function upsertProvisionRow(input: {
  creatorId: string;
  productId: string;
  status: MembershipProvisionStatus;
  playState?: string | null;
  lastError?: string | null;
  priceSnapshot?: MembershipPriceConfig | null;
  activated?: boolean;
}): Promise<void> {
  const pool = getPool();
  if (!pool) throw new Error("DATABASE_UNAVAILABLE");
  await pool.query(
    `INSERT INTO elix_creator_membership_products
       (creator_id, product_id, base_plan_id, status, play_state, last_error, price_snapshot, activated_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, CASE WHEN $8 THEN NOW() ELSE NULL END, NOW())
     ON CONFLICT (creator_id) DO UPDATE SET
       product_id = EXCLUDED.product_id,
       base_plan_id = EXCLUDED.base_plan_id,
       status = EXCLUDED.status,
       play_state = EXCLUDED.play_state,
       last_error = EXCLUDED.last_error,
       price_snapshot = COALESCE(EXCLUDED.price_snapshot, elix_creator_membership_products.price_snapshot),
       activated_at = CASE
         WHEN $8 THEN COALESCE(elix_creator_membership_products.activated_at, NOW())
         ELSE elix_creator_membership_products.activated_at
       END,
       updated_at = NOW()`,
    [
      input.creatorId,
      input.productId,
      CREATOR_MEMBERSHIP_BASE_PLAN_ID,
      input.status,
      input.playState ?? null,
      input.lastError ?? null,
      input.priceSnapshot ? JSON.stringify(input.priceSnapshot) : null,
      input.activated === true,
    ],
  );
}

export type EnsureMembershipProductResult = {
  productId: string;
  basePlanId: string;
  purchaseReady: boolean;
  status: MembershipProvisionStatus;
  detail?: string;
};

/**
 * Idempotent get-or-create for a creator's Google Play subscription product.
 * Ensures product `elix.creator.<hash>` exists with an ACTIVE `monthly` base plan.
 */
export async function ensureCreatorMembershipProduct(
  creatorId: string,
): Promise<EnsureMembershipProductResult> {
  const productId = creatorMembershipProductId(creatorId);
  const basePlanId = CREATOR_MEMBERSHIP_BASE_PLAN_ID;
  const pool = getPool();

  if (pool) {
    try {
      const cached = await pool.query(
        `SELECT status, updated_at
           FROM elix_creator_membership_products
          WHERE creator_id = $1 AND product_id = $2
          LIMIT 1`,
        [creatorId, productId],
      );
      const row = cached.rows[0] as { status?: string; updated_at?: Date | string } | undefined;
      if (row?.status === "active") {
        const updatedMs = row.updated_at ? new Date(row.updated_at).getTime() : 0;
        // Trust a recent active cache to avoid Play API rate pressure.
        if (Number.isFinite(updatedMs) && Date.now() - updatedMs < 24 * 60 * 60 * 1000) {
          return {
            productId,
            basePlanId,
            purchaseReady: true,
            status: "active",
          };
        }
      }
    } catch (err) {
      logger.warn({ err, creatorId }, "membership product cache read failed — continuing with Play API");
    }
  }

  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim()) {
    await upsertProvisionRow({
      creatorId,
      productId,
      status: "error",
      lastError: "google_not_configured",
    });
    return {
      productId,
      basePlanId,
      purchaseReady: false,
      status: "error",
      detail: "GOOGLE_SERVICE_ACCOUNT_JSON is required to provision memberships",
    };
  }

  const accessToken = await getAndroidPublisherAccessToken();
  if (!accessToken) {
    await upsertProvisionRow({
      creatorId,
      productId,
      status: "error",
      lastError: "google_auth_failed",
    });
    return {
      productId,
      basePlanId,
      purchaseReady: false,
      status: "error",
      detail: "Google Play auth failed — check service account permissions",
    };
  }

  const packageName = googlePlayPackageName();
  const price = loadMembershipPriceConfig();

  try {
    let existing = await playGetSubscription(accessToken, packageName, productId);

    if (existing.status === 404) {
      const created = await playCreateSubscription(accessToken, packageName, productId, price);
      if (!created.ok && created.status !== 409) {
        await upsertProvisionRow({
          creatorId,
          productId,
          status: "error",
          playState: `create_${created.status}`,
          lastError: created.detail || `create_failed_${created.status}`,
          priceSnapshot: price,
        });
        return {
          productId,
          basePlanId,
          purchaseReady: false,
          status: "error",
          detail:
            created.detail ||
            "Failed to create Play subscription — grant the service account Monetization / Manage store presence permission",
        };
      }
      existing = await playGetSubscription(accessToken, packageName, productId);
    } else if (existing.status !== 200) {
      await upsertProvisionRow({
        creatorId,
        productId,
        status: "error",
        playState: `get_${existing.status}`,
        lastError: existing.detail || `get_failed_${existing.status}`,
      });
      return {
        productId,
        basePlanId,
        purchaseReady: false,
        status: "error",
        detail: existing.detail || `Play get subscription failed (${existing.status})`,
      };
    }

    if (!isBasePlanActive(existing.body)) {
      const activated = await playActivateBasePlan(accessToken, packageName, productId);
      if (!activated.ok && activated.status !== 409) {
        await upsertProvisionRow({
          creatorId,
          productId,
          status: "error",
          playState: `activate_${activated.status}`,
          lastError: activated.detail || `activate_failed_${activated.status}`,
          priceSnapshot: price,
        });
        return {
          productId,
          basePlanId,
          purchaseReady: false,
          status: "error",
          detail:
            activated.detail ||
            "Failed to activate monthly base plan in Google Play",
        };
      }
      // Re-read after activate for truth.
      existing = await playGetSubscription(accessToken, packageName, productId);
    }

    const ready = existing.status === 200 && isBasePlanActive(existing.body);
    await upsertProvisionRow({
      creatorId,
      productId,
      status: ready ? "active" : "pending",
      playState: ready ? "ACTIVE" : "DRAFT",
      lastError: ready ? null : "base_plan_not_active_yet",
      priceSnapshot: price,
      activated: ready,
    });

    return {
      productId,
      basePlanId,
      purchaseReady: ready,
      status: ready ? "active" : "pending",
      detail: ready ? undefined : "Membership product is still activating in Google Play",
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err, creatorId, productId }, "ensureCreatorMembershipProduct failed");
    await upsertProvisionRow({
      creatorId,
      productId,
      status: "error",
      lastError: msg.slice(0, 500),
      priceSnapshot: price,
    });
    return {
      productId,
      basePlanId,
      purchaseReady: false,
      status: "error",
      detail: msg,
    };
  }
}
