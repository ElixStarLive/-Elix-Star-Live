/**
 * The migrations directory contract — one place, used by every reader.
 *
 * Consumers:
 *  - `server/migrate.ts`                  applies migrations (deploy / CI / shell)
 *  - `server/lib/testMigrationBootstrap.ts` applies them to a test database
 *  - `server/lib/postgres.ts`             verifies at boot that they are applied
 *
 * They must agree on which files exist, in what order, and what SQL each file
 * contributes, or the boot gate can demand a migration the runner would apply
 * differently.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const MIGRATIONS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "migrations",
);

/** SQL filenames in server/migrations, in the order they must be applied. */
export function listMigrationFilenames(): string[] {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

/** A statement that opens or closes a transaction, alone on its own line. */
const FILE_TRANSACTION_STATEMENT = /^\s*(BEGIN|COMMIT|START\s+TRANSACTION|ROLLBACK)\s*;\s*$/i;

/**
 * Transaction control anywhere else on a line — e.g. `CREATE TABLE x; COMMIT;`.
 * `END` is deliberately not matched: in these files it closes `CASE` and
 * PL/pgSQL blocks far more often than it means COMMIT.
 */
const INLINE_TRANSACTION_STATEMENT = /(^|;)\s*(BEGIN|COMMIT|START\s+TRANSACTION|ROLLBACK)\s*;/i;

/**
 * The SQL of a migration file, with the file's own transaction control removed.
 *
 * The runner wraps each file in one transaction together with the row that
 * records it as applied, so a file and its marker either both land or neither
 * does. A `COMMIT;` inside the file breaks exactly that: it commits the runner's
 * transaction early, so a failure later in the same file leaves committed schema
 * behind that was never recorded — and the runner's `ROLLBACK` cannot undo it.
 * (Verified against Postgres: DDL before a file-level COMMIT survives the
 * runner's ROLLBACK.) The next deploy then replays a file that is already half
 * applied.
 *
 * So the runner owns the transaction, and it is the only one. Historic files
 * still carry `BEGIN;` / `COMMIT;`; stripping them here keeps every file — past
 * and future — under that single guarantee instead of depending on how each file
 * happens to be written.
 */
export function migrationSqlWithoutFileTransactions(filename: string, sql: string): string {
  const lines = sql.split(/\r?\n/);
  const kept: string[] = [];
  let inDollarQuoted = false;
  for (const line of lines) {
    const code = line.replace(/--.*$/, "");
    // `$$ ... $$` bodies (DO blocks, functions) carry their own BEGIN/END that
    // belong to PL/pgSQL, not to a transaction.
    const opensOrCloses = (code.match(/\$\$/g) || []).length % 2 === 1;
    const isTransactionControl = !inDollarQuoted && FILE_TRANSACTION_STATEMENT.test(code);
    if (opensOrCloses) inDollarQuoted = !inDollarQuoted;
    if (isTransactionControl) continue;
    kept.push(line);
  }

  const stripped = kept.join("\n");
  // Anything left means the file mixes transaction control into a line with other
  // SQL, which this cannot safely rewrite. Refuse rather than apply a file whose
  // atomicity we cannot promise.
  const residual = stripped
    .split(/\r?\n/)
    .filter((line) => {
      const code = line.replace(/--.*$/, "");
      return INLINE_TRANSACTION_STATEMENT.test(code);
    })
    .map((line) => line.trim());
  if (residual.length > 0) {
    throw new Error(
      `Migration ${filename} mixes transaction control into a statement line ` +
        `(${residual[0]}). The migration runner owns the transaction — put ` +
        `BEGIN/COMMIT on their own line or remove them.`,
    );
  }
  return stripped;
}

/** One migration file's SQL, ready to run inside the runner's transaction. */
export function readMigrationSql(filename: string): string {
  const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, filename), "utf8");
  return migrationSqlWithoutFileTransactions(filename, sql);
}
