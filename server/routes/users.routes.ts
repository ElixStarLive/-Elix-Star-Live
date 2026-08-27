import { Router, type Request, type Response } from 'express';
import { query } from '../lib/postgres.js';
import { authMiddleware } from '../http/authMiddleware.js';

export const usersRouter = Router();

usersRouter.get('/users/:userId', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.params.userId;
  const { rows } = await query<
    {
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
    }
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
    [userId],
  );

  const row = rows[0];
  if (!row) {
    return res.status(404).json({ code: 'not_found', message: 'Profile not found.' });
  }
  return res.json({
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
  });
});
