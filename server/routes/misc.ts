import { Request, Response } from 'express';
import { createHash } from 'node:crypto';
import { getTokenFromRequest, verifyAuthToken } from './auth';
import {
  neonCreditIap,
  neonGetActiveMembershipEntitlement,
  neonGetCoinBalance,
  neonInsertPromotePurchase,
  neonIsIapProcessed,
  neonUpsertMembershipEntitlement,
} from '../lib/walletNeon';
import { getPool, dbLoadCoinMap } from '../lib/postgres';
import { valkeyRateCheck, isValkeyConfigured } from '../lib/valkey';
import { logger } from '../lib/logger';
import { assertIapVerifyVelocityOk } from '../lib/fraud';
import {
  acknowledgeGoogleSubscription,
  CREATOR_MEMBERSHIP_BASE_PLAN_ID,
  creatorMembershipProductId,
  ensureCreatorMembershipProduct,
  hashPurchaseToken,
  verifyGoogleSubscription,
} from '../lib/googlePlaySubscriptions';
import {
  ensureAppleCreatorMembershipProduct,
  fetchAppleTransaction,
  hashAppleOriginalTransactionId,
  markAppleCreatorMembershipActive,
  verifyAppleSubscription,
} from '../lib/appleIap';
import { insertNotification } from '../lib/notifications';

const rateLimits = new Map<string, { count: number; timestamp: number }>();
const MAX_LOCAL_RATE_ENTRIES = 20_000;

function providerTransactionKey(
  provider: 'apple' | 'google',
  transactionId: string,
  purchaseToken?: string,
): string | null {
  if (provider === 'apple') return transactionId.trim() || null;
  const token = purchaseToken?.trim();
  if (!token) return null;
  return `token_sha256:${createHash('sha256').update(token).digest('hex')}`;
}

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rateLimits) {
    if (now - v.timestamp > 120_000) rateLimits.delete(k);
  }
}, 60_000).unref();

