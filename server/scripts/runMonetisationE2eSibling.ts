/**
 * Derive elix_money_it sibling from DATABASE_URL and run monetisationE2eEvidence.ts
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

async function main() {
  const base = normalizeDatabaseUrl((process.env.DATABASE_URL || "").trim());
  if (!base) {
    console.error("DATABASE_URL required");
    process.exit(1);
  }
  const admin = new pg.Pool({ connectionString: base, ssl: { rejectUnauthorized: false }, max: 1 });
  const c = await admin.connect();
  try {
    const cur = await c.query("SELECT current_database() AS db");
    if (String(cur.rows[0].db) === SIBLING) {
      console.error("Refusing: DATABASE_URL already sibling");
      process.exit(1);
    }
    const exists = await c.query("SELECT 1 FROM pg_database WHERE datname = $1", [SIBLING]);
    if (exists.rowCount === 0) await c.query(`CREATE DATABASE ${SIBLING}`);
    console.log(`[e2e] Using isolated sibling ${SIBLING} (source untouched)`);
  } finally {
    c.release();
    await admin.end();
  }

  const testUrl = swapDatabaseName(base, SIBLING);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      process.platform === "win32" ? "npx.cmd" : "npx",
      ["tsx", "server/scripts/monetisationE2eEvidence.ts"],
      {
        cwd: root,
        env: {
          ...process.env,
          TEST_DATABASE_URL: testUrl,
          ALLOW_MONEY_IT_ON_URL: "1",
          DATABASE_URL: "",
        },
        stdio: "inherit",
        shell: process.platform === "win32",
      },
    );
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
