/**
 * Store refund / void notifications for Google Play and Apple IAP.
 * Reverses credited coins and still-pending creator gift earnings.
 * Google subscription RTDN reconciles creator-membership entitlements.
 */
import { createHash, timingSafeEqual } from "crypto";
import { Request, Response } from "express";
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

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const json = Buffer.from(parts[1], "base64url").toString("utf8");
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
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
    const authorized = callbackSecretIsValid(
      req,
      process.env.GOOGLE_RTDN_WEBHOOK_SECRET,
    );
    if (authorized === null) {
      return res.status(503).json({ error: "Google RTDN webhook is not configured" });
    }
    if (!authorized) return res.status(401).json({ error: "Unauthorized" });

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

    const outer = decodeJwtPayload(signedPayload);
    if (!outer) return res.status(400).json({ error: "Invalid signedPayload" });

    const notificationType = String(outer.notificationType || "");
    const data = (outer.data && typeof outer.data === "object" ? outer.data : {}) as Record<
      string,
      unknown
    >;
    const signedTransactionInfo =
      typeof data.signedTransactionInfo === "string" ? data.signedTransactionInfo : "";
    const tx = signedTransactionInfo ? decodeJwtPayload(signedTransactionInfo) : null;
    const transactionId =
      (tx && typeof tx.transactionId === "string" && tx.transactionId) ||
      (tx && typeof tx.originalTransactionId === "string" && tx.originalTransactionId) ||
      "";

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

    return res.status(200).json({ ok: true, ignored: true });
  } catch (err) {
    logger.error({ err }, "handleAppleIapNotification failed");
    return res.status(500).json({ error: "APPLE_IAP_NOTIFY_ERROR" });
  }
}
