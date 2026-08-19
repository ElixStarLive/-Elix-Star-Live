/**
 * DB migrations from a shell, CI, or a deploy step. Does not start HTTP/WebSocket.
 *
 * The container no longer needs this: `server/cluster.ts` applies pending
 * migrations itself before it forks any worker. This stays as the manual entry
 * point, and running it is harmless either way — the runner is idempotent and
 * takes the same advisory lock, so it cannot collide with a booting instance.
 *
 * Usage: npx tsx server/migrate.ts
 * Requires: DATABASE_URL
 */
import "./config";
import { logger } from "./lib/logger";
import { applyPendingMigrations } from "./lib/applyMigrations";

applyPendingMigrations()
  .then((applied) => {
    logger.info({ applied: applied.length }, "[migrate] complete");
  })
  .catch((err) => {
    logger.fatal({ err }, "[migrate] failed");
    process.exit(1);
  });
