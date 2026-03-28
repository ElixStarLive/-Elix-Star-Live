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
import { logger } from '../lib/logger';

const rateLimits = new Map<string, { count: number; timestamp: number }>();
const MAX_LOCAL_RATE_ENTRIES = 20_000;

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rateLimits) {
    if (now - v.timestamp > 120_000) rateLimits.delete(k);
  }
}, 60_000).unref();

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
  if (rateLimits.size >= MAX_LOCAL_RATE_ENTRIES && !rateLimits.has(key)) {
    const oldest = rateLimits.keys().next().value;
    if (oldest) rateLimits.delete(oldest);
  }
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
  const body = req.body ?? {};
  const blockedUserId = typeof body.blockedUserId === 'string' ? body.blockedUserId : (typeof body.blockedId === 'string' ? body.blockedId : '');
  if (!blockedUserId) return res.status(400).json({ error: 'blockedUserId required' });
  if (blockedUserId === user.sub) return res.status(400).json({ error: 'Cannot block yourself' });
  try {
    await db.query(
      `INSERT INTO elix_blocked_users (blocker_user_id, blocked_user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [user.sub, blockedUserId],
    );
    return res.status(200).json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Block user error');
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
    logger.error({ err }, 'Unblock user error');
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
    const r = await db.query(
      `SELECT b.blocked_user_id, b.created_at, p.username, p.display_name, p.avatar_url
       FROM elix_blocked_users b LEFT JOIN profiles p ON p.user_id = b.blocked_user_id
       WHERE b.blocker_user_id = $1 ORDER BY b.created_at DESC`,
      [user.sub],
    );
    return res.status(200).json({ data: r.rows });
  } catch (err) {
    logger.error({ err }, 'List blocked users error');
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
  try {
    await db.query(
      `INSERT INTO elix_reports (reporter_user_id, target_type, target_id, reason, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [user.sub, targetType, targetId, reason, details],
    );
    return res.status(200).json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Report submission error');
    return res.status(500).json({ error: 'Failed to submit report' });
  }
}

