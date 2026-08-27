import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { query } from '../lib/postgres.js';
import { authMiddleware } from '../http/authMiddleware.js';

const profileUpdateSchema = z.object({
  displayName: z.string().trim().min(1).max(60).optional(),
  bio: z.string().max(500).optional(),
  avatarUrl: z.string().max(500).optional(),
});

function profileFromRow(row: {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string;
  bio: string;
  is_verified: boolean;
  is_admin: boolean;
  followers: number;
  following: number;
  video_count: number;
}) {
  return {
    id: row.user_id,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    bio: row.bio,
    isVerified: row.is_verified,
    isAdmin: row.is_admin,
    followers: Number(row.followers),
    following: Number(row.following),
    videoCount: Number(row.video_count),
  };
}

export const usersRouter = Router();

usersRouter.get('/users/:userId', authMiddleware, async (req: Request, res: Response) => {
  const { rows } = await query<
    Parameters<typeof profileFromRow>[0]
  >(
    `SELECT p.user_id, u.username, p.display_name, p.avatar_url, p.bio,
            p.is_verified, p.is_admin,
            (SELECT COUNT(*) FROM follows WHERE following_id = p.user_id) AS followers,
            (SELECT COUNT(*) FROM follows WHERE follower_id = p.user_id) AS following,
            (SELECT COUNT(*) FROM videos WHERE user_id = p.user_id AND privacy = 'public') AS video_count
       FROM profiles p
       JOIN users u ON u.id = p.user_id
      WHERE p.user_id = $1
      LIMIT 1`,
    [req.params.userId],
  );

  const row = rows[0];
  if (!row) return res.status(404).json({ code: 'not_found', message: 'Profile not found.' });
  return res.json(profileFromRow(row));
});

usersRouter.get('/users/me', authMiddleware, async (req: Request, res: Response) => {
  const { rows } = await query<Parameters<typeof profileFromRow>[0]>(
    `SELECT p.user_id, u.username, p.display_name, p.avatar_url, p.bio,
            p.is_verified, p.is_admin,
            (SELECT COUNT(*) FROM follows WHERE following_id = p.user_id) AS followers,
            (SELECT COUNT(*) FROM follows WHERE follower_id = p.user_id) AS following,
            (SELECT COUNT(*) FROM videos WHERE user_id = p.user_id AND privacy = 'public') AS video_count
       FROM profiles p
       JOIN users u ON u.id = p.user_id
      WHERE p.user_id = $1
      LIMIT 1`,
    [req.userId],
  );

  const row = rows[0];
  if (!row) return res.status(404).json({ code: 'not_found', message: 'Profile not found.' });
  return res.json(profileFromRow(row));
});

usersRouter.get('/users/:userId/followers', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.params.userId;
  const { rows } = await query<
    {
      user_id: string;
      username: string;
      display_name: string;
      avatar_url: string;
    }
  >(
    `SELECT p.user_id, u.username, p.display_name, p.avatar_url
       FROM follows f
       JOIN users u ON u.id = f.follower_id
       JOIN profiles p ON p.user_id = f.follower_id
      WHERE f.following_id = $1
      ORDER BY f.created_at DESC`,
    [userId],
  );

  const users = rows.map((row) => ({
    id: row.user_id,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
  }));

  return res.json({ users });
});

usersRouter.get('/users/:userId/following', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.params.userId;
  const { rows } = await query<
    {
      user_id: string;
      username: string;
      display_name: string;
      avatar_url: string;
    }
  >(
    `SELECT p.user_id, u.username, p.display_name, p.avatar_url
       FROM follows f
       JOIN users u ON u.id = f.following_id
       JOIN profiles p ON p.user_id = f.following_id
      WHERE f.follower_id = $1
      ORDER BY f.created_at DESC`,
    [userId],
  );

  const users = rows.map((row) => ({
    id: row.user_id,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
  }));

  return res.json({ users });
});

const notificationSettingsSchema = z.object({
  pushEnabled: z.boolean().optional(),
  emailEnabled: z.boolean().optional(),
  likesEnabled: z.boolean().optional(),
  commentsEnabled: z.boolean().optional(),
  followsEnabled: z.boolean().optional(),
  liveEnabled: z.boolean().optional(),
  marketingEnabled: z.boolean().optional(),
});

