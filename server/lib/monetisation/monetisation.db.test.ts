/**
 * DB integration tests for monetisation uniqueness / gift settlement.
 * Requires: TEST_DATABASE_URL + ALLOW_MONEY_IT_ON_URL=1
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { normalizeDatabaseUrl } from "../databaseUrl";
import { recordQualifiedRewardView } from "./qualifiedViews";
import { splitNetRevenue } from "./moneyMath";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_URL = normalizeDatabaseUrl((process.env.TEST_DATABASE_URL || "").trim());
const RUN = !!TEST_URL;

describe.skipIf(!RUN)("Monetisation DB integration", () => {
  let pool: pg.Pool;

  beforeAll(async () => {
    if (process.env.ALLOW_MONEY_IT_ON_URL !== "1") {
      throw new Error("Refusing without ALLOW_MONEY_IT_ON_URL=1");
    }
    const dbName = (() => {
      try {
        return new URL(TEST_URL.replace(/^postgres(ql)?:/i, "http:")).pathname.replace(/^\//, "").toLowerCase();
      } catch { return ""; }
    })();
    if (!dbName || !/(test|dev|ephemeral|money.?it)/.test(dbName)) {
      throw new Error(
        `Refusing database "${dbName}" — name must contain test, dev, ephemeral, or money_it.`,
      );
    }
    pool = new pg.Pool({
      connectionString: TEST_URL,
      max: 4,
      ssl: TEST_URL.includes("neon.tech") ? { rejectUnauthorized: false } : undefined,
    });
    const client = await pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS elix_schema_migrations (
          id SERIAL PRIMARY KEY,
          filename TEXT NOT NULL UNIQUE,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`);
      const applied = new Set(
        (await client.query<{ filename: string }>(`SELECT filename FROM elix_schema_migrations`)).rows.map(
          (r) => r.filename,
        ),
      );
      const dir = path.join(__dirname, "../../migrations");
      for (const name of fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
        if (applied.has(name)) continue;
        await client.query(fs.readFileSync(path.join(dir, name), "utf8"));
        await client.query(
          `INSERT INTO elix_schema_migrations (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING`,
          [name],
        );
      }
    } finally {
      client.release();
    }
    // Point getPool used by recordQualifiedRewardView — set env DATABASE_URL for this process
    process.env.DATABASE_URL = TEST_URL;
  }, 180_000);

  afterAll(async () => {
    await pool?.end();
  });

  it("one user watching 30 times → one qualified view", async () => {
    const videoId = `v_qv_${Date.now()}`;
    const viewer = `u_viewer_${Date.now()}`;
    const creator = `u_creator_${Date.now()}`;
    // Ensure getPool works: use direct SQL for uniqueness if module pool differs
    for (let i = 0; i < 30; i++) {
      await pool.query(
        `INSERT INTO elix_qualified_video_views (video_id, viewer_user_id, creator_user_id, watch_seconds)
         VALUES ($1,$2,$3,10)
         ON CONFLICT (video_id, viewer_user_id) DO UPDATE SET last_seen_at = NOW()`,
        [videoId, viewer, creator],
      );
    }
    const c = await pool.query(
      `SELECT COUNT(*)::int AS c FROM elix_qualified_video_views WHERE video_id = $1`,
      [videoId],
    );
    expect(c.rows[0].c).toBe(1);
  });

  it("thirty users → thirty qualified views", async () => {
    const videoId = `v_qv30_${Date.now()}`;
    const creator = `u_c30_${Date.now()}`;
    for (let i = 0; i < 30; i++) {
      await pool.query(
        `INSERT INTO elix_qualified_video_views (video_id, viewer_user_id, creator_user_id, watch_seconds)
         VALUES ($1,$2,$3,10)`,
        [videoId, `viewer_${i}_${Date.now()}`, creator],
      );
    }
    const c = await pool.query(
      `SELECT COUNT(*)::int AS c FROM elix_qualified_video_views WHERE video_id = $1`,
      [videoId],
    );
    expect(c.rows[0].c).toBe(30);
  });

  it("self-view CHECK rejects", async () => {
    const videoId = `v_self_${Date.now()}`;
    const uid = `u_self_${Date.now()}`;
    await expect(
      pool.query(
        `INSERT INTO elix_qualified_video_views (video_id, viewer_user_id, creator_user_id, watch_seconds)
         VALUES ($1,$2,$2,10)`,
        [videoId, uid],
      ),
    ).rejects.toThrow();
  });

  it("ledger idempotency unique", async () => {
    const key = `idem_${Date.now()}`;
    await pool.query(
      `INSERT INTO elix_financial_ledger
         (id, idempotency_key, revenue_source, gross_pence, net_revenue_pence,
          creator_pct, creator_amount_pence, platform_pct, platform_amount_pence, status, rule_snapshot)
       VALUES ($1,$2,'PAID_GIFT',100,100,60,60,40,40,'pending','{}')`,
      [`led_${key}`, key],
    );
    await expect(
      pool.query(
        `INSERT INTO elix_financial_ledger
           (id, idempotency_key, revenue_source, gross_pence, net_revenue_pence,
            creator_pct, creator_amount_pence, platform_pct, platform_amount_pence, status, rule_snapshot)
         VALUES ($1,$2,'PAID_GIFT',100,100,60,60,40,40,'pending','{}')`,
        [`led2_${key}`, key],
      ),
    ).rejects.toThrow();
  });

  it("60/40 pennies exact", () => {
    const s = splitNetRevenue(7000, 60, 40);
    expect(s.creatorPence).toBe(4200);
    expect(s.platformPence).toBe(2800);
  });

  // smoke that API helper can be imported (pool may be null in this worker)
  it("recordQualifiedRewardView rejects logged out", async () => {
    const r = await recordQualifiedRewardView({
      videoId: "x",
      viewerUserId: "",
      creatorUserId: "c",
      watchSeconds: 10,
    });
    expect(r.qualified).toBe(false);
  });
});
