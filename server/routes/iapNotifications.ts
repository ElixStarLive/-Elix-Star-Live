/**
 * Store refund / void notifications for Google Play and Apple IAP.
 * Reverses credited coins and still-pending creator gift earnings.
 * Google subscription RTDN reconciles creator-membership entitlements.
 */
import { createHash, timingSafeEqual } from "crypto";
import { Request, Response } from "express";
import { OAuth2Client } from "google-auth-library";
import { logger } from "../lib/logger";
import { getPool } from "../lib/postgres";
import {
  neonReverseIapPurchase,
  neonUpdateMembershipSubscriptionState,
  neonUpsertMembershipEntitlement,
} from "../lib/walletNeon";
import {
  hashPurchaseToken,
  verifyGoogleSubscription,
} from "../lib/googlePlaySubscriptions";
import {
  hashAppleOriginalTransactionId,
  verifyAppleJwsPayload,
  verifyAppleSubscription,
} from "../lib/appleIap";

function googleProviderTxnFromToken(purchaseToken: string): string {
  return `token_sha256:${createHash("sha256").update(purchaseToken).digest("hex")}`;
}

function callbackSecretIsValid(req: Request, expected: string | undefined): boolean | null {
  const configured = expected?.trim();
  if (!configured) return null;
  const supplied = String(
    req.query.token ||
      req.headers["x-elix-webhook-secret"] ||
      "",
  );
  const actual = Buffer.from(supplied);
  const wanted = Buffer.from(configured);
  return actual.length === wanted.length && timingSafeEqual(actual, wanted);
}

// Optional Google Pub/Sub OIDC push-token verification (defense in depth on top
// of the URL secret). Enabled only when GOOGLE_RTDN_OIDC_AUDIENCE is set, so
// existing secret-only deployments keep working unchanged. When enabled, the
// Pub/Sub push must carry a valid Google-signed OIDC JWT in the Authorization
// header whose audience matches, and (optionally) whose service-account email
// matches GOOGLE_RTDN_OIDC_SA_EMAIL.
let rtdnOidcClient: OAuth2Client | null = null;
function rtdnOidcConfigured(): boolean {
  return !!process.env.GOOGLE_RTDN_OIDC_AUDIENCE?.trim();
}
async function googleRtdnOidcValid(req: Request): Promise<boolean> {
  const audience = process.env.GOOGLE_RTDN_OIDC_AUDIENCE?.trim();
  if (!audience) return true; // not enforced
  const authz = String(req.headers["authorization"] || "");
  const match = authz.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;
  try {
    if (!rtdnOidcClient) rtdnOidcClient = new OAuth2Client();
    const ticket = await rtdnOidcClient.verifyIdToken({ idToken: match[1], audience });
    const payload = ticket.getPayload();
    if (!payload) return false;
    const expectedEmail = process.env.GOOGLE_RTDN_OIDC_SA_EMAIL?.trim();
    if (expectedEmail) {
      if (payload.email !== expectedEmail) return false;
      if (payload.email_verified === false) return false;
    }
    return true;
  } catch (err) {
    logger.warn({ err }, "Google RTDN OIDC verification failed");
    return false;
  }
}

async function decodeAppleNotificationPayload(
  token: string,
): Promise<Record<string, unknown> | null> {
  const verified = await verifyAppleJwsPayload(token);
  if (verified) return verified as Record<string, unknown>;
  // Fail closed for membership/refund paths — unsigned payloads are rejected.
  return null;
}

