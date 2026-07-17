/**
 * Rising Stars — Neon data access.
 * Free votes / rankings are isolated from wallet, IAP, Stripe, and gift scores.
 */
import type pg from "pg";
import { getPool } from "./postgres";
import { logger } from "./logger";

function db(): pg.Pool | null {
  return getPool();
}

export type RsSeasonStatus = "draft" | "active" | "closed";
export type RsChallengeStatus =
  | "scheduled"
  | "open"
  | "voting"
  | "qualified"
  | "final"
  | "closed";
export type RsEntryStatus =
  | "pending"
  | "active"
  | "disqualified"
  | "advanced"
  | "eliminated"
  | "withdrawn";

export interface RsSeason {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  status: RsSeasonStatus;
  created_by: string | null;
  created_at: string;
}

export interface RsCategory {
  id: string;
  season_id: string;
  slug: string;
  title: string;
  sort_order: number;
  is_active: boolean;
}

export interface RsRegion {
  id: string;
  season_id: string;
  slug: string;
  title: string;
  country_codes: string[];
  sort_order: number;
  is_active: boolean;
}

export interface RsChallenge {
  id: string;
  season_id: string;
  category_id: string;
  region_id: string | null;
  week_index: number;
  title: string;
  description: string | null;
  sound_provider: string;
  sound_track_id: string;
  sound_meta: Record<string, unknown>;
  opens_at: string;
  closes_at: string;
  exclusive_until: string | null;
  status: RsChallengeStatus;
  leaderboard_frozen: boolean;
  live_qualifier_room_id: string | null;
  live_final_room_id: string | null;
}

export interface RsEntry {
  id: string;
  challenge_id: string;
  creator_user_id: string;
  video_id: string;
  team_id: string | null;
  status: RsEntryStatus;
  vote_count: number;
  created_at: string;
}

export interface RsTeam {
  id: string;
  season_id: string;
  region_id: string | null;
  name: string;
  slug: string;
  captain_user_id: string | null;
  created_at: string;
}

function mapSeason(r: Record<string, unknown>): RsSeason {
  return {
    id: String(r.id),
    slug: String(r.slug),
    title: String(r.title),
    description: r.description == null ? null : String(r.description),
    starts_at: new Date(String(r.starts_at)).toISOString(),
    ends_at: new Date(String(r.ends_at)).toISOString(),
    status: String(r.status) as RsSeasonStatus,
    created_by: r.created_by == null ? null : String(r.created_by),
    created_at: new Date(String(r.created_at)).toISOString(),
  };
}

function mapChallenge(r: Record<string, unknown>): RsChallenge {
  const meta = r.sound_meta;
  return {
    id: String(r.id),
    season_id: String(r.season_id),
    category_id: String(r.category_id),
    region_id: r.region_id == null ? null : String(r.region_id),
    week_index: Number(r.week_index) || 1,
    title: String(r.title),
    description: r.description == null ? null : String(r.description),
    sound_provider: String(r.sound_provider || "epidemic"),
    sound_track_id: String(r.sound_track_id),
    sound_meta:
      meta && typeof meta === "object" && !Array.isArray(meta)
        ? (meta as Record<string, unknown>)
        : {},
    opens_at: new Date(String(r.opens_at)).toISOString(),
    closes_at: new Date(String(r.closes_at)).toISOString(),
    exclusive_until: r.exclusive_until
      ? new Date(String(r.exclusive_until)).toISOString()
      : null,
    status: String(r.status) as RsChallengeStatus,
    leaderboard_frozen: Boolean(r.leaderboard_frozen),
    live_qualifier_room_id: r.live_qualifier_room_id
      ? String(r.live_qualifier_room_id)
      : null,
    live_final_room_id: r.live_final_room_id
      ? String(r.live_final_room_id)
      : null,
  };
}

function mapEntry(r: Record<string, unknown>): RsEntry {
  return {
    id: String(r.id),
    challenge_id: String(r.challenge_id),
    creator_user_id: String(r.creator_user_id),
    video_id: String(r.video_id),
    team_id: r.team_id == null ? null : String(r.team_id),
    status: String(r.status) as RsEntryStatus,
    vote_count: Number(r.vote_count) || 0,
    created_at: new Date(String(r.created_at)).toISOString(),
  };
}

