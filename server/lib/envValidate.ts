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

  logger.info(
    "Production environment validation passed — ensure `npm run migrate` runs in the release/deploy step before workers start",
  );
}
