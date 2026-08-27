import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { query } from '../lib/postgres.js';
import { authMiddleware } from '../http/authMiddleware.js';

const startBattleSchema = z.object({
  creatorStreamId: z.string().min(1),
  opponentStreamId: z.string().min(1),
});

const tapSchema = z.object({
  side: z.enum(['creator', 'opponent']),
});

export const battleRouter = Router();

battleRouter.post('/battles', authMiddleware, async (req: Request, res: Response) => {
  const parsed = startBattleSchema.safeParse(req.body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return res.status(400).json({ code: 'invalid_request', message: first?.message ?? 'Invalid battle data.' });
  }

  const { creatorStreamId, opponentStreamId } = parsed.data;
  const { rows } = await query<{ id: string }>(
    `INSERT INTO battles (creator_stream_id, opponent_stream_id)
     VALUES ($1, $2) RETURNING id`,
    [creatorStreamId, opponentStreamId],
  );

  const row = rows[0];
  if (!row) return res.status(500).json({ code: 'server_error', message: 'Could not start battle.' });
  return res.status(201).json({ id: row.id });
});

battleRouter.get('/battles/:battleId', async (req: Request, res: Response) => {
  const { rows } = await query<{
    id: string;
    creator_stream_id: string;
    opponent_stream_id: string;
    creator_score: number;
    opponent_score: number;
    is_active: boolean;
    started_at: Date;
  }>(
    `SELECT id, creator_stream_id, opponent_stream_id, creator_score, opponent_score, is_active, started_at
       FROM battles WHERE id = $1 LIMIT 1`,
    [req.params.battleId],
  );

  const battle = rows[0];
  if (!battle) return res.status(404).json({ code: 'not_found', message: 'Battle not found.' });

  return res.json({
    id: battle.id,
    creatorStreamId: battle.creator_stream_id,
    opponentStreamId: battle.opponent_stream_id,
    creatorScore: battle.creator_score,
    opponentScore: battle.opponent_score,
    isActive: battle.is_active,
    startedAt: battle.started_at.toISOString(),
  });
});

battleRouter.post('/battles/:battleId/tap', authMiddleware, async (req: Request, res: Response) => {
  const parsed = tapSchema.safeParse(req.body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return res.status(400).json({ code: 'invalid_request', message: first?.message ?? 'Invalid tap.' });
  }

  const { side } = parsed.data;
  const scoreColumn = side === 'creator' ? 'creator_score' : 'opponent_score';

  await query(
    `INSERT INTO battle_taps (battle_id, user_id, side, points) VALUES ($1, $2, $3, 5)
     ON CONFLICT (battle_id, user_id, side) DO NOTHING`,
    [req.params.battleId, req.userId, side],
  );

  await query(
    `UPDATE battles SET ${scoreColumn} = ${scoreColumn} + 5 WHERE id = $1`,
    [req.params.battleId],
  );

  const { rows } = await query<{
    creator_score: number;
    opponent_score: number;
  }>(`SELECT creator_score, opponent_score FROM battles WHERE id = $1`, [req.params.battleId]);

  const row = rows[0];
  if (!row) return res.status(404).json({ code: 'not_found', message: 'Battle not found.' });
  return res.json({
    creatorScore: row.creator_score,
    opponentScore: row.opponent_score,
    pointsAdded: 5,
  });
});
