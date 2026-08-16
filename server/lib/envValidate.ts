/**
 * Production environment validation — fails fast on missing critical config.
 */
import { logger } from "./logger";

export function validateProductionEnvironment(): void {
  if (process.env.NODE_ENV !== "production") return;

  if (!process.env.DATABASE_URL) {
    logger.fatal("DATABASE_URL is required in production");
    process.exit(1);
  }

  const jwt = process.env.JWT_SECRET || process.env.AUTH_SECRET || "";
  if (jwt.length < 32) {
    logger.fatal("JWT_SECRET (or AUTH_SECRET) must be at least 32 characters in production");
    process.exit(1);
  }

  if (!process.env.VALKEY_URL && !process.env.REDIS_URL) {
    logger.fatal("VALKEY_URL or REDIS_URL is required in production");
    process.exit(1);
  }

  if (process.env.ELIX_SKIP_MIGRATION_CHECK === "1") {
    logger.fatal("ELIX_SKIP_MIGRATION_CHECK must not be set in production — migration checks are mandatory");
    process.exit(1);
  }

  // Payment credentials: fail closed at boot so users are not charged while verify fails.
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim()) {
    logger.fatal("GOOGLE_SERVICE_ACCOUNT_JSON is required in production for Android IAP verification");
    process.exit(1);
  }
  if (!process.env.STRIPE_SECRET_KEY?.trim() || !process.env.STRIPE_WEBHOOK_SECRET?.trim()) {
    logger.fatal("STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are required in production for shop checkout");
    process.exit(1);
  }
  const stripeKey = process.env.STRIPE_SECRET_KEY.trim();
  const stripeWhsec = process.env.STRIPE_WEBHOOK_SECRET.trim();
  if (!stripeKey.startsWith("sk_live_")) {
    logger.fatal("STRIPE_SECRET_KEY must be sk_live_… in production (test keys are not allowed)");
    process.exit(1);
  }
  if (!stripeWhsec.startsWith("whsec_")) {
    logger.fatal("STRIPE_WEBHOOK_SECRET must be whsec_… in production");
    process.exit(1);
  }
  if (String(process.env.ELIX_STRIPE_CONNECT_MODE || "").trim().toLowerCase() === "test") {
    logger.fatal(
      "ELIX_STRIPE_CONNECT_MODE=test must not be set in production — remove it so Connect uses live keys",
    );
    process.exit(1);
  }

  // Live streaming: fail fast so the app does not boot "healthy" while every
  // live token request fails at runtime.
  if (
    !process.env.LIVEKIT_URL?.trim() ||
    !process.env.LIVEKIT_API_KEY?.trim() ||
    !process.env.LIVEKIT_API_SECRET?.trim()
  ) {
    logger.fatal(
      "LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET are required in production for live streaming",
    );
    process.exit(1);
  }
  try {
    const lk = new URL(process.env.LIVEKIT_URL.trim());
    const proto = lk.protocol.toLowerCase();
    if (proto !== "wss:" && proto !== "https:") {
      logger.fatal("LIVEKIT_URL must use wss:// or https:// in production");
      process.exit(1);
    }
    const host = lk.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
      logger.fatal("LIVEKIT_URL must not point to localhost in production");
      process.exit(1);
    }
  } catch {
    logger.fatal("LIVEKIT_URL is not a valid URL in production");
    process.exit(1);
  }

  // Media storage: avatar/video/sticker uploads fail without these Bunny keys.
  if (!process.env.BUNNY_STORAGE_ZONE?.trim() || !process.env.BUNNY_STORAGE_API_KEY?.trim()) {
    logger.fatal(
      "BUNNY_STORAGE_ZONE and BUNNY_STORAGE_API_KEY are required in production for media uploads",
    );
    process.exit(1);
  }
  // Play package name: if explicitly set, must match the shipped app id.
  // (Default falls back to the correct value, so unset is fine.)
  const playPkg = (process.env.GOOGLE_PLAY_PACKAGE_NAME || "com.elixstarlive.app").trim();
  if (playPkg !== "com.elixstarlive.app") {
    logger.fatal(
      `GOOGLE_PLAY_PACKAGE_NAME must be com.elixstarlive.app in production (got ${playPkg})`,
    );
    process.exit(1);
  }

  // Apple IAP is opt-in via APPLE_IAP_REQUIRED=1. When opted-in, boot fails
  // closed unless every Apple credential is present. When not opted-in, iOS
  // purchase attempts still fail closed at runtime in appleIap.ts
  // (`APPLE_CREDENTIALS_NOT_CONFIGURED`), so nothing can be silently credited —
  // but the server is allowed to boot and serve Android/Web while iOS IAP
  // is being finalised in App Store Connect + Coolify.
  const appleRequired = process.env.APPLE_IAP_REQUIRED === "1";
  const appleTrioReady =
    !!process.env.APPLE_ISSUER_ID?.trim() &&
    !!process.env.APPLE_KEY_ID?.trim() &&
    !!process.env.APPLE_PRIVATE_KEY?.trim();
  const appleBundle = (process.env.APPLE_BUNDLE_ID || "").trim();
  const appleNotifSecret = !!process.env.APPLE_IAP_NOTIFICATION_SECRET?.trim();
  if (appleRequired) {
    if (!appleTrioReady) {
      logger.fatal(
        "APPLE_IAP_REQUIRED=1 but APPLE_ISSUER_ID / APPLE_KEY_ID / APPLE_PRIVATE_KEY are missing",
      );
      process.exit(1);
    }
    if (!appleBundle) {
      logger.fatal("APPLE_IAP_REQUIRED=1 but APPLE_BUNDLE_ID is missing");
      process.exit(1);
    }
    if (appleBundle !== "com.elixstarlive.app") {
      logger.fatal(
        `APPLE_BUNDLE_ID must be com.elixstarlive.app in production (got ${appleBundle})`,
      );
      process.exit(1);
    }
    if (!appleNotifSecret) {
      logger.fatal(
        "APPLE_IAP_REQUIRED=1 but APPLE_IAP_NOTIFICATION_SECRET is missing (needed for App Store Server Notifications V2)",
      );
      process.exit(1);
    }
  } else if (appleTrioReady || appleBundle || appleNotifSecret) {
    logger.warn(
      "Apple IAP env variables are set but APPLE_IAP_REQUIRED is not 1 — iOS purchases will be refused at runtime until you opt in explicitly",
    );
  } else {
    logger.warn(
      "APPLE_IAP_REQUIRED is not 1 — iOS purchases will be refused at runtime (Android/web continue to serve)",
    );
  }

  // Play refund/void RTDN: warn only. If the shared secret is not configured
  // the RTDN endpoint rejects all callbacks (see iapNotifications.ts), which
  // is the same fail-closed posture without preventing boot.
  if (!process.env.GOOGLE_RTDN_WEBHOOK_SECRET?.trim()) {
    logger.warn(
      "GOOGLE_RTDN_WEBHOOK_SECRET is not set — Play refund/void notifications will be rejected until configured",
    );
  }

  if (process.env.ALLOW_LOADTEST_IN_PROD === "1") {
    logger.fatal(
      "ALLOW_LOADTEST_IN_PROD must not be set in production — remove it so rate-limit bypass cannot be enabled against live traffic",
    );
    process.exit(1);
  }

  logger.info(
    "Production environment validation passed — ensure `npm run migrate` runs in the release/deploy step before workers start",
  );
}
