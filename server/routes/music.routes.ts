import { Router, type Request, type Response } from 'express';
import { query } from '../lib/postgres.js';
import { authMiddleware } from '../http/authMiddleware.js';

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
