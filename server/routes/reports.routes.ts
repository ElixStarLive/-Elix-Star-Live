import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { query } from '../lib/postgres.js';
import { authMiddleware } from '../http/authMiddleware.js';

const reportSchema = z.object({
  targetId: z.string().min(1),
  targetType: z.enum(['user', 'video', 'live_stream', 'comment']),
  reason: z.string().min(1),
  details: z.string().max(2000).optional(),
});

export const reportsRouter = Router();

reportsRouter.post('/reports', authMiddleware, async (req: Request, res: Response) => {
  const parsed = reportSchema.safeParse(req.body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return res.status(400).json({ code: 'invalid_request', message: first?.message ?? 'Invalid report.' });
  }

  const { targetId, targetType, reason, details = '' } = parsed.data;
  await query(
    `INSERT INTO reports (reporter_id, target_id, target_type, reason, details)
     VALUES ($1, $2, $3, $4, $5)`,
    [req.userId, targetId, targetType, reason, details],
  );

  return res.status(201).json({ success: true });
});