usersRouter.get('/users/me/notifications', authMiddleware, async (req: Request, res: Response) => {
  const { rows } = await query<{
    push_enabled: boolean;
    email_enabled: boolean;
    likes_enabled: boolean;
    comments_enabled: boolean;
    follows_enabled: boolean;
    live_enabled: boolean;
    marketing_enabled: boolean;
  }>(
    `INSERT INTO user_notification_settings (user_id)
     VALUES ($1)
     ON CONFLICT (user_id) DO UPDATE SET updated_at = NOW()
     RETURNING push_enabled, email_enabled, likes_enabled, comments_enabled, follows_enabled, live_enabled, marketing_enabled`,
    [req.userId],
  );

  const row = rows[0];
  if (!row) return res.status(500).json({ code: 'server_error', message: 'Could not load settings.' });

  return res.json({
    pushEnabled: row.push_enabled,
    emailEnabled: row.email_enabled,
    likesEnabled: row.likes_enabled,
    commentsEnabled: row.comments_enabled,
    followsEnabled: row.follows_enabled,
    liveEnabled: row.live_enabled,
    marketingEnabled: row.marketing_enabled,
  });
});

usersRouter.patch('/users/me/notifications', authMiddleware, async (req: Request, res: Response) => {
  const parsed = notificationSettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return res.status(400).json({ code: 'invalid_request', message: first?.message ?? 'Invalid settings.' });
  }

  const sets: string[] = [];
  const values: (boolean | string)[] = [];
  const map: Record<string, string> = {
    pushEnabled: 'push_enabled',
    emailEnabled: 'email_enabled',
    likesEnabled: 'likes_enabled',
    commentsEnabled: 'comments_enabled',
    followsEnabled: 'follows_enabled',
    liveEnabled: 'live_enabled',
    marketingEnabled: 'marketing_enabled',
  };

  for (const [key, col] of Object.entries(map)) {
    const v = parsed.data[key as keyof typeof parsed.data];
    if (v !== undefined) {
      sets.push(`${col} = $${sets.length + 1}`);
      values.push(v);
    }
  }

  if (sets.length === 0) {
    return res.status(400).json({ code: 'invalid_request', message: 'No settings to update.' });
  }

  values.push(req.userId!);
  await query(
    `INSERT INTO user_notification_settings (user_id) VALUES ($${values.length})
     ON CONFLICT (user_id) DO UPDATE SET ${sets.join(', ')}, updated_at = NOW()`,
    values,
  );

  return res.json({ success: true });
});

usersRouter.get('/users', authMiddleware, async (req: Request, res: Response) => {
  const q = String(req.query.q ?? '').trim().toLowerCase();
  if (!q || q.length < 2) {
    return res.status(400).json({ code: 'invalid_request', message: 'Search query must be at least 2 characters.' });
  }

  const { rows } = await query<
    {
      user_id: string;
      username: string;
      display_name: string;
      avatar_url: string;
      is_verified: boolean;
    }
  >(
    `SELECT p.user_id, u.username, p.display_name, p.avatar_url, p.is_verified
       FROM profiles p
       JOIN users u ON u.id = p.user_id
      WHERE u.username ILIKE $1 || '%' OR p.display_name ILIKE '%' || $1 || '%'
      ORDER BY p.is_verified DESC, p.display_name ASC
      LIMIT 20`,
    [q],
  );

  const users = rows.map((row) => ({
    id: row.user_id,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    isVerified: row.is_verified,
  }));

  return res.json({ users });
});

usersRouter.patch('/users/me', authMiddleware, async (req: Request, res: Response) => {
  const parsed = profileUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return res.status(400).json({ code: 'invalid_request', message: first?.message ?? 'Invalid profile data.' });
  }

  const { displayName, bio, avatarUrl } = parsed.data;
  const sets: string[] = [];
  const values: (string | undefined)[] = [];

  if (displayName !== undefined) {
    sets.push(`display_name = $${sets.length + 1}`);
    values.push(displayName);
  }
  if (bio !== undefined) {
    sets.push(`bio = $${sets.length + 1}`);
    values.push(bio);
  }
  if (avatarUrl !== undefined) {
    sets.push(`avatar_url = $${sets.length + 1}`);
    values.push(avatarUrl);
  }

  if (sets.length === 0) {
    return res.status(400).json({ code: 'invalid_request', message: 'No fields to update.' });
  }

  values.push(req.userId!);
  await query(`UPDATE profiles SET ${sets.join(', ')}, updated_at = NOW() WHERE user_id = $${values.length}`, values);
  return res.json({ success: true });
});
