/**
 * Production environment validation — fails fast on missing critical config.
 */
import { logger } from "./logger";
import { normalizeLiveKitSignalUrl } from "../services/livekit";

/** Returns fatal production boot messages. Empty when NODE_ENV is not production. */
export function collectProductionEnvironmentFailures(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  if (env.NODE_ENV !== "production") return [];
  const failures: string[] = [];

  if (!env.DATABASE_URL) {
    failures.push("DATABASE_URL is required in production");
  }

  const jwt = env.JWT_SECRET || env.AUTH_SECRET || "";
  if (jwt.length < 32) {
    failures.push("JWT_SECRET (or AUTH_SECRET) must be at least 32 characters in production");
  }

  if (!env.VALKEY_URL && !env.REDIS_URL) {
    failures.push("VALKEY_URL or REDIS_URL is required in production");
  }

  if (env.ELIX_SKIP_MIGRATION_CHECK === "1") {
    failures.push(
      "ELIX_SKIP_MIGRATION_CHECK must not be set in production — migration checks are mandatory",
    );
  }

  if (!env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim()) {
    failures.push("GOOGLE_SERVICE_ACCOUNT_JSON is required in production for Android IAP verification");
  }
  if (!env.STRIPE_SECRET_KEY?.trim() || !env.STRIPE_WEBHOOK_SECRET?.trim()) {
    failures.push("STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are required in production for shop checkout");
  }
  const stripeKey = (env.STRIPE_SECRET_KEY || "").trim();
  const stripeWhsec = (env.STRIPE_WEBHOOK_SECRET || "").trim();
  if (stripeKey && !stripeKey.startsWith("sk_live_")) {
    failures.push("STRIPE_SECRET_KEY must be sk_live_… in production (test keys are not allowed)");
  }
  if (stripeWhsec && !stripeWhsec.startsWith("whsec_")) {
    failures.push("STRIPE_WEBHOOK_SECRET must be whsec_… in production");
  }
  if (String(env.ELIX_STRIPE_CONNECT_MODE || "").trim().toLowerCase() === "test") {
    failures.push(
      "ELIX_STRIPE_CONNECT_MODE=test must not be set in production — remove it so Connect uses live keys",
    );
  }

  if (!env.LIVEKIT_URL?.trim() || !env.LIVEKIT_API_KEY?.trim() || !env.LIVEKIT_API_SECRET?.trim()) {
    failures.push(
      "LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET are required in production for live streaming",
    );
  } else {
    try {
      const lk = new URL(normalizeLiveKitSignalUrl(env.LIVEKIT_URL));
      const host = lk.hostname.toLowerCase();
      if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
        failures.push("LIVEKIT_URL must not point to localhost in production");
      }
      if (lk.protocol.toLowerCase() !== "wss:") {
        failures.push("LIVEKIT_URL must resolve to a wss:// signal URL in production");
      }
    } catch {
      failures.push("LIVEKIT_URL is not a valid URL in production");
    }
  }

  if (!env.BUNNY_STORAGE_ZONE?.trim() || !env.BUNNY_STORAGE_API_KEY?.trim()) {
    failures.push(
      "BUNNY_STORAGE_ZONE and BUNNY_STORAGE_API_KEY are required in production for media uploads",
    );
  }

  const playPkg = (env.GOOGLE_PLAY_PACKAGE_NAME || "com.elixstarlive.app").trim();
  if (playPkg !== "com.elixstarlive.app") {
    failures.push(
      `GOOGLE_PLAY_PACKAGE_NAME must be com.elixstarlive.app in production (got ${playPkg})`,
    );
  }

  const appleTrioReady =
    !!env.APPLE_ISSUER_ID?.trim() && !!env.APPLE_KEY_ID?.trim() && !!env.APPLE_PRIVATE_KEY?.trim();
  const appleBundle = (env.APPLE_BUNDLE_ID || "").trim();
  const appleNotifSecret = !!env.APPLE_IAP_NOTIFICATION_SECRET?.trim();
  if (!appleTrioReady) {
    failures.push(
      "APPLE_ISSUER_ID / APPLE_KEY_ID / APPLE_PRIVATE_KEY are required in production for iOS IAP verification",
    );
  }
  if (!appleBundle) {
    failures.push("APPLE_BUNDLE_ID is required in production for iOS IAP verification");
  } else if (appleBundle !== "com.elixstarlive.app") {
    failures.push(`APPLE_BUNDLE_ID must be com.elixstarlive.app in production (got ${appleBundle})`);
  }
  if (!appleNotifSecret) {
    failures.push(
      "APPLE_IAP_NOTIFICATION_SECRET is required in production for App Store Server Notifications V2",
    );
  }

  if (!env.GOOGLE_RTDN_WEBHOOK_SECRET?.trim()) {
    failures.push(
      "GOOGLE_RTDN_WEBHOOK_SECRET is required in production for Play refund/void notifications",
    );
  }

  if (env.ALLOW_LOADTEST_IN_PROD === "1") {
    failures.push(
      "ALLOW_LOADTEST_IN_PROD must not be set in production — remove it so rate-limit bypass cannot be enabled against live traffic",
    );
  }

  return failures;
}

export function validateProductionEnvironment(): void {
  const failures = collectProductionEnvironmentFailures();
  if (!failures.length) {
    if (process.env.NODE_ENV === "production") {
      logger.info(
        "Production environment validation passed — ensure `npm run migrate` runs in the release/deploy step before workers start",
      );
    }
    return;
  }
  for (const msg of failures) {
    logger.fatal(msg);
  }
  process.exit(1);
}
