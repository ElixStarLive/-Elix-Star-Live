import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
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

adminRouter.get('/progression', authMiddleware, requireAdmin, async (_req: Request, res: Response) => {
  const { rows } = await query<{
    user_id: string;
    username: string;
    display_name: string;
    current_level: number;
    total_xp: number;
  }>(
    `SELECT p.user_id, u.username, p.display_name, up.current_level, up.total_xp
       FROM user_progression up
       JOIN profiles p ON p.user_id = up.user_id
       JOIN users u ON u.id = up.user_id
      ORDER BY up.total_xp DESC
      LIMIT 100`,
  );

  const users = rows.map((row) => ({
    id: row.user_id,
    username: row.username,
    displayName: row.display_name,
    level: row.current_level,
    xp: Number(row.total_xp),
  }));

  return res.json({ users });
});

adminRouter.get('/rising-stars', authMiddleware, requireAdmin, async (_req: Request, res: Response) => {
  const { rows } = await query<{
    id: string;
    title: string;
    description: string;
    hashtag: string;
    start_at: Date;
    end_at: Date;
    is_active: boolean;
  }>(
    `SELECT id, title, description, hashtag, start_at, end_at, is_active
       FROM challenges
      ORDER BY is_active DESC, end_at DESC
      LIMIT 100`,
  );

  const challenges = rows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    hashtag: row.hashtag,
    startAt: row.start_at.toISOString(),
    endAt: row.end_at.toISOString(),
    isActive: row.is_active,
  }));

  return res.json({ challenges });
});

const createChallengeSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  hashtag: z.string().max(60).optional(),
  days: z.coerce.number().int().min(1).max(30).optional(),
});

adminRouter.post('/rising-stars', authMiddleware, requireAdmin, async (req: Request, res: Response) => {
  const parsed = createChallengeSchema.safeParse(req.body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return res.status(400).json({ code: 'invalid_request', message: first?.message ?? 'Invalid challenge.' });
  }

  const { title, description = '', hashtag = '', days = 7 } = parsed.data;
  const { rows } = await query<{ id: string }>(
    `INSERT INTO challenges (title, description, hashtag, end_at)
     VALUES ($1, $2, $3, NOW() + ($4 || ' days')::INTERVAL)
     RETURNING id`,
    [title, description, hashtag, days],
  );

  const row = rows[0];
  if (!row) return res.status(500).json({ code: 'server_error', message: 'Could not create challenge.' });
  return res.status(201).json({ id: row.id });
});

adminRouter.get('/payouts', authMiddleware, requireAdmin, async (_req: Request, res: Response) => {
  const { rows } = await query<{
    id: string;
    user_id: string;
    username: string;
    display_name: string;
    amount_gbp: number;
    status: string;
    created_at: Date;
  }>(
    `SELECT pr.id, pr.user_id, u.username, p.display_name, pr.amount_gbp, pr.status, pr.created_at
       FROM payout_requests pr
       JOIN users u ON u.id = pr.user_id
       JOIN profiles p ON p.user_id = pr.user_id
      ORDER BY pr.created_at DESC
      LIMIT 200`,
  );

  const requests = rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    username: row.username,
    displayName: row.display_name,
    amountGbp: Number(row.amount_gbp),
    status: row.status,
    createdAt: row.created_at.toISOString(),
  }));

  return res.json({ requests });
});

adminRouter.patch('/payouts/:requestId', authMiddleware, requireAdmin, async (req: Request, res: Response) => {
  const status = String(req.body.status);
  if (!['pending', 'approved', 'rejected'].includes(status)) {
    return res.status(400).json({ code: 'invalid_request', message: 'Invalid status.' });
  }

  await query(`UPDATE payout_requests SET status = $1 WHERE id = $2`, [status, req.params.requestId]);
  return res.json({ success: true });
});