export async function rsGetCurrentSeason(): Promise<RsSeason | null> {
  const p = db();
  if (!p) return null;
  const r = await p.query(
    `SELECT * FROM rs_seasons
     WHERE status = 'active'
     ORDER BY starts_at DESC
     LIMIT 1`,
  );
  return r.rows[0] ? mapSeason(r.rows[0]) : null;
}

export async function rsGetSeasonById(id: string): Promise<RsSeason | null> {
  const p = db();
  if (!p) return null;
  const r = await p.query(`SELECT * FROM rs_seasons WHERE id = $1`, [id]);
  return r.rows[0] ? mapSeason(r.rows[0]) : null;
}

export async function rsListCategories(seasonId: string): Promise<RsCategory[]> {
  const p = db();
  if (!p) return [];
  const r = await p.query(
    `SELECT * FROM rs_categories
     WHERE season_id = $1 AND is_active = TRUE
     ORDER BY sort_order ASC, title ASC`,
    [seasonId],
  );
  return r.rows.map((row) => ({
    id: String(row.id),
    season_id: String(row.season_id),
    slug: String(row.slug),
    title: String(row.title),
    sort_order: Number(row.sort_order) || 0,
    is_active: Boolean(row.is_active),
  }));
}

export async function rsListRegions(seasonId: string): Promise<RsRegion[]> {
  const p = db();
  if (!p) return [];
  const r = await p.query(
    `SELECT * FROM rs_regions
     WHERE season_id = $1 AND is_active = TRUE
     ORDER BY sort_order ASC, title ASC`,
    [seasonId],
  );
  return r.rows.map((row) => ({
    id: String(row.id),
    season_id: String(row.season_id),
    slug: String(row.slug),
    title: String(row.title),
    country_codes: Array.isArray(row.country_codes)
      ? row.country_codes.map(String)
      : [],
    sort_order: Number(row.sort_order) || 0,
    is_active: Boolean(row.is_active),
  }));
}

export async function rsListChallenges(opts: {
  seasonId: string;
  categoryId?: string;
  regionId?: string;
  week?: number;
}): Promise<RsChallenge[]> {
  const p = db();
  if (!p) return [];
  const params: unknown[] = [opts.seasonId];
  let sql = `SELECT * FROM rs_challenges WHERE season_id = $1`;
  if (opts.categoryId) {
    params.push(opts.categoryId);
    sql += ` AND category_id = $${params.length}`;
  }
  if (opts.regionId) {
    params.push(opts.regionId);
    sql += ` AND region_id = $${params.length}`;
  }
  if (opts.week != null) {
    params.push(opts.week);
    sql += ` AND week_index = $${params.length}`;
  }
  sql += ` ORDER BY week_index ASC, opens_at ASC`;
  const r = await p.query(sql, params);
  return r.rows.map((row) => mapChallenge(row));
}

export async function rsGetChallenge(id: string): Promise<RsChallenge | null> {
  const p = db();
  if (!p) return null;
  const r = await p.query(`SELECT * FROM rs_challenges WHERE id = $1`, [id]);
  return r.rows[0] ? mapChallenge(r.rows[0]) : null;
}

export async function rsListEntries(
  challengeId: string,
): Promise<Array<RsEntry & { username?: string; avatar_url?: string | null }>> {
  const p = db();
  if (!p) return [];
  const r = await p.query(
    `SELECT e.*,
            COALESCE(p.username, p.display_name, 'Creator') AS username,
            p.avatar_url
     FROM rs_entries e
     LEFT JOIN profiles p ON p.user_id = e.creator_user_id
     WHERE e.challenge_id = $1
       AND e.status IN ('active', 'advanced', 'eliminated')
     ORDER BY e.vote_count DESC, e.created_at ASC`,
    [challengeId],
  );
  return r.rows.map((row) => ({
    ...mapEntry(row),
    username: row.username ? String(row.username) : undefined,
    avatar_url: row.avatar_url == null ? null : String(row.avatar_url),
  }));
}

export async function rsGetLeaderboard(challengeId: string, limit = 50) {
  const entries = await rsListEntries(challengeId);
  return entries.slice(0, Math.max(1, Math.min(200, limit))).map((e, i) => ({
    rank: i + 1,
    entry_id: e.id,
    creator_user_id: e.creator_user_id,
    video_id: e.video_id,
    team_id: e.team_id,
    vote_count: e.vote_count,
    status: e.status,
    username: e.username,
    avatar_url: e.avatar_url,
  }));
}

