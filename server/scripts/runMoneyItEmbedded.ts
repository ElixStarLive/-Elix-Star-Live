/**
 * Starts an isolated embedded Postgres, runs money integration tests, then destroys it.
 * Never uses DATABASE_URL / production.
 *
 *   npx tsx server/scripts/runMoneyItEmbedded.ts
 *   TEST_DATABASE_URL=postgres://... npx tsx server/scripts/runMoneyItEmbedded.ts
 */
import fs from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");

function runVitest(env: NodeJS.ProcessEnv): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(
      process.platform === "win32" ? "npx.cmd" : "npx",
      ["vitest", "run", "server/lib/moneyIntegration.test.ts"],
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
  const existing = (process.env.TEST_DATABASE_URL || "").trim();
  if (existing) {
    if (!process.env.ALLOW_MONEY_IT_ON_URL) {
      process.env.ALLOW_MONEY_IT_ON_URL = "1";
    }
    const code = await runVitest({ ...process.env });
    process.exit(code);
  }

  if (process.platform === "win32") {
    try {
      const { execSync } = await import("child_process");
      execSync("net session", { stdio: "ignore" });
      console.error(
        "[money-it] NOT EXECUTED — Windows elevated/admin shell detected.",
        "\n  Embedded Postgres refuses to start as Administrator.",
        "\n  Re-run from a normal (non-admin) terminal, or set TEST_DATABASE_URL to an isolated DB.",
      );
      process.exit(1);
    } catch {
      // not elevated — continue
    }
  }

  const EmbeddedPostgres = (await import("embedded-postgres")).default;
  const databaseDir = fs.mkdtempSync(path.join(os.tmpdir(), "elix-money-it-"));
  const port = 45000 + Math.floor(Math.random() * 10000);
  const user = "elix_it";
  const password = "elix_it_local_only";
  const dbName = "elix_money_it";

  const pg = new EmbeddedPostgres({
    databaseDir,
    user,
    password,
    port,
    persistent: false,
    onLog: () => {},
    onError: (err: unknown) => {
      console.error("[money-it embedded]", err);
    },
  });

  let exitCode = 1;
  try {
    console.log(`[money-it] Initialising embedded Postgres on port ${port}…`);
    await pg.initialise();
    await pg.start();
    await pg.createDatabase(dbName);
    const url = `postgres://${user}:${password}@127.0.0.1:${port}/${dbName}`;
    exitCode = await runVitest({
      ...process.env,
      TEST_DATABASE_URL: url,
      ALLOW_MONEY_IT_ON_URL: "1",
      CI: process.env.CI || "",
      REQUIRE_MONEY_IT: "1",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err ?? "unknown");
    console.error("[money-it] Failed to start isolated database:", msg);
    if (/administrative permissions|unprivileged user/i.test(msg) || err == null) {
      console.error(
        "[money-it] On Windows, embedded Postgres cannot start from an elevated/admin shell.",
        "\n  Options:",
        "\n  1) Re-run from a non-admin terminal: npm run test:money",
        "\n  2) Point at an isolated DB: TEST_DATABASE_URL=postgres://… ALLOW_MONEY_IT_ON_URL=1 npm run test:money:url",
        "\n  3) Rely on CI money-integration job (Postgres service).",
      );
    }
    exitCode = 1;
  } finally {
    try {
      await pg.stop();
    } catch {
      /* ignore */
    }
    try {
      fs.rmSync(databaseDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }

  if (exitCode === 0) {
    console.log("[money-it] PASSED");
  } else {
    console.error("[money-it] FAILED");
  }
  process.exit(exitCode);
}

main();
