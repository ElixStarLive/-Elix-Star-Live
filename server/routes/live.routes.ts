import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { query } from '../lib/postgres.js';
import { authMiddleware } from '../http/authMiddleware.js';

const startLiveSchema = z.object({
  title: z.string().max(120).optional(),
});

export const liveRouter = Router();

liveRouter.get('/live', authMiddleware, async (_req: Request, res: Response) => {
  const { rows } = await query<{
    id: string;
    user_id: string;
    title: string;
    display_name: string;
    avatar_url: string;
    viewer_count: number;
    started_at: Date;
  }>(
    `SELECT l.id, l.user_id, l.title, p.display_name, p.avatar_url, l.viewer_count, l.started_at
       FROM live_streams l
       JOIN profiles p ON p.user_id = l.user_id
      WHERE l.is_live = TRUE
        AND l.ended_at IS NULL
      ORDER BY l.started_at DESC
      LIMIT 50`,
  );

  const streams = rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    title: row.title,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    viewerCount: row.viewer_count,
    startedAt: row.started_at.toISOString(),
  }));

  return res.json({ streams });
});

liveRouter.get('/live/:streamId', authMiddleware, async (req: Request, res: Response) => {
  const { rows } = await query<{
    id: string;
    user_id: string;
    title: string;
    display_name: string;
    avatar_url: string;
    stream_key: string;
    viewer_count: number;
    started_at: Date;
  }>(
    `SELECT l.id, l.user_id, l.title, p.display_name, p.avatar_url, l.stream_key, l.viewer_count, l.started_at
       FROM live_streams l
       JOIN profiles p ON p.user_id = l.user_id
      WHERE l.id = $1
      LIMIT 1`,
    [req.params.streamId],
  );

  const row = rows[0];
  if (!row) {
    return res.status(404).json({ code: 'not_found', message: 'Stream not found.' });
  }

  return res.json({
    stream: {
      id: row.id,
      userId: row.user_id,
      title: row.title,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
      streamKey: row.stream_key,
      viewerCount: row.viewer_count,
      startedAt: row.started_at.toISOString(),
    },
  });
});

liveRouter.post('/live', authMiddleware, async (req: Request, res: Response) => {
  const parsed = startLiveSchema.safeParse(req.body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return res.status(400).json({ code: 'invalid_request', message: first?.message ?? 'Invalid live data.' });
  }

  const title = parsed.data.title ?? '';
  const { rows } = await query<{ id: string; stream_key: string }>(
    `INSERT INTO live_streams (user_id, title, stream_key)
     VALUES ($1, $2, $3)
     RETURNING id, stream_key`,
    [req.userId, title, crypto.randomUUID()],
  );

  const row = rows[0];
  if (!row) return res.status(500).json({ code: 'server_error', message: 'Could not start stream.' });
  return res.status(201).json({ id: row.id, streamKey: row.stream_key });
});

liveRouter.post('/live/:streamId/cohost', authMiddleware, async (req: Request, res: Response) => {
  const cohostId = String(req.body.cohostId);
  const { rows } = await query<{ user_id: string }>(
    `SELECT user_id FROM live_streams WHERE id = $1 AND is_live = TRUE LIMIT 1`,
    [req.params.streamId],
  );

  const stream = rows[0];
  if (!stream) return res.status(404).json({ code: 'not_found', message: 'Stream not found.' });
  if (stream.user_id !== req.userId) {
    return res.status(403).json({ code: 'forbidden', message: 'Only the stream owner can invite a co-host.' });
  }

  await query(`UPDATE live_streams SET cohost_id = $1 WHERE id = $2`, [cohostId, req.params.streamId]);
  return res.json({ success: true });
});