// --- Google Play purchase verification via androidpublisher API ---
async function verifyGooglePlayPurchase(
  packageName: string,
  productId: string,
  purchaseToken: string,
): Promise<{ valid: boolean; productId?: string; detail?: string }> {
  const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

  if (!serviceAccountJson) {
    if (process.env.NODE_ENV !== 'production') {
      logger.warn('[IAP] Google service account not configured — skipping verification (dev only)');
      return { valid: true, productId, detail: 'google-keys-not-configured-dev' };
    }
    logger.error('[IAP] Google service account not configured — rejecting purchase');
    return { valid: false, detail: 'google-service-account-not-configured' };
  }

  try {
    const crypto = await import('crypto');
    let sa: { client_email: string; private_key: string };
    try {
      sa = JSON.parse(serviceAccountJson);
    } catch {
      return { valid: false, detail: 'invalid-service-account-json' };
    }
    if (!sa.client_email || !sa.private_key) {
      return { valid: false, detail: 'service-account-missing-fields' };
    }

    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/androidpublisher',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })).toString('base64url');

    const sign = crypto.createSign('RSA-SHA256');
    sign.update(`${header}.${payload}`);
    const signature = sign.sign(sa.private_key.replace(/\\n/g, '\n'), 'base64url');
    const jwt = `${header}.${payload}.${signature}`;

    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
    });

    if (!tokenResp.ok) {
      const text = await tokenResp.text();
      return { valid: false, detail: `google-token-error-${tokenResp.status}: ${text}` };
    }

    const tokenJson: any = await tokenResp.json();
    const accessToken = tokenJson.access_token;
    if (!accessToken) {
      return { valid: false, detail: 'google-no-access-token' };
    }

    const verifyUrl = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName)}/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}`;

    const verifyResp = await fetch(verifyUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!verifyResp.ok) {
      const text = await verifyResp.text();
      return { valid: false, detail: `google-verify-${verifyResp.status}: ${text}` };
    }

    const purchase: any = await verifyResp.json();
    // purchaseState: 0 = purchased, 1 = canceled, 2 = pending
    if (purchase.purchaseState !== 0) {
      return { valid: false, detail: `google-purchase-state-${purchase.purchaseState}` };
    }

    return {
      valid: true,
      productId: productId,
      detail: JSON.stringify({ orderId: purchase.orderId, purchaseState: purchase.purchaseState }),
    };
  } catch (err: any) {
    logger.error({ err: err.message }, '[IAP] Google Play verification error');
    return { valid: false, detail: err.message };
  }
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
      logger.warn('[IAP] Apple API keys not configured — skipping verification (dev only)');
      return { valid: true, detail: 'apple-keys-not-configured-dev' };
    }
    logger.error('[IAP] Apple API keys not configured — rejecting purchase');
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

    return { valid: false, detail: 'apple-jws-missing-or-malformed' };
  } catch (err: any) {
    logger.error({ err: err.message }, '[IAP] Apple verification error');
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
      const packageName = process.env.GOOGLE_PLAY_PACKAGE_NAME || 'com.elixstarlive.app';
      const google = await verifyGooglePlayPurchase(
        packageName,
        String(packageId),
        typeof receipt === 'string' ? receipt : String(transactionId),
      );
      isValid = google.valid;
      verificationResponse = { provider: 'google', verified: google.valid, productId: google.productId, detail: google.detail };
    }
    if (!isValid) return res.status(400).json({ error: 'Invalid receipt' });

    if (safeProvider === 'apple' && verificationResponse.productId) {
      if (String(verificationResponse.productId) !== String(packageId)) {
        logger.warn({ claimed: packageId, actual: verificationResponse.productId }, 'IAP productId mismatch');
        return res.status(400).json({ error: 'Product ID mismatch' });
      }
    }

    const coinMap: Record<string, number> = {
      'com.elixstarlive.coins_10': 10,
      'com.elixstarlive.coins_50': 50,
      'com.elixstarlive.coins_100': 100,
      'com.elixstarlive.coins_500': 500,
      'com.elixstarlive.coins_1000': 1000,
      'com.elixstarlive.coins_2000': 2000,
      'com.elixstarlive.coins_5000': 5000,
      'com.elixstarlive.coins_10000': 10000,
      'com.elixstarlive.coins_50000': 50000,
      'com.elixstarlive.coins_100000': 100000,
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
    logger.error({ err: error?.message }, 'Purchase verification error');
    return res.status(500).json({ error: 'Purchase verification failed' });
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
    const packageName = process.env.GOOGLE_PLAY_PACKAGE_NAME || 'com.elixstarlive.app';
    const purchaseToken = typeof body.receipt === 'string' ? body.receipt : String(transactionId);
    const google = await verifyGooglePlayPurchase(packageName, String(productId), purchaseToken);
    valid = google.valid;
  }
  if (!valid) return res.status(400).json({ error: 'Invalid or unverified transaction' });

  try {
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
  } catch (err) {
    logger.error({ err }, 'Promote purchase recording error');
    return res.status(500).json({ error: 'Failed to record promote purchase' });
  }
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
  } else {
    const packageName = process.env.GOOGLE_PLAY_PACKAGE_NAME || 'com.elixstarlive.app';
    const purchaseToken = typeof body.receipt === 'string' ? body.receipt : transactionId;
    const google = await verifyGooglePlayPurchase(packageName, body.productId || 'com.elixstarlive.membership', purchaseToken);
    if (!google.valid) return res.status(400).json({ error: 'Invalid or unverified transaction' });
  }

  try {
    await neonInsertMembershipPurchase({
      userId: user.sub,
      creatorId,
      provider,
      providerTransactionId: transactionId,
    });
    return res.json({ success: true, message: 'Membership recorded' });
  } catch (err) {
    logger.error({ err }, 'Membership purchase recording error');
    return res.status(500).json({ error: 'Failed to record membership' });
  }
}
