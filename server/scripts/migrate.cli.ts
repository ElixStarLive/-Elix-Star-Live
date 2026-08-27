/** `npm run migrate` — applies the migration chain, then exits. */

import { runMigrations } from '../migrate.js';
import { closePool } from '../lib/postgres.js';
import { logger } from '../lib/logger.js';

runMigrations()
  .then(({ applied }) => {
    logger.info(
      { applied },
      applied.length > 0 ? 'migrations complete' : 'database already up to date',
    );
  })
  .catch((err: unknown) => {
    logger.fatal({ err }, 'MIGRATION RUN FAILED');
    process.exitCode = 1;
  })
  .finally(() => closePool());
