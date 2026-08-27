import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { query } from '../lib/postgres.js';
import { authMiddleware } from '../http/authMiddleware.js';

const purchaseSchema = z.object({
  packageId: z.string().min(1).optional(),
  platformProductId: z.string().min(1),
  receiptToken: z.string().min(1),
  platform: z.enum(['ios', 'android']).optional(),
});

export const coinsRouter = Router();

coinsRouter.get('/coin-packages', authMiddleware, async (_req: Request, res: Response) => {
  const { rows } = await query<{
    id: string;
    platform: string;
    name: string;
    coins: number;
    price_gbp: number;
    product_id: string;
  }>(
    `SELECT id, platform, name, coins, price_gbp, product_id
       FROM coin_packages
      WHERE is_active = TRUE
      ORDER BY price_gbp ASC`,
  );

  const packages = rows.map((row) => ({
    id: row.id,
    platform: row.platform,
    name: row.name,
    coins: row.coins,
    priceGbp: Number(row.price_gbp),
    productId: row.product_id,
  }));

  return res.json({ packages });
});

coinsRouter.post('/coin-purchases', authMiddleware, async (req: Request, res: Response) => {
  const parsed = purchaseSchema.safeParse(req.body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return res.status(400).json({ code: 'invalid_request', message: first?.message ?? 'Invalid purchase data.' });
  }

  const { packageId, platformProductId, receiptToken, platform = 'android' } = parsed.data;

  const packageRow = packageId
    ? (await query<{ coins: number }>('SELECT coins FROM coin_packages WHERE id = $1 AND is_active = TRUE', [packageId])).rows[0]
    : undefined;

  const coins = packageRow?.coins ?? 0;
  const { rows } = await query<{ id: string }>(
    `INSERT INTO coin_purchases (user_id, package_id, platform, platform_product_id, receipt_token, coins)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [req.userId, packageId ?? null, platform, platformProductId, receiptToken, coins],
  );

  const row = rows[0];
  if (!row) return res.status(500).json({ code: 'server_error', message: 'Could not record purchase.' });
  return res.status(201).json({ id: row.id, status: 'pending', coins });
});