async function reconcileAppleSubscriptionEntitlement(
  originalTransactionId: string,
  productIdHint?: string,
): Promise<{ ok: boolean; updated: boolean; detail?: string }> {
  const pool = getPool();
  if (!pool) return { ok: false, detail: "database_unavailable" };

  const purchaseTokenHash = hashAppleOriginalTransactionId(originalTransactionId);
  const existing = await pool.query(
    `SELECT user_id, creator_id, product_id
       FROM elix_membership_purchases
      WHERE provider = 'apple'
        AND (
          purchase_token_hash = $1
          OR provider_transaction_id = $2
        )
      LIMIT 1`,
    [purchaseTokenHash, originalTransactionId],
  );
  if (!existing.rowCount) {
    return { ok: true, updated: false, detail: "membership_not_found" };
  }

  const row = existing.rows[0];
  const productId =
    (row.product_id != null ? String(row.product_id) : "") ||
    (productIdHint ? String(productIdHint) : "");
  const userId = String(row.user_id);
  const creatorId = row.creator_id != null ? String(row.creator_id) : "";
  if (!productId || !creatorId) {
    return { ok: true, updated: false, detail: "membership_incomplete" };
  }

  const verified = await verifyAppleSubscription(originalTransactionId, productId);
  if (verified.ok && verified.entitled) {
    const upserted = await neonUpsertMembershipEntitlement({
      userId,
      creatorId,
      provider: "apple",
      purchaseTokenHash,
      providerTransactionId: verified.originalTransactionId,
      productId,
      basePlanId: "monthly",
      subscriptionState: verified.subscriptionState,
      expiresAt: verified.expiresAt,
      autoRenewEnabled: verified.autoRenewEnabled,
      acknowledgementState: "ACKNOWLEDGED",
      latestOrderId: verified.transactionId,
      linkedPurchaseTokenHash: null,
      verification: {
        provider: "apple",
        source: "app_store_notification",
        productId,
        subscriptionState: verified.subscriptionState,
        expiresAt: verified.expiresAt,
      },
    });
    if (!upserted.ok) return { ok: false, updated: false, detail: upserted.error };
    return { ok: true, updated: true };
  }

  const state = verified.subscriptionState || "EXPIRED";
  const updated = await neonUpdateMembershipSubscriptionState({
    purchaseTokenHash,
    subscriptionState: state,
    expiresAt: null,
    autoRenewEnabled: false,
  });
  if (!updated.ok) return { ok: false, updated: false, detail: updated.error };
  return { ok: true, updated: updated.updated };
}

async function reconcileGoogleSubscriptionEntitlement(purchaseToken: string): Promise<{
  ok: boolean;
  updated: boolean;
  detail?: string;
}> {
  const pool = getPool();
  if (!pool) return { ok: false, detail: "database_unavailable" };

  const purchaseTokenHash = hashPurchaseToken(purchaseToken);
  const existing = await pool.query(
    `SELECT user_id, creator_id, product_id
       FROM elix_membership_purchases
      WHERE purchase_token_hash = $1
      LIMIT 1`,
    [purchaseTokenHash],
  );
  if (!existing.rowCount) {
    return { ok: true, updated: false, detail: "membership_not_found" };
  }

  const row = existing.rows[0];
  const productId = row.product_id != null ? String(row.product_id) : "";
  const userId = String(row.user_id);
  const creatorId = row.creator_id != null ? String(row.creator_id) : "";
  if (!productId || !creatorId) {
    return { ok: true, updated: false, detail: "membership_incomplete" };
  }

  const verified = await verifyGoogleSubscription(purchaseToken, productId);
  if (verified.ok && verified.entitled) {
    const upserted = await neonUpsertMembershipEntitlement({
      userId,
      creatorId,
      provider: "google",
      purchaseTokenHash,
      productId,
      basePlanId: verified.basePlanId,
      subscriptionState: verified.subscriptionState,
      expiresAt: verified.expiresAt,
      autoRenewEnabled: verified.autoRenewEnabled,
      acknowledgementState: verified.acknowledgementState,
      latestOrderId: verified.latestOrderId,
      linkedPurchaseTokenHash: verified.linkedPurchaseTokenHash,
      verification: {
        provider: "google",
        source: "rtdn",
        productId,
        subscriptionState: verified.subscriptionState,
        expiresAt: verified.expiresAt,
      },
    });
    if (!upserted.ok) return { ok: false, updated: false, detail: upserted.error };
    return { ok: true, updated: true };
  }

  // Not entitled (expired / on hold / revoked / etc.) — persist authoritative state.
  const state = verified.subscriptionState || "EXPIRED";
  const updated = await neonUpdateMembershipSubscriptionState({
    purchaseTokenHash,
    subscriptionState: state,
    expiresAt: null,
    autoRenewEnabled: false,
  });
  if (!updated.ok) return { ok: false, updated: false, detail: updated.error };
  return { ok: true, updated: updated.updated };
}

