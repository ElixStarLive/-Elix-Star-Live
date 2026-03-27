import { Router } from "express";
import express from "express";
import { handleStripeWebhook } from "./webhook";
import { handleLiveKitWebhook } from "./livekit-webhook";

const stripeWebhookRouter = Router();
stripeWebhookRouter.use(express.raw({ type: "application/json" }), handleStripeWebhook);

const livekitWebhookRouter = Router();
livekitWebhookRouter.post("/", express.raw({ type: "application/webhook+json" }), handleLiveKitWebhook);

export { stripeWebhookRouter, livekitWebhookRouter };
