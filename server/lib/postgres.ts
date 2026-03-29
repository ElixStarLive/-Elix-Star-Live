/**
 * Optional Postgres persistence for videos and live streams.
 * When DATABASE_URL is set, data is loaded on startup and persisted.
 */

import pg from "pg";
import type { Video } from "./videoStore";
import { logger } from "./logger";
import { initWalletPaymentTables } from "./walletNeon";

const { Pool } = pg;

let pool: pg.Pool | null = null;

function firstNonEmptyString(
  ...values: Array<unknown>
): string {
  for (const v of values) {
    if (typeof v === "string" && v.trim().length > 0) return v;
    if (v instanceof Date) return v.toISOString();
  }
  return "";
}

export function getPool(): pg.Pool | null {
  return pool;
}

export function isPostgresConfigured(): boolean {
  return Boolean((process.env.DATABASE_URL || "").trim());
}

export async function initPostgres(): Promise<void> {
  const url = (process.env.DATABASE_URL || "").trim();
  if (!url) {
    logger.warn("DATABASE_URL is not set — all data will be stored in memory only and lost on restart!");
    return;
  }
  try {
    const needsSsl = url.includes('neon.tech') || url.includes('sslmode=require');
    pool = new Pool({
      connectionString: url,
      max: Number(process.env.PG_POOL_MAX) || 30,
      min: Number(process.env.PG_POOL_MIN) || 2,
      idleTimeoutMillis: 60_000,
      connectionTimeoutMillis: 10_000,
      allowExitOnIdle: false,
      statement_timeout: 15_000,
      ...(needsSsl ? { ssl: { rejectUnauthorized: process.env.PG_SSL_REJECT_UNAUTHORIZED === 'true' } } : {}),
    });
    pool.on("error", (err) => {
      logger.error({ err: err.message }, "Unexpected pool error");
    });
    try {
      await pool.query("SELECT 1");
    } catch (pingErr) {
      logger.error(
        { err: pingErr instanceof Error ? pingErr.message : pingErr },
        "PostgreSQL startup health check failed (SELECT 1)",
      );
      throw pingErr;
    }
    logger.info("PostgreSQL connected successfully");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS videos (
        id TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        thumbnail TEXT DEFAULT '',
        duration NUMERIC DEFAULT 0,
        user_id TEXT NOT NULL,
        username TEXT DEFAULT '',
        display_name TEXT DEFAULT '',
        avatar TEXT DEFAULT '',
        description TEXT DEFAULT '',
        hashtags JSONB DEFAULT '[]',
        music JSONB DEFAULT NULL,
        views INTEGER DEFAULT 0,
        likes INTEGER DEFAULT 0,
        comments INTEGER DEFAULT 0,
        shares INTEGER DEFAULT 0,
        saves INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        privacy TEXT DEFAULT 'public'
      )
    `);
    const videoCols: [string, string][] = [
      ['url', 'TEXT DEFAULT \'\''],
      ['thumbnail', 'TEXT DEFAULT \'\''],
      ['duration', 'NUMERIC DEFAULT 0'],
      ['user_id', 'TEXT DEFAULT \'\''],
      ['username', 'TEXT DEFAULT \'\''],
      ['display_name', 'TEXT DEFAULT \'\''],
      ['avatar', 'TEXT DEFAULT \'\''],
      ['description', 'TEXT DEFAULT \'\''],
      ['hashtags', 'JSONB DEFAULT \'[]\''],
      ['music', 'JSONB DEFAULT NULL'],
      ['views', 'INTEGER DEFAULT 0'],
      ['likes', 'INTEGER DEFAULT 0'],
      ['comments', 'INTEGER DEFAULT 0'],
      ['shares', 'INTEGER DEFAULT 0'],
      ['saves', 'INTEGER DEFAULT 0'],
      ['created_at', 'TIMESTAMPTZ DEFAULT NOW()'],
      ['privacy', 'TEXT DEFAULT \'public\''],
    ];
    for (const [col, def] of videoCols) {
      await pool.query(`ALTER TABLE videos ADD COLUMN IF NOT EXISTS ${col} ${def}`).catch(() => {});
    }
    await pool.query(`
      CREATE TABLE IF NOT EXISTS live_streams (
        stream_key TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        display_name TEXT,
        started_at TIMESTAMPTZ DEFAULT NOW(),
        ended_at TIMESTAMPTZ,
        is_live BOOLEAN DEFAULT TRUE,
        viewer_count INTEGER DEFAULT 0
      )
    `);

    await pool.query(`CREATE INDEX IF NOT EXISTS idx_videos_user_id ON videos(user_id)`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_videos_created_at ON videos(created_at DESC NULLS LAST)`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_videos_privacy_created ON videos(privacy, created_at DESC NULLS LAST)`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_follows_following_id ON follows(following_id)`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_follows_follower_id ON follows(follower_id)`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username)`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_live_streams_is_live ON live_streams(is_live) WHERE is_live = TRUE`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_comments_video_id ON comments(video_id, created_at DESC)`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_likes_video_id ON likes(video_id)`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_saves_video_id ON saves(video_id)`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(user_id)`).catch(() => {});

    // Comments (basic; likes are handled client-side for now)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS comments (
        id TEXT PRIMARY KEY,
        video_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        text TEXT NOT NULL,
        parent_id TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    const commentCols: [string, string][] = [
      ["video_id", "TEXT DEFAULT ''"],
      ["user_id", "TEXT DEFAULT ''"],
      ["text", "TEXT DEFAULT ''"],
      ["parent_id", "TEXT"],
      ["created_at", "TIMESTAMPTZ DEFAULT NOW()"],
    ];
    for (const [col, def] of commentCols) {
      await pool.query(`ALTER TABLE comments ADD COLUMN IF NOT EXISTS ${col} ${def}`).catch(() => {});
    }

    await pool.query(`
      CREATE TABLE IF NOT EXISTS likes (
        user_id TEXT NOT NULL,
        video_id TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (user_id, video_id)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS saves (
        user_id TEXT NOT NULL,
        video_id TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (user_id, video_id)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS auth_users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        username TEXT DEFAULT '',
        display_name TEXT DEFAULT '',
        avatar_url TEXT DEFAULT '',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS elix_auth_sessions (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL
      )
    `);
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_elix_auth_sessions_user ON elix_auth_sessions(user_id, expires_at DESC)`,
    ).catch(() => {});
    await pool.query(`
      CREATE TABLE IF NOT EXISTS elix_device_tokens (
        user_id TEXT NOT NULL,
        platform TEXT NOT NULL,
        token TEXT NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (user_id, platform)
      )
    `);
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_elix_device_tokens_user ON elix_device_tokens(user_id)`,
    ).catch(() => {});
    await pool.query(`
      CREATE TABLE IF NOT EXISTS elix_gift_transactions (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        user_id TEXT NOT NULL,
        room_id TEXT NOT NULL,
        gift_id TEXT NOT NULL,
        coins INTEGER NOT NULL DEFAULT 0,
        client_transaction_id TEXT NOT NULL UNIQUE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_elix_gift_transactions_user_time ON elix_gift_transactions(user_id, created_at DESC)`,
    ).catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS profiles (
        user_id TEXT PRIMARY KEY,
        username TEXT DEFAULT '',
        display_name TEXT DEFAULT '',
        avatar_url TEXT DEFAULT '',
        bio TEXT DEFAULT '',
        website TEXT DEFAULT '',
        followers INT DEFAULT 0,
        following INT DEFAULT 0,
        video_count INT DEFAULT 0,
        coins INT DEFAULT 0,
        level INT DEFAULT 1,
        is_verified BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS chat_threads (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        user1_id TEXT NOT NULL,
        user2_id TEXT NOT NULL,
        last_message TEXT DEFAULT '',
        last_at TIMESTAMPTZ DEFAULT NOW(),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        thread_id TEXT NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
        sender_id TEXT NOT NULL,
        text TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool
      .query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS read BOOLEAN DEFAULT FALSE`)
      .catch(() => {});
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_chat_threads_user1_last ON chat_threads(user1_id, last_at DESC)`,
    ).catch(() => {});
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_chat_threads_user2_last ON chat_threads(user2_id, last_at DESC)`,
    ).catch(() => {});
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_messages_thread_created ON messages(thread_id, created_at ASC)`,
    ).catch(() => {});
    await pool.query(`
      CREATE TABLE IF NOT EXISTS shop_items (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT DEFAULT '',
        price NUMERIC NOT NULL DEFAULT 0,
        image_url TEXT,
        category TEXT DEFAULT 'other',
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_shop_items_active_created ON shop_items(is_active, created_at DESC)`,
    ).catch(() => {});
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_shop_items_user_created ON shop_items(user_id, created_at DESC)`,
    ).catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS follows (
        follower_id TEXT NOT NULL,
        following_id TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (follower_id, following_id)
      )
    `);

    // Older DBs may have follows without PRIMARY KEY — INSERT ... ON CONFLICT / upserts will fail until fixed.
    const followsPk = await pool.query(`
      SELECT 1 FROM information_schema.table_constraints
      WHERE table_schema = 'public' AND table_name = 'follows' AND constraint_type = 'PRIMARY KEY'
      LIMIT 1
    `);
    if (!followsPk.rows?.length) {
      await pool.query(`ALTER TABLE follows ADD PRIMARY KEY (follower_id, following_id)`).catch((err) => {
        logger.error(
          { err: err instanceof Error ? err.message : err },
          "follows: could not add PRIMARY KEY (fix duplicates in Neon SQL editor). Follow saves may fail.",
        );
      });
    }

    await pool.query(`
      CREATE TABLE IF NOT EXISTS live_share_inbox (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        recipient_id TEXT NOT NULL,
        sharer_id TEXT NOT NULL,
        stream_key TEXT NOT NULL,
        host_user_id TEXT NOT NULL,
        host_name TEXT DEFAULT '',
        host_avatar TEXT DEFAULT '',
        sharer_name TEXT DEFAULT '',
        sharer_avatar TEXT DEFAULT '',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (recipient_id, sharer_id, stream_key)
      )
    `);

    /** One row per creator slot per battle (host room). Scores are the source of truth when DATABASE_URL is set. */
    await pool.query(`
      CREATE TABLE IF NOT EXISTS battle_creator_buckets (
        host_room_id TEXT NOT NULL,
        battle_id TEXT NOT NULL DEFAULT '',
        slot TEXT NOT NULL,
        creator_user_id TEXT NOT NULL DEFAULT '',
        score BIGINT NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (host_room_id, slot),
        CONSTRAINT battle_creator_buckets_slot_chk CHECK (slot IN ('host', 'opponent', 'player3', 'player4'))
      )
    `);
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_battle_creator_buckets_battle_id ON battle_creator_buckets(battle_id)`,
    ).catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS creator_stickers (
        id SERIAL PRIMARY KEY,
        creator_user_id TEXT NOT NULL,
        image_url TEXT NOT NULL,
        label TEXT NOT NULL DEFAULT '',
        sort_order INT NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_creator_stickers_user ON creator_stickers(creator_user_id)`,
    ).catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS daily_hearts (
        id SERIAL PRIMARY KEY,
        creator_user_id TEXT NOT NULL,
        member_user_id TEXT NOT NULL,
        day DATE NOT NULL DEFAULT CURRENT_DATE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(creator_user_id, member_user_id, day)
      )
    `);
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_daily_hearts_creator_day ON daily_hearts(creator_user_id, day)`,
    ).catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS gift_logs (
        id SERIAL PRIMARY KEY,
        sender_user_id TEXT NOT NULL,
        creator_user_id TEXT NOT NULL,
        room_id TEXT NOT NULL DEFAULT '',
        gift_id TEXT NOT NULL,
        coins INT NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_gift_logs_creator ON gift_logs(creator_user_id, created_at)`,
    ).catch(() => {});
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_gift_logs_sender ON gift_logs(sender_user_id, created_at)`,
    ).catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS elix_notifications (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'general',
        title TEXT NOT NULL DEFAULT '',
        body TEXT NOT NULL DEFAULT '',
        action_url TEXT DEFAULT '',
        read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_elix_notifications_user_created ON elix_notifications(user_id, created_at DESC)`,
    ).catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS elix_blocked_users (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        blocker_user_id TEXT NOT NULL,
        blocked_user_id TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(blocker_user_id, blocked_user_id)
      )
    `).catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS elix_reports (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        reporter_user_id TEXT NOT NULL,
        target_type TEXT NOT NULL DEFAULT 'unknown',
        target_id TEXT NOT NULL DEFAULT '',
        reason TEXT NOT NULL DEFAULT '',
        details TEXT DEFAULT '',
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `).catch(() => {});

    // Migrate old column names if they exist (safe no-op if already correct)
    await pool.query(`ALTER TABLE elix_blocked_users RENAME COLUMN blocker_id TO blocker_user_id`).catch(() => {});
    await pool.query(`ALTER TABLE elix_reports RENAME COLUMN reporter_id TO reporter_user_id`).catch(() => {});
    await pool.query(`ALTER TABLE elix_reports ADD COLUMN IF NOT EXISTS target_type TEXT NOT NULL DEFAULT 'unknown'`).catch(() => {});
    await pool.query(`ALTER TABLE elix_reports ADD COLUMN IF NOT EXISTS target_id TEXT NOT NULL DEFAULT ''`).catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS elix_gifts (
        gift_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        gift_type TEXT NOT NULL DEFAULT 'small',
        coin_cost INTEGER NOT NULL DEFAULT 0,
        animation_url TEXT,
        sfx_url TEXT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        battle_points INTEGER NOT NULL DEFAULT 0
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS elix_coin_packages (
        id TEXT PRIMARY KEY,
        coins INTEGER NOT NULL,
        price NUMERIC NOT NULL DEFAULT 0,
        label TEXT NOT NULL DEFAULT '',
        bonus_coins INTEGER NOT NULL DEFAULT 0,
        is_popular BOOLEAN NOT NULL DEFAULT FALSE,
        product_id TEXT NOT NULL DEFAULT ''
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS elix_analytics_events (
        id SERIAL PRIMARY KEY,
        user_id TEXT,
        event TEXT NOT NULL DEFAULT 'unknown',
        properties JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_elix_analytics_events_created ON elix_analytics_events(created_at DESC)`,
    ).catch(() => {});

    await seedGiftsIfEmpty(pool);
    await seedCoinPackagesIfEmpty(pool);

    const userCount = await pool.query(`SELECT COUNT(*) as cnt FROM auth_users`);
    const profileCount = await pool.query(`SELECT COUNT(*) as cnt FROM profiles`);
    await initWalletPaymentTables(pool);
    logger.info(`Tables ready — ${userCount.rows[0]?.cnt || 0} auth users, ${profileCount.rows[0]?.cnt || 0} profiles in DB`);
  } catch (err) {
    logger.error({ err }, "PostgreSQL init FAILED — data will NOT persist across restarts. Check DATABASE_URL and ensure PostgreSQL is running.");
    pool = null;
  }
}

/** Idempotent — call before INSERT/SELECT on `follows` outside initPostgres (e.g. profile routes). */
export async function ensureFollowsTable(): Promise<void> {
  const p = getPool();
  if (!p) return;
  await p.query(`
    CREATE TABLE IF NOT EXISTS follows (
      follower_id TEXT NOT NULL,
      following_id TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (follower_id, following_id)
    )
  `);
}

export async function loadVideosFromDb(): Promise<Video[]> {
  if (!pool) return [];
  try {
    const res = await pool.query(
      `SELECT id, url, thumbnail, duration, description, hashtags, views, likes, comments, shares, saves, created_at, privacy, user_id
       FROM videos ORDER BY created_at DESC LIMIT 5000`
    );
    return (res.rows || []).map((row: Record<string, unknown>) => ({
      id: String(row.id),
      url: firstNonEmptyString(row.url, row.video_url),
      thumbnail: firstNonEmptyString(row.thumbnail, row.thumbnail_url),
      duration: Number(row.duration ?? 0),
      userId: String(row.userId ?? row.user_id ?? ""),
      username: String(row.username ?? ""),
      displayName: String(row.displayName ?? row.display_name ?? ""),
      avatar: String(row.avatar ?? ""),
      description: String(row.description ?? ""),
      hashtags: Array.isArray(row.hashtags) ? row.hashtags : [],
      music: row.music && typeof row.music === "object" ? (row.music as Video["music"]) : null,
      views: Number(row.views ?? 0),
      likes: Number(row.likes ?? 0),
      comments: Number(row.comments ?? 0),
      shares: Number(row.shares ?? 0),
      saves: Number(row.saves ?? 0),
      createdAt: firstNonEmptyString(row.createdAt, row.created_at),
      privacy: String(row.privacy ?? "public"),
    }));
  } catch (err) {
    logger.error({ err }, "Postgres load videos failed");
    return [];
  }
}

/** Single video by id — used when in-memory store misses (feed reads Postgres directly). */
export async function loadVideoByIdFromDb(id: string): Promise<Video | null> {
  if (!pool) return null;
  const trimmed = String(id || "").trim();
  if (!trimmed) return null;
  try {
    const res = await pool.query(`SELECT * FROM videos WHERE id = $1 LIMIT 1`, [trimmed]);
    const row = res.rows?.[0] as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      id: String(row.id),
      url: firstNonEmptyString(row.url, row.video_url),
      thumbnail: firstNonEmptyString(row.thumbnail, row.thumbnail_url),
      duration: Number(row.duration ?? 0),
      userId: String(row.userId ?? row.user_id ?? ""),
      username: String(row.username ?? ""),
      displayName: String(row.displayName ?? row.display_name ?? ""),
      avatar: String(row.avatar ?? ""),
      description: String(row.description ?? ""),
      hashtags: Array.isArray(row.hashtags) ? row.hashtags : [],
      music: row.music && typeof row.music === "object" ? (row.music as Video["music"]) : null,
      views: Number(row.views ?? 0),
      likes: Number(row.likes ?? 0),
      comments: Number(row.comments ?? 0),
      shares: Number(row.shares ?? 0),
      saves: Number(row.saves ?? 0),
      createdAt: firstNonEmptyString(row.createdAt, row.created_at),
      privacy: String(row.privacy ?? "public"),
    };
  } catch (err) {
    logger.error({ err, id: trimmed }, "loadVideoByIdFromDb failed");
    return null;
  }
}

export async function saveVideoToDb(video: Video): Promise<void> {
  if (!pool) {
    throw new Error("Postgres pool is not initialized");
  }
  const hashtags = Array.isArray(video.hashtags) ? video.hashtags : [];
  await pool.query(
    `INSERT INTO videos (id, url, thumbnail, duration, user_id, username, display_name, avatar, description, hashtags, music, views, likes, comments, shares, saves, created_at, privacy)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12, $13, $14, $15, $16, $17, $18)
     ON CONFLICT (id) DO UPDATE SET url=$2, thumbnail=$3, duration=$4, username=$6, display_name=$7, avatar=$8, description=$9, hashtags=$10::jsonb, music=$11::jsonb, views=$12, likes=$13, comments=$14, shares=$15, saves=$16, privacy=$18`,
    [
      video.id,
      video.url || "",
      video.thumbnail ?? "",
      video.duration ?? 0,
      video.userId,
      video.username ?? "",
      video.displayName ?? "",
      video.avatar ?? "",
      video.description ?? "",
      JSON.stringify(hashtags),
      video.music ? JSON.stringify(video.music) : null,
      video.views ?? 0,
      video.likes ?? 0,
      video.comments ?? 0,
      video.shares ?? 0,
      video.saves ?? 0,
      video.createdAt ?? new Date().toISOString(),
      video.privacy ?? "public",
    ]
  );
  logger.info({ videoId: video.id, url: video.url?.slice(0, 50) }, "Video saved to Postgres");
}

/** Remove video and related engagement rows so it does not reappear after restart (Neon reload). */
export async function deleteVideoFromDb(videoId: string): Promise<void> {
  if (!pool) return;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM comments WHERE video_id = $1`, [videoId]);
    await client.query(`DELETE FROM likes WHERE video_id = $1`, [videoId]);
    await client.query(`DELETE FROM saves WHERE video_id = $1`, [videoId]);
    const del = await client.query(`DELETE FROM videos WHERE id = $1`, [videoId]);
    await client.query("COMMIT");
    logger.info({ videoId, videosDeleted: del.rowCount }, "Video deleted from Postgres");
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    logger.error({ err, videoId }, "Postgres delete video failed");
    throw err;
  } finally {
    client.release();
  }
}