/** Extract track id from videos.music JSON (supports id / trackId / track_id). */
export function extractVideoMusicTrackId(music: unknown): string | null {
  if (!music) return null;
  let obj: Record<string, unknown> | null = null;
  if (typeof music === "string") {
    try {
      obj = JSON.parse(music) as Record<string, unknown>;
    } catch {
      return null;
    }
  } else if (typeof music === "object" && !Array.isArray(music)) {
    obj = music as Record<string, unknown>;
  }
  if (!obj) return null;
  const id = obj.id ?? obj.trackId ?? obj.track_id ?? obj.songId;
  return id == null ? null : String(id);
}

export async function rsEnterChallenge(opts: {
  challengeId: string;
  creatorUserId: string;
  videoId: string;
  teamId?: string | null;
}): Promise<
  | { ok: true; entry: RsEntry }
  | { ok: false; code: string; status: number }
> {
  const p = db();
  if (!p) return { ok: false, code: "DATABASE_UNAVAILABLE", status: 503 };

  const client = await p.connect();
  try {
    await client.query("BEGIN");
    const ch = await client.query(`SELECT * FROM rs_challenges WHERE id = $1 FOR UPDATE`, [
      opts.challengeId,
    ]);
    if (!ch.rows[0]) {
      await client.query("ROLLBACK");
      return { ok: false, code: "CHALLENGE_NOT_FOUND", status: 404 };
    }
    const challenge = mapChallenge(ch.rows[0]);
    if (!["open", "voting"].includes(challenge.status)) {
      await client.query("ROLLBACK");
      return { ok: false, code: "CHALLENGE_CLOSED", status: 409 };
    }
    const now = Date.now();
    if (now < new Date(challenge.opens_at).getTime() || now > new Date(challenge.closes_at).getTime()) {
      await client.query("ROLLBACK");
      return { ok: false, code: "OUTSIDE_ENTRY_WINDOW", status: 409 };
    }

    const vid = await client.query(
      `SELECT id, user_id, music FROM videos WHERE id = $1`,
      [opts.videoId],
    );
    const video = vid.rows[0] as
      | { id: string; user_id: string; music: unknown }
      | undefined;
    if (!video) {
      await client.query("ROLLBACK");
      return { ok: false, code: "VIDEO_NOT_FOUND", status: 404 };
    }
    if (String(video.user_id) !== opts.creatorUserId) {
      await client.query("ROLLBACK");
      return { ok: false, code: "VIDEO_NOT_OWNED", status: 403 };
    }
    const trackId = extractVideoMusicTrackId(video.music);
    if (!trackId || trackId !== challenge.sound_track_id) {
      await client.query("ROLLBACK");
      return { ok: false, code: "SOUND_MISMATCH", status: 400 };
    }

    if (opts.teamId) {
      const tm = await client.query(
        `SELECT 1 FROM rs_team_members WHERE team_id = $1 AND user_id = $2`,
        [opts.teamId, opts.creatorUserId],
      );
      if (!tm.rows[0]) {
        await client.query("ROLLBACK");
        return { ok: false, code: "NOT_TEAM_MEMBER", status: 403 };
      }
    }

    const ins = await client.query(
      `INSERT INTO rs_entries (challenge_id, creator_user_id, video_id, team_id, status)
       VALUES ($1, $2, $3, $4, 'active')
       ON CONFLICT (challenge_id, creator_user_id) DO NOTHING
       RETURNING *`,
      [opts.challengeId, opts.creatorUserId, opts.videoId, opts.teamId || null],
    );
    if (!ins.rows[0]) {
      await client.query("ROLLBACK");
      return { ok: false, code: "ALREADY_ENTERED", status: 409 };
    }
    await client.query("COMMIT");
    return { ok: true, entry: mapEntry(ins.rows[0]) };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    const code = (err as { code?: string })?.code;
    if (code === "23505") {
      return { ok: false, code: "ALREADY_ENTERED", status: 409 };
    }
    logger.error({ err, opts }, "rsEnterChallenge failed");
    return { ok: false, code: "ENTER_FAILED", status: 500 };
  } finally {
    client.release();
  }
}

