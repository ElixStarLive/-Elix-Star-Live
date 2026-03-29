/**
 * Profile API — DB-primary, no in-memory Maps.
 * Optional Valkey cache for hot profile reads.
 * Horizontally scalable.
 */

import { Request, Response } from "express";
import { getTokenFromRequest, verifyAuthToken } from "./auth";
import { ensureFollowsTable, getPool } from "../lib/postgres";
import { logger } from "../lib/logger";
import { isValkeyConfigured, valkeyGet, valkeySet, valkeyDel } from "../lib/valkey";

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

let profilesTableReady = false;

type StoredUserRow = { id: string; email?: string; username?: string; avatar_url?: string; display_name?: string };

const PROFILE_CACHE_TTL = 30_000;

/** @deprecated No-op — bulk loading removed for horizontal scaling. */
export async function loadFollowsFromDb(): Promise<void> {
  // Intentionally empty — follows are queried per-user from DB.
}

/** DB-primary following IDs for a user. */
export async function getFollowingIdsAsync(userId: string): Promise<string[]> {
  const db = getPool();
  if (!db) return [];
  try {
    await ensureFollowsTable();
    const res = await db.query(`SELECT following_id FROM follows WHERE follower_id = $1`, [userId]);
    return (res.rows || []).map((r: any) => String(r.following_id));
  } catch (err) {
    logger.error({ err, userId }, "getFollowingIdsAsync DB read failed");
    return [];
  }
}

/** DB-primary follower IDs for a user. */
export async function getFollowerIdsAsync(userId: string): Promise<string[]> {
  const db = getPool();
  if (!db) return [];
  try {
    await ensureFollowsTable();
    const res = await db.query(`SELECT follower_id FROM follows WHERE following_id = $1`, [userId]);
    return (res.rows || []).map((r: any) => String(r.follower_id));
  } catch (err) {
    logger.error({ err, userId }, "getFollowerIdsAsync DB read failed");
    return [];
  }
}

/** DB-primary mutual follow IDs. */
export async function getMutualFollowIdsAsync(userId: string): Promise<string[]> {
  const db = getPool();
  if (!db) return [];
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
    logger.error({ err, userId }, "getMutualFollowIdsAsync DB read failed");
    return [];
  }
}

/** DB-primary isFollowing check. */
export async function isFollowingAsync(followerId: string, targetId: string): Promise<boolean> {
  const db = getPool();
  if (!db) return false;
  try {
    await ensureFollowsTable();
    const res = await db.query(
      `SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = $2 LIMIT 1`,
      [followerId, targetId],
    );
    return (res.rows?.length ?? 0) > 0;
  } catch (err) {
    logger.warn({ err, followerId, targetId }, "isFollowingAsync DB read failed");
    return false;
  }
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
  } catch (err) {
    logger.warn({ err }, "ensureProfilesTable: table creation failed");
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
  if (isValkeyConfigured()) {
    await valkeyDel(`profile:${p.userId}`);
  }
  return true;
}

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
  } catch (err) {
    logger.warn({ err, userId }, "loadProfileFromDb failed");
    return null;
  }
}

async function getCachedProfile(userId: string): Promise<Profile | null> {
  if (!isValkeyConfigured()) return null;
  try {
    const raw = await valkeyGet(`profile:${userId}`);
    if (raw) return JSON.parse(raw) as Profile;
  } catch (err) {
    logger.warn({ err, userId }, "getCachedProfile: valkey read/parse failed");
  }
  return null;
}

async function setCachedProfile(profile: Profile): Promise<void> {
  if (!isValkeyConfigured()) return;
  try {
    await valkeySet(`profile:${profile.userId}`, JSON.stringify(profile), PROFILE_CACHE_TTL);
  } catch (err) {
    logger.warn({ err, userId: profile.userId }, "setCachedProfile: valkey set failed");
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
  } catch (err) {
    logger.warn({ err, userId }, "lookupAuthUser failed");
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
  } catch (err) {
    logger.warn({ err }, "readUsersFromDb failed");
    return [];
  }
}

