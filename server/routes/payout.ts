import { Request, Response } from 'express';
import { getPool } from '../lib/postgres';
import { getTokenFromRequest, verifyAuthToken } from './auth';
import { logger } from '../lib/logger';
import { isEmailConfigured } from '../lib/email';

function getUserId(req: Request): string | null {
  const token = getTokenFromRequest(req);
  if (!token) return null;
  const payload = verifyAuthToken(token);
  return payload?.sub ?? null;
}

async function ensurePayoutTables(): Promise<void> {
  const db = getPool();
  if (!db) return;
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
    res.setHeader("Cache-Control", "private, no-store");
    const coinBal =
      r.rows.length === 0
        ? { pending_coins: 0, available_coins: 0, locked_coins: 0, total_earned: 0, total_withdrawn: 0 }
        : {
            pending_coins: Number(r.rows[0].pending_coins),
            available_coins: Number(r.rows[0].available_coins),
            locked_coins: Number(r.rows[0].locked_coins),
            total_earned: Number(r.rows[0].total_earned),
            total_withdrawn: Number(r.rows[0].total_withdrawn),
          };

    let gbp = {
      pending_pence: 0,
      available_pence: 0,
      withdrawn_pence: 0,
      reversed_pence: 0,
      held_pence: 0,
    };
    try {
      const g = await db.query(
        `SELECT pending_pence, available_pence, withdrawn_pence, reversed_pence, held_pence
           FROM elix_creator_wallet_gbp WHERE user_id = $1`,
        [userId],
      );
      if (g.rows[0]) {
        gbp = {
          pending_pence: Number(g.rows[0].pending_pence) || 0,
          available_pence: Number(g.rows[0].available_pence) || 0,
          withdrawn_pence: Number(g.rows[0].withdrawn_pence) || 0,
          reversed_pence: Number(g.rows[0].reversed_pence) || 0,
          held_pence: Number(g.rows[0].held_pence) || 0,
        };
      }
    } catch {
      /* migration may not be applied yet */
    }

    let rewards = {
      qualified_views_30d: 0,
      current_reward_pence: 0,
      next_milestone_views: null as number | null,
      next_milestone_reward_pence: null as number | null,
    };
    try {
      const { calculateCreatorRewardPence } = await import('../lib/monetisation/creatorRewardsMath');
      const { loadMonetisationConfig } = await import('../lib/monetisation/config');
      const cfg = await loadMonetisationConfig();
      const qv = await db.query(
        `SELECT COUNT(*)::bigint AS c FROM elix_qualified_video_views
          WHERE creator_user_id = $1
            AND first_qualified_at >= NOW() - interval '30 days'`,
        [userId],
      );
      const qualified = Math.floor(Number(qv.rows[0]?.c) || 0);
      const calc = calculateCreatorRewardPence(
        qualified,
        cfg.milestones,
        cfg.rewardsMaxPencePerCreator,
      );
      rewards = {
        qualified_views_30d: qualified,
        current_reward_pence: calc.rewardPence,
        next_milestone_views: calc.nextMilestoneViews,
        next_milestone_reward_pence: calc.nextMilestoneRewardPence,
      };
    } catch {
      /* optional until migration */
    }

    const earningsBySource = {
      gifts_pence: 0,
      subscriptions_pence: 0,
      rewards_pence: 0,
      reversals_pence: 0,
    };
    let activeSubscribers = 0;
    try {
      const bySrc = await db.query(
        `SELECT revenue_source,
                COALESCE(SUM(creator_amount_pence),0)::bigint AS pence
           FROM elix_financial_ledger
          WHERE creator_user_id = $1 AND creator_amount_pence > 0
          GROUP BY revenue_source`,
        [userId],
      );
      for (const row of bySrc.rows) {
        const src = String(row.revenue_source);
        const p = Math.floor(Number(row.pence) || 0);
        if (src === 'PAID_GIFT') earningsBySource.gifts_pence = p;
        if (src === 'CREATOR_SUBSCRIPTION') earningsBySource.subscriptions_pence = p;
        if (src === 'CREATOR_REWARD') earningsBySource.rewards_pence = p;
        if (src === 'REFUND_REVERSAL' || src === 'CHARGEBACK_REVERSAL') {
          earningsBySource.reversals_pence += p;
        }
      }
      const subs = await db.query(
        `SELECT COUNT(*)::int AS c FROM elix_membership_purchases
          WHERE creator_id = $1
            AND subscription_state IN ('ACTIVE', 'IN_GRACE_PERIOD')
            AND (expires_at IS NULL OR expires_at > NOW())`,
        [userId],
      );
      activeSubscribers = Math.floor(Number(subs.rows[0]?.c) || 0);
    } catch {
      /* optional */
    }

    return res.json({
      ...coinBal,
      gbp,
      rewards,
      earnings_by_source: earningsBySource,
      active_subscribers: activeSubscribers,
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
    res.setHeader("Cache-Control", "private, no-store");
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

    // Withdrawals require a confirmed email when mail is configured.
    try {
      if (isEmailConfigured()) {
        const conf = await db.query(
          `SELECT email_confirmed_at FROM elix_auth_users WHERE id = $1 LIMIT 1`,
          [userId],
        );
        const confirmed = conf.rows[0]?.email_confirmed_at;
        if (!confirmed) {
          return res.status(403).json({
            error: 'Please confirm your email before requesting a payout.',
          });
        }
      }
    } catch (err) {
      logger.warn({ err, userId }, 'payout email-confirm check skipped');
    }

      const { coins_amount, payout_method_id } = req.body;
    const amt = Math.floor(Number(coins_amount));
    if (!Number.isFinite(amt) || amt <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    const methodId: string | null =
      typeof payout_method_id === 'string' && payout_method_id.trim()
        ? payout_method_id.trim()
        : null;
    if (methodId) {
      const owned = await db.query(
        `SELECT id FROM elix_payout_methods WHERE id = $1 AND user_id = $2 LIMIT 1`,
        [methodId, userId],
      );
      if (!owned.rowCount) {
        return res.status(400).json({ error: 'Invalid payout method' });
      }
    }

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const balR = await client.query(
        `SELECT available_coins FROM elix_creator_balances WHERE user_id = $1 FOR UPDATE`, [userId],
      );
      const available = balR.rows.length ? Number(balR.rows[0].available_coins) : 0;
      if (available < amt) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Insufficient available balance' });
      }
      await client.query(
        `UPDATE elix_creator_balances SET available_coins = available_coins - $2, locked_coins = locked_coins + $2, updated_at = NOW()
         WHERE user_id = $1`, [userId, amt],
      );
      const ins = await client.query(
        `INSERT INTO elix_payout_requests (user_id, coins_amount, payout_method_id, status)
         VALUES ($1, $2, $3, 'pending') RETURNING *`,
        [userId, amt, methodId],
      );
      await client.query('COMMIT');
      return res.json({ payout: ins.rows[0] });
    } catch (e) {
      await client.query('ROLLBACK').catch((re) => logger.warn({ err: re }, "ROLLBACK failed"));
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
    res.setHeader("Cache-Control", "private, no-store");
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
    res.setHeader("Cache-Control", "private, no-store");
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
  res.setHeader("Cache-Control", "private, no-store");
  const db = getPool();
  if (!db) return res.status(503).json({ error: 'Database not configured' });
  try {
    await ensureTables();
    const adminId = await requireAdmin(req, db);
    if (!adminId) return res.status(403).json({ error: 'Admin only' });

    const status = (req.query.status as string) || 'pending';
    const allowed = new Set([
      'pending',
      'under_review',
      'approved',
      'paid_manually',
      'rejected',
      'cancelled',
      'all',
    ]);
    if (!allowed.has(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    const r =
      status === 'all'
        ? await db.query(
            `SELECT p.*, pr.username, pr.display_name, pr.avatar_url
             FROM elix_payout_requests p LEFT JOIN profiles pr ON pr.user_id = p.user_id
             ORDER BY p.created_at DESC LIMIT 100`,
          )
        : await db.query(
            `SELECT p.*, pr.username, pr.display_name, pr.avatar_url
             FROM elix_payout_requests p LEFT JOIN profiles pr ON pr.user_id = p.user_id
             WHERE p.status = $1 ORDER BY p.created_at ASC LIMIT 100`,
            [status],
          );
    return res.json({
      payouts: r.rows,
      workflow: [
        'pending',
        'under_review',
        'approved',
        'paid_manually',
        'rejected',
        'cancelled',
      ],
      note: 'Manual bank payout only — no automated bank rail',
    });
  } catch (err) {
    logger.error({ err }, 'Admin list payouts error');
    return res.status(500).json({ error: 'Failed to list payouts' });
  }
}

async function writePayoutAudit(
  client: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  payoutRequestId: string,
  adminUserId: string,
  previousStatus: string | null,
  newStatus: string,
  note: string | null,
): Promise<void> {
  await client.query(
    `INSERT INTO elix_payout_audit
       (payout_request_id, admin_user_id, previous_status, new_status, note)
     VALUES ($1, $2, $3, $4, $5)`,
    [payoutRequestId, adminUserId, previousStatus, newStatus, note],
  );
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
        `UPDATE elix_payout_requests
         SET status = 'approved',
             previous_status = status,
             admin_note = $2,
             processed_by = $3,
             processed_at = NOW()
         WHERE id = $1 AND status IN ('pending', 'under_review')
         RETURNING *`,
        [requestId, admin_note || null, adminId],
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
      await writePayoutAudit(
        client,
        requestId,
        adminId,
        payout.previous_status || 'pending',
        'approved',
        admin_note || null,
      );
      await client.query('COMMIT');
      return res.json({ payout: pr.rows[0] });
    } catch (e) {
      await client.query('ROLLBACK').catch((re) => logger.warn({ err: re }, "ROLLBACK failed"));
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
    if (!admin_note || !String(admin_note).trim()) {
      return res.status(400).json({ error: 'admin_note required' });
    }

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const pr = await client.query(
        `UPDATE elix_payout_requests
         SET status = 'rejected',
             previous_status = status,
             admin_note = $2,
             processed_by = $3,
             processed_at = NOW()
         WHERE id = $1 AND status IN ('pending', 'under_review')
         RETURNING *`,
        [requestId, admin_note, adminId],
      );
      if (pr.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Payout not found or already processed' });
      }
      const payout = pr.rows[0];
      // Unlock coins only when they were still locked (pending/under_review).
      if (payout.previous_status === 'pending' || payout.previous_status === 'under_review') {
        await client.query(
          `UPDATE elix_creator_balances SET locked_coins = locked_coins - $2, available_coins = available_coins + $2, updated_at = NOW()
           WHERE user_id = $1`, [payout.user_id, payout.coins_amount],
        );
      }
      await writePayoutAudit(
        client,
        requestId,
        adminId,
        payout.previous_status || 'pending',
        'rejected',
        admin_note,
      );
      await client.query('COMMIT');
      return res.json({ payout: pr.rows[0] });
    } catch (e) {
      await client.query('ROLLBACK').catch((re) => logger.warn({ err: re }, "ROLLBACK failed"));
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    logger.error({ err }, 'Admin reject payout error');
    return res.status(500).json({ error: 'Failed to reject payout' });
  }
}

/** Mark an approved payout as paid manually (no bank rail). */
export async function handleAdminMarkPayoutPaid(req: Request, res: Response) {
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
        `UPDATE elix_payout_requests
         SET status = 'paid_manually',
             previous_status = status,
             admin_note = COALESCE($2, admin_note),
             processed_by = $3,
             processed_at = NOW()
         WHERE id = $1 AND status = 'approved'
         RETURNING *`,
        [requestId, admin_note || null, adminId],
      );
      if (pr.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Payout must be approved before marking paid' });
      }
      const payout = pr.rows[0];
      await writePayoutAudit(
        client,
        requestId,
        adminId,
        payout.previous_status || 'approved',
        'paid_manually',
        admin_note || null,
      );
      await client.query('COMMIT');
      return res.json({ payout: pr.rows[0] });
    } catch (e) {
      await client.query('ROLLBACK').catch((re) => logger.warn({ err: re }, "ROLLBACK failed"));
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    logger.error({ err }, 'Admin mark payout paid error');
    return res.status(500).json({ error: 'Failed to mark payout paid' });
  }
}

export async function handleAdminCancelPayout(req: Request, res: Response) {
  const db = getPool();
  if (!db) return res.status(503).json({ error: 'Database not configured' });
  try {
    await ensureTables();
    const adminId = await requireAdmin(req, db);
    if (!adminId) return res.status(403).json({ error: 'Admin only' });

    const requestId = req.params.id;
    const { admin_note } = req.body;
    if (!admin_note || !String(admin_note).trim()) {
      return res.status(400).json({ error: 'admin_note required' });
    }

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const pr = await client.query(
        `UPDATE elix_payout_requests
         SET status = 'cancelled',
             previous_status = status,
             admin_note = $2,
             processed_by = $3,
             processed_at = NOW()
         WHERE id = $1 AND status IN ('pending', 'under_review')
         RETURNING *`,
        [requestId, admin_note, adminId],
      );
      if (pr.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Payout not found or not cancellable' });
      }
      const payout = pr.rows[0];
      await client.query(
        `UPDATE elix_creator_balances SET locked_coins = locked_coins - $2, available_coins = available_coins + $2, updated_at = NOW()
         WHERE user_id = $1`, [payout.user_id, payout.coins_amount],
      );
      await writePayoutAudit(
        client,
        requestId,
        adminId,
        payout.previous_status || 'pending',
        'cancelled',
        admin_note,
      );
      await client.query('COMMIT');
      return res.json({ payout: pr.rows[0] });
    } catch (e) {
      await client.query('ROLLBACK').catch((re) => logger.warn({ err: re }, "ROLLBACK failed"));
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    logger.error({ err }, 'Admin cancel payout error');
    return res.status(500).json({ error: 'Failed to cancel payout' });
  }
}

export async function handleAdminReviewPayout(req: Request, res: Response) {
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
        `UPDATE elix_payout_requests
         SET status = 'under_review',
             previous_status = status,
             admin_note = COALESCE($2, admin_note),
             processed_by = $3,
             processed_at = NOW()
         WHERE id = $1 AND status = 'pending'
         RETURNING *`,
        [requestId, admin_note || null, adminId],
      );
      if (pr.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Payout not found or not pending' });
      }
      const payout = pr.rows[0];
      await writePayoutAudit(
        client,
        requestId,
        adminId,
        payout.previous_status || 'pending',
        'under_review',
        admin_note || null,
      );
      await client.query('COMMIT');
      return res.json({ payout: pr.rows[0] });
    } catch (e) {
      await client.query('ROLLBACK').catch((re) => logger.warn({ err: re }, "ROLLBACK failed"));
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    logger.error({ err }, 'Admin review payout error');
    return res.status(500).json({ error: 'Failed to mark under review' });
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

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const existing = await client.query(
        `SELECT * FROM elix_creator_earnings
         WHERE id = $1 AND status IN ('pending', 'available')
         FOR UPDATE`,
        [gift_tx_id],
      );
      if (existing.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Earning not found or already processed' });
      }
      const earning = existing.rows[0];
      const priorStatus = String(earning.status);
      const coins = Math.floor(Number(earning.coins) || 0);
      const balR = await client.query(
        `SELECT available_coins, pending_coins FROM elix_creator_balances WHERE user_id = $1 FOR UPDATE`,
        [earning.creator_id],
      );
      const available = balR.rows[0] ? Number(balR.rows[0].available_coins) : 0;
      const pending = balR.rows[0] ? Number(balR.rows[0].pending_coins) : 0;
      if (priorStatus === 'available' && available < coins) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: 'Earning already withdrawn or spent; cannot reverse from available balance',
          available,
          required: coins,
        });
      }
      if (priorStatus !== 'available' && pending < coins) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: 'Insufficient pending balance to reverse earning',
          pending,
          required: coins,
        });
      }
      await client.query(
        `UPDATE elix_creator_earnings SET status = 'reversed' WHERE id = $1`,
        [gift_tx_id],
      );
      if (priorStatus === 'available') {
        await client.query(
          `UPDATE elix_creator_balances SET available_coins = available_coins - $2, updated_at = NOW()
           WHERE user_id = $1`, [earning.creator_id, coins],
        );
      } else {
        await client.query(
          `UPDATE elix_creator_balances SET pending_coins = pending_coins - $2, updated_at = NOW()
           WHERE user_id = $1`, [earning.creator_id, coins],
        );
      }
      await client.query('COMMIT');
      return res.json({ reversed: { ...earning, status: 'reversed' } });
    } catch (txErr) {
      await client.query('ROLLBACK').catch(() => {});
      throw txErr;
    } finally {
      client.release();
    }
  } catch (err) {
    logger.error({ err }, 'Admin chargeback error');
    return res.status(500).json({ error: 'Chargeback failed' });
  }
}

