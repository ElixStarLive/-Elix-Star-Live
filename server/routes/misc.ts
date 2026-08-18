import { Request, Response } from 'express';
import { createHash } from 'node:crypto';
import { getTokenFromRequest, verifyAuthToken } from './auth';
import {
  neonCreditIap,
  neonGetActiveMembershipEntitlement,
  neonGetCoinBalance,
  neonInsertPromotePurchase,
  neonIsIapProcessed,
  neonIsPromoteProcessed,
  neonSettledIapPurchase,
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
  verifyGooglePlayProductPurchase,
  verifyGoogleSubscription,
} from '../lib/googlePlaySubscriptions';
import {
  APPLE_CREATOR_MEMBERSHIP_PRODUCT_ID,
  ensureAppleCreatorMembershipProduct,
  fetchAppleTransaction,
  hashAppleOriginalTransactionId,
  markAppleCreatorMembershipActive,
  verifyAppleSubscription,
} from '../lib/appleIap';
import { insertNotification } from '../lib/notifications';
import {
  coinAmountForProviderProduct,
  gateProviderProduct,
  PROMOTE_IAP_PRODUCTS,
  appAccountTokenForUserId,
} from '../lib/monetisation/storeProductCatalogs';

// Dev/test only: local in-memory window when Valkey is off (never in production).
const rateLimits = new Map<string, { count: number; timestamp: number }>();
const MAX_LOCAL_RATE_ENTRIES = 20_000;
const allowLocalRateLimit = process.env.NODE_ENV !== "production";

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

if (allowLocalRateLimit) {
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of rateLimits) {
      if (now - v.timestamp > 120_000) rateLimits.delete(k);
    }
  }, 60_000).unref();
}