function isFallbackName(name: string): boolean {
  if (!name) return true;
  if (/^User [0-9a-f]{8}$/i.test(name)) return true;
  if (/^user_[0-9a-f]{8}$/i.test(name)) return true;
  return false;
}

/** DB-primary profile getter. Creates profile in DB if not found. */
export async function getOrCreateProfile(userId: string, seed?: Partial<Profile>): Promise<Profile> {
  const cached = await getCachedProfile(userId);
  if (cached) {
    if (seed) {
      let changed = false;
      if (seed.username && isFallbackName(cached.username)) { cached.username = seed.username; changed = true; }
      if (seed.displayName && isFallbackName(cached.displayName)) { cached.displayName = seed.displayName; changed = true; }
      if (seed.avatarUrl && cached.avatarUrl.includes("ui-avatars")) { cached.avatarUrl = seed.avatarUrl; changed = true; }
      if (changed) {
        cached.updatedAt = new Date().toISOString();
        saveProfileToDb(cached).catch((err) => {
          logger.warn({ err, userId: cached.userId }, "getOrCreateProfile: saveProfileToDb failed (cached)");
        });
      }
    }
    return cached;
  }

  const existing = await loadProfileFromDb(userId);
  if (existing) {
    if (seed) {
      let changed = false;
      if (seed.username && isFallbackName(existing.username)) { existing.username = seed.username; changed = true; }
      if (seed.displayName && isFallbackName(existing.displayName)) { existing.displayName = seed.displayName; changed = true; }
      if (seed.avatarUrl && existing.avatarUrl.includes("ui-avatars")) { existing.avatarUrl = seed.avatarUrl; changed = true; }
      if (changed) {
        existing.updatedAt = new Date().toISOString();
        saveProfileToDb(existing).catch((err) => {
          logger.warn({ err, userId: existing.userId }, "getOrCreateProfile: saveProfileToDb failed (existing)");
        });
      }
    }
    await setCachedProfile(existing);
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
  saveProfileToDb(profile).catch((err) => {
    logger.warn({ err, userId: profile.userId }, "getOrCreateProfile: saveProfileToDb failed (new profile)");
  });
  await setCachedProfile(profile);
  return profile;
}

/** @deprecated Use getOrCreateProfile (now async). */
export async function getOrCreateProfileFromDb(userId: string, seed?: Partial<Profile>): Promise<Profile> {
  return getOrCreateProfile(userId, seed);
}

async function getOrCreateProfileAsync(userId: string, seed?: Partial<Profile>): Promise<Profile> {
  let profile = await getCachedProfile(userId) ?? await loadProfileFromDb(userId) ?? null;

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
      const realAvatar = (authUser.avatar_url?.trim()) || "";

      if (profile) {
        if (realUsername && isFallbackName(profile.username)) profile.username = realUsername;
        if (realDisplayName && isFallbackName(profile.displayName)) profile.displayName = realDisplayName;
        if (realAvatar && profile.avatarUrl.includes("ui-avatars")) profile.avatarUrl = realAvatar;
        profile.updatedAt = new Date().toISOString();
        saveProfileToDb(profile).catch((err) => {
          logger.warn({ err, userId: profile.userId }, "getOrCreateProfileAsync: saveProfileToDb failed");
        });
        await setCachedProfile(profile);
        return profile;
      }

      profile = await getOrCreateProfile(userId, {
        username: realUsername || undefined,
        displayName: realDisplayName || undefined,
        avatarUrl: realAvatar || undefined,
        ...seed,
      });
      return profile;
    }
  }

  if (profile) {
    await setCachedProfile(profile);
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
    } catch (err) {
      logger.warn({ err, userId }, "handleGetProfile: follow counts query failed");
    }
  }

  const resolvedFollowers = followersCount ?? 0;
  const resolvedFollowing = followingCount ?? 0;
  if (profile.followers !== resolvedFollowers || profile.following !== resolvedFollowing) {
    profile.followers = resolvedFollowers;
    profile.following = resolvedFollowing;
    profile.updatedAt = new Date().toISOString();
    saveProfileToDb(profile).catch((err) => {
      logger.warn({ err, userId: profile.userId }, "handleGetProfile: saveProfileToDb failed");
    });
  }
  res.json({ profile });
}

