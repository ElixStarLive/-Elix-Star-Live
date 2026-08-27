import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { query } from '../lib/postgres.js';
import { authMiddleware } from '../http/authMiddleware.js';

const createVideoSchema = z.object({
  url: z.string().min(1),
  thumbnail: z.string().optional(),
  description: z.string().max(2000).optional(),
  hashtags: z.array(z.string()).max(50).optional(),
  privacy: z.enum(['public', 'private', 'friends']).optional(),
});

interface FeedRow {
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

function toVideo(row: FeedRow, likedByMe = false, savedByMe = false) {
  return {
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
    likedByMe,
    savedByMe,
  };
}

function parsePagination(req: Request): { limit: number; offset: number } {
  return {
    limit: Math.min(parseInt(req.query.limit as string, 10) || 20, 100),
    offset: Math.max(parseInt(req.query.offset as string, 10) || 0, 0),
  };
}

export const feedRouter = Router();

feedRouter.get('/feed', authMiddleware, async (req: Request, res: Response) => {
  const { limit, offset } = parsePagination(req);

  const { rows } = await query<FeedRow>(
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

  const videos = rows.map((row) => toVideo(row));
  return res.json({ videos, hasMore: videos.length === limit });
});

feedRouter.get('/following', authMiddleware, async (req: Request, res: Response) => {
  const { limit, offset } = parsePagination(req);

  const { rows } = await query<FeedRow>(
    `SELECT v.id, v.url, v.thumbnail, v.duration, v.user_id,
            p.display_name, p.avatar_url, v.description, v.hashtags,
            v.views, v.likes, v.comments, v.created_at
       FROM videos v
       JOIN profiles p ON p.user_id = v.user_id
       JOIN follows f ON f.following_id = v.user_id
      WHERE v.privacy = 'public'
        AND f.follower_id = $3
      ORDER BY v.created_at DESC
      LIMIT $1 OFFSET $2`,
    [limit, offset, req.userId],
  );

  const videos = rows.map((row) => toVideo(row));
  return res.json({ videos, hasMore: videos.length === limit });
});

feedRouter.get('/friends', authMiddleware, async (req: Request, res: Response) => {
  const { limit, offset } = parsePagination(req);

  const { rows } = await query<FeedRow>(
    `SELECT v.id, v.url, v.thumbnail, v.duration, v.user_id,
            p.display_name, p.avatar_url, v.description, v.hashtags,
            v.views, v.likes, v.comments, v.created_at
       FROM videos v
       JOIN profiles p ON p.user_id = v.user_id
       JOIN follows f1 ON f1.following_id = v.user_id
       JOIN follows f2 ON f2.follower_id = v.user_id
      WHERE v.privacy = 'public'
        AND f1.follower_id = $3
        AND f2.following_id = $3
      ORDER BY v.created_at DESC
      LIMIT $1 OFFSET $2`,
    [limit, offset, req.userId],
  );

  const videos = rows.map((row) => toVideo(row));
  return res.json({ videos, hasMore: videos.length === limit });
});

feedRouter.post('/videos', authMiddleware, async (req: Request, res: Response) => {
  const parsed = createVideoSchema.safeParse(req.body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return res.status(400).json({ code: 'invalid_request', message: first?.message ?? 'Invalid video data.' });
  }

  const { url, thumbnail = '', description = '', hashtags = [], privacy = 'public' } = parsed.data;

  const { rows } = await query<{ id: string }>(
    `INSERT INTO videos (url, thumbnail, user_id, description, hashtags, privacy)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [url, thumbnail, req.userId, description, JSON.stringify(hashtags), privacy],
  );

  const id = rows[0]?.id;
  if (!id) {
    return res.status(500).json({ code: 'server_error', message: 'Could not create video.' });
  }

  return res.status(201).json({ id });
});

feedRouter.post('/videos/:videoId/save', authMiddleware, async (req: Request, res: Response) => {
  const videoId = req.params.videoId;
  try {
    await query(
      `INSERT INTO saves (user_id, video_id) VALUES ($1, $2) ON CONFLICT (user_id, video_id) DO NOTHING`,
      [req.userId, videoId],
    );
    return res.json({ success: true });
  } catch {
    return res.status(500).json({ code: 'server_error', message: 'Could not save video.' });
  }
});

feedRouter.delete('/videos/:videoId/save', authMiddleware, async (req: Request, res: Response) => {
  const videoId = req.params.videoId;
  await query(`DELETE FROM saves WHERE user_id = $1 AND video_id = $2`, [req.userId, videoId]);
  return res.json({ success: true });
});

feedRouter.get('/saved', authMiddleware, async (req: Request, res: Response) => {
  const { rows } = await query<FeedRow>(
    `SELECT v.id, v.url, v.thumbnail, v.duration, v.user_id,
            p.display_name, p.avatar_url, v.description, v.hashtags,
            v.views, v.likes, v.comments, v.created_at
       FROM saves s
       JOIN videos v ON v.id = s.video_id
       JOIN profiles p ON p.user_id = v.user_id
      WHERE s.user_id = $1 AND v.privacy = 'public'
      ORDER BY s.created_at DESC`,
    [req.userId],
  );

  const videos = rows.map((row) => toVideo(row));
  return res.json({ videos });
});

feedRouter.get('/videos/:videoId', async (req: Request, res: Response) => {
  const { rows } = await query<FeedRow>(
    `SELECT v.id, v.url, v.thumbnail, v.duration, v.user_id,
            p.display_name, p.avatar_url, v.description, v.hashtags,
            v.views, v.likes, v.comments, v.created_at
       FROM videos v
       JOIN profiles p ON p.user_id = v.user_id
      WHERE v.id = $1 AND v.privacy = 'public'
      LIMIT 1`,
    [req.params.videoId],
  );

  const row = rows[0];
  if (!row) {
    return res.status(404).json({ code: 'not_found', message: 'Video not found.' });
  }

  return res.json({ video: toVideo(row) });
});
