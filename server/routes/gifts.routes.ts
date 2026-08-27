import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { query } from '../lib/postgres.js';
import { authMiddleware } from '../http/authMiddleware.js';

const sendGiftSchema = z.object({
  giftId: z.string().min(1),
  source: z.enum(['test', 'paid']).optional(),
});

export const giftsRouter = Router();

giftsRouter.get('/gifts', authMiddleware, async (_req: Request, res: Response) => {
  const { rows } = await query<{
    id: string;
    name: string;
    animation: string;
    battle_points: number;
    financial_value_gbp: number;
  }>(
    `SELECT id, name, animation, battle_points, financial_value_gbp
       FROM gift_packages
      WHERE is_active = TRUE
      ORDER BY battle_points ASC`,
  );

  const gifts = rows.map((row) => ({
    id: row.id,
    name: row.name,
    animation: row.animation,
    battlePoints: row.battle_points,
    financialValueGbp: Number(row.financial_value_gbp),
  }));

  return res.json({ gifts });
});

giftsRouter.post('/live/:streamId/gifts', authMiddleware, async (req: Request, res: Response) => {
  const parsed = sendGiftSchema.safeParse(req.body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return res.status(400).json({ code: 'invalid_request', message: first?.message ?? 'Invalid gift.' });
  }

  const { giftId, source = 'test' } = parsed.data;
  const { rows } = await query<{
    battle_points: number;
    financial_value_gbp: number;
  }>(
    `SELECT battle_points, financial_value_gbp FROM gift_packages WHERE id = $1 AND is_active = TRUE LIMIT 1`,
    [giftId],
  );

  const gift = rows[0];
  if (!gift) return res.status(404).json({ code: 'not_found', message: 'Gift not found.' });

  const financial = source === 'paid' ? gift.financial_value_gbp : 0;
  const points = gift.battle_points;

  if (source === 'paid' && financial > 0) {
    return res.status(503).json({
      code: 'not_configured',
      message: 'Paid gifts require in-app purchase verification. Use test coins for now.',
    });
  }

  await query(
    `INSERT INTO live_gifts (stream_id, sender_id, gift_id, source, battle_points)
     VALUES ($1, $2, $3, $4, $5)`,
    [req.params.streamId, req.userId, giftId, source, points],
  );

  // Add points to any active battle the stream is in.
  await query(
    `UPDATE battles
        SET creator_score = creator_score + $1
      WHERE creator_stream_id = $2 AND is_active = TRUE;
     UPDATE battles
        SET opponent_score = opponent_score + $1
      WHERE opponent_stream_id = $2 AND is_active = TRUE`,
    [points, req.params.streamId],
  );

  return res.status(201).json({
    giftId,
    points,
    source,
    financialValueGbp: financial,
  });
});