async function checkRateLimit(userId: string, action: string, limit: number, windowMs: number) {
  const key = `${userId}:${action}`;

  if (isValkeyConfigured()) {
    try {
      const allowed = await valkeyRateCheck(`rl:${key}`, windowMs, limit);
      return { allowed, retryAfter: Math.ceil(windowMs / 1000) };
    } catch {
      // Valkey unavailable — fall through to local
    }
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
  const pool = getPool();
  if (!pool) {
    logger.warn('Analytics rejected: database pool unavailable');
    return res.status(503).json({ error: 'DATABASE_UNAVAILABLE' });
  }
  try {
    const { event, properties } = req.body ?? {};
    const token = getTokenFromRequest(req);
    const user = token ? verifyAuthToken(token) : null;
    await pool.query(
      `INSERT INTO elix_analytics_events (user_id, event, properties, created_at)
       VALUES ($1, $2, $3, NOW())`,
      [user?.sub ?? null, String(event ?? 'unknown'), JSON.stringify(properties ?? {})],
    );
    return res.status(202).json({ accepted: true });
  } catch (err) {
    logger.error({ err }, 'Analytics insert failed');
    return res.status(500).json({ error: 'ANALYTICS_INSERT_FAILED' });
  }
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
    res.setHeader("Cache-Control", "private, no-store");
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
    logger.error('[IAP] Google service account not configured — rejecting purchase');
    return { valid: false, detail: 'GOOGLE_CREDENTIALS_NOT_CONFIGURED' };
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
      signal: AbortSignal.timeout(15_000),
    });

    if (!tokenResp.ok) {
      const text = await tokenResp.text();
      return { valid: false, detail: `google-token-error-${tokenResp.status}: ${text}` };
    }

    const tokenJson = (await tokenResp.json()) as { access_token?: string };
    const accessToken = tokenJson.access_token;
    if (!accessToken) {
      return { valid: false, detail: 'google-no-access-token' };
    }

    const verifyUrl = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName)}/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}`;

    const verifyResp = await fetch(verifyUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15_000),
    });

    if (!verifyResp.ok) {
      const text = await verifyResp.text();
      return { valid: false, detail: `google-verify-${verifyResp.status}: ${text}` };
    }

    const purchase = (await verifyResp.json()) as {
      purchaseState?: number;
      consumptionState?: number;
      orderId?: string;
    };
    // purchaseState: 0 = purchased, 1 = canceled, 2 = pending
    if (purchase.purchaseState !== 0) {
      return { valid: false, detail: `google-purchase-state-${purchase.purchaseState}` };
    }
    // consumptionState: 0 = yet to be consumed, 1 = consumed.
    // Reject already-consumed tokens as defense-in-depth against replay.
    if (purchase.consumptionState === 1) {
      return { valid: false, detail: 'google-already-consumed' };
    }

    return {
      valid: true,
      productId: productId,
      detail: JSON.stringify({ orderId: purchase.orderId, purchaseState: purchase.purchaseState }),
    };
  } catch (err) {
    logger.error({ err: (err as Error)?.message }, '[IAP] Google Play verification error');
    return { valid: false, detail: (err as Error)?.message };
  }
}

// --- Apple receipt verification via App Store Server API ---
async function verifyAppleReceipt(
  transactionId: string,
): Promise<{ valid: boolean; productId?: string; detail?: string }> {
  const result = await fetchAppleTransaction(transactionId);
  // Consumable coin purchases must NOT credit for a transaction that Apple has
  // revoked or refunded. fetchAppleTransaction only checks JWS validity, so
  // reject any transaction carrying a revocationDate here.
  if (
    result.valid &&
    result.payload &&
    typeof result.payload.revocationDate === 'number' &&
    result.payload.revocationDate > 0
  ) {
    return { valid: false, productId: result.productId, detail: 'apple-transaction-revoked' };
  }
  return result;
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

    const fraudIap = await assertIapVerifyVelocityOk(user.sub);
    if (!fraudIap.ok) return res.status(429).json({ error: fraudIap.code });

    try {
    const { userId, packageId, provider, receipt, transactionId } = req.body ?? {};
    if (!userId || !packageId || !provider || !transactionId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (userId !== user.sub) return res.status(403).json({ error: 'Forbidden' });
    if (!getPool()) return res.status(503).json({ error: 'Database not configured' });

    const safeProvider = provider === 'google' ? 'google' : provider === 'apple' ? 'apple' : '';
    if (!safeProvider) return res.status(400).json({ error: `Unknown provider: ${provider}` });
    const googlePurchaseToken = safeProvider === 'google' && typeof receipt === 'string' ? receipt.trim() : '';
    if (safeProvider === 'google' && !googlePurchaseToken) {
      return res.status(400).json({ error: 'Google purchase token is required' });
    }
    const providerTransactionId = providerTransactionKey(
      safeProvider,
      String(transactionId),
      googlePurchaseToken,
    );
    if (!providerTransactionId) return res.status(400).json({ error: 'Invalid transaction identifier' });
    if (await neonIsIapProcessed(safeProvider, providerTransactionId)) {
      // Coins were already credited for this transaction. Return the authoritative
      // wallet balance so the client never fabricates one (e.g. base + coins),
      // which would double-count the purchase in the displayed balance.
      const dedupedBalance = await neonGetCoinBalance(String(userId));
      return res.status(200).json({
        success: true,
        deduplicated: true,
        message: 'Transaction already processed',
        ...(typeof dedupedBalance === 'number' ? { newBalance: dedupedBalance } : {}),
      });
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
        googlePurchaseToken,
      );
      isValid = google.valid;
      verificationResponse = { provider: 'google', verified: google.valid, productId: google.productId, detail: google.detail };
    }
    if (!isValid) {
      // Log the exact reason (credentials missing, google-verify-410, already-consumed,
      // purchase-state, etc.) so the failure is visible in backend logs without a device.
      logger.warn(
        { provider: safeProvider, packageId, userId: user.sub, detail: verificationResponse.detail },
        'IAP verification failed — coins NOT credited',
      );
      return res.status(400).json({
        error: 'Invalid receipt',
        code: 'verification_failed',
        detail:
          typeof verificationResponse.detail === 'string'
            ? verificationResponse.detail.slice(0, 300)
            : undefined,
      });
    }

    if (safeProvider === 'apple' && verificationResponse.productId) {
      if (String(verificationResponse.productId) !== String(packageId)) {
        logger.warn({ claimed: packageId, actual: verificationResponse.productId }, 'IAP productId mismatch');
        return res.status(400).json({ error: 'Product ID mismatch' });
      }
    }

    const coinMap = await dbLoadCoinMap();
    const coins = coinMap[String(packageId)] || 0;
    if (coins <= 0) {
      // Receipt was valid but the product is not present in the coin_packages map.
      logger.warn(
        { packageId, knownPackages: Object.keys(coinMap) },
        'IAP verified but product missing from coin map — check coin_packages table',
      );
      return res.status(400).json({ error: 'Unknown coin package', code: 'unknown_package' });
    }

    const credited = await neonCreditIap({
      userId: String(userId),
      provider: safeProvider,
      providerTransactionId,
      productId: String(packageId),
      coins,
      verification: verificationResponse,
    });

    if (credited.ok) {
      logger.info(
        { userId: String(userId), provider: safeProvider, packageId, coins, newBalance: credited.newBalance },
        'IAP coins credited',
      );
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
  } catch (error) {
    logger.error({ err: (error as Error)?.message }, 'Purchase verification error');
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
  const googlePurchaseToken = provider === 'google' && typeof body.receipt === 'string' ? body.receipt.trim() : '';
  if (provider === 'google' && !googlePurchaseToken) {
    return res.status(400).json({ error: 'Google purchase token is required' });
  }
  const providerTransactionId = providerTransactionKey(
    provider,
    String(transactionId),
    googlePurchaseToken,
  );
  if (!providerTransactionId) return res.status(400).json({ error: 'Invalid transaction identifier' });
  try {
    if (await neonIsIapProcessed(provider, providerTransactionId)) {
      return res.json({ success: true, message: 'Already processed' });
    }
  } catch {
    return res.status(500).json({ error: 'Deduplication check failed' });
  }
  let valid = false;
  if (provider === 'apple') {
    const apple = await verifyAppleReceipt(String(transactionId));
    valid = apple.valid && apple.productId === String(productId);
  } else {
    const packageName = process.env.GOOGLE_PLAY_PACKAGE_NAME || 'com.elixstarlive.app';
    const google = await verifyGooglePlayPurchase(packageName, String(productId), googlePurchaseToken);
    valid = google.valid;
  }
  if (!valid) return res.status(400).json({ error: 'Invalid or unverified transaction' });

  try {
    await neonInsertPromotePurchase({
      userId: user.sub,
      provider,
      providerTransactionId,
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

/** GET /api/membership/:creatorId/status — viewer entitlement + store product IDs. */
export async function handleGetMembershipStatus(req: Request, res: Response) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const token = getTokenFromRequest(req);
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  const user = verifyAuthToken(token);
  if (!user) return res.status(401).json({ error: 'Invalid auth token' });

  const creatorId = String(req.params.creatorId || '').trim();
  if (!creatorId) return res.status(400).json({ error: 'creatorId required' });

  const storeParam = String(req.query.store || '').trim().toLowerCase();
  const store =
    storeParam === 'apple' || storeParam === 'google'
      ? storeParam
      : String(req.headers['x-client-platform'] || '').toLowerCase() === 'ios'
        ? 'apple'
        : 'google';

  const productId = creatorMembershipProductId(creatorId);
  const basePlanId = CREATOR_MEMBERSHIP_BASE_PLAN_ID;
  if (creatorId === user.sub) {
    return res.json({
      active: false,
      productId,
      basePlanId,
      purchaseReady: false,
      provisionStatus: 'pending',
      store,
      self: true,
    });
  }

  if (!getPool()) return res.status(503).json({ error: 'Database not configured' });
  try {
    const provisioned =
      store === 'apple'
        ? await ensureAppleCreatorMembershipProduct(creatorId)
        : await ensureCreatorMembershipProduct(creatorId);
    const entitlement = await neonGetActiveMembershipEntitlement(user.sub, creatorId);
    return res.json({
      active: Boolean(entitlement),
      productId: provisioned.productId || productId,
      basePlanId: provisioned.basePlanId || basePlanId,
      purchaseReady: provisioned.purchaseReady === true,
      provisionStatus: provisioned.status,
      provisionDetail: provisioned.detail ?? null,
      store,
      expiresAt: entitlement?.expiresAt ?? null,
      autoRenewing: entitlement?.autoRenewEnabled === true,
      subscriptionState: entitlement?.subscriptionState ?? null,
    });
  } catch (err) {
    logger.error({ err, creatorId, userId: user.sub }, 'Membership status lookup failed');
    return res.status(500).json({ error: 'Failed to load membership status' });
  }
}

/**
 * POST /api/membership/iap-complete — Google Play or Apple creator subscription.
 * Google: subscriptionsv2 + token hash. Apple: App Store Server API + originalTransactionId.
 */
export async function handleMembershipIAPComplete(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const token = getTokenFromRequest(req);
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  const user = verifyAuthToken(token);
  if (!user) return res.status(401).json({ error: 'Invalid auth token' });

  const rateCheck = await checkRateLimit(user.sub, 'membership:iap', 20, 60 * 60 * 1000);
  if (!rateCheck.allowed) return res.status(429).json({ error: 'Too many requests' });

  const body = req.body ?? {};
  const provider =
    body.provider === 'google' ? 'google' : body.provider === 'apple' ? 'apple' : '';
  let creatorId = typeof body.creatorId === 'string' ? body.creatorId.trim() : '';
  const googlePurchaseToken =
    typeof body.receipt === 'string' ? body.receipt.trim() : '';
  const appleTransactionId =
    typeof body.transactionId === 'string' ? body.transactionId.trim() : '';
  const claimedProductId =
    typeof body.productId === 'string' ? body.productId.trim() : '';

  if (provider !== 'google' && provider !== 'apple') {
    return res.status(400).json({ error: 'provider must be google or apple' });
  }
  if (provider === 'google' && !googlePurchaseToken) {
    return res.status(400).json({ error: 'Google purchase token is required' });
  }
  if (provider === 'apple' && !appleTransactionId) {
    return res.status(400).json({ error: 'Apple transactionId is required' });
  }
  if (!getPool()) return res.status(503).json({ error: 'Database not configured' });

  // Restore path: resolve creator from pre-provisioned product map when creatorId omitted.
  const pool = getPool();
  if (!creatorId && claimedProductId && pool) {
    try {
      const mapped = await pool.query(
        `SELECT creator_id FROM elix_creator_membership_products WHERE product_id = $1 LIMIT 1`,
        [claimedProductId],
      );
      if (mapped.rowCount) creatorId = String(mapped.rows[0].creator_id);
    } catch (err) {
      logger.warn({ err, claimedProductId }, 'Membership product→creator lookup failed');
    }
  }
  if (!creatorId) return res.status(400).json({ error: 'creatorId required' });
  if (creatorId === user.sub) {
    return res.status(400).json({ error: 'Cannot subscribe to your own membership' });
  }

  const expectedProductId = creatorMembershipProductId(creatorId);
  if (claimedProductId && claimedProductId !== expectedProductId) {
    return res.status(400).json({ error: 'Product ID mismatch' });
  }

  if (provider === 'apple') {
    try {
      if (await neonIsIapProcessed('apple', appleTransactionId)) {
        return res.status(400).json({ error: 'Transaction already used' });
      }
    } catch {
      return res.status(500).json({ error: 'Deduplication check failed' });
    }

    const verified = await verifyAppleSubscription(appleTransactionId, expectedProductId);
    if (!verified.ok || !verified.entitled) {
      return res.status(400).json({
        error: 'Invalid or unverified subscription',
        detail: verified.error,
        subscriptionState: verified.subscriptionState ?? null,
      });
    }

    const purchaseTokenHash = hashAppleOriginalTransactionId(verified.originalTransactionId);
    try {
      const upserted = await neonUpsertMembershipEntitlement({
        userId: user.sub,
        creatorId,
        provider: 'apple',
        purchaseTokenHash,
        providerTransactionId: verified.originalTransactionId,
        productId: expectedProductId,
        basePlanId: CREATOR_MEMBERSHIP_BASE_PLAN_ID,
        subscriptionState: verified.subscriptionState,
        expiresAt: verified.expiresAt,
        autoRenewEnabled: verified.autoRenewEnabled,
        acknowledgementState: 'ACKNOWLEDGED',
        latestOrderId: verified.transactionId,
        linkedPurchaseTokenHash: null,
        verification: {
          provider: 'apple',
          productId: expectedProductId,
          subscriptionState: verified.subscriptionState,
          expiresAt: verified.expiresAt,
          originalTransactionId: verified.originalTransactionId,
          transactionId: verified.transactionId,
          environment: verified.environment ?? null,
        },
      });
      if (!upserted.ok) {
        if (upserted.error === 'ownership_conflict') {
          return res.status(409).json({ error: 'Purchase token already bound' });
        }
        return res.status(500).json({ error: 'Failed to record membership' });
      }
      await markAppleCreatorMembershipActive(creatorId, expectedProductId);
      if (upserted.created) {
        try {
          await insertNotification({
            userId: creatorId,
            type: 'membership_subscribed',
            title: 'New membership',
            body: 'Someone subscribed to your creator membership.',
            actionUrl: `/profile/${encodeURIComponent(creatorId)}`,
            data: { path: `/profile/${creatorId}`, provider: 'apple' },
          });
        } catch (err) {
          logger.warn({ err, creatorId }, 'Apple membership push skipped');
        }
      }
      return res.json({
        success: true,
        active: true,
        productId: expectedProductId,
        basePlanId: CREATOR_MEMBERSHIP_BASE_PLAN_ID,
        expiresAt: verified.expiresAt,
        autoRenewing: verified.autoRenewEnabled,
        subscriptionState: verified.subscriptionState,
        created: upserted.created,
      });
    } catch (err) {
      logger.error({ err }, 'Apple membership purchase recording error');
      return res.status(500).json({ error: 'Failed to record membership' });
    }
  }

  // Reject coin receipts reused as membership (cross-table replay).
  const providerTransactionId = providerTransactionKey(
    'google',
    String(body.transactionId || googlePurchaseToken),
    googlePurchaseToken,
  );
  if (!providerTransactionId) {
    return res.status(400).json({ error: 'Invalid transaction identifier' });
  }
  try {
    if (await neonIsIapProcessed('google', providerTransactionId)) {
      return res.status(400).json({ error: 'Transaction already used' });
    }
  } catch {
    return res.status(500).json({ error: 'Deduplication check failed' });
  }

  const verified = await verifyGoogleSubscription(googlePurchaseToken, expectedProductId);
  if (!verified.ok || !verified.entitled) {
    return res.status(400).json({
      error: 'Invalid or unverified subscription',
      detail: verified.error,
      subscriptionState: verified.subscriptionState ?? null,
    });
  }
  if (
    verified.basePlanId &&
    verified.basePlanId !== CREATOR_MEMBERSHIP_BASE_PLAN_ID
  ) {
    return res.status(400).json({ error: 'Base plan mismatch' });
  }

  const purchaseTokenHash = hashPurchaseToken(googlePurchaseToken);
  try {
    const upserted = await neonUpsertMembershipEntitlement({
      userId: user.sub,
      creatorId,
      provider: 'google',
      purchaseTokenHash,
      productId: expectedProductId,
      basePlanId: verified.basePlanId || CREATOR_MEMBERSHIP_BASE_PLAN_ID,
      subscriptionState: verified.subscriptionState,
      expiresAt: verified.expiresAt,
      autoRenewEnabled: verified.autoRenewEnabled,
      acknowledgementState: verified.acknowledgementState,
      latestOrderId: verified.latestOrderId,
      linkedPurchaseTokenHash: verified.linkedPurchaseTokenHash,
      verification: {
        provider: 'google',
        productId: expectedProductId,
        subscriptionState: verified.subscriptionState,
        expiresAt: verified.expiresAt,
        latestOrderId: verified.latestOrderId,
      },
    });
    if (!upserted.ok) {
      if (upserted.error === 'ownership_conflict') {
        return res.status(409).json({ error: 'Purchase token already bound' });
      }
      return res.status(500).json({ error: 'Failed to record membership' });
    }

    if (verified.acknowledgementState !== 'ACKNOWLEDGED') {
      const ack = await acknowledgeGoogleSubscription(
        expectedProductId,
        googlePurchaseToken,
      );
      if (!ack.ok) {
        logger.warn(
          { detail: ack.detail, productId: expectedProductId, userId: user.sub },
          'Membership acknowledge deferred — entitlement already persisted',
        );
      }
    }

    if (upserted.created) {
      try {
        await insertNotification({
          userId: creatorId,
          type: 'membership_subscribed',
          title: 'New membership',
          body: 'Someone subscribed to your creator membership.',
          actionUrl: `/profile/${encodeURIComponent(creatorId)}`,
          data: { path: `/profile/${creatorId}`, provider: 'google' },
        });
      } catch (err) {
        logger.warn({ err, creatorId }, 'Google membership push skipped');
      }
    }

    return res.json({
      success: true,
      active: true,
      productId: expectedProductId,
      basePlanId: verified.basePlanId || CREATOR_MEMBERSHIP_BASE_PLAN_ID,
      expiresAt: verified.expiresAt,
      autoRenewing: verified.autoRenewEnabled,
      subscriptionState: verified.subscriptionState,
      created: upserted.created,
    });
  } catch (err) {
    logger.error({ err }, 'Membership purchase recording error');
    return res.status(500).json({ error: 'Failed to record membership' });
  }
}
