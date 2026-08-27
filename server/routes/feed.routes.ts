import { Router, type Request, type Response } from 'express';
import { query } from '../lib/postgres.js';
import { authMiddleware } from '../http/authMiddleware.js';

export const feedRouter = Router();

feedRouter.get('/feed', authMiddleware, async (req: Request, res: Response) => {
  const limit = Math.min(parseInt(req.query.limit as string, 10) || 20, 100);
  const offset = Math.max(parseInt(req.query.offset as string, 10) || 0, 0);

  const { rows } = await query<
    {
      id: string;
      url: string;
      thumbnail: string;
      duration: number;
      user_id: string;
      display_name: string;
      avatar_url: string;
      description: string;
      hashtags: unknown;
      views: number;
      likes: number;
      comments: number;
      created_at: Date;
    }
  >(
    `SELECT v.id, v.url, v.thumbnail, v.duration, v.user_id,
            p.display_name, p.avatar_url, v.description, v.hashtags,
            v.views, v.likes, v.comments, v.created_at
       FROM videos v
       JOIN profiles p ON p.user_id = v.user_id
      WHERE v.privacy = 'public'
      ORDER BY v.created_at DESC
      LIMIT $1 OFFSET $2`,
    [limit, offset],
  );

  const videos = rows.map((row) => ({
    id: row.id,
    url: row.url,
    thumbnail: row.thumbnail,
    duration: Number(row.duration),
    user: {
      id: row.user_id,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
    },
    description: row.description,
    hashtags: Array.isArray(row.hashtags) ? row.hashtags : [],
    stats: {
      views: row.views,
      likes: row.likes,
      comments: row.comments,
    },
    createdAt: row.created_at.toISOString(),
    likedByMe: false,
    savedByMe: false,
  }));

  return res.json({ videos, hasMore: videos.length === limit });
});
