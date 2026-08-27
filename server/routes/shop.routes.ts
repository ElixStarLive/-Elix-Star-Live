import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import Stripe from 'stripe';
import { config } from '../config.js';
import { query } from '../lib/postgres.js';
import { authMiddleware } from '../http/authMiddleware.js';

const orderSchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().int().min(1).max(100),
});

const stripe = config.STRIPE_SECRET_KEY
  ? new Stripe(config.STRIPE_SECRET_KEY, { apiVersion: '2026-07-29.dahlia' })
  : null;

export const shopRouter = Router();

function integrationIdentifier(): string {
  const suffix = Array.from({ length: 8 }, () => 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)]).join('');
  return `elix_shop_${suffix}`;
}

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
  if (!stripe) {
    return res.status(503).json({ code: 'not_configured', message: 'Stripe is not configured.' });
  }

  const parsed = orderSchema.safeParse(req.body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return res.status(400).json({ code: 'invalid_request', message: first?.message ?? 'Invalid order.' });
  }

  const { productId, quantity } = parsed.data;
  const { rows } = await query<{
    id: string;
    name: string;
    description: string;
    price_gbp: number;
    image_url: string;
    stock: number;
  }>(
    `SELECT id, name, description, price_gbp, image_url, stock
       FROM products WHERE id = $1 AND is_active = TRUE LIMIT 1`,
    [productId],
  );

  const product = rows[0];
  if (!product) return res.status(404).json({ code: 'not_found', message: 'Product not found.' });
  if (product.stock < quantity) {
    return res.status(409).json({ code: 'out_of_stock', message: 'Not enough stock.' });
  }

  const unitAmount = Math.round(Number(product.price_gbp) * 100);
  const { rows: orderRows } = await query<{ id: string }>(
    `INSERT INTO shop_orders (user_id, product_id, quantity) VALUES ($1, $2, $3) RETURNING id`,
    [req.userId, productId, quantity],
  );

  const order = orderRows[0];
  if (!order) return res.status(500).json({ code: 'server_error', message: 'Could not create order.' });

  await query(`UPDATE products SET stock = stock - $1 WHERE id = $2`, [quantity, productId]);

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    client_reference_id: order.id,
    line_items: [
      {
        price_data: {
          currency: 'gbp',
          product_data: {
            name: product.name,
            ...(product.description ? { description: product.description } : {}),
            ...(product.image_url ? { images: [product.image_url] } : {}),
          },
          unit_amount: unitAmount,
        },
        quantity,
      },
    ],
    success_url: `${config.APP_ORIGIN}/shop/success?order=${order.id}`,
    cancel_url: `${config.APP_ORIGIN}/shop?cancelled=1`,
    integration_identifier: integrationIdentifier(),
  });

  await query(`UPDATE shop_orders SET stripe_session_id = $1 WHERE id = $2`, [session.id, order.id]);

  return res.status(201).json({ id: order.id, checkoutUrl: session.url });
});

shopRouter.post('/shop/webhook', async (req: Request, res: Response) => {
  if (!stripe || !config.STRIPE_WEBHOOK_SECRET) {
    return res.status(503).json({ code: 'not_configured', message: 'Stripe is not configured.' });
  }

  const sig = req.headers['stripe-signature'] as string | undefined;
  if (!sig) return res.status(400).json({ code: 'missing_signature', message: 'Missing Stripe signature.' });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body as string, sig, config.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid signature.';
    return res.status(400).json({ code: 'invalid_signature', message });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.client_reference_id) {
      await query(`UPDATE shop_orders SET status = 'completed' WHERE id = $1`, [session.client_reference_id]);
    }
  }

  if (event.type === 'checkout.session.expired') {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.client_reference_id) {
      const { rows } = await query<{ product_id: string; quantity: number; status: string }>(
        `SELECT product_id, quantity, status FROM shop_orders WHERE id = $1`,
        [session.client_reference_id],
      );
      const order = rows[0];
      if (order && order.status !== 'completed') {
        await query(`UPDATE products SET stock = stock + $1 WHERE id = $2`, [order.quantity, order.product_id]);
        await query(`UPDATE shop_orders SET status = 'cancelled' WHERE id = $1`, [session.client_reference_id]);
      }
    }
  }

  return res.json({ received: true });
});