// ── Live stream persistence ─────────────────────────────────────────

export async function dbInsertLiveStream(
  streamKey: string,
  userId: string,
  displayName?: string,
): Promise<void> {
  if (!pool) return;
  try {
    await pool.query(
      `INSERT INTO live_streams (stream_key, user_id, display_name, started_at, is_live, viewer_count)
       VALUES ($1, $2, $3, NOW(), TRUE, 0)
       ON CONFLICT (stream_key) DO UPDATE
         SET user_id = $2, display_name = $3, started_at = NOW(), ended_at = NULL, is_live = TRUE, viewer_count = 0`,
      [streamKey, userId, displayName ?? null],
    );
  } catch (err) {
    logger.error({ err }, "Postgres insert live_stream failed");
  }
}

export async function dbEndLiveStream(streamKey: string): Promise<void> {
  if (!pool) return;
  try {
    await pool.query(
      `UPDATE live_streams SET is_live = FALSE, ended_at = NOW() WHERE stream_key = $1`,
      [streamKey],
    );
  } catch (err) {
    logger.error({ err }, "Postgres end live_stream failed");
  }
}

export async function dbUpdateViewerCount(
  streamKey: string,
  count: number,
): Promise<void> {
  if (!pool) return;
  try {
    await pool.query(
      `UPDATE live_streams SET viewer_count = $2 WHERE stream_key = $1 AND is_live = TRUE`,
      [streamKey, count],
    );
  } catch (err) {
    logger.error({ err }, "Postgres update viewer_count failed");
  }
}

