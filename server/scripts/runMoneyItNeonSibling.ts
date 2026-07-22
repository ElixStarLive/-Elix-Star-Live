/**
 * Money IT against an isolated Neon sibling database (never neondb / production data).
 *
 * Creates `elix_money_it` on the same Neon host as DATABASE_URL if missing,
 * runs the suite there, then leaves the empty DB for reuse (or drops if
 * MONEY_IT_DROP_DB=1).
 *
 * Usage:
 *   npx tsx server/scripts/runMoneyItNeonSibling.ts
 */
import "../config.ts";
import pg from "pg";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { normalizeDatabaseUrl } from "../lib/databaseUrl.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const SIBLING = "elix_money_it";

function swapDatabaseName(url: string, dbName: string): string {
  const u = new URL(url.replace(/^postgres(ql)?:/i, "http:"));
  u.pathname = "/" + dbName;
  return u.toString().replace(/^http:/i, "postgresql:");
}

function runVitest(env: NodeJS.ProcessEnv): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(
      process.platform === "win32" ? "npx.cmd" : "npx",
      ["vitest", "run", "--config", "vitest.money.config.ts"],
      {
        cwd: root,
        env,
        stdio: "inherit",
        shell: process.platform === "win32",
      },
    );
    child.on("exit", (code) => resolve(code ?? 1));
    child.on("error", () => resolve(1));
  });
}

async function main() {
  const base = normalizeDatabaseUrl((process.env.DATABASE_URL || "").trim());
  if (!base) {
    console.error("[money-it] DATABASE_URL required to derive sibling test DB");
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
    if (currentDb === SIBLING) {
      console.error("[money-it] Refusing: DATABASE_URL already points at sibling");
      process.exit(1);
    }
    console.log(
      `[money-it] Source DB=${currentDb} (untouched). Target sibling=${SIBLING}`,
    );
    // Drop accidental probe DB
    await c.query("DROP DATABASE IF EXISTS elix_money_it_tmp").catch(() => {});
    const exists = await c.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [SIBLING],
    );
    if (exists.rowCount === 0) {
      await c.query(`CREATE DATABASE ${SIBLING}`);
      console.log(`[money-it] Created database ${SIBLING}`);
    } else {
      console.log(`[money-it] Reusing existing ${SIBLING}`);
    }
  } finally {
    c.release();
    await admin.end();
  }

  const testUrl = swapDatabaseName(base, SIBLING);
  // Sanity: parsed path must be sibling
  if (!testUrl.includes(`/${SIBLING}`)) {
    console.error("[money-it] Failed to build sibling URL");
    process.exit(1);
  }

  const code = await runVitest({
    ...process.env,
    TEST_DATABASE_URL: testUrl,
    ALLOW_MONEY_IT_ON_URL: "1",
    REQUIRE_MONEY_IT: "1",
    // Prevent accidental use of production URL inside tests
    DATABASE_URL: "",
  });

  if (process.env.MONEY_IT_DROP_DB === "1") {
    const dropPool = new pg.Pool({
      connectionString: base,
      ssl: { rejectUnauthorized: false },
      max: 1,
    });
    const dc = await dropPool.connect();
    try {
      await dc.query(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
        [SIBLING],
      ).catch(() => {});
      await dc.query(`DROP DATABASE IF EXISTS ${SIBLING}`);
      console.log(`[money-it] Dropped ${SIBLING}`);
    } finally {
      dc.release();
      await dropPool.end();
    }
  }

  if (code === 0) console.log("[money-it] PASSED against isolated sibling DB");
  else console.error("[money-it] FAILED");
  process.exit(code);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
