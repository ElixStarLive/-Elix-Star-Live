import { Router, type Request, type Response } from 'express';
import { query } from '../lib/postgres.js';
import { authMiddleware } from '../http/authMiddleware.js';
import { toVideo, type FeedRow } from '../routes/feed.routes.js';

export const musicRouter = Router();

musicRouter.get('/music', authMiddleware, async (_req: Request, res: Response) => {
  const { rows } = await query<{
    id: string;
    title: string;
    artist: string;
    thumbnail: string;
    duration: number;
    use_count: number;
  }>(
    `SELECT id, title, artist, thumbnail, duration, use_count
       FROM sounds
      ORDER BY use_count DESC, created_at DESC
      LIMIT 100`,
  );

  const sounds = rows.map((row) => ({
    id: row.id,
    title: row.title,
    artist: row.artist,
    thumbnail: row.thumbnail,
    duration: Number(row.duration),
    useCount: row.use_count,
  }));

  return res.json({ sounds });
});

musicRouter.get('/music/:songId', authMiddleware, async (req: Request, res: Response) => {
  const { rows: soundRows } = await query<{
    id: string;
    title: string;
    artist: string;
    thumbnail: string;
    duration: number;
    use_count: number;
  }>(`SELECT id, title, artist, thumbnail, duration, use_count FROM sounds WHERE id = $1 LIMIT 1`, [req.params.songId]);

  const sound = soundRows[0];
  if (!sound) return res.status(404).json({ code: 'not_found', message: 'Sound not found.' });

  const { rows: videoRows } = await query<FeedRow>(
    `SELECT v.id, v.url, v.thumbnail, v.duration, v.user_id,
            p.display_name, p.avatar_url, v.description, v.hashtags,
            v.views, v.likes, v.comments, v.created_at
       FROM videos v
       JOIN profiles p ON p.user_id = v.user_id
      WHERE v.privacy = 'public'
        AND v.music @> $2::jsonb
      ORDER BY v.created_at DESC
      LIMIT 20`,
    [req.params.songId, JSON.stringify({ id: req.params.songId })],
  );

  return res.json({
    sound: {
      id: sound.id,
      title: sound.title,
      artist: sound.artist,
      thumbnail: sound.thumbnail,
      duration: Number(sound.duration),
      useCount: sound.use_count,
    },
    videos: videoRows.map((row) => toVideo(row)),
  });
});