export async function dbGetLiveStreams(): Promise<
  { stream_key: string; user_id: string; display_name: string | null; started_at: string; viewer_count: number }[]
> {
  if (!pool) return [];
  try {
    const res = await pool.query(
      `SELECT stream_key, user_id, display_name, started_at, viewer_count
       FROM live_streams WHERE is_live = TRUE ORDER BY started_at DESC
       LIMIT 500`,
    );
    return res.rows;
  } catch (err) {
    logger.error({ err }, "Postgres get live_streams failed");
    return [];
  }
}

export type LiveShareInboxRow = {
  sharer_id: string;
  stream_key: string;
  host_user_id: string;
  host_name: string;
  host_avatar: string;
  sharer_name: string;
  sharer_avatar: string;
  created_at: string;
};

/** Someone shared a live with recipient (Inbox → Requests). */
export async function upsertLiveShareInbox(row: {
  recipientId: string;
  sharerId: string;
  streamKey: string;
  hostUserId: string;
  hostName: string;
  hostAvatar: string;
  sharerName: string;
  sharerAvatar: string;
}): Promise<boolean> {
  if (!pool) return false;
  try {
    await pool.query(
      `INSERT INTO live_share_inbox (
         recipient_id, sharer_id, stream_key, host_user_id, host_name, host_avatar, sharer_name, sharer_avatar, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       ON CONFLICT (recipient_id, sharer_id, stream_key) DO UPDATE SET
         host_user_id = EXCLUDED.host_user_id,
         host_name = EXCLUDED.host_name,
         host_avatar = EXCLUDED.host_avatar,
         sharer_name = EXCLUDED.sharer_name,
         sharer_avatar = EXCLUDED.sharer_avatar,
         created_at = NOW()`,
      [
        row.recipientId,
        row.sharerId,
        row.streamKey,
        row.hostUserId,
        row.hostName.slice(0, 120),
        row.hostAvatar.slice(0, 500),
        row.sharerName.slice(0, 120),
        row.sharerAvatar.slice(0, 500),
      ],
    );
    return true;
  } catch (err) {
    logger.error({ err }, "Postgres upsert live_share_inbox failed");
    return false;
  }
}

