import { Router } from "express";
import express from "express";
import { handleStripeWebhook } from "./webhook";
import { handleLiveKitWebhook } from "./livekit-webhook";
import { handleAppleIapNotification, handleGooglePlayRtdn } from "./iapNotifications";

const stripeWebhookRouter = Router();
stripeWebhookRouter.use(express.raw({ type: "application/json" }), handleStripeWebhook);

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
