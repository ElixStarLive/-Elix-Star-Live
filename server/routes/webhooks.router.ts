import { Router } from "express";
import express from "express";
import { handleStripeWebhook } from "./webhook";
import { handleLiveKitWebhook } from "./livekit-webhook";
import { handleAppleIapNotification, handleGooglePlayRtdn } from "./iapNotifications";

const stripeWebhookRouter = Router();
// `.post("/")`, like every other provider router here. Registered with `.use()`
// this router answered any method on /api/stripe-webhook, so a GET or DELETE
// reached the signature check instead of not existing. Stripe only ever POSTs.
stripeWebhookRouter.post("/", express.raw({ type: "application/json" }), handleStripeWebhook);

const livekitWebhookRouter = Router();
livekitWebhookRouter.post("/", express.raw({ type: "application/webhook+json" }), handleLiveKitWebhook);

const googlePlayRtdnRouter = Router();
googlePlayRtdnRouter.post(
  "/",
  express.raw({ type: "application/json" }),
  (req, res, next) => {
    if (Buffer.isBuffer(req.body)) {
      (req as { body: unknown }).body = req.body.toString("utf8");
    }
    next();
  },
  handleGooglePlayRtdn,
);

const appleIapNotifyRouter = Router();
appleIapNotifyRouter.post(
  "/",
  express.raw({ type: "application/json" }),
  (req, res, next) => {
    if (Buffer.isBuffer(req.body)) {
      (req as { body: unknown }).body = req.body.toString("utf8");
    }
    next();
  },
  handleAppleIapNotification,
);

export {
  stripeWebhookRouter,
  livekitWebhookRouter,
  googlePlayRtdnRouter,
  appleIapNotifyRouter,
};
