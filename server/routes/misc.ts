import { Request, Response } from 'express';
import { getTokenFromRequest, verifyAuthToken } from './auth';
import {
  neonCreditIap,
  neonInsertMembershipPurchase,
  neonInsertPromotePurchase,
  neonIsIapProcessed,
} from '../lib/walletNeon';
import { getPool } from '../lib/postgres';
import { valkeyRateCheck, isValkeyConfigured } from '../lib/valkey';

// Rate limiting helper — Valkey-first with local Map fallback
const rateLimits = new Map<string, { count: number; timestamp: number }>();
async function checkRateLimit(userId: string, action: string, limit: number, windowMs: number) {
  const key = `${userId}:${action}`;

  if (isValkeyConfigured()) {
    const allowed = await valkeyRateCheck(`rl:${key}`, windowMs, limit);
    return { allowed, retryAfter: Math.ceil(windowMs / 1000) };
  }

  const now = Date.now();
  const record = rateLimits.get(key) || { count: 0, timestamp: now };
  
  if (now - record.timestamp > windowMs) {
    record.count = 0;
    record.timestamp = now;
  }

  record.count++;
  rateLimits.set(key, record);

  return {
    allowed: record.count <= limit,
    retryAfter: Math.ceil((record.timestamp + windowMs - now) / 1000)
  };
}

// --- Analytics ---
export async function handleAnalytics(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');
  return res.status(200).json({ ok: true });
}

// --- Block User ---
export async function handleBlockUser(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const token = getTokenFromRequest(req);
  const user = token ? verifyAuthToken(token) : null;
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const db = getPool();
  if (!db) return res.status(503).json({ error: 'Database not configured' });
  const { blockedUserId } = req.body ?? {};
  if (!blockedUserId || typeof blockedUserId !== 'string') return res.status(400).json({ error: 'blockedUserId required' });
  if (blockedUserId === user.sub) return res.status(400).json({ error: 'Cannot block yourself' });
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS elix_blocked_users (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        blocker_user_id TEXT NOT NULL,
        blocked_user_id TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(blocker_user_id, blocked_user_id)
      )
    `);
    await db.query(
      `INSERT INTO elix_blocked_users (blocker_user_id, blocked_user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [user.sub, blockedUserId],
    );
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Block user error:', err);
    return res.status(500).json({ error: 'Failed to block user' });
  }
}

// --- Unblock User ---
export async function handleUnblockUser(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const token = getTokenFromRequest(req);
  const user = token ? verifyAuthToken(token) : null;
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const db = getPool();
  if (!db) return res.status(503).json({ error: 'Database not configured' });
  const { blockedUserId } = req.body ?? {};
  if (!blockedUserId) return res.status(400).json({ error: 'blockedUserId required' });
  try {
    await db.query(
      `DELETE FROM elix_blocked_users WHERE blocker_user_id = $1 AND blocked_user_id = $2`,
      [user.sub, blockedUserId],
    );
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Unblock user error:', err);
    return res.status(500).json({ error: 'Failed to unblock user' });
  }
}

