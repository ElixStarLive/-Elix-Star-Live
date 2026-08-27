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