export async function rsWithdrawEntry(
  entryId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; code: string; status: number }> {
  const p = db();
  if (!p) return { ok: false, code: "DATABASE_UNAVAILABLE", status: 503 };
  const r = await p.query(
    `UPDATE rs_entries e
     SET status = 'withdrawn', updated_at = NOW()
     FROM rs_challenges c
     WHERE e.id = $1
       AND e.creator_user_id = $2
       AND e.challenge_id = c.id
       AND e.status IN ('pending', 'active')
       AND c.status IN ('open', 'voting')
       AND c.leaderboard_frozen = FALSE
     RETURNING e.id`,
    [entryId, userId],
  );
  if (!r.rows[0]) return { ok: false, code: "WITHDRAW_DENIED", status: 409 };
  return { ok: true };
}

/**
 * Cast one free vote per user per challenge per UTC day.
 * Source of truth: UNIQUE(challenge_id, voter_user_id, vote_day).
 */
export async function rsCastFreeVote(opts: {
  entryId: string;
  voterUserId: string;
}): Promise<
  | { ok: true; vote_count: number; entry_id: string; challenge_id: string }
  | { ok: false; code: string; status: number }
> {
  const p = db();
  if (!p) return { ok: false, code: "DATABASE_UNAVAILABLE", status: 503 };

  const client = await p.connect();
  try {
    await client.query("BEGIN");
    const er = await client.query(
      `SELECT e.*, c.status AS challenge_status, c.leaderboard_frozen
       FROM rs_entries e
       JOIN rs_challenges c ON c.id = e.challenge_id
       WHERE e.id = $1
       FOR UPDATE OF e`,
      [opts.entryId],
    );
    const entry = er.rows[0] as
      | {
          id: string;
          challenge_id: string;
          creator_user_id: string;
          status: string;
          vote_count: number;
          challenge_status: string;
          leaderboard_frozen: boolean;
        }
      | undefined;
    if (!entry) {
      await client.query("ROLLBACK");
      return { ok: false, code: "ENTRY_NOT_FOUND", status: 404 };
    }
    if (entry.creator_user_id === opts.voterUserId) {
      await client.query("ROLLBACK");
      return { ok: false, code: "CANNOT_VOTE_SELF", status: 400 };
    }
    if (!["active", "advanced"].includes(entry.status)) {
      await client.query("ROLLBACK");
      return { ok: false, code: "ENTRY_NOT_VOTABLE", status: 409 };
    }
    if (!["open", "voting", "qualified", "final"].includes(entry.challenge_status)) {
      await client.query("ROLLBACK");
      return { ok: false, code: "VOTING_CLOSED", status: 409 };
    }
    if (entry.leaderboard_frozen) {
      await client.query("ROLLBACK");
      return { ok: false, code: "LEADERBOARD_FROZEN", status: 409 };
    }

    const voteIns = await client.query(
      `INSERT INTO rs_votes (challenge_id, entry_id, voter_user_id, vote_day)
       VALUES ($1, $2, $3, CURRENT_DATE)
       ON CONFLICT (challenge_id, voter_user_id, vote_day) DO NOTHING
       RETURNING id`,
      [entry.challenge_id, entry.id, opts.voterUserId],
    );
    if (!voteIns.rows[0]) {
      await client.query("ROLLBACK");
      return { ok: false, code: "ALREADY_VOTED_TODAY", status: 409 };
    }

    const upd = await client.query(
      `UPDATE rs_entries
       SET vote_count = vote_count + 1, updated_at = NOW()
       WHERE id = $1
       RETURNING vote_count`,
      [entry.id],
    );
    await client.query("COMMIT");
    return {
      ok: true,
      vote_count: Number(upd.rows[0]?.vote_count) || entry.vote_count + 1,
      entry_id: entry.id,
      challenge_id: entry.challenge_id,
    };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    logger.error({ err, opts }, "rsCastFreeVote failed");
    return { ok: false, code: "VOTE_FAILED", status: 500 };
  } finally {
    client.release();
  }
}

export async function rsHasVotedToday(
  challengeId: string,
  voterUserId: string,
): Promise<boolean> {
  const p = db();
  if (!p) return false;
  const r = await p.query(
    `SELECT 1 FROM rs_votes
     WHERE challenge_id = $1 AND voter_user_id = $2 AND vote_day = CURRENT_DATE`,
    [challengeId, voterUserId],
  );
  return Boolean(r.rows[0]);
}