/** Shares from people you do not follow — keeps Main chat list uncluttered. */
export async function listLiveShareRequestsNonFollowing(recipientId: string): Promise<LiveShareInboxRow[]> {
  if (!pool) return [];
  try {
    const res = await pool.query(
      `SELECT l.sharer_id, l.stream_key, l.host_user_id,
              COALESCE(l.host_name, '') AS host_name,
              COALESCE(l.host_avatar, '') AS host_avatar,
              COALESCE(l.sharer_name, '') AS sharer_name,
              COALESCE(l.sharer_avatar, '') AS sharer_avatar,
              l.created_at
       FROM live_share_inbox l
       WHERE l.recipient_id = $1
         AND l.sharer_id <> $1
         AND NOT EXISTS (
           SELECT 1 FROM follows f
           WHERE f.follower_id = $1 AND f.following_id = l.sharer_id
         )
       ORDER BY l.created_at DESC
       LIMIT 80`,
      [recipientId],
    );
    return (res.rows || []).map((r: Record<string, unknown>) => ({
      sharer_id: String(r.sharer_id ?? ""),
      stream_key: String(r.stream_key ?? ""),
      host_user_id: String(r.host_user_id ?? ""),
      host_name: String(r.host_name ?? ""),
      host_avatar: String(r.host_avatar ?? ""),
      sharer_name: String(r.sharer_name ?? ""),
      sharer_avatar: String(r.sharer_avatar ?? ""),
      created_at:
        r.created_at instanceof Date ? (r.created_at as Date).toISOString() : String(r.created_at ?? ""),
    }));
  } catch (err) {
    logger.error({ err, recipientId }, "Postgres list live_share_inbox failed");
    return [];
  }
}

// ── Battle scores (Neon / Postgres) — one bucket per creator slot per host room ─────────────────

export type BattleSlot = "host" | "opponent" | "player3" | "player4";

export type BattleSessionScoreContext = {
  hostRoomId: string;
  id: string;
  hostUserId: string;
  opponentUserId: string;
  player3UserId: string;
  player4UserId: string;
};

export type BattleScoresRow = {
  host: number;
  opponent: number;
  player3: number;
  player4: number;
};

function rowToScores(rows: { slot: string; score: unknown }[]): BattleScoresRow {
  const out: BattleScoresRow = { host: 0, opponent: 0, player3: 0, player4: 0 };
  for (const r of rows) {
    const s = String(r.slot);
    const n = Number(r.score);
    if (s === "host") out.host = Number.isFinite(n) ? n : 0;
    else if (s === "opponent") out.opponent = Number.isFinite(n) ? n : 0;
    else if (s === "player3") out.player3 = Number.isFinite(n) ? n : 0;
    else if (s === "player4") out.player4 = Number.isFinite(n) ? n : 0;
  }
  return out;
}

/** Insert or refresh four creator buckets (P1–P4) for a battle. */
export async function dbEnsureBattleCreatorBuckets(ctx: BattleSessionScoreContext): Promise<void> {
  const p = getPool();
  if (!p) return;
  const creators: Record<BattleSlot, string> = {
    host: ctx.hostUserId || "",
    opponent: ctx.opponentUserId || "",
    player3: ctx.player3UserId || "",
    player4: ctx.player4UserId || "",
  };
  for (const slot of ["host", "opponent", "player3", "player4"] as BattleSlot[]) {
    await p.query(
      `INSERT INTO battle_creator_buckets (host_room_id, battle_id, slot, creator_user_id, score)
       VALUES ($1, $2, $3, $4, 0)
       ON CONFLICT (host_room_id, slot) DO UPDATE SET
         battle_id = EXCLUDED.battle_id,
         creator_user_id = CASE
           WHEN EXCLUDED.creator_user_id <> '' THEN EXCLUDED.creator_user_id
           ELSE battle_creator_buckets.creator_user_id
         END`,
      [ctx.hostRoomId, ctx.id, slot, creators[slot]],
    );
  }
}

export async function dbSyncBattleCreatorSlot(
  hostRoomId: string,
  slot: BattleSlot,
  creatorUserId: string,
): Promise<void> {
  const p = getPool();
  if (!p || !creatorUserId) return;
  try {
    await p.query(
      `UPDATE battle_creator_buckets SET creator_user_id = $3, updated_at = NOW()
       WHERE host_room_id = $1 AND slot = $2`,
      [hostRoomId, slot, creatorUserId],
    );
  } catch (err) {
    logger.error({ err, hostRoomId, slot }, "dbSyncBattleCreatorSlot failed");
  }
}

/** Atomic increment for one creator bucket; returns all four scores. Ensures rows if missing. */
export async function dbAddBattleScoreAndFetchAll(
  hostRoomId: string,
  target: BattleSlot,
  points: number,
  ensureCtx: BattleSessionScoreContext | null,
): Promise<BattleScoresRow | null> {
  const pool = getPool();
  if (!pool) return null;

  async function doIncrement(): Promise<BattleScoresRow | null> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const up = await client.query(
        `UPDATE battle_creator_buckets SET score = score + $3, updated_at = NOW()
         WHERE host_room_id = $1 AND slot = $2`,
        [hostRoomId, target, points],
      );
      if ((up.rowCount ?? 0) === 0) {
        await client.query("ROLLBACK");
        return null;
      }
      const sel = await client.query(
        `SELECT slot, score FROM battle_creator_buckets WHERE host_room_id = $1`,
        [hostRoomId],
      );
      await client.query("COMMIT");
      return rowToScores(sel.rows as { slot: string; score: unknown }[]);
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* ignore */
      }
      logger.error({ err, hostRoomId, target }, "battle bucket increment failed");
      return null;
    } finally {
      client.release();
    }
  }

  let result = await doIncrement();
  if (result === null && ensureCtx) {
    await dbEnsureBattleCreatorBuckets(ensureCtx);
    result = await doIncrement();
  }
  return result;
}

