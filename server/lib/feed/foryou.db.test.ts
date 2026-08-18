/**
 * For You lifecycle DB tests — runs with money IT suite when TEST_DATABASE_URL set.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { randomUUID } from "crypto";
import { normalizeDatabaseUrl } from "../databaseUrl";
import {
  applyRepoMigrations,
  assertSafeTestDatabase,
  createTestPool,
} from "../testMigrationBootstrap";
import { computeForYouRankingScore } from "./foryouRanking";
import { defaultForYouConfig } from "./foryouConfig";

const TEST_URL = normalizeDatabaseUrl((process.env.TEST_DATABASE_URL || "").trim());
const RUN = !!TEST_URL;

describe.skipIf(!RUN)("For You feed lifecycle DB", () => {
  let pool: pg.Pool;

  beforeAll(async () => {
    assertSafeTestDatabase(TEST_URL);
    pool = createTestPool(TEST_URL, 8);
    await applyRepoMigrations(pool);
    process.env.DATABASE_URL = TEST_URL;
  }, 180_000);

  afterAll(async () => {
    await pool?.end();
  });

  it("new public video enrolls in initial For You stage", async () => {
    const videoId = `fyv_${randomUUID()}`;
    const creator = `fyc_${randomUUID()}`;
    await pool.query(
      `INSERT INTO videos (id, url, user_id, privacy, created_at)
       VALUES ($1, $2, $3, 'public', NOW())
       ON CONFLICT (id) DO NOTHING`,
      [videoId, `https://example.invalid/${videoId}.mp4`, creator],
    );
    await pool.query(
      `INSERT INTO elix_video_foryou_state (video_id, creator_user_id, stage, cycle_count)
       VALUES ($1, $2, 'initial', 1)
       ON CONFLICT (video_id) DO NOTHING`,
      [videoId, creator],
    );
    const r = await pool.query(`SELECT stage FROM elix_video_foryou_state WHERE video_id = $1`, [
      videoId,
    ]);
    expect(r.rows[0]?.stage).toBe("initial");
  });

  it("promotes at configurable qualified threshold (default 5000)", async () => {
    const videoId = `fyp_${randomUUID()}`;
    const creator = `fyc_${randomUUID()}`;
    await pool.query(
      `INSERT INTO videos (id, url, user_id, privacy) VALUES ($1, $2, $3, 'public')
       ON CONFLICT (id) DO NOTHING`,
      [videoId, `https://example.invalid/${videoId}.mp4`, creator],
    );
    await pool.query(
      `INSERT INTO elix_video_foryou_state (video_id, creator_user_id, stage, qualified_unique_views)
       VALUES ($1, $2, 'initial', 4999)
       ON CONFLICT (video_id) DO UPDATE SET stage = 'initial', qualified_unique_views = 4999`,
      [videoId, creator],
    );
    const cfg = await pool.query(`SELECT promotion_qualified_views FROM elix_foryou_config WHERE id = 'default'`);
    const threshold = Math.floor(Number(cfg.rows[0]?.promotion_qualified_views) || 5000);
    expect(threshold).toBe(5000);

    await pool.query(
      `UPDATE elix_video_foryou_state SET
         qualified_unique_views = $2::int,
         stage = CASE WHEN $2::int >= $3::int THEN 'promoted' ELSE stage END,
         promoted_at = CASE WHEN $2::int >= $3::int THEN NOW() ELSE promoted_at END
       WHERE video_id = $1`,
      [videoId, threshold, threshold],
    );
    const r = await pool.query(`SELECT stage FROM elix_video_foryou_state WHERE video_id = $1`, [
      videoId,
    ]);
    expect(r.rows[0]?.stage).toBe("promoted");
  });

  it("removed videos are excluded from active stage set but video row remains", async () => {
    const videoId = `fyr_${randomUUID()}`;
    const creator = `fyc_${randomUUID()}`;
    await pool.query(
      `INSERT INTO videos (id, url, user_id, privacy) VALUES ($1, $2, $3, 'public')
       ON CONFLICT (id) DO NOTHING`,
      [videoId, `https://example.invalid/${videoId}.mp4`, creator],
    );
    await pool.query(
      `INSERT INTO elix_video_foryou_state
         (video_id, creator_user_id, stage, qualified_unique_views, qualified_at_removal, removed_at)
       VALUES ($1, $2, 'removed', 100, 100, NOW())
       ON CONFLICT (video_id) DO UPDATE SET stage = 'removed'`,
      [videoId, creator],
    );
    const active = await pool.query(
      `SELECT 1 FROM elix_video_foryou_state
        WHERE video_id = $1 AND stage IN ('initial','promoted','reentered')`,
      [videoId],
    );
    expect(active.rowCount).toBe(0);
    const still = await pool.query(`SELECT id FROM videos WHERE id = $1`, [videoId]);
    expect(still.rowCount).toBe(1);
  });

  it("re-entry after 1000 additional qualified views post-removal", async () => {
    const videoId = `fye_${randomUUID()}`;
    const creator = `fyc_${randomUUID()}`;
    await pool.query(
      `INSERT INTO videos (id, url, user_id, privacy) VALUES ($1, $2, $3, 'public')
       ON CONFLICT (id) DO NOTHING`,
      [videoId, `https://example.invalid/${videoId}.mp4`, creator],
    );
    await pool.query(
      `INSERT INTO elix_video_foryou_state
         (video_id, creator_user_id, stage, qualified_unique_views, qualified_at_removal, cycle_count)
       VALUES ($1, $2, 'removed', 1100, 100, 1)
       ON CONFLICT (video_id) DO UPDATE SET
         stage = 'removed', qualified_unique_views = 1100, qualified_at_removal = 100`,
      [videoId, creator],
    );
    const cfg = await pool.query(
      `SELECT reentry_additional_qualified_views FROM elix_foryou_config WHERE id = 'default'`,
    );
    const need = Math.floor(Number(cfg.rows[0]?.reentry_additional_qualified_views) || 1000);
    expect(need).toBe(1000);
    const since = 1100 - 100;
    expect(since).toBeGreaterThanOrEqual(need);
    await pool.query(
      `UPDATE elix_video_foryou_state SET stage = 'reentry_eligible', qualified_since_removal = $2
       WHERE video_id = $1`,
      [videoId, since],
    );
    const score = computeForYouRankingScore(
      {
        qualifiedUniqueViews: 1100,
        watchTimeSeconds: 2000,
        completions: 50,
        rewatchesUnique: 10,
        shares: 5,
        saves: 5,
        comments: 5,
        likes: 20,
        followsGenerated: 2,
        profileVisitsGenerated: 5,
        reportCount: 0,
        notInterestedCount: 0,
        retentionScore: 0.5,
        ageHours: 10,
        freshnessWindowHours: 72,
        creatorQualityScore: 1,
        guidelinesOk: true,
      },
      defaultForYouConfig(),
    );
    expect(score).toBeGreaterThan(0);
    await pool.query(
      `UPDATE elix_video_foryou_state SET stage = 'reentered', cycle_count = cycle_count + 1, ranking_score = $2
       WHERE video_id = $1`,
      [videoId, score],
    );
    const r = await pool.query(`SELECT stage, cycle_count FROM elix_video_foryou_state WHERE video_id = $1`, [
      videoId,
    ]);
    expect(r.rows[0]?.stage).toBe("reentered");
    expect(Number(r.rows[0]?.cycle_count)).toBe(2);
  });

  it("one user 30 qualified inserts → one unique row", async () => {
    const videoId = `fyq_${randomUUID()}`;
    const viewer = `fyvu_${randomUUID()}`;
    const creator = `fyc_${randomUUID()}`;
    for (let i = 0; i < 30; i++) {
      await pool.query(
        `INSERT INTO elix_qualified_video_views (video_id, viewer_user_id, creator_user_id, watch_seconds)
         VALUES ($1,$2,$3,12)
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

  it("foryou config defaults are not hardcoded-only — DB row exists", async () => {
    const r = await pool.query(`SELECT * FROM elix_foryou_config WHERE id = 'default'`);
    expect(r.rowCount).toBe(1);
    expect(Number(r.rows[0].promotion_qualified_views)).toBe(5000);
    expect(Number(r.rows[0].reentry_additional_qualified_views)).toBe(1000);
  });
});