export async function rsCreateSeason(input: {
  slug: string;
  title: string;
  description?: string;
  starts_at: string;
  ends_at: string;
  status?: RsSeasonStatus;
  created_by: string;
}): Promise<RsSeason | null> {
  const p = db();
  if (!p) return null;
  const r = await p.query(
    `INSERT INTO rs_seasons (slug, title, description, starts_at, ends_at, status, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      input.slug,
      input.title,
      input.description || null,
      input.starts_at,
      input.ends_at,
      input.status || "draft",
      input.created_by,
    ],
  );
  return r.rows[0] ? mapSeason(r.rows[0]) : null;
}

export async function rsCreateCategory(input: {
  season_id: string;
  slug: string;
  title: string;
  sort_order?: number;
}): Promise<RsCategory | null> {
  const p = db();
  if (!p) return null;
  const r = await p.query(
    `INSERT INTO rs_categories (season_id, slug, title, sort_order)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [input.season_id, input.slug, input.title, input.sort_order ?? 0],
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    id: String(row.id),
    season_id: String(row.season_id),
    slug: String(row.slug),
    title: String(row.title),
    sort_order: Number(row.sort_order) || 0,
    is_active: Boolean(row.is_active),
  };
}

export async function rsCreateRegion(input: {
  season_id: string;
  slug: string;
  title: string;
  country_codes?: string[];
  sort_order?: number;
}): Promise<RsRegion | null> {
  const p = db();
  if (!p) return null;
  const r = await p.query(
    `INSERT INTO rs_regions (season_id, slug, title, country_codes, sort_order)
     VALUES ($1, $2, $3, $4::jsonb, $5)
     RETURNING *`,
    [
      input.season_id,
      input.slug,
      input.title,
      JSON.stringify(input.country_codes || []),
      input.sort_order ?? 0,
    ],
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    id: String(row.id),
    season_id: String(row.season_id),
    slug: String(row.slug),
    title: String(row.title),
    country_codes: Array.isArray(row.country_codes)
      ? row.country_codes.map(String)
      : [],
    sort_order: Number(row.sort_order) || 0,
    is_active: Boolean(row.is_active),
  };
}

export async function rsCreateChallenge(input: {
  season_id: string;
  category_id: string;
  region_id?: string | null;
  week_index?: number;
  title: string;
  description?: string;
  sound_track_id: string;
  sound_meta?: Record<string, unknown>;
  opens_at: string;
  closes_at: string;
  exclusive_until?: string | null;
  status?: RsChallengeStatus;
}): Promise<RsChallenge | null> {
  const p = db();
  if (!p) return null;
  const r = await p.query(
    `INSERT INTO rs_challenges (
       season_id, category_id, region_id, week_index, title, description,
       sound_track_id, sound_meta, opens_at, closes_at, exclusive_until, status
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12)
     RETURNING *`,
    [
      input.season_id,
      input.category_id,
      input.region_id || null,
      input.week_index ?? 1,
      input.title,
      input.description || null,
      input.sound_track_id,
      JSON.stringify(input.sound_meta || {}),
      input.opens_at,
      input.closes_at,
      input.exclusive_until || null,
      input.status || "scheduled",
    ],
  );
  return r.rows[0] ? mapChallenge(r.rows[0]) : null;
}

export async function rsUpdateChallengeStatus(
  challengeId: string,
  status: RsChallengeStatus,
): Promise<RsChallenge | null> {
  const p = db();
  if (!p) return null;
  const r = await p.query(
    `UPDATE rs_challenges SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [challengeId, status],
  );
  return r.rows[0] ? mapChallenge(r.rows[0]) : null;
}

export async function rsFreezeLeaderboard(
  challengeId: string,
  frozen: boolean,
): Promise<RsChallenge | null> {
  const p = db();
  if (!p) return null;
  const r = await p.query(
    `UPDATE rs_challenges SET leaderboard_frozen = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [challengeId, frozen],
  );
  return r.rows[0] ? mapChallenge(r.rows[0]) : null;
}