/** Increment both slots on one team (red: host+player3, blue: opponent+player4) in one transaction. */
export async function dbAddBattleScoreTeamSideAndFetchAll(
  hostRoomId: string,
  side: "red" | "blue",
  pointsPerPlayer: number,
  ensureCtx: BattleSessionScoreContext | null,
): Promise<BattleScoresRow | null> {
  const pool = getPool();
  if (!pool) return null;

  const slots: [BattleSlot, BattleSlot] =
    side === "red" ? ["host", "player3"] : ["opponent", "player4"];

  async function doIncrement(): Promise<BattleScoresRow | null> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const slot of slots) {
        const up = await client.query(
          `UPDATE battle_creator_buckets SET score = score + $3, updated_at = NOW()
           WHERE host_room_id = $1 AND slot = $2`,
          [hostRoomId, slot, pointsPerPlayer],
        );
        if ((up.rowCount ?? 0) === 0) {
          await client.query("ROLLBACK");
          return null;
        }
      }
      const sel = await client.query(
        `SELECT slot, score FROM battle_creator_buckets WHERE host_room_id = $1`,
        [hostRoomId],
      );
      await client.query("COMMIT");
      return rowToScores(sel.rows as { slot: string; score: unknown }[]);
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* ignore */
      }
      logger.error({ err, hostRoomId, side }, "battle team side increment failed");
      return null;
    } finally {
      client.release();
    }
  }

  let result = await doIncrement();
  if (result === null && ensureCtx) {
    await dbEnsureBattleCreatorBuckets(ensureCtx);
    result = await doIncrement();
  }
  return result;
}

export async function dbLoadBattleScores(hostRoomId: string): Promise<BattleScoresRow | null> {
  const p = getPool();
  if (!p) return null;
  try {
    const sel = await p.query(
      `SELECT slot, score FROM battle_creator_buckets WHERE host_room_id = $1`,
      [hostRoomId],
    );
    if (!sel.rows?.length) return null;
    return rowToScores(sel.rows as { slot: string; score: unknown }[]);
  } catch (err) {
    logger.error({ err, hostRoomId }, "dbLoadBattleScores failed");
    return null;
  }
}

export async function dbDeleteBattleBuckets(hostRoomId: string): Promise<void> {
  const p = getPool();
  if (!p) return;
  try {
    await p.query(`DELETE FROM battle_creator_buckets WHERE host_room_id = $1`, [hostRoomId]);
  } catch (err) {
    logger.error({ err, hostRoomId }, "dbDeleteBattleBuckets failed");
  }
}

// ── Creator Stickers ──

export async function dbGetCreatorStickers(creatorUserId: string): Promise<{ id: number; image_url: string; label: string }[]> {
  const p = getPool();
  if (!p) return [];
  try {
    const res = await p.query(
      `SELECT id, image_url, label FROM creator_stickers WHERE creator_user_id = $1 ORDER BY sort_order, id`,
      [creatorUserId],
    );
    return res.rows;
  } catch (err) {
    logger.error({ err, creatorUserId }, "dbGetCreatorStickers failed");
    return [];
  }
}

export async function dbAddCreatorSticker(creatorUserId: string, imageUrl: string, label: string): Promise<{ id: number; image_url: string; label: string } | null> {
  const p = getPool();
  if (!p) return null;
  try {
    const count = await p.query(`SELECT COUNT(*) as cnt FROM creator_stickers WHERE creator_user_id = $1`, [creatorUserId]);
    if (Number(count.rows[0]?.cnt) >= 20) return null;
    const res = await p.query(
      `INSERT INTO creator_stickers (creator_user_id, image_url, label, sort_order) VALUES ($1, $2, $3, COALESCE((SELECT MAX(sort_order) + 1 FROM creator_stickers WHERE creator_user_id = $1), 0)) RETURNING id, image_url, label`,
      [creatorUserId, imageUrl, label],
    );
    return res.rows[0] || null;
  } catch (err) {
    logger.error({ err, creatorUserId }, "dbAddCreatorSticker failed");
    return null;
  }
}

export async function dbDeleteCreatorSticker(creatorUserId: string, stickerId: number): Promise<boolean> {
  const p = getPool();
  if (!p) return false;
  try {
    const res = await p.query(
      `DELETE FROM creator_stickers WHERE id = $1 AND creator_user_id = $2`,
      [stickerId, creatorUserId],
    );
    return (res.rowCount ?? 0) > 0;
  } catch (err) {
    logger.error({ err, stickerId, creatorUserId }, "dbDeleteCreatorSticker failed");
    return false;
  }
}

// ── Daily Hearts ──

export async function dbSendDailyHeart(creatorUserId: string, memberUserId: string): Promise<'sent' | 'already' | 'error'> {
  const p = getPool();
  if (!p) return 'error';
  try {
    await p.query(
      `INSERT INTO daily_hearts (creator_user_id, member_user_id, day) VALUES ($1, $2, CURRENT_DATE) ON CONFLICT DO NOTHING`,
      [creatorUserId, memberUserId],
    );
    const check = await p.query(
      `SELECT 1 FROM daily_hearts WHERE creator_user_id = $1 AND member_user_id = $2 AND day = CURRENT_DATE`,
      [creatorUserId, memberUserId],
    );
    return check.rows.length > 0 ? 'sent' : 'error';
  } catch (err: any) {
    if (err?.code === '23505') return 'already';
    logger.error({ err, creatorUserId, memberUserId }, "dbSendDailyHeart failed");
    return 'error';
  }
}

export async function dbGetDailyHeartCount(creatorUserId: string): Promise<number> {
  const p = getPool();
  if (!p) return 0;
  try {
    const res = await p.query(
      `SELECT COUNT(*) as cnt FROM daily_hearts WHERE creator_user_id = $1 AND day = CURRENT_DATE`,
      [creatorUserId],
    );
    return Number(res.rows[0]?.cnt) || 0;
  } catch (err) {
    logger.error({ err, creatorUserId }, "dbGetDailyHeartCount failed");
    return 0;
  }
}

export async function dbGetTotalHeartCount(creatorUserId: string): Promise<number> {
  const p = getPool();
  if (!p) return 0;
  try {
    const res = await p.query(
      `SELECT COUNT(*) as cnt FROM daily_hearts WHERE creator_user_id = $1`,
      [creatorUserId],
    );
    return Number(res.rows[0]?.cnt) || 0;
  } catch (err) {
    logger.error({ err, creatorUserId }, "dbGetTotalHeartCount failed");
    return 0;
  }
}

export async function dbHasSentDailyHeart(creatorUserId: string, memberUserId: string): Promise<boolean> {
  const p = getPool();
  if (!p) return false;
  try {
    const res = await p.query(
      `SELECT 1 FROM daily_hearts WHERE creator_user_id = $1 AND member_user_id = $2 AND day = CURRENT_DATE`,
      [creatorUserId, memberUserId],
    );
    return res.rows.length > 0;
  } catch (err) {
    logger.error({ err, creatorUserId, memberUserId }, "dbHasSentDailyHeart failed");
    return false;
  }
}