/** GET /api/profiles — list all known users/profiles */
let profilesListCache: { data: any; ts: number } | null = null;
const PROFILES_LIST_CACHE_TTL = 30_000;

export async function handleListProfiles(_req: Request, res: Response): Promise<void> {
  const now = Date.now();
  if (profilesListCache && now - profilesListCache.ts < PROFILES_LIST_CACHE_TTL) {
    res.setHeader("Cache-Control", "public, s-maxage=30, max-age=15");
    res.json(profilesListCache.data);
    return;
  }

  const merged = new Map<string, any>();

  const db = getPool();
  if (db) {
    try {
      await ensureProfilesTable();
      const dbRes = await db.query(`SELECT user_id, username, display_name, avatar_url, level, is_verified, followers, following FROM profiles LIMIT 500`);
      for (const r of dbRes.rows || []) {
        merged.set(String(r.user_id), {
          user_id: String(r.user_id),
          username: String(r.username || ""),
          display_name: String(r.display_name || ""),
          avatar_url: String(r.avatar_url || ""),
          level: Number(r.level) || 1,
          is_creator: Boolean(r.is_verified),
          followers_count: Number(r.followers) || 0,
          following_count: Number(r.following) || 0,
        });
      }
    } catch (err) {
      logger.warn({ err }, "handleListProfiles: profiles query failed");
    }
  }

  if (db) {
    const users = await readUsersFromDb();
    for (const u of users) {
      if (!u?.id || merged.has(u.id)) continue;
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
      merged.set(u.id, {
        user_id: u.id,
        username: String(username),
        display_name: String(displayName),
        avatar_url: String(avatarUrl),
        level: 1,
        is_creator: false,
        followers_count: 0,
        following_count: 0,
      });
    }
  }

  const result = { profiles: Array.from(merged.values()) };
  profilesListCache = { data: result, ts: now };
  res.setHeader("Cache-Control", "public, s-maxage=30, max-age=15");
  res.json(result);
}