export async function rsDisqualifyEntry(
  entryId: string,
): Promise<RsEntry | null> {
  const p = db();
  if (!p) return null;
  const r = await p.query(
    `UPDATE rs_entries SET status = 'disqualified', updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [entryId],
  );
  return r.rows[0] ? mapEntry(r.rows[0]) : null;
}

export async function rsAttachLiveRoom(
  challengeId: string,
  phase: "qualifier" | "final",
  roomId: string,
): Promise<RsChallenge | null> {
  const p = db();
  if (!p) return null;
  const col =
    phase === "qualifier" ? "live_qualifier_room_id" : "live_final_room_id";
  const r = await p.query(
    `UPDATE rs_challenges SET ${col} = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [challengeId, roomId],
  );
  return r.rows[0] ? mapChallenge(r.rows[0]) : null;
}

/**
 * Snapshot current leaderboard into rs_phase_results and advance top N.
 */
export async function rsSnapshotPhase(opts: {
  challengeId: string;
  phase: "qualifier" | "final";
  advanceTopN?: number;
}): Promise<{ ok: true; results: number } | { ok: false; code: string }> {
  const p = db();
  if (!p) return { ok: false, code: "DATABASE_UNAVAILABLE" };
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    const board = await client.query(
      `SELECT id, vote_count FROM rs_entries
       WHERE challenge_id = $1 AND status IN ('active', 'advanced')
       ORDER BY vote_count DESC, created_at ASC
       FOR UPDATE`,
      [opts.challengeId],
    );
    await client.query(
      `DELETE FROM rs_phase_results WHERE challenge_id = $1 AND phase = $2`,
      [opts.challengeId, opts.phase],
    );
    let rank = 0;
    for (const row of board.rows) {
      rank += 1;
      await client.query(
        `INSERT INTO rs_phase_results
           (challenge_id, phase, entry_id, rank, vote_count_snapshot, live_score_snapshot)
         VALUES ($1, $2, $3, $4, $5, 0)`,
        [opts.challengeId, opts.phase, row.id, rank, Number(row.vote_count) || 0],
      );
    }
    const topN = Math.max(0, opts.advanceTopN ?? 0);
    if (opts.phase === "qualifier" && topN > 0) {
      const ids = board.rows.slice(0, topN).map((r) => String(r.id));
      const rest = board.rows.slice(topN).map((r) => String(r.id));
      if (ids.length) {
        await client.query(
          `UPDATE rs_entries SET status = 'advanced', updated_at = NOW()
           WHERE id = ANY($1::uuid[])`,
          [ids],
        );
      }
      if (rest.length) {
        await client.query(
          `UPDATE rs_entries SET status = 'eliminated', updated_at = NOW()
           WHERE id = ANY($1::uuid[])`,
          [rest],
        );
      }
      await client.query(
        `UPDATE rs_challenges SET status = 'qualified', leaderboard_frozen = TRUE, updated_at = NOW()
         WHERE id = $1`,
        [opts.challengeId],
      );
    } else if (opts.phase === "final") {
      await client.query(
        `UPDATE rs_challenges SET status = 'closed', leaderboard_frozen = TRUE, updated_at = NOW()
         WHERE id = $1`,
        [opts.challengeId],
      );
    }
    await client.query("COMMIT");
    return { ok: true, results: board.rows.length };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    logger.error({ err, opts }, "rsSnapshotPhase failed");
    return { ok: false, code: "SNAPSHOT_FAILED" };
  } finally {
    client.release();
  }
}