// ── Gift Logs ──

export async function dbLogGift(senderUserId: string, creatorUserId: string, roomId: string, giftId: string, coins: number): Promise<void> {
  const p = getPool();
  if (!p) return;
  try {
    await p.query(
      `INSERT INTO gift_logs (sender_user_id, creator_user_id, room_id, gift_id, coins) VALUES ($1, $2, $3, $4, $5)`,
      [senderUserId, creatorUserId, roomId, giftId, coins],
    );
  } catch (err) {
    logger.error({ err, senderUserId, creatorUserId, giftId }, "dbLogGift failed");
  }
}

export async function dbGetWeeklyRanking(): Promise<{ user_id: string; total_coins: number }[]> {
  const p = getPool();
  if (!p) return [];
  try {
    const res = await p.query(`
      SELECT creator_user_id AS user_id, SUM(coins) AS total_coins
      FROM gift_logs
      WHERE created_at >= NOW() - INTERVAL '7 days'
      GROUP BY creator_user_id
      ORDER BY total_coins DESC
      LIMIT 50
    `);
    return res.rows.map(r => ({ user_id: r.user_id, total_coins: Number(r.total_coins) || 0 }));
  } catch (err) {
    logger.error({ err }, "dbGetWeeklyRanking failed");
    return [];
  }
}

export async function dbGetCreatorMembershipStats(creatorUserId: string): Promise<{ todayHearts: number; totalHearts: number; totalGiftCoins: number; topGifters: { user_id: string; total_coins: number }[] }> {
  const p = getPool();
  if (!p) return { todayHearts: 0, totalHearts: 0, totalGiftCoins: 0, topGifters: [] };
  try {
    const [todayRes, totalRes, coinsRes, giftersRes] = await Promise.all([
      p.query(`SELECT COUNT(*) as cnt FROM daily_hearts WHERE creator_user_id = $1 AND day = CURRENT_DATE`, [creatorUserId]),
      p.query(`SELECT COUNT(*) as cnt FROM daily_hearts WHERE creator_user_id = $1`, [creatorUserId]),
      p.query(`SELECT COALESCE(SUM(coins), 0) as total FROM gift_logs WHERE creator_user_id = $1`, [creatorUserId]),
      p.query(`SELECT sender_user_id AS user_id, SUM(coins) AS total_coins FROM gift_logs WHERE creator_user_id = $1 GROUP BY sender_user_id ORDER BY total_coins DESC LIMIT 10`, [creatorUserId]),
    ]);
    return {
      todayHearts: Number(todayRes.rows[0]?.cnt) || 0,
      totalHearts: Number(totalRes.rows[0]?.cnt) || 0,
      totalGiftCoins: Number(coinsRes.rows[0]?.total) || 0,
      topGifters: giftersRes.rows.map(r => ({ user_id: r.user_id, total_coins: Number(r.total_coins) || 0 })),
    };
  } catch (err) {
    logger.error({ err, creatorUserId }, "dbGetCreatorMembershipStats failed");
    return { todayHearts: 0, totalHearts: 0, totalGiftCoins: 0, topGifters: [] };
  }
}

export type DbChatThreadRow = {
  id: string;
  user1_id: string;
  user2_id: string;
  last_at: string;
  last_message: string;
  created_at: string;
};

export type DbChatMessageRow = {
  id: string;
  thread_id: string;
  sender_id: string;
  text: string;
  created_at: string;
  read: boolean;
};

export async function dbEnsureChatThread(userId: string, otherUserId: string): Promise<DbChatThreadRow | null> {
  const p = getPool();
  if (!p || !userId || !otherUserId || userId === otherUserId) return null;
  try {
    const existing = await p.query(
      `SELECT id, user1_id, user2_id, last_at, last_message, created_at
       FROM chat_threads
       WHERE (user1_id = $1 AND user2_id = $2) OR (user1_id = $2 AND user2_id = $1)
       LIMIT 1`,
      [userId, otherUserId],
    );
    if (existing.rows[0]) {
      const row = existing.rows[0];
      return {
        id: String(row.id),
        user1_id: String(row.user1_id),
        user2_id: String(row.user2_id),
        last_at: new Date(row.last_at).toISOString(),
        last_message: String(row.last_message ?? ""),
        created_at: new Date(row.created_at).toISOString(),
      };
    }
    const inserted = await p.query(
      `INSERT INTO chat_threads (user1_id, user2_id, last_message, last_at, created_at)
       VALUES ($1, $2, '', NOW(), NOW())
       RETURNING id, user1_id, user2_id, last_at, last_message, created_at`,
      [userId, otherUserId],
    );
    const row = inserted.rows[0];
    return {
      id: String(row.id),
      user1_id: String(row.user1_id),
      user2_id: String(row.user2_id),
      last_at: new Date(row.last_at).toISOString(),
      last_message: String(row.last_message ?? ""),
      created_at: new Date(row.created_at).toISOString(),
    };
  } catch (err) {
    logger.error({ err }, "dbEnsureChatThread failed");
    return null;
  }
}

export async function dbListChatThreadsForUser(userId: string, limit: number): Promise<DbChatThreadRow[]> {
  const p = getPool();
  if (!p || !userId) return [];
  try {
    const lim = Math.max(1, Math.min(100, limit || 50));
    const res = await p.query(
      `SELECT id, user1_id, user2_id, last_at, last_message, created_at
       FROM chat_threads
       WHERE user1_id = $1 OR user2_id = $1
       ORDER BY last_at DESC
       LIMIT $2`,
      [userId, lim],
    );
    return res.rows.map((row) => ({
      id: String(row.id),
      user1_id: String(row.user1_id),
      user2_id: String(row.user2_id),
      last_at: new Date(row.last_at).toISOString(),
      last_message: String(row.last_message ?? ""),
      created_at: new Date(row.created_at).toISOString(),
    }));
  } catch (err) {
    logger.error({ err }, "dbListChatThreadsForUser failed");
    return [];
  }
}

export async function dbGetChatThread(threadId: string, userId: string): Promise<DbChatThreadRow | null> {
  const p = getPool();
  if (!p) return null;
  try {
    const res = await p.query(
      `SELECT id, user1_id, user2_id, last_at, last_message, created_at
       FROM chat_threads
       WHERE id = $1 AND (user1_id = $2 OR user2_id = $2)
       LIMIT 1`,
      [threadId, userId],
    );
    const row = res.rows[0];
    if (!row) return null;
    return {
      id: String(row.id),
      user1_id: String(row.user1_id),
      user2_id: String(row.user2_id),
      last_at: new Date(row.last_at).toISOString(),
      last_message: String(row.last_message ?? ""),
      created_at: new Date(row.created_at).toISOString(),
    };
  } catch (err) {
    logger.error({ err }, "dbGetChatThread failed");
    return null;
  }
}

