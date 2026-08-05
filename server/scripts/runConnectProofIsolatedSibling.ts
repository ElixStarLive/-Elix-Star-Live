/**
 * Fresh isolated Neon sibling for Stripe Connect proof + reconciliation.
 * Never touches production neondb / elix_money_it residue.
 *
 * Creates `elix_connect_proof`, migrates, runs connect proof, reconciles.
 * Expected: reconciliation ok=true, mismatches=0 for this clean DB.
 *
 * Usage: npx tsx server/scripts/runConnectProofIsolatedSibling.ts
 */
import "../config.ts";
import pg from "pg";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { normalizeDatabaseUrl } from "../lib/databaseUrl.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const SIBLING = "elix_connect_proof";

function swapDatabaseName(url: string, dbName: string): string {
  const u = new URL(url.replace(/^postgres(ql)?:/i, "http:"));
  u.pathname = "/" + dbName;
  return u.toString().replace(/^http:/i, "postgresql:");
}

function run(cmd: string, args: string[], env: NodeJS.ProcessEnv): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: root,
      env,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.on("exit", (code) => resolve(code ?? 1));
    child.on("error", () => resolve(1));
  });
}

async function main() {
  const base = normalizeDatabaseUrl((process.env.DATABASE_URL || "").trim());
  if (!base) {
    console.error("[connect-proof-iso] DATABASE_URL required");
    process.exit(1);
  }

  const admin = new pg.Pool({
    connectionString: base,
    ssl: { rejectUnauthorized: false },
    max: 1,
  });
  const c = await admin.connect();
  try {
    const cur = await c.query("SELECT current_database() AS db");
    const currentDb = String(cur.rows[0].db);
    if (currentDb === SIBLING || currentDb === "elix_money_it") {
      console.error("[connect-proof-iso] Refusing: DATABASE_URL already points at a sibling");
      process.exit(1);
    }
    console.log(`[connect-proof-iso] Source DB=${currentDb} (untouched). Target=${SIBLING}`);

    await c.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [SIBLING],
    ).catch(() => {});
    await c.query(`DROP DATABASE IF EXISTS ${SIBLING}`);
    await c.query(`CREATE DATABASE ${SIBLING}`);
    console.log(`[connect-proof-iso] Created fresh ${SIBLING}`);
  } finally {
    c.release();
    await admin.end();
  }

  const testUrl = swapDatabaseName(base, SIBLING);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: testUrl,
    TEST_DATABASE_URL: testUrl,
    ALLOW_MONEY_IT_ON_URL: "1",
    ELIX_STRIPE_CONNECT_MODE: "test",
    ELIX_SKIP_MIGRATION_CHECK: "1",
    CONNECT_PROOF_DB: SIBLING,
  };

  const migrateCode = await run(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["tsx", "server/migrate.ts"],
    env,
  );
  if (migrateCode !== 0) {
    console.error("[connect-proof-iso] migrate failed");
    process.exit(migrateCode);
  }

  const proofCode = await run(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["tsx", "server/scripts/stripeConnectTestProof.ts"],
    env,
  );
  if (proofCode !== 0) {
    console.error("[connect-proof-iso] connect proof failed");
    process.exit(proofCode);
  }

  // Scoped reconciliation on the clean sibling only
  const reconcileCode = await run(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["tsx", "server/scripts/runConnectProofReconcile.ts"],
    env,
  );
  process.exit(reconcileCode);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