export async function rsCreateTeam(input: {
  season_id: string;
  region_id?: string | null;
  name: string;
  slug: string;
  captain_user_id: string;
}): Promise<RsTeam | null> {
  const p = db();
  if (!p) return null;
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    const r = await client.query(
      `INSERT INTO rs_teams (season_id, region_id, name, slug, captain_user_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        input.season_id,
        input.region_id || null,
        input.name,
        input.slug,
        input.captain_user_id,
      ],
    );
    const team = r.rows[0];
    if (!team) {
      await client.query("ROLLBACK");
      return null;
    }
    await client.query(
      `INSERT INTO rs_team_members (team_id, user_id, role)
       VALUES ($1, $2, 'captain')
       ON CONFLICT DO NOTHING`,
      [team.id, input.captain_user_id],
    );
    await client.query("COMMIT");
    return {
      id: String(team.id),
      season_id: String(team.season_id),
      region_id: team.region_id == null ? null : String(team.region_id),
      name: String(team.name),
      slug: String(team.slug),
      captain_user_id: team.captain_user_id
        ? String(team.captain_user_id)
        : null,
      created_at: new Date(String(team.created_at)).toISOString(),
    };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    logger.error({ err, input }, "rsCreateTeam failed");
    return null;
  } finally {
    client.release();
  }
}

export async function rsJoinTeam(
  teamId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; code: string; status: number }> {
  const p = db();
  if (!p) return { ok: false, code: "DATABASE_UNAVAILABLE", status: 503 };
  try {
    await p.query(
      `INSERT INTO rs_team_members (team_id, user_id, role)
       VALUES ($1, $2, 'member')
       ON CONFLICT DO NOTHING`,
      [teamId, userId],
    );
    return { ok: true };
  } catch (err) {
    logger.error({ err, teamId, userId }, "rsJoinTeam failed");
    return { ok: false, code: "JOIN_FAILED", status: 500 };
  }
}

export async function rsListTeams(seasonId: string, regionId?: string) {
  const p = db();
  if (!p) return [];
  const params: unknown[] = [seasonId];
  let sql = `SELECT t.*,
                    COALESCE(SUM(e.vote_count) FILTER (WHERE e.status IN ('active','advanced')), 0)::int AS team_votes,
                    COUNT(DISTINCT tm.user_id)::int AS member_count
             FROM rs_teams t
             LEFT JOIN rs_team_members tm ON tm.team_id = t.id
             LEFT JOIN rs_entries e ON e.team_id = t.id
             WHERE t.season_id = $1`;
  if (regionId) {
    params.push(regionId);
    sql += ` AND t.region_id = $${params.length}`;
  }
  sql += ` GROUP BY t.id ORDER BY team_votes DESC, t.name ASC`;
  const r = await p.query(sql, params);
  return r.rows.map((row) => ({
    id: String(row.id),
    season_id: String(row.season_id),
    region_id: row.region_id == null ? null : String(row.region_id),
    name: String(row.name),
    slug: String(row.slug),
    captain_user_id: row.captain_user_id
      ? String(row.captain_user_id)
      : null,
    created_at: new Date(String(row.created_at)).toISOString(),
    team_votes: Number(row.team_votes) || 0,
    member_count: Number(row.member_count) || 0,
  }));
}

export async function rsListSeasons(): Promise<RsSeason[]> {
  const p = db();
  if (!p) return [];
  const r = await p.query(`SELECT * FROM rs_seasons ORDER BY starts_at DESC`);
  return r.rows.map((row) => mapSeason(row));
}

export async function rsCreateBadge(input: {
  season_id: string;
  code: string;
  title: string;
  image_url?: string;
  kind: string;
}) {
  const p = db();
  if (!p) return null;
  const r = await p.query(
    `INSERT INTO rs_badges (season_id, code, title, image_url, kind)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (season_id, code) DO UPDATE
       SET title = EXCLUDED.title, image_url = EXCLUDED.image_url, kind = EXCLUDED.kind
     RETURNING *`,
    [
      input.season_id,
      input.code,
      input.title,
      input.image_url || null,
      input.kind,
    ],
  );
  return r.rows[0] || null;
}

export async function rsAwardBadge(opts: {
  userId: string;
  badgeId: string;
  challengeId?: string | null;
  awardedBy?: string | null;
}): Promise<{ ok: true; created: boolean } | { ok: false; code: string }> {
  const p = db();
  if (!p) return { ok: false, code: "DATABASE_UNAVAILABLE" };
  const r = await p.query(
    `INSERT INTO rs_user_badges (user_id, badge_id, challenge_id, awarded_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, badge_id) DO NOTHING
     RETURNING user_id`,
    [opts.userId, opts.badgeId, opts.challengeId || null, opts.awardedBy || null],
  );
  return { ok: true, created: Boolean(r.rows[0]) };
}

export async function rsListUserBadges(userId: string) {
  const p = db();
  if (!p) return [];
  const r = await p.query(
    `SELECT ub.awarded_at, ub.challenge_id, b.*
     FROM rs_user_badges ub
     JOIN rs_badges b ON b.id = ub.badge_id
     WHERE ub.user_id = $1
     ORDER BY ub.awarded_at DESC`,
    [userId],
  );
  return r.rows.map((row) => ({
    badge_id: String(row.id),
    season_id: String(row.season_id),
    code: String(row.code),
    title: String(row.title),
    image_url: row.image_url == null ? null : String(row.image_url),
    kind: String(row.kind),
    challenge_id: row.challenge_id == null ? null : String(row.challenge_id),
    awarded_at: new Date(String(row.awarded_at)).toISOString(),
  }));
}

export async function rsCreateRewardDefinition(input: {
  season_id: string;
  place_from: number;
  place_to: number;
  category_id?: string | null;
  region_id?: string | null;
  reward_kind: string;
  payload?: Record<string, unknown>;
}) {
  const p = db();
  if (!p) return null;
  const r = await p.query(
    `INSERT INTO rs_reward_definitions
       (season_id, place_from, place_to, category_id, region_id, reward_kind, payload)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
     RETURNING *`,
    [
      input.season_id,
      input.place_from,
      input.place_to,
      input.category_id || null,
      input.region_id || null,
      input.reward_kind,
      JSON.stringify(input.payload || {}),
    ],
  );
  return r.rows[0] || null;
}

export async function rsListRewardDefinitions(seasonId: string) {
  const p = db();
  if (!p) return [];
  const r = await p.query(
    `SELECT * FROM rs_reward_definitions
     WHERE season_id = $1 AND is_active = TRUE
     ORDER BY place_from ASC`,
    [seasonId],
  );
  return r.rows;
}

export async function rsGrantReward(opts: {
  definitionId: string;
  userId: string;
  challengeId?: string | null;
  grantedBy: string;
  notes?: string;
  status?: "pending" | "granted" | "rejected";
}) {
  const p = db();
  if (!p) return null;
  const r = await p.query(
    `INSERT INTO rs_reward_grants
       (definition_id, user_id, challenge_id, status, granted_by, granted_at, notes)
     VALUES ($1, $2, $3, $4, $5, CASE WHEN $4 = 'granted' THEN NOW() ELSE NULL END, $6)
     ON CONFLICT (definition_id, user_id, challenge_id) DO UPDATE
       SET status = EXCLUDED.status,
           granted_by = EXCLUDED.granted_by,
           granted_at = EXCLUDED.granted_at,
           notes = EXCLUDED.notes
     RETURNING *`,
    [
      opts.definitionId,
      opts.userId,
      opts.challengeId || null,
      opts.status || "pending",
      opts.grantedBy,
      opts.notes || null,
    ],
  );
  return r.rows[0] || null;
}

export async function rsAdminAudit(opts: {
  adminUserId: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  details?: Record<string, unknown>;
}) {
  const p = db();
  if (!p) return;
  try {
    await p.query(
      `INSERT INTO rs_admin_audit (admin_user_id, action, entity_type, entity_id, details)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [
        opts.adminUserId,
        opts.action,
        opts.entityType,
        opts.entityId || null,
        JSON.stringify(opts.details || {}),
      ],
    );
  } catch (err) {
    logger.warn({ err, opts }, "rsAdminAudit failed");
  }
}