export async function dbListChatMessages(threadId: string, userId: string, limit: number): Promise<DbChatMessageRow[]> {
  const p = getPool();
  if (!p) return [];
  const thread = await dbGetChatThread(threadId, userId);
  if (!thread) return [];
  try {
    const lim = Math.max(1, Math.min(500, limit || 200));
    const res = await p.query(
      `SELECT id, thread_id, sender_id, text, created_at, read
       FROM messages
       WHERE thread_id = $1
       ORDER BY created_at ASC
       LIMIT $2`,
      [threadId, lim],
    );
    return res.rows.map((row) => ({
      id: String(row.id),
      thread_id: String(row.thread_id),
      sender_id: String(row.sender_id),
      text: String(row.text ?? ""),
      created_at: new Date(row.created_at).toISOString(),
      read: Boolean(row.read),
    }));
  } catch (err) {
    logger.error({ err }, "dbListChatMessages failed");
    return [];
  }
}

export async function dbAppendChatMessage(
  threadId: string,
  senderId: string,
  text: string,
): Promise<DbChatMessageRow | null> {
  const p = getPool();
  if (!p) return null;
  const thread = await dbGetChatThread(threadId, senderId);
  if (!thread) return null;
  const trimmed = String(text || "").trim().slice(0, 8000);
  if (!trimmed) return null;
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    const msgRes = await client.query(
      `INSERT INTO messages (thread_id, sender_id, text, created_at, read)
       VALUES ($1, $2, $3, NOW(), FALSE)
       RETURNING id, thread_id, sender_id, text, created_at, read`,
      [threadId, senderId, trimmed],
    );
    await client.query(
      `UPDATE chat_threads
       SET last_message = $2, last_at = NOW()
       WHERE id = $1`,
      [threadId, trimmed],
    );
    await client.query("COMMIT");
    const row = msgRes.rows[0];
    return {
      id: String(row.id),
      thread_id: String(row.thread_id),
      sender_id: String(row.sender_id),
      text: String(row.text ?? ""),
      created_at: new Date(row.created_at).toISOString(),
      read: Boolean(row.read),
    };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* noop */
    }
    logger.error({ err }, "dbAppendChatMessage failed");
    return null;
  } finally {
    client.release();
  }
}

export async function dbUnreadCountForThread(threadId: string, readerId: string): Promise<number> {
  const p = getPool();
  if (!p) return 0;
  const thread = await dbGetChatThread(threadId, readerId);
  if (!thread) return 0;
  try {
    const res = await p.query(
      `SELECT COUNT(*)::int AS c
       FROM messages
       WHERE thread_id = $1 AND sender_id <> $2 AND read = FALSE`,
      [threadId, readerId],
    );
    return Number(res.rows[0]?.c ?? 0);
  } catch (err) {
    logger.warn({ err, threadId, readerId }, "dbUnreadCountForThread failed");
    return 0;
  }
}

export type DbShopItemRow = {
  id: string;
  user_id: string;
  title: string;
  description: string;
  price: number;
  image_url: string | null;
  category: string;
  is_active: boolean;
  created_at: string;
};

export async function dbListShopItems(filter: {
  category?: string;
  userId?: string;
  activeOnly?: boolean;
  limit?: number;
}): Promise<DbShopItemRow[]> {
  const p = getPool();
  if (!p) return [];
  const lim = Math.min(200, Math.max(1, filter.limit ?? 50));
  const params: unknown[] = [];
  let where = "WHERE 1=1";
  if (filter.activeOnly !== false) where += " AND is_active = TRUE";
  if (filter.category && filter.category !== "all") {
    params.push(filter.category);
    where += ` AND category = $${params.length}`;
  }
  if (filter.userId) {
    params.push(filter.userId);
    where += ` AND user_id = $${params.length}`;
  }
  params.push(lim);
  try {
    const res = await p.query(
      `SELECT id, user_id, title, description, price, image_url, category, is_active, created_at
       FROM shop_items
       ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length}`,
      params,
    );
    return res.rows.map((row) => ({
      id: String(row.id),
      user_id: String(row.user_id),
      title: String(row.title ?? ""),
      description: String(row.description ?? ""),
      price: Number(row.price ?? 0),
      image_url: row.image_url == null ? null : String(row.image_url),
      category: String(row.category ?? "other"),
      is_active: Boolean(row.is_active),
      created_at: new Date(row.created_at).toISOString(),
    }));
  } catch (err) {
    logger.error({ err }, "dbListShopItems failed");
    return [];
  }
}

export async function dbCreateShopItem(input: {
  user_id: string;
  title: string;
  description: string;
  price: number;
  image_url: string | null;
  category: string;
}): Promise<DbShopItemRow | null> {
  const p = getPool();
  if (!p) return null;
  try {
    const res = await p.query(
      `INSERT INTO shop_items (user_id, title, description, price, image_url, category, is_active, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, NOW())
       RETURNING id, user_id, title, description, price, image_url, category, is_active, created_at`,
      [
        input.user_id,
        input.title.trim().slice(0, 200),
        input.description.trim().slice(0, 5000),
        Math.max(0, Number(input.price) || 0),
        input.image_url,
        input.category || "other",
      ],
    );
    const row = res.rows[0];
    return {
      id: String(row.id),
      user_id: String(row.user_id),
      title: String(row.title ?? ""),
      description: String(row.description ?? ""),
      price: Number(row.price ?? 0),
      image_url: row.image_url == null ? null : String(row.image_url),
      category: String(row.category ?? "other"),
      is_active: Boolean(row.is_active),
      created_at: new Date(row.created_at).toISOString(),
    };
  } catch (err) {
    logger.error({ err }, "dbCreateShopItem failed");
    return null;
  }
}

export async function dbGetShopItemById(id: string): Promise<DbShopItemRow | null> {
  const p = getPool();
  if (!p) return null;
  try {
    const res = await p.query(
      `SELECT id, user_id, title, description, price, image_url, category, is_active, created_at
       FROM shop_items
       WHERE id = $1
       LIMIT 1`,
      [id],
    );
    const row = res.rows[0];
    if (!row) return null;
    return {
      id: String(row.id),
      user_id: String(row.user_id),
      title: String(row.title ?? ""),
      description: String(row.description ?? ""),
      price: Number(row.price ?? 0),
      image_url: row.image_url == null ? null : String(row.image_url),
      category: String(row.category ?? "other"),
      is_active: Boolean(row.is_active),
      created_at: new Date(row.created_at).toISOString(),
    };
  } catch (err) {
    logger.error({ err }, "dbGetShopItemById failed");
    return null;
  }
}

export async function dbMarkShopItemSold(id: string): Promise<void> {
  const p = getPool();
  if (!p) return;
  try {
    await p.query(`UPDATE shop_items SET is_active = FALSE WHERE id = $1`, [id]);
  } catch (err) {
    logger.error({ err }, "dbMarkShopItemSold failed");
  }
}

// ── Gifts catalog (DB) ──

const SEED_GIFTS = [
  { gift_id: "rose", name: "Rose", gift_type: "small", coin_cost: 1, animation_url: "/gifts/rose.webm", sfx_url: null, battle_points: 1 },
  { gift_id: "heart", name: "Heart", gift_type: "small", coin_cost: 5, animation_url: "/gifts/heart.webm", sfx_url: null, battle_points: 5 },
  { gift_id: "kiss", name: "Kiss", gift_type: "small", coin_cost: 10, animation_url: "/gifts/kiss.webm", sfx_url: null, battle_points: 10 },
  { gift_id: "crown", name: "Crown", gift_type: "big", coin_cost: 50, animation_url: "/gifts/crown.webm", sfx_url: null, battle_points: 1500 },
  { gift_id: "diamond", name: "Diamond", gift_type: "big", coin_cost: 100, animation_url: "/gifts/diamond.webm", sfx_url: null, battle_points: 300 },
  { gift_id: "rocket", name: "Rocket", gift_type: "big", coin_cost: 500, animation_url: "/gifts/rocket.webm", sfx_url: null, battle_points: 500 },
  { gift_id: "elix_global_universe", name: "Elix Universe", gift_type: "universe", coin_cost: 1000, animation_url: "/gifts/elix_global_universe.webm", sfx_url: null, battle_points: 1000000 },
  { gift_id: "elix_live_universe", name: "Elix Live", gift_type: "universe", coin_cost: 2000, animation_url: "/gifts/elix_live_universe.webm", sfx_url: null, battle_points: 80000 },
  { gift_id: "elix_gold_universe", name: "Elix Gold", gift_type: "universe", coin_cost: 5000, animation_url: "/gifts/elix_gold_universe.webm", sfx_url: null, battle_points: 120000 },
];