/** POST /api/creator/withdraw-gbp — withdraw available GBP earnings only. */
export async function handleCreatorWithdrawGbp(req: Request, res: Response) {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const amountPence = Math.floor(Number(req.body?.amount_pence) || 0);
  const idempotencyKey =
    typeof req.body?.idempotency_key === 'string' && req.body.idempotency_key.trim()
      ? String(req.body.idempotency_key).trim().slice(0, 120)
      : `wdgbp:${userId}:${amountPence}:${Date.now()}`;
  try {
    const { requestGbpWithdrawal } = await import('../lib/monetisation/gbpWithdrawals');
    const result = await requestGbpWithdrawal({
      creatorUserId: userId,
      amountPence,
      idempotencyKey,
    });
    if (!result.ok) {
      const status =
        result.error === 'insufficient_available'
          ? 400
          : result.error === 'no_payout_method'
            ? 400
            : result.error === 'below_minimum' || result.error === 'above_maximum'
              ? 400
              : 500;
      return res.status(status).json({ error: result.error });
    }
    return res.json({
      ok: true,
      id: result.id,
      status: result.status,
      already_exists: result.alreadyExists,
    });
  } catch (err) {
    logger.error({ err }, 'handleCreatorWithdrawGbp failed');
    return res.status(500).json({ error: 'withdraw_failed' });
  }
}

export async function handleGetCreatorGbpWithdrawals(req: Request, res: Response) {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const { listGbpWithdrawals } = await import('../lib/monetisation/gbpWithdrawals');
    const rows = await listGbpWithdrawals(userId);
    return res.json({ withdrawals: rows });
  } catch (err) {
    logger.error({ err }, 'handleGetCreatorGbpWithdrawals failed');
    return res.status(500).json({ error: 'list_failed' });
  }
}

export async function handleGetCreatorLedgerHistory(req: Request, res: Response) {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const db = getPool();
  if (!db) return res.status(503).json({ error: 'Database not configured' });
  try {
    const r = await db.query(
      `SELECT id, revenue_source, creator_amount_pence, platform_amount_pence, net_revenue_pence,
              status, gift_id, subscription_id, reward_period_id, created_at, reversal_of_id
         FROM elix_financial_ledger
        WHERE creator_user_id = $1
        ORDER BY created_at DESC
        LIMIT 100`,
      [userId],
    );
    return res.json({ ledger: r.rows });
  } catch (err) {
    logger.error({ err }, 'handleGetCreatorLedgerHistory failed');
    return res.status(500).json({ error: 'list_failed' });
  }
}