export async function rsListAdminAudit(limit = 100) {
  const p = db();
  if (!p) return [];
  const r = await p.query(
    `SELECT * FROM rs_admin_audit ORDER BY created_at DESC LIMIT $1`,
    [Math.min(500, Math.max(1, limit))],
  );
  return r.rows;
}

export async function rsGetSeasonStandings(seasonId: string) {
  const p = db();
  if (!p) return [];
  const r = await p.query(
    `SELECT e.creator_user_id,
            COALESCE(p.username, p.display_name, 'Creator') AS username,
            p.avatar_url,
            SUM(e.vote_count)::int AS total_votes,
            COUNT(e.id)::int AS entries
     FROM rs_entries e
     JOIN rs_challenges c ON c.id = e.challenge_id
     LEFT JOIN profiles p ON p.user_id = e.creator_user_id
     WHERE c.season_id = $1
       AND e.status IN ('active', 'advanced', 'eliminated')
     GROUP BY e.creator_user_id, p.username, p.display_name, p.avatar_url
     ORDER BY total_votes DESC
     LIMIT 100`,
    [seasonId],
  );
  return r.rows.map((row, i) => ({
    rank: i + 1,
    creator_user_id: String(row.creator_user_id),
    username: String(row.username || "Creator"),
    avatar_url: row.avatar_url == null ? null : String(row.avatar_url),
    total_votes: Number(row.total_votes) || 0,
    entries: Number(row.entries) || 0,
  }));
}