async function seedGiftsIfEmpty(p: pg.Pool): Promise<void> {
  try {
    const count = await p.query(`SELECT COUNT(*) as cnt FROM elix_gifts`);
    if (Number(count.rows[0]?.cnt) > 0) return;
    for (const g of SEED_GIFTS) {
      await p.query(
        `INSERT INTO elix_gifts (gift_id, name, gift_type, coin_cost, animation_url, sfx_url, is_active, battle_points)
         VALUES ($1, $2, $3, $4, $5, $6, TRUE, $7)
         ON CONFLICT (gift_id) DO NOTHING`,
        [g.gift_id, g.name, g.gift_type, g.coin_cost, g.animation_url, g.sfx_url, g.battle_points],
      );
    }
    logger.info(`Seeded ${SEED_GIFTS.length} gifts into elix_gifts`);
  } catch (err) {
    logger.error({ err }, "seedGiftsIfEmpty failed");
  }
}

export type DbGiftRow = {
  gift_id: string;
  name: string;
  gift_type: string;
  coin_cost: number;
  animation_url: string | null;
  sfx_url: string | null;
  is_active: boolean;
  battle_points: number;
};

export async function dbLoadGifts(): Promise<DbGiftRow[]> {
  const p = getPool();
  if (!p) return [];
  try {
    const res = await p.query(
      `SELECT gift_id, name, gift_type, coin_cost, animation_url, sfx_url, is_active, battle_points
       FROM elix_gifts WHERE is_active = TRUE ORDER BY coin_cost ASC`,
    );
    return res.rows.map((r: any) => ({
      gift_id: String(r.gift_id),
      name: String(r.name),
      gift_type: String(r.gift_type),
      coin_cost: Number(r.coin_cost),
      animation_url: r.animation_url ?? null,
      sfx_url: r.sfx_url ?? null,
      is_active: Boolean(r.is_active),
      battle_points: Number(r.battle_points ?? 0),
    }));
  } catch (err) {
    logger.error({ err }, "dbLoadGifts failed");
    return [];
  }
}

export async function dbGetGiftCost(giftId: string): Promise<number | null> {
  const p = getPool();
  if (!p) return null;
  try {
    const res = await p.query(
      `SELECT coin_cost FROM elix_gifts WHERE gift_id = $1 AND is_active = TRUE LIMIT 1`,
      [giftId],
    );
    if (!res.rows[0]) return null;
    return Number(res.rows[0].coin_cost);
  } catch (err) {
    logger.error({ err, giftId }, "dbGetGiftCost failed");
    return null;
  }
}

// ── Coin packages (DB) ──

const SEED_COIN_PACKAGES = [
  { id: "coins_10", coins: 10, price: 0.05, label: "10 Coins", bonus_coins: 0, is_popular: false, product_id: "com.elixstarlive.coins_10" },
  { id: "coins_50", coins: 50, price: 0.18, label: "50 Coins", bonus_coins: 0, is_popular: false, product_id: "com.elixstarlive.coins_50" },
  { id: "coins_100", coins: 100, price: 0.35, label: "100 Coins", bonus_coins: 0, is_popular: false, product_id: "com.elixstarlive.coins_100" },
  { id: "coins_500", coins: 500, price: 1.75, label: "500 Coins", bonus_coins: 50, is_popular: false, product_id: "com.elixstarlive.coins_500" },
  { id: "coins_1000", coins: 1000, price: 3.5, label: "1,000 Coins", bonus_coins: 100, is_popular: true, product_id: "com.elixstarlive.coins_1000" },
  { id: "coins_2000", coins: 2000, price: 7.0, label: "2,000 Coins", bonus_coins: 200, is_popular: false, product_id: "com.elixstarlive.coins_2000" },
  { id: "coins_5000", coins: 5000, price: 17.5, label: "5,000 Coins", bonus_coins: 500, is_popular: false, product_id: "com.elixstarlive.coins_5000" },
  { id: "coins_10000", coins: 10000, price: 35.0, label: "10K Coins", bonus_coins: 1000, is_popular: false, product_id: "com.elixstarlive.coins_10000" },
  { id: "coins_50000", coins: 50000, price: 175.0, label: "50K Coins", bonus_coins: 5000, is_popular: false, product_id: "com.elixstarlive.coins_50000" },
  { id: "coins_100000", coins: 100000, price: 350.0, label: "100K Coins", bonus_coins: 10000, is_popular: false, product_id: "com.elixstarlive.coins_100000" },
];

async function seedCoinPackagesIfEmpty(p: pg.Pool): Promise<void> {
  try {
    const count = await p.query(`SELECT COUNT(*) as cnt FROM elix_coin_packages`);
    if (Number(count.rows[0]?.cnt) > 0) return;
    for (const pkg of SEED_COIN_PACKAGES) {
      await p.query(
        `INSERT INTO elix_coin_packages (id, coins, price, label, bonus_coins, is_popular, product_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO NOTHING`,
        [pkg.id, pkg.coins, pkg.price, pkg.label, pkg.bonus_coins, pkg.is_popular, pkg.product_id],
      );
    }
    logger.info(`Seeded ${SEED_COIN_PACKAGES.length} coin packages into elix_coin_packages`);
  } catch (err) {
    logger.error({ err }, "seedCoinPackagesIfEmpty failed");
  }
}

export type DbCoinPackageRow = {
  id: string;
  coins: number;
  price: number;
  label: string;
  bonus_coins: number;
  is_popular: boolean;
  product_id: string;
};

export async function dbLoadCoinPackages(): Promise<DbCoinPackageRow[]> {
  const p = getPool();
  if (!p) return [];
  try {
    const res = await p.query(
      `SELECT id, coins, price, label, bonus_coins, is_popular, product_id
       FROM elix_coin_packages ORDER BY coins ASC`,
    );
    return res.rows.map((r: any) => ({
      id: String(r.id),
      coins: Number(r.coins),
      price: Number(r.price),
      label: String(r.label),
      bonus_coins: Number(r.bonus_coins),
      is_popular: Boolean(r.is_popular),
      product_id: String(r.product_id),
    }));
  } catch (err) {
    logger.error({ err }, "dbLoadCoinPackages failed");
    return [];
  }
}

export async function dbLoadCoinMap(): Promise<Record<string, number>> {
  const p = getPool();
  if (!p) return {};
  try {
    const res = await p.query(`SELECT product_id, coins FROM elix_coin_packages`);
    const map: Record<string, number> = {};
    for (const row of res.rows) {
      if (row.product_id) map[String(row.product_id)] = Number(row.coins);
    }
    return map;
  } catch (err) {
    logger.error({ err }, "dbLoadCoinMap failed");
    return {};
  }
}
