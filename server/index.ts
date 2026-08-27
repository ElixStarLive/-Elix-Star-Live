/**
 * Server entrypoint.
 *
 * Configuration is validated by importing `config`, which throws on anything
 * missing, before a listener is opened. Migrations run before the port is bound
 * so an instance never serves requests against a schema it has not confirmed.
 */

import { config } from './config.js';
import { logger } from './lib/logger.js';
import { closePool, isDatabaseHealthy } from './lib/postgres.js';
import { closeValkey, isValkeyHealthy } from './lib/valkey.js';
import { runMigrations } from './migrate.js';
import { createApp } from './http/app.js';

async function main(): Promise<void> {
  const database = await isDatabaseHealthy();
  if (!database) throw new Error('DATABASE CONNECTION FAILED');

  const valkey = await isValkeyHealthy();
  if (!valkey) throw new Error('VALKEY CONNECTION FAILED');

  const { applied } = await runMigrations();
  logger.info({ applied: applied.length }, 'schema ready');

  const server = createApp().listen(config.PORT, () => {
    logger.info({ port: config.PORT, env: config.NODE_ENV }, 'server listening');
  });

  const shutdown = (signal: string): void => {
    logger.info({ signal }, 'shutting down');
    server.close(() => {
      void Promise.allSettled([closePool(), closeValkey()]).then(() => process.exit(0));
    });
    // A connection that will not drain must not hold the deploy open forever.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err: unknown) => {
  logger.fatal({ err }, 'server failed to start');
  process.exit(1);
});