/**
 * Google Play Real-time Developer Notifications (Pub/Sub push).
 * Expects the standard Pub/Sub envelope; message.data is base64 JSON.
 */
export async function handleGooglePlayRtdn(req: Request, res: Response) {
  try {
    const secretAuth = callbackSecretIsValid(
      req,
      process.env.GOOGLE_RTDN_WEBHOOK_SECRET,
    );
    const oidcOn = rtdnOidcConfigured();
    // At least one auth mechanism must be configured.
    if (secretAuth === null && !oidcOn) {
      return res.status(503).json({ error: "Google RTDN webhook is not configured" });
    }
    // If a URL secret is configured, it must match.
    if (secretAuth === false) return res.status(401).json({ error: "Unauthorized" });
    // If OIDC is enabled, the Pub/Sub push JWT must verify.
    if (oidcOn && !(await googleRtdnOidcValid(req))) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const dataB64 =
      body && typeof body === "object" && body.message && typeof body.message.data === "string"
        ? body.message.data
        : null;
    if (!dataB64) {
      return res.status(400).json({ error: "Invalid Pub/Sub payload" });
    }
    const decoded = JSON.parse(Buffer.from(dataB64, "base64").toString("utf8")) as {
      packageName?: string;
      voidedPurchaseNotification?: { purchaseToken?: string; orderId?: string };
      oneTimeProductNotification?: { purchaseToken?: string; notificationType?: number };
      subscriptionNotification?: { purchaseToken?: string; notificationType?: number };
    };

    const expectedPackage = process.env.GOOGLE_PLAY_PACKAGE_NAME || "com.elixstarlive.app";
    if (decoded.packageName && decoded.packageName !== expectedPackage) {
      return res.status(400).json({ error: "Package name mismatch" });
    }

    const voided = decoded.voidedPurchaseNotification;
    if (voided?.purchaseToken) {
      const providerTransactionId = googleProviderTxnFromToken(voided.purchaseToken);
      const result = await neonReverseIapPurchase({
        provider: "google",
        providerTransactionId,
      });
      if (!result.ok && result.error !== "purchase_not_found") {
        logger.error({ result }, "Google RTDN reverse failed");
        return res.status(500).json({ error: "reverse_failed" });
      }

      // Also revoke any creator-membership entitlement bound to this token.
      const membership = await neonUpdateMembershipSubscriptionState({
        purchaseTokenHash: hashPurchaseToken(voided.purchaseToken),
        subscriptionState: "EXPIRED",
        expiresAt: new Date().toISOString(),
        autoRenewEnabled: false,
      });
      if (!membership.ok) {
        return res.status(500).json({ error: "membership_reverse_failed" });
      }

      logger.info(
        {
          providerTransactionId,
          ok: result.ok,
          alreadyProcessed: result.ok ? result.alreadyProcessed : false,
          reversedCoins: result.ok ? result.reversedCoins : 0,
          membershipUpdated: membership.updated,
        },
        "Google RTDN void processed",
      );
      return res.status(200).json({ ok: true });
    }

    const sub = decoded.subscriptionNotification;
    if (sub?.purchaseToken) {
      const reconciled = await reconcileGoogleSubscriptionEntitlement(sub.purchaseToken);
      if (!reconciled.ok) {
        logger.error({ reconciled }, "Google RTDN subscription reconcile failed");
        return res.status(500).json({ error: "subscription_reconcile_failed" });
      }
      logger.info(
        {
          notificationType: sub.notificationType,
          updated: reconciled.updated,
          detail: reconciled.detail,
        },
        "Google RTDN subscription processed",
      );
      return res.status(200).json({ ok: true, updated: reconciled.updated });
    }

    // Acknowledge other notification types so Pub/Sub does not retry forever.
    return res.status(200).json({ ok: true, ignored: true });
  } catch (err) {
    logger.error({ err }, "handleGooglePlayRtdn failed");
    return res.status(500).json({ error: "RTDN_ERROR" });
  }
}

