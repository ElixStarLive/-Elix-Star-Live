/**
 * Profile API for Express backend.
 * GET /api/profiles/:userId, PATCH /api/profiles/:userId, POST /api/profiles (seed),
 * GET followers/following, POST follow/unfollow.
 * Persists to PostgreSQL when DATABASE_URL is configured; falls back to in-memory.
 */

import { Request, Response } from "express";
import { getTokenFromRequest, verifyAuthToken } from "./auth";
import { ensureFollowsTable, getPool } from "../lib/postgres";
import { logger } from "../lib/logger";

export interface Profile {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  bio: string;
  website: string;
  followers: number;
  following: number;
  videoCount: number;
  coins: number;
  level: number;
  isVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

const profiles = new Map<string, Profile>();
let profilesTableReady = false;

type StoredUserRow = { id: string; email?: string; username?: string; avatar_url?: string; display_name?: string };

const followsMap = new Map<string, Set<string>>();

export async function loadFollowsFromDb(): Promise<void> {
  const db = getPool();
  if (!db) return;
  try {
    await ensureFollowsTable();
    const res = await db.query(`SELECT follower_id, following_id FROM follows`);
    for (const row of res.rows || []) {
      const fid = String(row.follower_id);
      const tid = String(row.following_id);
      const set = followsMap.get(fid) ?? new Set<string>();
      set.add(tid);
      followsMap.set(fid, set);
    }
    logger.info({ rows: res.rowCount ?? 0 }, "Follows loaded from Postgres into memory");
  } catch (err) {
    logger.error({ err }, "loadFollowsFromDb failed — follow lists may be empty until fixed");
  }
}

/** Neon-primary following IDs. Falls back to cache if DB unavailable. */
export async function getFollowingIdsAsync(userId: string): Promise<string[]> {
  const db = getPool();
  if (db) {
    try {
      await ensureFollowsTable();
      const res = await db.query(`SELECT following_id FROM follows WHERE follower_id = $1`, [userId]);
      const ids = (res.rows || []).map((r: any) => String(r.following_id));
      const set = new Set(ids);
      followsMap.set(userId, set);
      return ids;
    } catch (err) {
      logger.error({ err, userId }, "getFollowingIdsAsync DB read failed, using cache");
    }
  }
  return [...(followsMap.get(userId) ?? [])];
}

/** Sync version for backward compat — uses cache only. */
export function getFollowingIds(userId: string): string[] {
  return [...(followsMap.get(userId) ?? [])];
}

/** Neon-primary follower IDs. Falls back to cache if DB unavailable. */
export async function getFollowerIdsAsync(userId: string): Promise<string[]> {
  const db = getPool();
  if (db) {
    try {
      await ensureFollowsTable();
      const res = await db.query(`SELECT follower_id FROM follows WHERE following_id = $1`, [userId]);
      return (res.rows || []).map((r: any) => String(r.follower_id));
    } catch (err) {
      logger.error({ err, userId }, "getFollowerIdsAsync DB read failed, using cache");
    }
  }
  const ids: string[] = [];
  for (const [followerId, followingSet] of followsMap) {
    if (followingSet.has(userId)) ids.push(followerId);
  }
  return ids;
}

/** Sync version for backward compat — uses cache only. */
export function getFollowerIds(userId: string): string[] {
  const ids: string[] = [];
  for (const [followerId, followingSet] of followsMap) {
    if (followingSet.has(userId)) ids.push(followerId);
  }
  return ids;
}

/** Neon-primary mutual follow IDs. */
export async function getMutualFollowIdsAsync(userId: string): Promise<string[]> {
  const db = getPool();
  if (db) {
    try {
      await ensureFollowsTable();
      const res = await db.query(
        `SELECT f1.following_id
         FROM follows f1
         INNER JOIN follows f2 ON f2.follower_id = f1.following_id AND f2.following_id = f1.follower_id
         WHERE f1.follower_id = $1 AND f1.following_id <> $1`,
        [userId],
      );
      return (res.rows || []).map((r: any) => String(r.following_id));
    } catch (err) {
      logger.error({ err, userId }, "getMutualFollowIdsAsync DB read failed, using cache");
    }
  }
  return getMutualFollowIds(userId);
}

/** Sync version for backward compat — uses cache only. */
export function getMutualFollowIds(userId: string): string[] {
  const following = getFollowingIds(userId);
  if (following.length === 0) return [];
  const followers = new Set(getFollowerIds(userId));
  return following.filter((id) => id && id !== userId && followers.has(id));
}

export function isFollowing(followerId: string, targetId: string): boolean {
  return followsMap.get(followerId)?.has(targetId) ?? false;
}

// ── PostgreSQL profile persistence ──────────────────────────────────────────

async function ensureProfilesTable(): Promise<void> {
  if (profilesTableReady) return;
  const db = getPool();
  if (!db) return;
  try {
    await db.query(`
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
    profilesTableReady = true;
  } catch {
    // Table creation failed; continue with in-memory only
  }
}

async function saveProfileToDb(p: Profile): Promise<boolean> {
  const db = getPool();
  if (!db) return false;
  await ensureProfilesTable();
  if (!profilesTableReady) {
    logger.error({ userId: p.userId }, "saveProfileToDb: profiles table not ready");
    throw new Error("profiles table not ready");
  }
  await db.query(
    `INSERT INTO profiles (user_id, username, display_name, avatar_url, bio, website,
                           followers, following, video_count, coins, level, is_verified,
                           created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     ON CONFLICT (user_id) DO UPDATE SET
       username = EXCLUDED.username,
       display_name = EXCLUDED.display_name,
       avatar_url = EXCLUDED.avatar_url,
       bio = EXCLUDED.bio,
       website = EXCLUDED.website,
       followers = EXCLUDED.followers,
       following = EXCLUDED.following,
       video_count = EXCLUDED.video_count,
       coins = EXCLUDED.coins,
       level = EXCLUDED.level,
       is_verified = EXCLUDED.is_verified,
       updated_at = EXCLUDED.updated_at`,
    [
      p.userId, p.username, p.displayName, p.avatarUrl, p.bio, p.website,
      p.followers, p.following, p.videoCount, p.coins, p.level, p.isVerified,
      p.createdAt, p.updatedAt,
    ],
  );
  return true;
}

/** Keep auth_users in sync so login/session and legacy reads see the same avatar as profiles. */
async function updateAuthUserAvatarUrl(userId: string, avatarUrl: string): Promise<void> {
  const db = getPool();
  if (!db) return;
  try {
    await db.query(`UPDATE auth_users SET avatar_url = $1 WHERE id = $2`, [avatarUrl, userId]);
  } catch (err) {
    logger.error({ err, userId }, "updateAuthUserAvatarUrl failed");
  }
}

async function loadProfileFromDb(userId: string): Promise<Profile | null> {
  const db = getPool();
  if (!db) return null;
  await ensureProfilesTable();
  if (!profilesTableReady) return null;
  try {
    const res = await db.query(`SELECT * FROM profiles WHERE user_id = $1`, [userId]);
    const r = res.rows?.[0];
    if (!r) return null;
    return {
      userId: String(r.user_id),
      username: String(r.username || ""),
      displayName: String(r.display_name || ""),
      avatarUrl: String(r.avatar_url || ""),
      bio: String(r.bio || ""),
      website: String(r.website || ""),
      followers: Number(r.followers) || 0,
      following: Number(r.following) || 0,
      videoCount: Number(r.video_count) || 0,
      coins: Number(r.coins) || 0,
      level: Number(r.level) || 1,
      isVerified: Boolean(r.is_verified),
      createdAt: String(r.created_at || ""),
      updatedAt: String(r.updated_at || ""),
    };
  } catch {
    return null;
  }
}

async function lookupAuthUser(userId: string): Promise<StoredUserRow | null> {
  const db = getPool();
  if (!db) return null;
  try {
    const res = await db.query(
      `SELECT id, email, username, display_name, avatar_url FROM auth_users WHERE id = $1`,
      [userId],
    );
    const r = res.rows?.[0];
    if (!r) return null;
    return {
      id: String(r.id),
      email: String(r.email || ""),
      username: String(r.username || ""),
      display_name: String(r.display_name || ""),
      avatar_url: String(r.avatar_url || ""),
    };
  } catch {
    return null;
  }
}

async function readUsersFromDb(): Promise<StoredUserRow[]> {
  const db = getPool();
  if (!db) return [];
  try {
    const res = await db.query(`
      SELECT id, email, username, display_name, avatar_url
      FROM auth_users
    `);
    return (res.rows || []).map((r: any) => ({
      id: String(r.id),
      email: String(r.email || ""),
      username: String(r.username || ""),
      avatar_url: String(r.avatar_url || ""),
      display_name: String(r.display_name || ""),
    }));
  } catch {
    return [];
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function isFallbackName(name: string): boolean {
  if (!name) return true;
  if (/^User [0-9a-f]{8}$/i.test(name)) return true;
  if (/^user_[0-9a-f]{8}$/i.test(name)) return true;
  return false;
}

// ── Core profile getter (sync, in-memory only) ─────────────────────────────

export function getOrCreateProfile(userId: string, seed?: Partial<Profile>): Profile {
  const existing = profiles.get(userId);
  if (existing) {
    if (seed) {
      let changed = false;
      if (seed.username && isFallbackName(existing.username)) {
        existing.username = seed.username;
        changed = true;
      }
      if (seed.displayName && isFallbackName(existing.displayName)) {
        existing.displayName = seed.displayName;
        changed = true;
      }
      if (seed.avatarUrl && existing.avatarUrl.includes("ui-avatars")) {
        existing.avatarUrl = seed.avatarUrl;
        changed = true;
      }
      if (changed) {
        existing.updatedAt = new Date().toISOString();
        profiles.set(userId, existing);
        saveProfileToDb(existing).catch(() => {});
      }
    }
    return existing;
  }

  const now = new Date().toISOString();
  const profile: Profile = {
    userId,
    username: seed?.username ?? `user_${userId.slice(0, 8)}`,
    displayName: seed?.displayName ?? seed?.username ?? `User ${userId.slice(0, 8)}`,
    avatarUrl:
      seed?.avatarUrl ??
      `https://ui-avatars.com/api/?name=${encodeURIComponent(seed?.username ?? userId.slice(0, 8))}&background=random`,
    bio: seed?.bio ?? "",
    website: seed?.website ?? "",
    followers: seed?.followers ?? 0,
    following: seed?.following ?? 0,
    videoCount: seed?.videoCount ?? 0,
    coins: seed?.coins ?? 0,
    level: seed?.level ?? 1,
    isVerified: seed?.isVerified ?? false,
    createdAt: seed?.createdAt ?? now,
    updatedAt: now,
  };
  profiles.set(userId, profile);
  saveProfileToDb(profile).catch(() => {});
  return profile;
}

/** Async variant that reads from Neon first, falls back to in-memory cache. */
export async function getOrCreateProfileFromDb(userId: string, seed?: Partial<Profile>): Promise<Profile> {
  const dbProfile = await loadProfileFromDb(userId);
  if (dbProfile) {
    profiles.set(userId, dbProfile);
    return dbProfile;
  }
  return getOrCreateProfile(userId, seed);
}

/**
 * Async profile getter: tries in-memory -> DB profiles table -> auth_users table -> fallback.
 * Always checks if the displayName is a fallback and fixes it from auth_users.
 */
async function getOrCreateProfileAsync(userId: string, seed?: Partial<Profile>): Promise<Profile> {
  let profile = profiles.get(userId) ?? await loadProfileFromDb(userId) ?? null;

  const needsNameFix = !profile || isFallbackName(profile.displayName) || isFallbackName(profile.username);

  if (needsNameFix) {
    const authUser = await lookupAuthUser(userId);
    if (authUser) {
      const rawUsername = authUser.username?.trim() || "";
      const rawDisplayName = authUser.display_name?.trim() || "";
      const emailPrefix = authUser.email?.includes("@") ? authUser.email.split("@")[0] : "";

      const realUsername =
        (rawUsername && !isFallbackName(rawUsername) ? rawUsername : "") ||
        (rawDisplayName && !isFallbackName(rawDisplayName) ? rawDisplayName : "") ||
        emailPrefix ||
        rawUsername ||
        "";
      const realDisplayName =
        (rawDisplayName && !isFallbackName(rawDisplayName) ? rawDisplayName : "") ||
        (rawUsername && !isFallbackName(rawUsername) ? rawUsername : "") ||
        emailPrefix ||
        realUsername;
      const realAvatar =
        (authUser.avatar_url?.trim()) || "";

      if (profile) {
        if (realUsername && isFallbackName(profile.username)) profile.username = realUsername;
        if (realDisplayName && isFallbackName(profile.displayName)) profile.displayName = realDisplayName;
        if (realAvatar && profile.avatarUrl.includes("ui-avatars")) profile.avatarUrl = realAvatar;
        profile.updatedAt = new Date().toISOString();
        profiles.set(userId, profile);
        saveProfileToDb(profile).catch(() => {});
        return profile;
      }

      profile = getOrCreateProfile(userId, {
        username: realUsername || undefined,
        displayName: realDisplayName || undefined,
        avatarUrl: realAvatar || undefined,
        ...seed,
      });
      return profile;
    }
  }

  if (profile) {
    profiles.set(userId, profile);
    return profile;
  }

  return getOrCreateProfile(userId, seed);
}

/** GET /api/profiles/:userId */
export async function handleGetProfile(req: Request, res: Response): Promise<void> {
  const userId = req.params.userId;
  if (!userId) {
    res.status(400).json({ error: "userId is required" });
    return;
  }
  const profile = await getOrCreateProfileAsync(userId);

  let followersCount: number | null = null;
  let followingCount: number | null = null;
  const db = getPool();
  if (db) {
    try {
      await ensureFollowsTable();
      const [fersRes, fingRes] = await Promise.all([
        db.query(`SELECT COUNT(*)::int AS c FROM follows WHERE following_id = $1`, [userId]),
        db.query(`SELECT COUNT(*)::int AS c FROM follows WHERE follower_id = $1`, [userId]),
      ]);
      followersCount = Number(fersRes.rows[0]?.c ?? 0);
      followingCount = Number(fingRes.rows[0]?.c ?? 0);
    } catch {
      // DB unavailable — fall through to in-memory
    }
  }

  const resolvedFollowers = followersCount ?? getFollowerIds(userId).length;
  const resolvedFollowing = followingCount ?? getFollowingIds(userId).length;
  if (profile.followers !== resolvedFollowers || profile.following !== resolvedFollowing) {
    profile.followers = resolvedFollowers;
    profile.following = resolvedFollowing;
    profile.updatedAt = new Date().toISOString();
    profiles.set(userId, profile);
    saveProfileToDb(profile).catch(() => {});
  }
  res.json({ profile });
}

/** GET /api/profiles — list all known users/profiles */
export async function handleListProfiles(_req: Request, res: Response): Promise<void> {
  const merged = new Map<string, Profile>();

  // Try Neon first for profiles
  const db = getPool();
  if (db) {
    try {
      await ensureProfilesTable();
      const dbRes = await db.query(`SELECT * FROM profiles`);
      for (const r of dbRes.rows || []) {
        const p: Profile = {
          userId: String(r.user_id),
          username: String(r.username || ""),
          displayName: String(r.display_name || ""),
          avatarUrl: String(r.avatar_url || ""),
          bio: String(r.bio || ""),
          website: String(r.website || ""),
          followers: Number(r.followers) || 0,
          following: Number(r.following) || 0,
          videoCount: Number(r.video_count) || 0,
          coins: Number(r.coins) || 0,
          level: Number(r.level) || 1,
          isVerified: Boolean(r.is_verified),
          createdAt: String(r.created_at || ""),
          updatedAt: String(r.updated_at || ""),
        };
        profiles.set(p.userId, p);
        merged.set(p.userId, p);
      }
    } catch {
      // DB unavailable — fall through to in-memory
    }
  }

  // Fill in from in-memory cache (covers profiles not yet in DB)
  for (const p of profiles.values()) {
    if (!merged.has(p.userId)) merged.set(p.userId, p);
  }

  const users = await readUsersFromDb();
  for (const u of users) {
    if (!u?.id) continue;
    const username =
      (typeof u.username === "string" && u.username.trim()) ||
      (typeof u.display_name === "string" && u.display_name.trim()) ||
      (typeof u.email === "string" && u.email.includes("@") ? u.email.split("@")[0] : "") ||
      `user_${u.id.slice(0, 8)}`;
    const displayName =
      (typeof u.display_name === "string" && u.display_name.trim()) ||
      username;
    const avatarUrl =
      (typeof u.avatar_url === "string" && u.avatar_url.trim()) ||
      `https://ui-avatars.com/api/?name=${encodeURIComponent(String(username))}&background=random`;
    const p = getOrCreateProfile(u.id, { username: String(username), displayName: String(displayName), avatarUrl: String(avatarUrl) });
    merged.set(p.userId, p);
  }

  const list = Array.from(merged.values()).map((p) => ({
    user_id: p.userId,
    username: p.username,
    display_name: p.displayName,
    avatar_url: p.avatarUrl,
    level: p.level,
    is_creator: p.isVerified,
    followers_count: p.followers,
    following_count: p.following,
  }));
  res.json({ profiles: list });
}

/** GET /api/profiles/:userId/followers — ids from follows graph; profiles from Neon when available */
export async function handleGetFollowers(req: Request, res: Response): Promise<void> {
  const userId = req.params.userId;
  const profile = await getOrCreateProfileAsync(userId);

  let followerIds: string[] = [];
  const db = getPool();

  // Try Neon first for follower IDs
  if (db) {
    try {
      await ensureFollowsTable();
      const fRes = await db.query(
        `SELECT follower_id FROM follows WHERE following_id = $1`,
        [userId],
      );
      followerIds = (fRes.rows || []).map((r: any) => String(r.follower_id));
    } catch {
      followerIds = [];
    }
  }

  // Fallback to in-memory if DB returned nothing or unavailable
  if (followerIds.length === 0) {
    for (const [fid, set] of followsMap) {
      if (set.has(userId)) followerIds.push(fid);
    }
  }

  type Row = { user_id: string; username: string; display_name: string | null; avatar_url: string | null };
  let follower_profiles: Row[] = [];

  if (db && followerIds.length > 0) {
    try {
      await ensureProfilesTable();
      const r = await db.query(
        `SELECT user_id, username, display_name, avatar_url FROM profiles WHERE user_id = ANY($1::text[])`,
        [followerIds],
      );
      const byId = new Map<string, Row>();
      for (const row of r.rows || []) {
        byId.set(String(row.user_id), {
          user_id: String(row.user_id),
          username: String(row.username || "user"),
          display_name: row.display_name != null ? String(row.display_name) : null,
          avatar_url: row.avatar_url != null ? String(row.avatar_url) : null,
        });
      }
      follower_profiles = followerIds.map((id) => {
        const hit = byId.get(id);
        if (hit) return hit;
        return { user_id: id, username: "user", display_name: null, avatar_url: null };
      });
    } catch (err) {
      logger.error({ err, userId }, "handleGetFollowers: profile query failed");
      follower_profiles = [];
    }
  }

  if (follower_profiles.length === 0 && followerIds.length > 0) {
    follower_profiles = await Promise.all(
      followerIds.map(async (id) => {
        const p = await getOrCreateProfileAsync(id);
        return {
          user_id: p.userId,
          username: p.username,
          display_name: p.displayName || null,
          avatar_url: p.avatarUrl || null,
        };
      }),
    );
  }

  const count = Math.max(followerIds.length, profile.followers);
  res.json({ count, followers: followerIds, follower_profiles });
}

/** GET /api/profiles/:userId/following */
export async function handleGetFollowing(req: Request, res: Response): Promise<void> {
  const userId = req.params.userId;
  const profile = await getOrCreateProfileAsync(userId);

  let followingIds: string[] = [];
  const db = getPool();

  // Try Neon first
  if (db) {
    try {
      await ensureFollowsTable();
      const fRes = await db.query(
        `SELECT following_id FROM follows WHERE follower_id = $1`,
        [userId],
      );
      followingIds = (fRes.rows || []).map((r: any) => String(r.following_id));
    } catch {
      followingIds = [];
    }
  }

  // Fallback to in-memory
  if (followingIds.length === 0) {
    followingIds = getFollowingIds(userId);
  }

  res.json({ count: Math.max(followingIds.length, profile.following), following: followingIds });
}

/** PATCH /api/profiles/:userId — auth required, own profile only */
export async function handlePatchProfile(req: Request, res: Response): Promise<void> {
  const userId = req.params.userId;
  const token = getTokenFromRequest(req);
  const jwtUser = token ? verifyAuthToken(token) : null;

  if (!jwtUser || jwtUser.sub !== userId) {
    res.status(403).json({ error: "Forbidden: cannot update another user's profile" });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const patchedAvatarRaw = body["avatarUrl"];
  const patchedAvatar =
    typeof patchedAvatarRaw === "string" ? patchedAvatarRaw.trim() : "";

  const profile = await getOrCreateProfileAsync(userId);
  const allowed = ["username", "displayName", "avatarUrl", "bio", "website", "level", "coins"] as const;
  for (const key of allowed) {
    const val = body[key];
    if (val !== undefined) {
      (profile as Record<string, unknown>)[key] = val;
    }
  }
  profile.updatedAt = new Date().toISOString();
  profiles.set(userId, profile);

  try {
    const persisted = await saveProfileToDb(profile);
    if (
      persisted &&
      patchedAvatar &&
      !patchedAvatar.startsWith("data:") &&
      /^https?:\/\//i.test(patchedAvatar)
    ) {
      await updateAuthUserAvatarUrl(userId, patchedAvatar);
    }
    logger.info(
      { userId, persisted, avatarLen: profile.avatarUrl?.length ?? 0 },
      "PATCH profile saved",
    );
  } catch (err) {
    logger.error({ err, userId }, "PATCH profile: database save failed");
    res.status(500).json({ error: "Could not save profile to database." });
    return;
  }

  res.json({ profile });
}

/** POST /api/profiles/:userId/follow — auth required */
export async function handleFollow(req: Request, res: Response): Promise<void> {
  const userId = req.params.userId;
  const token = getTokenFromRequest(req);
  const jwtUser = token ? verifyAuthToken(token) : null;

  if (!jwtUser) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (jwtUser.sub === userId) {
    res.status(400).json({ error: "Cannot follow yourself" });
    return;
  }

  const myFollows = followsMap.get(jwtUser.sub) ?? new Set<string>();
  if (myFollows.has(userId)) {
    const p = await getOrCreateProfileAsync(userId);
    res.json({ success: true, already: true, followers: p.followers });
    return;
  }

  const db = getPool();
  if (db) {
    try {
      await ensureFollowsTable();
      await db.query(`INSERT INTO follows (follower_id, following_id) VALUES ($1, $2)`, [jwtUser.sub, userId]);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === "23505") {
        myFollows.add(userId);
        followsMap.set(jwtUser.sub, myFollows);
        void import("./feed")
          .then((m) => {
            m.invalidateFeedCache(jwtUser.sub);
            m.invalidateFeedCache(userId);
          })
          .catch(() => {});
        const p = await getOrCreateProfileAsync(userId);
        res.json({ success: true, already: true, followers: p.followers });
        return;
      }
      logger.error({ err, follower: jwtUser.sub, following: userId }, "Follow INSERT failed");
      res.status(500).json({ error: "Could not save follow. Check database (follows table)." });
      return;
    }
  }

  myFollows.add(userId);
  followsMap.set(jwtUser.sub, myFollows);

  const target = await getOrCreateProfileAsync(userId);
  const follower = await getOrCreateProfileAsync(jwtUser.sub);
  target.followers = Math.max(0, target.followers + 1);
  follower.following = Math.max(0, follower.following + 1);
  profiles.set(userId, target);
  profiles.set(jwtUser.sub, follower);
  saveProfileToDb(target).catch(() => {});
  saveProfileToDb(follower).catch(() => {});
  void import("./feed")
    .then((m) => {
      m.invalidateFeedCache(jwtUser.sub);
      m.invalidateFeedCache(userId);
    })
    .catch(() => {});
  res.json({ success: true, followers: target.followers });
}

/** POST /api/profiles/:userId/unfollow — auth required */
export async function handleUnfollow(req: Request, res: Response): Promise<void> {
  const userId = req.params.userId;
  const token = getTokenFromRequest(req);
  const jwtUser = token ? verifyAuthToken(token) : null;

  if (!jwtUser) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // Write to Neon first, then update cache
  const db = getPool();
  if (db) {
    try {
      await ensureFollowsTable();
      await db.query(`DELETE FROM follows WHERE follower_id = $1 AND following_id = $2`, [jwtUser.sub, userId]);
    } catch (err) {
      logger.error({ err, follower: jwtUser.sub, following: userId }, "Unfollow DELETE failed");
    }
  }

  const myFollows = followsMap.get(jwtUser.sub);
  if (!myFollows || !myFollows.has(userId)) {
    const p = await getOrCreateProfileAsync(userId);
    res.json({ success: true, already: true, followers: p.followers });
    return;
  }
  myFollows.delete(userId);
  followsMap.set(jwtUser.sub, myFollows);

  const target = await getOrCreateProfileAsync(userId);
  const follower = await getOrCreateProfileAsync(jwtUser.sub);
  target.followers = Math.max(0, target.followers - 1);
  follower.following = Math.max(0, follower.following - 1);
  profiles.set(userId, target);
  profiles.set(jwtUser.sub, follower);
  saveProfileToDb(target).catch(() => {});
  saveProfileToDb(follower).catch(() => {});
  void import("./feed")
    .then((m) => {
      m.invalidateFeedCache(jwtUser.sub);
      m.invalidateFeedCache(userId);
    })
    .catch(() => {});
  res.json({ success: true, followers: target.followers });
}

/** GET /api/profiles/by-username/:username */
export async function handleGetProfileByUsername(req: Request, res: Response): Promise<void> {
  const username = req.params.username;
  if (!username) {
    res.status(400).json({ error: "username is required" });
    return;
  }

  const db = getPool();
  if (db) {
    try {
      const res2 = await db.query(
        `SELECT user_id, username, display_name, avatar_url, bio, level, followers, following
         FROM profiles WHERE username = $1 OR display_name = $1 LIMIT 1`,
        [username],
      );
      if (res2.rows?.[0]) {
        const r = res2.rows[0];
        res.json({
          user_id: r.user_id,
          username: r.username,
          display_name: r.display_name,
          avatar_url: r.avatar_url,
          bio: r.bio || "",
          level: Number(r.level) || 1,
          followers_count: Number(r.followers) || 0,
          following_count: Number(r.following) || 0,
        });
        return;
      }
    } catch { /* fall through to cache */ }
  }

  for (const profile of profiles.values()) {
    if (profile.username === username || profile.displayName === username) {
      res.json({
        user_id: profile.userId,
        username: profile.username,
        display_name: profile.displayName,
        avatar_url: profile.avatarUrl,
        bio: profile.bio,
        level: profile.level,
        followers_count: profile.followers,
        following_count: profile.following,
      });
      return;
    }
  }

  res.status(404).json({ error: "Profile not found" });
}

/** POST /api/test-coins — add test coins to current user */
export async function handleAddTestCoins(req: Request, res: Response): Promise<void> {
  const token = getTokenFromRequest(req);
  const jwtUser = token ? verifyAuthToken(token) : null;
  if (!jwtUser) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const { amount } = req.body ?? {};
  const numAmount = Number(amount);
  if (!numAmount || numAmount <= 0 || numAmount > 100000000) {
    res.status(400).json({ error: "Invalid amount" });
    return;
  }
  const profile = await getOrCreateProfileAsync(jwtUser.sub);
  profile.coins += numAmount;
  profiles.set(jwtUser.sub, profile);
  saveProfileToDb(profile).catch(() => {});
  res.json({ success: true, coins: profile.coins });
}

/** POST /api/profiles — seed/upsert (e.g. after auth); no auth required */
export async function handleSeedProfile(req: Request, res: Response): Promise<void> {
  const body = req.body as { userId?: string; username?: string; displayName?: string; email?: string; avatarUrl?: string };
  const { userId, username, displayName, email, avatarUrl } = body ?? {};

  if (!userId) {
    res.status(400).json({ error: "userId is required" });
    return;
  }

  const realUsername = username ?? (email ? email.split("@")[0] : undefined);
  const realDisplayName = displayName || realUsername;
  const existing = profiles.get(userId) ?? await loadProfileFromDb(userId);

  if (existing) {
    if (realUsername) existing.username = realUsername;
    if (realDisplayName) existing.displayName = realDisplayName;
    if (avatarUrl) existing.avatarUrl = avatarUrl;
    existing.updatedAt = new Date().toISOString();
    profiles.set(userId, existing);
    saveProfileToDb(existing).catch(() => {});
    res.status(201).json({ profile: existing });
    return;
  }

  const profile = getOrCreateProfile(userId, {
    username: realUsername,
    displayName: realDisplayName,
    avatarUrl,
  });
  res.status(201).json({ profile });
}
