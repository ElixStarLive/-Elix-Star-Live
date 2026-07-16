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
  const appleReady =
    !!process.env.APPLE_ISSUER_ID?.trim() &&
    !!process.env.APPLE_KEY_ID?.trim() &&
    !!process.env.APPLE_PRIVATE_KEY?.trim();
  if (!appleReady) {
    logger.warn(
      "Apple IAP credentials incomplete (APPLE_ISSUER_ID / APPLE_KEY_ID / APPLE_PRIVATE_KEY) — iOS purchases will be rejected until set",
    );
  }

  logger.info(
    "Production environment validation passed — ensure `npm run migrate` runs in the release/deploy step before workers start",
  );
}
