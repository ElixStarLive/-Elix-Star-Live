/**
 * Store refund / void notifications for Google Play and Apple IAP.
 * Reverses credited coins and still-pending creator gift earnings.
 */
import { createHash } from "crypto";
import { Request, Response } from "express";
import { logger } from "../lib/logger";
import { neonReverseIapPurchase } from "../lib/walletNeon";

function googleProviderTxnFromToken(purchaseToken: string): string {
  return `token_sha256:${createHash("sha256").update(purchaseToken).digest("hex")}`;
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

/**
 * Google Play Real-time Developer Notifications (Pub/Sub push).
 * Expects the standard Pub/Sub envelope; message.data is base64 JSON.
 */
export async function handleGooglePlayRtdn(req: Request, res: Response) {
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const dataB64 =
      body && typeof body === "object" && body.message && typeof body.message.data === "string"
        ? body.message.data
        : null;
    if (!dataB64) {
      return res.status(400).json({ error: "Invalid Pub/Sub payload" });
    }
    const decoded = JSON.parse(Buffer.from(dataB64, "base64").toString("utf8")) as {
      voidedPurchaseNotification?: { purchaseToken?: string; orderId?: string };
      oneTimeProductNotification?: { purchaseToken?: string; notificationType?: number };
      subscriptionNotification?: { purchaseToken?: string; notificationType?: number };
    };

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
      logger.info(
        {
          providerTransactionId,
          ok: result.ok,
          alreadyProcessed: result.ok ? result.alreadyProcessed : false,
          reversedCoins: result.ok ? result.reversedCoins : 0,
        },
        "Google RTDN void processed",
      );
      return res.status(200).json({ ok: true });
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
 * Uses signedPayload; requires APPLE_IAP_NOTIFICATION_SECRET header match when set.
 */
export async function handleAppleIapNotification(req: Request, res: Response) {
  try {
    const expected = process.env.APPLE_IAP_NOTIFICATION_SECRET?.trim();
    if (expected) {
      const got = String(req.headers["x-apple-notification-secret"] || "");
      if (got !== expected) {
        return res.status(401).json({ error: "Unauthorized" });
      }
    }

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
