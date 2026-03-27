import { Request, Response } from 'express';
import { getPool } from '../lib/postgres';
import { getTokenFromRequest, verifyAuthToken } from './auth';
import { logger } from '../lib/logger';

function getUserId(req: Request): string | null {
  const token = getTokenFromRequest(req);
  if (!token) return null;
  const payload = verifyAuthToken(token);
  return payload?.sub ?? null;
}

async function ensurePayoutTables(): Promise<void> {
  const db = getPool();
  if (!db) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS elix_creator_balances (
      user_id TEXT PRIMARY KEY,
      pending_coins BIGINT NOT NULL DEFAULT 0,
      available_coins BIGINT NOT NULL DEFAULT 0,
      locked_coins BIGINT NOT NULL DEFAULT 0,
      total_earned BIGINT NOT NULL DEFAULT 0,
      total_withdrawn BIGINT NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS elix_creator_earnings (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      creator_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      coins INTEGER NOT NULL DEFAULT 0,
      gift_id TEXT,
      room_id TEXT,
      sender_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_elix_creator_earnings_user ON elix_creator_earnings (creator_id, created_at DESC)`);
  await db.query(`
    CREATE TABLE IF NOT EXISTS elix_payout_requests (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      user_id TEXT NOT NULL,
      coins_amount BIGINT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      payout_method_id TEXT,
      admin_note TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      processed_at TIMESTAMPTZ
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS elix_payout_methods (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      details JSONB NOT NULL DEFAULT '{}',
      is_default BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

let tablesReady = false;
async function ensureTables(): Promise<void> {
  if (tablesReady) return;
  await ensurePayoutTables();
  tablesReady = true;
}

export async function handleGetCreatorBalance(req: Request, res: Response) {
  const db = getPool();
  if (!db) return res.status(503).json({ error: 'Database not configured' });
  try {
    await ensureTables();
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const r = await db.query(
      `SELECT pending_coins, available_coins, locked_coins, total_earned, total_withdrawn
       FROM elix_creator_balances WHERE user_id = $1`, [userId],
    );
    if (r.rows.length === 0) {
      return res.json({ pending_coins: 0, available_coins: 0, locked_coins: 0, total_earned: 0, total_withdrawn: 0 });
    }
    const b = r.rows[0];
    return res.json({
      pending_coins: Number(b.pending_coins),
      available_coins: Number(b.available_coins),
      locked_coins: Number(b.locked_coins),
      total_earned: Number(b.total_earned),
      total_withdrawn: Number(b.total_withdrawn),
    });
  } catch (err) {
    logger.error({ err }, 'Get creator balance error');
    return res.status(500).json({ error: 'Failed to get balance' });
  }
}

export async function handleGetCreatorEarnings(req: Request, res: Response) {
  const db = getPool();
  if (!db) return res.status(503).json({ error: 'Database not configured' });
  try {
    await ensureTables();
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    const r = await db.query(
      `SELECT * FROM elix_creator_earnings WHERE creator_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [userId, limit, offset],
    );
    return res.json({ earnings: r.rows });
  } catch (err) {
    logger.error({ err }, 'Get creator earnings error');
    return res.status(500).json({ error: 'Failed to get earnings' });
  }
}

export async function handleCreatorWithdraw(req: Request, res: Response) {
  const db = getPool();
  if (!db) return res.status(503).json({ error: 'Database not configured' });
  try {
    await ensureTables();
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { coins_amount, payout_method_id } = req.body;
    if (!coins_amount || coins_amount <= 0) return res.status(400).json({ error: 'Invalid amount' });

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const balR = await client.query(
        `SELECT available_coins FROM elix_creator_balances WHERE user_id = $1 FOR UPDATE`, [userId],
      );
      const available = balR.rows.length ? Number(balR.rows[0].available_coins) : 0;
      if (available < coins_amount) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Insufficient available balance' });
      }
      await client.query(
        `UPDATE elix_creator_balances SET available_coins = available_coins - $2, locked_coins = locked_coins + $2, updated_at = NOW()
         WHERE user_id = $1`, [userId, coins_amount],
      );
      const ins = await client.query(
        `INSERT INTO elix_payout_requests (user_id, coins_amount, payout_method_id, status)
         VALUES ($1, $2, $3, 'pending') RETURNING *`,
        [userId, coins_amount, payout_method_id || null],
      );
      await client.query('COMMIT');
      return res.json({ payout: ins.rows[0] });
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    logger.error({ err }, 'Creator withdraw error');
    return res.status(500).json({ error: 'Withdrawal failed' });
  }
}

export async function handleGetCreatorPayouts(req: Request, res: Response) {
  const db = getPool();
  if (!db) return res.status(503).json({ error: 'Database not configured' });
  try {
    await ensureTables();
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const r = await db.query(
      `SELECT * FROM elix_payout_requests WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`, [userId],
    );
    return res.json({ payouts: r.rows });
  } catch (err) {
    logger.error({ err }, 'Get creator payouts error');
    return res.status(500).json({ error: 'Failed to get payouts' });
  }
}

export async function handleSetPayoutMethod(req: Request, res: Response) {
  const db = getPool();
  if (!db) return res.status(503).json({ error: 'Database not configured' });
  try {
    await ensureTables();
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { type, details } = req.body;
    if (!type || !details) return res.status(400).json({ error: 'type and details required' });

    await db.query(`UPDATE elix_payout_methods SET is_default = false WHERE user_id = $1`, [userId]);
    const r = await db.query(
      `INSERT INTO elix_payout_methods (user_id, type, details, is_default) VALUES ($1, $2, $3::jsonb, true) RETURNING *`,
      [userId, type, JSON.stringify(details)],
    );
    return res.json(r.rows[0]);
  } catch (err) {
    logger.error({ err }, 'Set payout method error');
    return res.status(500).json({ error: 'Failed to set payout method' });
  }
}

export async function handleGetPayoutMethods(req: Request, res: Response) {
  const db = getPool();
  if (!db) return res.status(503).json({ error: 'Database not configured' });
  try {
    await ensureTables();
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const r = await db.query(
      `SELECT * FROM elix_payout_methods WHERE user_id = $1 ORDER BY is_default DESC`, [userId],
    );
    return res.json({ methods: r.rows });
  } catch (err) {
    logger.error({ err }, 'Get payout methods error');
    return res.status(500).json({ error: 'Failed to get payout methods' });
  }
}

// ═══ ADMIN ENDPOINTS ═══

async function requireAdmin(req: Request, db: ReturnType<typeof getPool>): Promise<string | null> {
  const userId = getUserId(req);
  if (!userId || !db) return null;
  const r = await db.query(`SELECT is_admin FROM profiles WHERE user_id = $1`, [userId]);
  if (r.rows.length === 0 || !r.rows[0].is_admin) return null;
  return userId;
}

export async function handleAdminListPayouts(req: Request, res: Response) {
  const db = getPool();
  if (!db) return res.status(503).json({ error: 'Database not configured' });
  try {
    await ensureTables();
    const adminId = await requireAdmin(req, db);
    if (!adminId) return res.status(403).json({ error: 'Admin only' });

    const status = (req.query.status as string) || 'pending';
    const r = await db.query(
      `SELECT p.*, pr.username, pr.display_name, pr.avatar_url
       FROM elix_payout_requests p LEFT JOIN profiles pr ON pr.user_id = p.user_id
       WHERE p.status = $1 ORDER BY p.created_at ASC LIMIT 100`, [status],
    );
    return res.json({ payouts: r.rows });
  } catch (err) {
    logger.error({ err }, 'Admin list payouts error');
    return res.status(500).json({ error: 'Failed to list payouts' });
  }
}

export async function handleAdminApprovePayout(req: Request, res: Response) {
  const db = getPool();
  if (!db) return res.status(503).json({ error: 'Database not configured' });
  try {
    await ensureTables();
    const adminId = await requireAdmin(req, db);
    if (!adminId) return res.status(403).json({ error: 'Admin only' });

    const requestId = req.params.id;
    const { admin_note } = req.body;

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const pr = await client.query(
        `UPDATE elix_payout_requests SET status = 'approved', admin_note = $2, processed_at = NOW()
         WHERE id = $1 AND status = 'pending' RETURNING *`, [requestId, admin_note || null],
      );
      if (pr.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Payout not found or already processed' });
      }
      const payout = pr.rows[0];
      await client.query(
        `UPDATE elix_creator_balances SET locked_coins = locked_coins - $2, total_withdrawn = total_withdrawn + $2, updated_at = NOW()
         WHERE user_id = $1`, [payout.user_id, payout.coins_amount],
      );
      await client.query('COMMIT');
      return res.json({ payout: pr.rows[0] });
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    logger.error({ err }, 'Admin approve payout error');
    return res.status(500).json({ error: 'Failed to approve payout' });
  }
}

export async function handleAdminRejectPayout(req: Request, res: Response) {
  const db = getPool();
  if (!db) return res.status(503).json({ error: 'Database not configured' });
  try {
    await ensureTables();
    const adminId = await requireAdmin(req, db);
    if (!adminId) return res.status(403).json({ error: 'Admin only' });

    const requestId = req.params.id;
    const { admin_note } = req.body;

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const pr = await client.query(
        `UPDATE elix_payout_requests SET status = 'rejected', admin_note = $2, processed_at = NOW()
         WHERE id = $1 AND status = 'pending' RETURNING *`, [requestId, admin_note || null],
      );
      if (pr.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Payout not found or already processed' });
      }
      const payout = pr.rows[0];
      await client.query(
        `UPDATE elix_creator_balances SET locked_coins = locked_coins - $2, available_coins = available_coins + $2, updated_at = NOW()
         WHERE user_id = $1`, [payout.user_id, payout.coins_amount],
      );
      await client.query('COMMIT');
      return res.json({ payout: pr.rows[0] });
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    logger.error({ err }, 'Admin reject payout error');
    return res.status(500).json({ error: 'Failed to reject payout' });
  }
}

export async function handleAdminChargeback(req: Request, res: Response) {
  const db = getPool();
  if (!db) return res.status(503).json({ error: 'Database not configured' });
  try {
    await ensureTables();
    const adminId = await requireAdmin(req, db);
    if (!adminId) return res.status(403).json({ error: 'Admin only' });

    const { gift_tx_id } = req.body;
    if (!gift_tx_id) return res.status(400).json({ error: 'gift_tx_id required' });

    const r = await db.query(
      `UPDATE elix_creator_earnings SET status = 'reversed' WHERE id = $1 AND status = 'pending' RETURNING *`,
      [gift_tx_id],
    );
    if (r.rowCount === 0) return res.status(400).json({ error: 'Earning not found or already processed' });
    const earning = r.rows[0];
    await db.query(
      `UPDATE elix_creator_balances SET pending_coins = GREATEST(0, pending_coins - $2), updated_at = NOW()
       WHERE user_id = $1`, [earning.creator_id, earning.coins],
    );
    return res.json({ reversed: r.rows[0] });
  } catch (err) {
    logger.error({ err }, 'Admin chargeback error');
    return res.status(500).json({ error: 'Chargeback failed' });
  }
}