/** GET /api/profiles/:userId/followers */
export async function handleGetFollowers(req: Request, res: Response): Promise<void> {
  const userId = req.params.userId;
  const profile = await getOrCreateProfileAsync(userId);

  const followerIds = await getFollowerIdsAsync(userId);

  type Row = { user_id: string; username: string; display_name: string | null; avatar_url: string | null };
  let follower_profiles: Row[] = [];

  const db = getPool();
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

  const followingIds = await getFollowingIdsAsync(userId);

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

  const db = getPool();
  if (db) {
    try {
      await ensureFollowsTable();
      await db.query(`INSERT INTO follows (follower_id, following_id) VALUES ($1, $2)`, [jwtUser.sub, userId]);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === "23505") {
        void import("./feed")
          .then((m) => {
            m.invalidateFeedCache(jwtUser.sub);
            m.invalidateFeedCache(userId);
          })
          .catch((err) => {
            logger.warn({ err, follower: jwtUser.sub, following: userId }, "handleFollow: invalidateFeedCache import failed");
          });
        const p = await getOrCreateProfileAsync(userId);
        res.json({ success: true, already: true, followers: p.followers });
        return;
      }
      logger.error({ err, follower: jwtUser.sub, following: userId }, "Follow INSERT failed");
      res.status(500).json({ error: "Could not save follow. Check database (follows table)." });
      return;
    }
  }

  const target = await getOrCreateProfileAsync(userId);
  const follower = await getOrCreateProfileAsync(jwtUser.sub);
  target.followers = Math.max(0, target.followers + 1);
  follower.following = Math.max(0, follower.following + 1);
  saveProfileToDb(target).catch((err) => {
    logger.warn({ err, userId: target.userId }, "handleFollow: saveProfileToDb failed (target)");
  });
  saveProfileToDb(follower).catch((err) => {
    logger.warn({ err, userId: follower.userId }, "handleFollow: saveProfileToDb failed (follower)");
  });
  void import("./feed")
    .then((m) => {
      m.invalidateFeedCache(jwtUser.sub);
      m.invalidateFeedCache(userId);
    })
    .catch((err) => {
      logger.warn({ err, follower: jwtUser.sub, following: userId }, "handleFollow: invalidateFeedCache import failed");
    });
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

  const db = getPool();
  let deleted = false;
  if (db) {
    try {
      await ensureFollowsTable();
      const result = await db.query(`DELETE FROM follows WHERE follower_id = $1 AND following_id = $2`, [jwtUser.sub, userId]);
      deleted = (result.rowCount ?? 0) > 0;
    } catch (err) {
      logger.error({ err, follower: jwtUser.sub, following: userId }, "Unfollow DELETE failed");
    }
  }

  if (!deleted) {
    const p = await getOrCreateProfileAsync(userId);
    res.json({ success: true, already: true, followers: p.followers });
    return;
  }

  const target = await getOrCreateProfileAsync(userId);
  const follower = await getOrCreateProfileAsync(jwtUser.sub);
  target.followers = Math.max(0, target.followers - 1);
  follower.following = Math.max(0, follower.following - 1);
  saveProfileToDb(target).catch((err) => {
    logger.warn({ err, userId: target.userId }, "handleUnfollow: saveProfileToDb failed (target)");
  });
  saveProfileToDb(follower).catch((err) => {
    logger.warn({ err, userId: follower.userId }, "handleUnfollow: saveProfileToDb failed (follower)");
  });
  void import("./feed")
    .then((m) => {
      m.invalidateFeedCache(jwtUser.sub);
      m.invalidateFeedCache(userId);
    })
    .catch((err) => {
      logger.warn({ err, follower: jwtUser.sub, following: userId }, "handleUnfollow: invalidateFeedCache import failed");
    });
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
    } catch (err) {
      logger.warn({ err, username }, "handleGetProfileByUsername: query failed");
    }
  }

  res.status(404).json({ error: "Profile not found" });
}

/** POST /api/test-coins — add test coins to current user (disabled in production) */
export async function handleAddTestCoins(req: Request, res: Response): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    res.status(403).json({ error: "Test coins are disabled in production" });
    return;
  }
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
  saveProfileToDb(profile).catch((err) => {
    logger.warn({ err, userId: profile.userId }, "handleAddTestCoins: saveProfileToDb failed");
  });
  res.json({ success: true, coins: profile.coins });
}

/** POST /api/profiles — seed/upsert (e.g. after auth); requires auth, userId must match token */
export async function handleSeedProfile(req: Request, res: Response): Promise<void> {
  const token = getTokenFromRequest(req);
  const jwtUser = token ? verifyAuthToken(token) : null;
  if (!jwtUser) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const body = req.body as { userId?: string; username?: string; displayName?: string; email?: string; avatarUrl?: string };
  const { userId, username, displayName, email, avatarUrl } = body ?? {};

  if (!userId) {
    res.status(400).json({ error: "userId is required" });
    return;
  }

  if (userId !== jwtUser.sub) {
    res.status(403).json({ error: "Cannot seed profile for another user" });
    return;
  }

  const realUsername = username ?? (email ? email.split("@")[0] : undefined);
  const realDisplayName = displayName || realUsername;
  const existing = await loadProfileFromDb(userId);

  if (existing) {
    if (realUsername) existing.username = realUsername;
    if (realDisplayName) existing.displayName = realDisplayName;
    if (avatarUrl) existing.avatarUrl = avatarUrl;
    existing.updatedAt = new Date().toISOString();
    saveProfileToDb(existing).catch((err) => {
      logger.warn({ err, userId: existing.userId }, "handleSeedProfile: saveProfileToDb failed");
    });
    res.status(201).json({ profile: existing });
    return;
  }

  const profile = await getOrCreateProfile(userId, {
    username: realUsername,
    displayName: realDisplayName,
    avatarUrl,
  });
  res.status(201).json({ profile });
}
