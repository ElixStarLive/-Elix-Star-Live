import { Router, type Request, type Response, type NextFunction } from 'express';
import { query } from '../lib/postgres.js';
import { authMiddleware } from '../http/authMiddleware.js';

export const adminRouter = Router();

async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const userId = req.userId;
  if (!userId) {
    return res.status(401).json({ code: 'unauthenticated', message: 'Sign in to continue.' });
  }

  const { rows } = await query<{ is_admin: boolean }>(`SELECT is_admin FROM profiles WHERE user_id = $1`, [userId]);
  if (!rows[0]?.is_admin) {
    return res.status(403).json({ code: 'forbidden', message: 'Admin access only.' });
  }
  return next();
}

adminRouter.get('/admin/users', authMiddleware, requireAdmin, async (_req: Request, res: Response) => {
  const { rows } = await query<
    {
      user_id: string;
      username: string;
      display_name: string;
      email: string;
      is_verified: boolean;
      banned_until: Date | null;
      created_at: Date;
    }
  >(
    `SELECT p.user_id, u.username, p.display_name, u.email, p.is_verified, p.banned_until, p.created_at
       FROM profiles p
       JOIN users u ON u.id = p.user_id
      ORDER BY p.created_at DESC
      LIMIT 200`,
  );

  const users = rows.map((row) => ({
    id: row.user_id,
    username: row.username,
    displayName: row.display_name,
    email: row.email,
    isVerified: row.is_verified,
    bannedUntil: row.banned_until?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
  }));

  return res.json({ users });
});

adminRouter.get('/reports', authMiddleware, requireAdmin, async (_req: Request, res: Response) => {
  const { rows } = await query<{
    id: string;
    reporter_id: string;
    target_id: string;
    target_type: string;
    reason: string;
    status: string;
    created_at: Date;
  }>(
    `SELECT id, reporter_id, target_id, target_type, reason, status, created_at
       FROM reports
      ORDER BY created_at DESC
      LIMIT 200`,
  );

  const reports = rows.map((row) => ({
    id: row.id,
    reporterId: row.reporter_id,
    targetId: row.target_id,
    targetType: row.target_type,
    reason: row.reason,
    status: row.status,
    createdAt: row.created_at.toISOString(),
  }));

  return res.json({ reports });
});

adminRouter.get('/economy', authMiddleware, requireAdmin, async (_req: Request, res: Response) => {
  const { rows } = await query<{
    videos: number;
    users: number;
    follows: number;
    likes: number;
    comments: number;
    live_streams: number;
    reports: number;
  }>(
    `SELECT
       (SELECT COUNT(*) FROM videos) AS videos,
       (SELECT COUNT(*) FROM users) AS users,
       (SELECT COUNT(*) FROM follows) AS follows,
       (SELECT COUNT(*) FROM likes) AS likes,
       (SELECT COUNT(*) FROM comments) AS comments,
       (SELECT COUNT(*) FROM live_streams WHERE is_live = TRUE) AS live_streams,
       (SELECT COUNT(*) FROM reports) AS reports`,
  );

  const row = rows[0];
  if (!row) return res.json({});

  return res.json({
    videos: Number(row.videos),
    users: Number(row.users),
    follows: Number(row.follows),
    likes: Number(row.likes),
    comments: Number(row.comments),
    liveStreams: Number(row.live_streams),
    reports: Number(row.reports),
  });
});