/**
 * Apple App Store Server Notifications V2.
 * Uses signedPayload and a mandatory secret embedded in the configured callback
 * URL (or supplied through x-elix-webhook-secret for controlled tests).
 */
export async function handleAppleIapNotification(req: Request, res: Response) {
  try {
    const authorized = callbackSecretIsValid(
      req,
      process.env.APPLE_IAP_NOTIFICATION_SECRET,
    );
    if (authorized === null) {
      return res.status(503).json({ error: "Apple IAP webhook is not configured" });
    }
    if (!authorized) return res.status(401).json({ error: "Unauthorized" });

    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const signedPayload =
      body && typeof body === "object" && typeof body.signedPayload === "string"
        ? body.signedPayload
        : null;
    if (!signedPayload) {
      return res.status(400).json({ error: "signedPayload required" });
    }

    const outer = await decodeAppleNotificationPayload(signedPayload);
    if (!outer) return res.status(400).json({ error: "Invalid signedPayload" });

    const notificationType = String(outer.notificationType || "");
    const data = (outer.data && typeof outer.data === "object" ? outer.data : {}) as Record<
      string,
      unknown
    >;
    const signedTransactionInfo =
      typeof data.signedTransactionInfo === "string" ? data.signedTransactionInfo : "";
    const tx = signedTransactionInfo
      ? await decodeAppleNotificationPayload(signedTransactionInfo)
      : null;
    const transactionId =
      (tx && typeof tx.transactionId === "string" && tx.transactionId) || "";
    const originalTransactionId =
      (tx && typeof tx.originalTransactionId === "string" && tx.originalTransactionId) ||
      transactionId;
    const productId = tx && typeof tx.productId === "string" ? tx.productId : "";

    if (
      (notificationType === "REFUND" ||
        notificationType === "REVOKE" ||
        notificationType === "REFUND_REVERSED") &&
      transactionId
    ) {
      if (notificationType === "REFUND_REVERSED") {
        // Coins already clawed back on REFUND; do not re-credit automatically.
        return res.status(200).json({ ok: true, ignored: "refund_reversed" });
      }
      const result = await neonReverseIapPurchase({
        provider: "apple",
        providerTransactionId: transactionId,
      });
      if (!result.ok && result.error !== "purchase_not_found") {
        logger.error({ result, notificationType }, "Apple IAP reverse failed");
        return res.status(500).json({ error: "reverse_failed" });
      }
      if (originalTransactionId) {
        await reconcileAppleSubscriptionEntitlement(originalTransactionId, productId);
      }
      logger.info(
        {
          transactionId,
          notificationType,
          ok: result.ok,
          alreadyProcessed: result.ok ? result.alreadyProcessed : false,
          reversedCoins: result.ok ? result.reversedCoins : 0,
        },
        "Apple IAP refund/revoke processed",
      );
      return res.status(200).json({ ok: true });
    }

    const membershipLifecycle = new Set([
      "SUBSCRIBED",
      "DID_RENEW",
      "DID_CHANGE_RENEWAL_STATUS",
      "DID_FAIL_TO_RENEW",
      "GRACE_PERIOD_EXPIRED",
      "EXPIRED",
      "DID_CHANGE_RENEWAL_PREF",
      "OFFER_REDEEMED",
      "PRICE_INCREASE",
    ]);
    if (membershipLifecycle.has(notificationType) && originalTransactionId) {
      const reconciled = await reconcileAppleSubscriptionEntitlement(
        originalTransactionId,
        productId,
      );
      if (!reconciled.ok) {
        logger.error({ reconciled, notificationType }, "Apple membership reconcile failed");
        return res.status(500).json({ error: "membership_reconcile_failed" });
      }
      return res.status(200).json({ ok: true, updated: reconciled.updated });
    }

    return res.status(200).json({ ok: true, ignored: true });
  } catch (err) {
    logger.error({ err }, "handleAppleIapNotification failed");
    return res.status(500).json({ error: "APPLE_IAP_NOTIFY_ERROR" });
  }
}
