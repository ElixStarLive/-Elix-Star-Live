import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { query } from '../lib/postgres.js';
import { authMiddleware } from '../http/authMiddleware.js';

const orderSchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().int().min(1).max(100),
});

export const shopRouter = Router();

shopRouter.get('/shop/products', authMiddleware, async (_req: Request, res: Response) => {
  const { rows } = await query<{
    id: string;
    name: string;
    description: string;
    price_gbp: number;
    image_url: string;
    stock: number;
  }>(
    `SELECT id, name, description, price_gbp, image_url, stock
       FROM products
      WHERE is_active = TRUE
      ORDER BY created_at DESC`,
  );

  const products = rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    priceGbp: Number(row.price_gbp),
    imageUrl: row.image_url,
    stock: row.stock,
  }));

  return res.json({ products });
});

shopRouter.post('/shop/orders', authMiddleware, async (req: Request, res: Response) => {
  const parsed = orderSchema.safeParse(req.body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return res.status(400).json({ code: 'invalid_request', message: first?.message ?? 'Invalid order.' });
  }

  const { productId, quantity } = parsed.data;
  const { rows } = await query<{ stock: number }>(
    `SELECT stock FROM products WHERE id = $1 AND is_active = TRUE LIMIT 1`,
    [productId],
  );

  const product = rows[0];
  if (!product) return res.status(404).json({ code: 'not_found', message: 'Product not found.' });
  if (product.stock < quantity) {
    return res.status(409).json({ code: 'out_of_stock', message: 'Not enough stock.' });
  }

  const { rows: orderRows } = await query<{ id: string }>(
    `INSERT INTO shop_orders (user_id, product_id, quantity) VALUES ($1, $2, $3) RETURNING id`,
    [req.userId, productId, quantity],
  );

  const order = orderRows[0];
  if (!order) return res.status(500).json({ code: 'server_error', message: 'Could not create order.' });

  await query(`UPDATE products SET stock = stock - $1 WHERE id = $2`, [quantity, productId]);
  return res.status(201).json({ id: order.id });
});