// --- List Blocked Users ---
export async function handleListBlockedUsers(req: Request, res: Response) {
  const token = getTokenFromRequest(req);
  const user = token ? verifyAuthToken(token) : null;
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const db = getPool();
  if (!db) return res.status(503).json({ error: 'Database not configured' });
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS elix_blocked_users (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        blocker_user_id TEXT NOT NULL,
        blocked_user_id TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(blocker_user_id, blocked_user_id)
      )
    `);
    const r = await db.query(
      `SELECT b.blocked_user_id, b.created_at, p.username, p.display_name, p.avatar_url
       FROM elix_blocked_users b LEFT JOIN profiles p ON p.user_id = b.blocked_user_id
       WHERE b.blocker_user_id = $1 ORDER BY b.created_at DESC`,
      [user.sub],
    );
    return res.status(200).json({ data: r.rows });
  } catch (err) {
    console.error('List blocked users error:', err);
    return res.status(500).json({ error: 'Failed to list blocked users' });
  }
}

// --- Report ---
export async function handleReport(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const token = getTokenFromRequest(req);
  const user = token ? verifyAuthToken(token) : null;
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const db = getPool();
  if (!db) return res.status(503).json({ error: 'Database not configured' });
  const body = req.body ?? {};
  const targetType = String(body.targetType || body.type || 'unknown').slice(0, 50);
  const targetId = String(body.targetId || body.videoId || body.streamId || '').slice(0, 200);
  const reason = String(body.reason || body.category || 'other').slice(0, 200);
  const details = String(body.details || body.description || '').slice(0, 5000);
  if (!targetId) return res.status(400).json({ error: 'targetId is required' });
  await db.query(`
    CREATE TABLE IF NOT EXISTS elix_reports (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      reporter_user_id TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      details TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await db.query(
    `INSERT INTO elix_reports (reporter_user_id, target_type, target_id, reason, details)
     VALUES ($1, $2, $3, $4, $5)`,
    [user.sub, targetType, targetId, reason, details],
  );
  return res.status(200).json({ success: true });
}

// --- Apple receipt verification via App Store Server API ---
async function verifyAppleReceipt(
  transactionId: string,
): Promise<{ valid: boolean; productId?: string; detail?: string }> {
  // StoreKit 2 transactions are JWS-signed — the transactionId is sufficient for
  // server-side lookup using the App Store Server API v2.
  // Env vars: APPLE_ISSUER_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY (p8 contents),
  //           APPLE_BUNDLE_ID, APPLE_IAP_ENVIRONMENT ('Sandbox' | 'Production')
  const issuerId = process.env.APPLE_ISSUER_ID;
  const keyId = process.env.APPLE_KEY_ID;
  const privateKey = process.env.APPLE_PRIVATE_KEY;
  const bundleId = process.env.APPLE_BUNDLE_ID || 'com.elixstarlive.app';
  const env = process.env.APPLE_IAP_ENVIRONMENT || 'Production';

  if (!issuerId || !keyId || !privateKey) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[IAP] Apple API keys not configured — skipping verification (dev only)');
      return { valid: true, detail: 'apple-keys-not-configured-dev' };
    }
    console.error('[IAP] Apple API keys not configured — rejecting purchase');
    return { valid: false, detail: 'apple-keys-not-configured' };
  }

  try {
    // Build JWT for App Store Server API (ES256 / P-256)
    const crypto = await import('crypto');

    const header = Buffer.from(
      JSON.stringify({ alg: 'ES256', kid: keyId, typ: 'JWT' }),
    ).toString('base64url');

    const now = Math.floor(Date.now() / 1000);
    const payload = Buffer.from(
      JSON.stringify({
        iss: issuerId,
        iat: now,
        exp: now + 3600,
        aud: 'appstoreconnect-v1',
        bid: bundleId,
      }),
    ).toString('base64url');

    const sign = crypto.createSign('SHA256');
    sign.update(`${header}.${payload}`);
    const signature = sign
      .sign(
        { key: privateKey.replace(/\\n/g, '\n'), format: 'pem' },
        'base64url',
      );

    const jwt = `${header}.${payload}.${signature}`;

    const baseUrl =
      env === 'Production'
        ? 'https://api.storekit.itunes.apple.com'
        : 'https://api.storekit-sandbox.itunes.apple.com';

    const resp = await fetch(
      `${baseUrl}/inApps/v1/transactions/${transactionId}`,
      { headers: { Authorization: `Bearer ${jwt}` } },
    );

    if (!resp.ok) {
      const body = await resp.text();
      return { valid: false, detail: `apple-api-${resp.status}: ${body}` };
    }

    const json: any = await resp.json();
    // The response signedTransactionInfo is a JWS; decode the payload to get productId
    const parts = (json.signedTransactionInfo || '').split('.');
    if (parts.length === 3) {
      const txPayload = JSON.parse(
        Buffer.from(parts[1], 'base64url').toString(),
      );
      return {
        valid: true,
        productId: txPayload.productId,
        detail: JSON.stringify(txPayload),
      };
    }

    return { valid: true, detail: 'jws-decode-skipped' };
  } catch (err: any) {
    console.error('[IAP] Apple verification error:', err);
    return { valid: false, detail: err.message };
  }
}