async function checkRateLimit(userId: string, action: string, limit: number, windowMs: number) {
  const key = `${userId}:${action}`;
  const retryAfter = Math.ceil(windowMs / 1000);

  if (isValkeyConfigured()) {
    try {
      const allowed = await valkeyRateCheck(`rl:${key}`, windowMs, limit);
      return { allowed, retryAfter };
    } catch (err) {
      // These limits guard IAP verify, promote and membership purchases. A
      // per-process window would multiply the real limit by the instance count,
      // so a Valkey failure must not quietly loosen it. Same rule as the main
      // API limiter and wsRateCheck: fail closed in production.
      if (!allowLocalRateLimit) {
        logger.error({ err, action }, "checkRateLimit: Valkey unavailable — failing closed");
        return { allowed: false, retryAfter };
      }
    }
  } else if (!allowLocalRateLimit) {
    logger.error({ action }, "checkRateLimit: Valkey required in production");
    return { allowed: false, retryAfter };
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

/**
 * A Play purchaseType is only present when nobody paid the shelf price:
 * 0 license test, 1 promo code, 2 rewarded. The coins are legitimately owned,
 * but deriving catalogue GBP from them would invent revenue and a creator
 * payout liability for money Google never collected.
 */
function googlePurchaseIsUnpaid(purchaseType: number | null): boolean {
  return purchaseType === 0 || purchaseType === 1 || purchaseType === 2;
}

// --- Apple receipt verification via App Store Server API ---
type AppleReceiptCheck = {
  valid: boolean;
  /** Only meaningful when valid is false. "unavailable" must be retryable. */
  reason?: 'invalid' | 'unavailable';
  productId?: string;
  detail?: string;
  payload?: Record<string, unknown>;
};

async function verifyAppleReceipt(transactionId: string): Promise<AppleReceiptCheck> {
  const result = await fetchAppleTransaction(transactionId);
  if (result.valid === false) {
    return {
      valid: false,
      reason: result.reason,
      productId: result.productId,
      detail: result.detail,
      payload: result.payload as Record<string, unknown> | undefined,
    };
  }
  // Consumable coin purchases must NOT credit for a transaction that Apple has
  // revoked or refunded. fetchAppleTransaction checks signature, app and
  // environment, so revocation is rejected here.
  if (
    typeof result.payload.revocationDate === 'number' &&
    result.payload.revocationDate > 0
  ) {
    return {
      valid: false,
      reason: 'invalid',
      productId: result.productId,
      detail: 'apple-transaction-revoked',
      payload: result.payload as Record<string, unknown>,
    };
  }
  return {
    valid: true,
    productId: result.productId,
    detail: result.detail,
    payload: result.payload as Record<string, unknown>,
  };
}

/**
 * Apple binds a purchase to the account that made it through appAccountToken,
 * which this app always sets. A transaction carrying somebody else's token is a
 * replay of their purchase and must never settle here.
 */
function appleTokenOwnershipError(
  userId: string,
  payload: Record<string, unknown> | null | undefined,
  opts: { required: boolean },
): 'missing_app_account_token' | 'app_account_token_mismatch' | null {
  const actual =
    payload && typeof payload.appAccountToken === 'string'
      ? payload.appAccountToken.trim()
      : '';
  if (!actual) return opts.required ? 'missing_app_account_token' : null;
  return actual.toLowerCase() === appAccountTokenForUserId(userId).toLowerCase()
    ? null
    : 'app_account_token_mismatch';
}

/**
 * The Play billing flow is launched with setObfuscatedAccountId(appAccountToken),
 * so Google hands that same value back as obfuscatedExternalAccountId. When it is
 * there it identifies the buyer, and a purchase carrying another account's id is
 * a replay of their purchase. Purchases made before the app sent the id have
 * none, so an absent id falls back to the durable first-settlement binding.
 */
function googleTokenOwnershipError(
  userId: string,
  externalAccountId: string | null | undefined,
): 'app_account_token_mismatch' | null {
  const actual = String(externalAccountId || '').trim();
  if (!actual) return null;
  return actual.toLowerCase() === appAccountTokenForUserId(userId).toLowerCase()
    ? null
    : 'app_account_token_mismatch';
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
    if (fraudIap.ok === false) return res.status(429).json({ error: fraudIap.code });

    try {
    const { userId, packageId, provider, receipt, transactionId } = req.body ?? {};
    if (!userId || !packageId || !provider || !transactionId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (userId !== user.sub) return res.status(403).json({ error: 'Forbidden' });
    if (!getPool()) return res.status(503).json({ error: 'Database not configured' });

    const safeProvider = provider === 'google' ? 'google' : provider === 'apple' ? 'apple' : '';
    if (!safeProvider) return res.status(400).json({ error: `Unknown provider: ${provider}` });

    const productGate = gateProviderProduct(safeProvider, String(packageId));
    if (productGate.ok === false) {
      logger.warn(
        { provider: safeProvider, packageId, code: productGate.code },
        'IAP rejected — product not allowed for declared provider',
      );
      return res.status(400).json({
        error: productGate.error,
        code: productGate.code,
      });
    }

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
    const settled = await neonSettledIapPurchase(safeProvider, providerTransactionId);
    if (settled) {
      // A store transaction belongs to whoever settled it first, permanently.
      // Replaying it from another account, or against another product, is not a
      // duplicate of that account's own purchase and must not read as success.
      if (settled.userId !== String(userId)) {
        logger.warn(
          { provider: safeProvider, userId: user.sub, packageId },
          'IAP rejected — transaction already settled for another account',
        );
        return res.status(403).json({
          error: 'Transaction belongs to another account',
          code: 'transaction_owned_by_another_user',
        });
      }
      if (settled.productId && settled.productId !== String(packageId)) {
        logger.warn(
          { provider: safeProvider, userId: user.sub, packageId, settled: settled.productId },
          'IAP rejected — transaction already settled for another product',
        );
        return res.status(409).json({
          error: 'Transaction already settled for a different product',
          code: 'transaction_product_conflict',
        });
      }
      if (safeProvider === 'google' && googlePurchaseToken) {
        const { consumeGooglePlayAfterCredit } = await import('../lib/googlePlayConsume');
        await consumeGooglePlayAfterCredit({
          productId: String(packageId),
          purchaseToken: googlePurchaseToken,
          externalPurchaseId: `${safeProvider}:${providerTransactionId}`,
        });
      }
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
    let applePayload: Record<string, unknown> | null = null;
    let googleQuantity = 1;
    let googleUnpaidPurchase = false;
    if (safeProvider === 'apple') {
      const apple = await verifyAppleReceipt(String(transactionId));
      if (apple.valid === false && apple.reason === 'unavailable') {
        // No verdict was reached. The customer may already have been charged, and
        // the StoreKit transaction is still unfinished, so this must read as
        // "try again" — not as a rejected receipt.
        logger.error(
          { provider: 'apple', packageId, userId: user.sub, detail: apple.detail },
          'Apple verification unavailable — coins not credited, retry is safe',
        );
        return res.status(503).json({
          error: 'Apple verification is temporarily unavailable',
          code: 'verification_unavailable',
          retry: true,
          detail: typeof apple.detail === 'string' ? apple.detail.slice(0, 300) : undefined,
        });
      }
      isValid = apple.valid;
      applePayload = apple.payload ?? null;
      verificationResponse = { provider: 'apple', verified: apple.valid, productId: apple.productId, detail: apple.detail };
    } else {
      const google = await verifyGooglePlayProductPurchase({
        productId: String(packageId),
        purchaseToken: googlePurchaseToken,
      });
      if (google.valid === false && google.reason === 'unavailable') {
        // Play has already charged the buyer and still holds an unconsumed
        // token. Calling that an invalid receipt loses the sale and hands the
        // customer an automatic refund three days later, so ask for a retry.
        logger.error(
          { provider: 'google', packageId, userId: user.sub, detail: google.detail },
          'Google verification unavailable — coins not credited, retry is safe',
        );
        return res.status(503).json({
          error: 'Google Play verification is temporarily unavailable',
          code: 'verification_unavailable',
          retry: true,
          detail: google.detail.slice(0, 300),
        });
      }
      isValid = google.valid;
      if (google.valid === true) {
        const ownership = googleTokenOwnershipError(user.sub, google.obfuscatedExternalAccountId);
        if (ownership) {
          logger.warn(
            { userId: user.sub, packageId, ownership },
            'IAP rejected — Google purchase belongs to another account',
          );
          return res.status(403).json({
            error: 'Transaction belongs to another account',
            code: ownership,
          });
        }
        googleQuantity = google.quantity;
        googleUnpaidPurchase = googlePurchaseIsUnpaid(google.purchaseType);
      }
      verificationResponse = {
        provider: 'google',
        verified: google.valid,
        productId: google.productId,
        detail: google.detail,
        ...(google.valid === true
          ? {
              quantity: google.quantity,
              purchaseType: google.purchaseType,
              orderId: google.orderId,
              unpaidPurchase: googleUnpaidPurchase,
            }
          : {}),
      };
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
    if (safeProvider === 'google' && verificationResponse.productId) {
      if (String(verificationResponse.productId) !== String(packageId)) {
        logger.warn(
          { claimed: packageId, actual: verificationResponse.productId },
          'Google IAP productId mismatch',
        );
        return res.status(400).json({ error: 'Product ID mismatch' });
      }
    }

    if (safeProvider === 'apple') {
      const ownership = appleTokenOwnershipError(user.sub, applePayload, { required: true });
      if (ownership) {
        logger.warn({ userId: user.sub, ownership }, `IAP rejected — Apple ${ownership}`);
        return res.status(400).json({
          error:
            ownership === 'missing_app_account_token'
              ? 'Missing appAccountToken'
              : 'appAccountToken mismatch',
          code: ownership,
        });
      }
    }

    const coinMap = await dbLoadCoinMap();
    const catalogCoins = coinAmountForProviderProduct(safeProvider, String(packageId));
    const packCoins = catalogCoins > 0 ? catalogCoins : coinMap[String(packageId)] || 0;
    // Quantity is Google's number, not the client's. Crediting one pack for a
    // multi-quantity purchase would keep money for coins never delivered.
    const coins = packCoins * googleQuantity;
    if (coins <= 0) {
      // Receipt was valid but the product is not present in the coin_packages map.
      logger.warn(
        { packageId, provider: safeProvider, knownPackages: Object.keys(coinMap) },
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
      applePayload,
      googlePurchaseToken: safeProvider === 'google' ? googlePurchaseToken : null,
      unpaidPurchase: googleUnpaidPurchase,
      quantity: googleQuantity,
    });

    if (credited.ok) {
      if (safeProvider === 'google' && googlePurchaseToken) {
        const { consumeGooglePlayAfterCredit } = await import('../lib/googlePlayConsume');
        await consumeGooglePlayAfterCredit({
          productId: String(packageId),
          purchaseToken: googlePurchaseToken,
          externalPurchaseId: `${safeProvider}:${providerTransactionId}`,
        });
      }
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
      if (safeProvider === 'google' && googlePurchaseToken) {
        const { consumeGooglePlayAfterCredit } = await import('../lib/googlePlayConsume');
        await consumeGooglePlayAfterCredit({
          productId: String(packageId),
          purchaseToken: googlePurchaseToken,
          externalPurchaseId: `${safeProvider}:${providerTransactionId}`,
        });
      }
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

  const meta = PROMOTE_IAP_PRODUCTS[String(productId) as keyof typeof PROMOTE_IAP_PRODUCTS];
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
    if (await neonIsPromoteProcessed(providerTransactionId)) {
      return res.json({ success: true, message: 'Already processed' });
    }
  } catch {
    return res.status(500).json({ error: 'Deduplication check failed' });
  }
  let valid = false;
  let applePayload: Record<string, unknown> | null = null;
  if (provider === 'apple') {
    const apple = await verifyAppleReceipt(String(transactionId));
    if (apple.valid === false && apple.reason === 'unavailable') {
      logger.error(
        { productId, userId: user.sub, detail: apple.detail },
        'Apple promote verification unavailable — retry is safe',
      );
      return res.status(503).json({
        error: 'Apple verification is temporarily unavailable',
        code: 'verification_unavailable',
        retry: true,
      });
    }
    applePayload = apple.payload ?? null;
    // A promote transaction that carries another account's Apple token is a
    // replay of that person's purchase. Older builds sent no token at all, so a
    // token that is absent falls back to the durable transaction-id dedupe.
    const ownership = appleTokenOwnershipError(user.sub, applePayload, { required: false });
    if (ownership) {
      logger.warn({ userId: user.sub, ownership }, 'Promote rejected — Apple token belongs to another account');
      return res.status(403).json({ error: 'Transaction belongs to another account', code: ownership });
    }
    valid = apple.valid && apple.productId === String(productId);
  } else {
    const google = await verifyGooglePlayProductPurchase({
      productId: String(productId),
      purchaseToken: googlePurchaseToken,
    });
    if (google.valid === false && google.reason === 'unavailable') {
      logger.error(
        { productId, userId: user.sub, detail: google.detail },
        'Google promote verification unavailable — retry is safe',
      );
      return res.status(503).json({
        error: 'Google Play verification is temporarily unavailable',
        code: 'verification_unavailable',
        retry: true,
      });
    }
    if (google.valid === true) {
      const ownership = googleTokenOwnershipError(user.sub, google.obfuscatedExternalAccountId);
      if (ownership) {
        logger.warn(
          { userId: user.sub, productId, ownership },
          'Promote rejected — Google purchase belongs to another account',
        );
        return res.status(403).json({ error: 'Transaction belongs to another account', code: ownership });
      }
    }
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
    const { autoPostPromoteRevenue } = await import('../lib/monetisation/storeSettlement');
    const posted = await autoPostPromoteRevenue({
      providerTransactionId,
      userId: user.sub,
      productId: String(productId),
      contentId: String(contentId || ''),
      amountGbp: meta.amountGbp,
      applePayload,
    });
    if (!posted.ok) {
      logger.error({ providerTransactionId, posted }, 'Promote revenue post returned not ok');
      return res.status(500).json({
        error: 'PROMOTE_REVENUE_POST_FAILED',
        message: 'Promote purchase saved but revenue post failed — retry is safe.',
        retry: true,
      });
    }
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

  const productId =
    store === 'apple'
      ? APPLE_CREATOR_MEMBERSHIP_PRODUCT_ID
      : creatorMembershipProductId(creatorId);
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
      if (claimedProductId !== APPLE_CREATOR_MEMBERSHIP_PRODUCT_ID) {
        const mapped = await pool.query(
          `SELECT creator_id FROM elix_creator_membership_products WHERE product_id = $1 LIMIT 1`,
          [claimedProductId],
        );
        if (mapped.rowCount) creatorId = String(mapped.rows[0].creator_id);
      }
    } catch (err) {
      logger.warn({ err, claimedProductId }, 'Membership product→creator lookup failed');
    }
  }
  if (!creatorId) return res.status(400).json({ error: 'creatorId required' });
  if (creatorId === user.sub) {
    return res.status(400).json({ error: 'Cannot subscribe to your own membership' });
  }

  const expectedProductId =
    provider === 'apple'
      ? APPLE_CREATOR_MEMBERSHIP_PRODUCT_ID
      : creatorMembershipProductId(creatorId);
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
    if (verified.ok === false && verified.reason === 'unavailable') {
      logger.error(
        { userId: user.sub, creatorId, detail: verified.error },
        'Apple subscription verification unavailable — retry is safe',
      );
      return res.status(503).json({
        error: 'Apple verification is temporarily unavailable',
        code: 'verification_unavailable',
        retry: true,
      });
    }
    if (verified.ok === false || !verified.entitled) {
      return res.status(400).json({
        error: 'Invalid or unverified subscription',
        detail: verified.ok === false ? verified.error : undefined,
        subscriptionState: verified.subscriptionState ?? null,
      });
    }

    // This app has always set appAccountToken on the membership purchase, so a
    // subscription that reports a different owner is somebody else's.
    const subOwnership = appleTokenOwnershipError(
      user.sub,
      verified.rawTransaction as Record<string, unknown>,
      { required: true },
    );
    if (subOwnership) {
      logger.warn(
        { userId: user.sub, creatorId, ownership: subOwnership },
        'Membership rejected — Apple subscription does not belong to this account',
      );
      return res.status(403).json({
        error: 'Subscription belongs to another account',
        code: subOwnership,
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
      if (upserted.ok === false) {
        if (upserted.error === 'ownership_conflict') {
          return res.status(409).json({ error: 'Purchase token already bound' });
        }
        return res.status(500).json({ error: 'Failed to record membership' });
      }
      await markAppleCreatorMembershipActive(creatorId, expectedProductId);
      try {
        const { autoPostSubscriptionRevenue } = await import('../lib/monetisation/storeSettlement');
        const posted = await autoPostSubscriptionRevenue({
          subscriptionId: upserted.id,
          creatorUserId: creatorId,
          payerUserId: user.sub,
          externalTransactionId: verified.transactionId || verified.originalTransactionId,
          applePayload: verified.rawTransaction as Record<string, unknown>,
        });
        if (!posted.ok) {
          logger.error({ creatorId, posted }, 'Membership GBP ledger post returned not ok');
          return res.status(500).json({
            error: 'MEMBERSHIP_REVENUE_POST_FAILED',
            message: 'Membership saved but revenue post failed — retry is safe.',
            retry: true,
          });
        }
      } catch (earnErr) {
        logger.error({ err: earnErr, creatorId }, 'Membership GBP ledger post failed');
        return res.status(500).json({
          error: 'MEMBERSHIP_REVENUE_POST_FAILED',
          message: 'Membership saved but revenue post failed — retry is safe.',
          retry: true,
        });
      }
      if (upserted.created) {
        logger.info(
          {
            creatorId,
            subscriberId: user.sub,
            externalTransactionId: verified.originalTransactionId,
          },
          'Membership created — automatic 60/40 creator earnings posted when entitled',
        );
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
  if (verified.ok === false && verified.reason === 'unavailable') {
    // Play has taken the first payment. Refusing the token permanently would
    // leave a charged subscriber with no entitlement, so ask for a retry.
    logger.error(
      { productId: expectedProductId, userId: user.sub, detail: verified.error },
      'Google subscription verification unavailable — retry is safe',
    );
    return res.status(503).json({
      error: 'Google Play verification is temporarily unavailable',
      code: 'verification_unavailable',
      retry: true,
    });
  }
  if (verified.ok === false || !verified.entitled) {
    return res.status(400).json({
      error: 'Invalid or unverified subscription',
      detail: verified.ok === false ? verified.error : undefined,
      subscriptionState: verified.subscriptionState ?? null,
    });
  }
  if (
    verified.basePlanId &&
    verified.basePlanId !== CREATOR_MEMBERSHIP_BASE_PLAN_ID
  ) {
    return res.status(400).json({ error: 'Base plan mismatch' });
  }
  const googleOwnership = googleTokenOwnershipError(user.sub, verified.externalAccountId);
  if (googleOwnership) {
    logger.warn(
      { userId: user.sub, creatorId, ownership: googleOwnership },
      'Membership rejected — Google subscription belongs to another account',
    );
    return res.status(403).json({
      error: 'Transaction belongs to another account',
      code: googleOwnership,
    });
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
    if (upserted.ok === false) {
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

    try {
      const { autoPostSubscriptionRevenue } = await import('../lib/monetisation/storeSettlement');
      const posted = await autoPostSubscriptionRevenue({
        subscriptionId: upserted.id,
        creatorUserId: creatorId,
        payerUserId: user.sub,
        externalTransactionId: verified.latestOrderId || purchaseTokenHash,
      });
      if (!posted.ok) {
        logger.error({ creatorId, posted }, 'Google membership GBP ledger post returned not ok');
        return res.status(500).json({
          error: 'MEMBERSHIP_REVENUE_POST_FAILED',
          message: 'Membership saved but revenue post failed — retry is safe.',
          retry: true,
        });
      }
    } catch (earnErr) {
      logger.error({ err: earnErr, creatorId }, 'Google membership GBP ledger post failed');
      return res.status(500).json({
        error: 'MEMBERSHIP_REVENUE_POST_FAILED',
        message: 'Membership saved but revenue post failed — retry is safe.',
        retry: true,
      });
    }
    if (upserted.created) {
      logger.info(
        {
          creatorId,
          subscriberId: user.sub,
          externalTransactionId: verified.latestOrderId || purchaseTokenHash,
        },
        'Membership created — automatic 60/40 creator earnings posted when entitled',
      );
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