adminRouter.get('/products', authMiddleware, requireAdmin, async (_req: Request, res: Response) => {
  const { rows } = await query<{
    id: string;
    name: string;
    description: string;
    price_gbp: number;
    image_url: string;
    stock: number;
    is_active: boolean;
  }>(
    `SELECT id, name, description, price_gbp, image_url, stock, is_active
       FROM products
      ORDER BY created_at DESC`,
  );

  const products = rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    priceGbp: Number(row.price_gbp),
    imageUrl: row.image_url,
    stock: row.stock,
    isActive: row.is_active,
  }));

  return res.json({ products });
});

const productSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  priceGbp: z.coerce.number().positive(),
  imageUrl: z.string().max(500).optional(),
  stock: z.coerce.number().int().min(0),
});

adminRouter.post('/products', authMiddleware, requireAdmin, async (req: Request, res: Response) => {
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return res.status(400).json({ code: 'invalid_request', message: first?.message ?? 'Invalid product.' });
  }

  const { name, description = '', priceGbp, imageUrl = '', stock } = parsed.data;
  const { rows } = await query<{ id: string }>(
    `INSERT INTO products (name, description, price_gbp, image_url, stock) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [name, description, priceGbp, imageUrl, stock],
  );

  const row = rows[0];
  if (!row) return res.status(500).json({ code: 'server_error', message: 'Could not create product.' });
  return res.status(201).json({ id: row.id });
});

adminRouter.get('/coin-purchases', authMiddleware, requireAdmin, async (_req: Request, res: Response) => {
  const { rows } = await query<{
    id: string;
    user_id: string;
    username: string;
    package_id: string;
    platform: string;
    platform_product_id: string;
    status: string;
    coins: number;
    created_at: Date;
  }>(
    `SELECT cp.id, cp.user_id, u.username, cp.package_id, cp.platform,
            cp.platform_product_id, cp.status, cp.coins, cp.created_at
       FROM coin_purchases cp
       JOIN users u ON u.id = cp.user_id
      ORDER BY cp.created_at DESC
      LIMIT 200`,
  );

  const purchases = rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    username: row.username,
    packageId: row.package_id,
    platform: row.platform,
    platformProductId: row.platform_product_id,
    status: row.status,
    coins: row.coins,
    createdAt: row.created_at.toISOString(),
  }));

  return res.json({ purchases });
});

adminRouter.get('/monetisation', authMiddleware, requireAdmin, async (_req: Request, res: Response) => {
  const { rows } = await query<{
    paid_gifts: number;
    paid_coins: number;
    shop_orders: number;
    approved_payouts: number;
  }>(
    `SELECT
       (SELECT COALESCE(SUM(financial_value_gbp), 0) FROM live_gifts WHERE source = 'paid') AS paid_gifts,
       (SELECT COALESCE(SUM(amount_gbp), 0) FROM payout_requests WHERE status = 'approved') AS approved_payouts,
       (SELECT COUNT(*) FROM coin_purchases WHERE status = 'completed') AS paid_coins,
       (SELECT COALESCE(SUM(p.price_gbp * so.quantity), 0)
          FROM shop_orders so
          JOIN products p ON p.id = so.product_id
         WHERE so.status = 'pending' OR so.status = 'completed') AS shop_orders`,
  );

  const row = rows[0];
  if (!row) return res.json({});

  return res.json({
    paidGiftsGbp: Number(row.paid_gifts),
    paidCoinsCount: Number(row.paid_coins),
    shopOrdersGbp: Number(row.shop_orders),
    approvedPayoutsGbp: Number(row.approved_payouts),
  });
});

adminRouter.get('/shop-orders', authMiddleware, requireAdmin, async (_req: Request, res: Response) => {
  const { rows } = await query<{
    id: string;
    user_id: string;
    username: string;
    product_name: string;
    quantity: number;
    status: string;
    created_at: Date;
  }>(
    `SELECT so.id, so.user_id, u.username, p.name AS product_name, so.quantity, so.status, so.created_at
       FROM shop_orders so
       JOIN users u ON u.id = so.user_id
       JOIN products p ON p.id = so.product_id
      ORDER BY so.created_at DESC
      LIMIT 200`,
  );

  const orders = rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    username: row.username,
    productName: row.product_name,
    quantity: row.quantity,
    status: row.status,
    createdAt: row.created_at.toISOString(),
  }));

  return res.json({ orders });
});