// --- Verify Purchase ---
export async function handleVerifyPurchase(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');
  const token = getTokenFromRequest(req);
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  const user = verifyAuthToken(token);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const rateCheck = await checkRateLimit(user.sub, 'iap:verify', 20, 60 * 60 * 1000);
  if (!rateCheck.allowed) return res.status(429).json({ error: 'Too many purchase attempts' });

  try {
    const { userId, packageId, provider, receipt, transactionId } = req.body ?? {};
    if (!userId || !packageId || !provider || !transactionId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (userId !== user.sub) return res.status(403).json({ error: 'Forbidden' });
    if (!getPool()) return res.status(503).json({ error: 'Database not configured' });

    const safeProvider = provider === 'google' ? 'google' : provider === 'apple' ? 'apple' : '';
    if (!safeProvider) return res.status(400).json({ error: `Unknown provider: ${provider}` });

    if (await neonIsIapProcessed(safeProvider, String(transactionId))) {
      return res.status(200).json({ success: true, deduplicated: true, message: 'Transaction already processed' });
    }

    let isValid = false;
    let verificationResponse: Record<string, unknown> = {};
    if (safeProvider === 'apple') {
      const apple = await verifyAppleReceipt(String(transactionId));
      isValid = apple.valid;
      verificationResponse = { provider: 'apple', verified: apple.valid, productId: apple.productId, detail: apple.detail };
    } else {
      const allowUnverifiedGoogle =
        process.env.NODE_ENV !== 'production' &&
        process.env.GOOGLE_IAP_ALLOW_UNVERIFIED === 'true';
      isValid = allowUnverifiedGoogle && typeof receipt === 'string' && receipt.length > 10;
      verificationResponse = {
        provider: 'google',
        verified: isValid,
        note: isValid ? 'dev-unverified-google-allowed' : 'google-verification-not-configured',
      };
    }
    if (!isValid) return res.status(400).json({ error: 'Invalid receipt' });

    const coinMap: Record<string, number> = {
      'com.elixstarlive.coins_100': 100,
      'com.elixstarlive.coins_500': 500,
      'com.elixstarlive.coins_1000': 1000,
      'com.elixstarlive.coins_5000': 5000,
    };
    const coins = coinMap[String(packageId)] || 0;
    if (coins <= 0) return res.status(400).json({ error: 'Unknown coin package' });

    const credited = await neonCreditIap({
      userId: String(userId),
      provider: safeProvider,
      providerTransactionId: String(transactionId),
      productId: String(packageId),
      coins,
      verification: verificationResponse,
    });

    if (credited.ok) {
      return res.json({
        success: true,
        message: 'Purchase verified and coins credited',
        newBalance: credited.newBalance,
      });
    }
    if ('alreadyProcessed' in credited && credited.alreadyProcessed) {
      return res.status(200).json({
        success: true,
        deduplicated: true,
        newBalance: credited.newBalance,
      });
    }
    return res.status(500).json({ error: 'error' in credited ? credited.error : 'Credit failed' });
  } catch (error: any) {
    console.error('Purchase verification error:', error);
    return res.status(500).json({ error: error.message || 'Purchase verification failed' });
  }
}

// Promote IAP product IDs and server-side amounts (must match App Store Connect)
const PROMOTE_IAP_PRODUCTS: Record<string, { goal: string; amountGbp: number }> = {
  'com.elixstarlive.promote_views':     { goal: 'views', amountGbp: 5 },
  'com.elixstarlive.promote_likes':     { goal: 'likes', amountGbp: 10 },
  'com.elixstarlive.promote_profile':   { goal: 'profile', amountGbp: 20 },
  'com.elixstarlive.promote_followers': { goal: 'followers', amountGbp: 30 },
};

// --- Promote IAP complete (Apple/Google) ---
export async function handlePromoteIAPComplete(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const token = getTokenFromRequest(req);
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  const user = verifyAuthToken(token);
  if (!user) return res.status(401).json({ error: 'Invalid auth token' });

  const rateCheck = await checkRateLimit(user.sub, 'promote:iap', 10, 60 * 60 * 1000);
  if (!rateCheck.allowed) return res.status(429).json({ error: 'Too many promote attempts' });

  const body = req.body ?? {};
  const { transactionId, productId, contentType, contentId } = body;
  if (!transactionId || !productId) return res.status(400).json({ error: 'Missing transactionId or productId' });
  if (!getPool()) return res.status(503).json({ error: 'Database not configured' });

  const meta = PROMOTE_IAP_PRODUCTS[String(productId)];
  if (!meta) return res.status(400).json({ error: 'Invalid promote product' });

  const provider = body.provider === 'google' ? 'google' : 'apple';
  let valid = false;
  if (provider === 'apple') {
    const apple = await verifyAppleReceipt(String(transactionId));
    valid = apple.valid && apple.productId === String(productId);
  } else {
    valid = true;
  }
  if (!valid) return res.status(400).json({ error: 'Invalid or unverified transaction' });

  await neonInsertPromotePurchase({
    userId: user.sub,
    provider,
    providerTransactionId: String(transactionId),
    productId: String(productId),
    contentType: String(contentType || 'video'),
    contentId: String(contentId || ''),
    goal: meta.goal,
    amountGbp: meta.amountGbp,
  });
  return res.json({ success: true, message: 'Promote purchase recorded' });
}

// --- Membership IAP complete (Apple/Google) ---
export async function handleMembershipIAPComplete(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const token = getTokenFromRequest(req);
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  const user = verifyAuthToken(token);
  if (!user) return res.status(401).json({ error: 'Invalid auth token' });

  const rateCheck = await checkRateLimit(user.sub, 'membership:iap', 20, 60 * 60 * 1000);
  if (!rateCheck.allowed) return res.status(429).json({ error: 'Too many requests' });

  const body = req.body ?? {};
  const transactionId = String(body.transactionId || '').trim();
  const provider = body.provider === 'google' ? 'google' : body.provider === 'apple' ? 'apple' : '';
  const creatorId = body.creatorId ? String(body.creatorId) : null;
  if (!transactionId || !provider) {
    return res.status(400).json({ error: 'transactionId and provider required' });
  }
  if (!getPool()) return res.status(503).json({ error: 'Database not configured' });

  if (provider === 'apple') {
    const apple = await verifyAppleReceipt(transactionId);
    if (!apple.valid) return res.status(400).json({ error: 'Invalid or unverified transaction' });
  }

  await neonInsertMembershipPurchase({
    userId: user.sub,
    creatorId,
    provider,
    providerTransactionId: transactionId,
  });

  return res.json({ success: true, message: 'Membership recorded' });
}
