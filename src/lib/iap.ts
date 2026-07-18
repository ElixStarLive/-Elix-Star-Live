/**
 * Apple / Google In-App Purchase Service
 * Uses @capgo/native-purchases for StoreKit 2 (iOS) and Google Play Billing (Android).
 */

import { platform } from './platform';
import { useAuthStore } from '../store/useAuthStore';
import { request } from './apiClient';

// Product IDs — must match App Store Connect / Google Play Console
export const IAP_PRODUCTS = {
  'com.elixstarlive.coins_100':  { coins: 100,  label: '100 Coins' },
  'com.elixstarlive.coins_500':  { coins: 500,  label: '500 Coins' },
  'com.elixstarlive.coins_1000': { coins: 1000, label: '1,000 Coins' },
  'com.elixstarlive.coins_5000': { coins: 5000, label: '5,000 Coins' },
} as const;

// Promote boost product IDs (Apple IAP) — match goals: views £5, likes £10, profile £20, followers £30
export const PROMOTE_PRODUCTS = {
  'com.elixstarlive.promote_views':     { goal: 'views',     label: 'More video views',      amountGbp: 5  },
  'com.elixstarlive.promote_likes':     { goal: 'likes',     label: 'More likes & comments', amountGbp: 10 },
  'com.elixstarlive.promote_profile':   { goal: 'profile',   label: 'More profile views',    amountGbp: 20 },
  'com.elixstarlive.promote_followers': { goal: 'followers', label: 'More followers',        amountGbp: 30 },
} as const;

export const PROMOTE_PRODUCT_IDS = Object.keys(PROMOTE_PRODUCTS) as PromoteProductId[];
export type PromoteProductId = keyof typeof PROMOTE_PRODUCTS;

export const IAP_PRODUCT_IDS = Object.keys(IAP_PRODUCTS) as IAPProductId[];
export type IAPProductId = keyof typeof IAP_PRODUCTS;

/** Legacy membership SKU. Creator subscriptions now use server-derived product IDs. */
export const MEMBERSHIP_PRODUCT_ID = 'com.elixstarlive.membership';

export interface MembershipStatus {
  active: boolean;
  productId: string;
  basePlanId: string;
  /** True when the store product is buyable (Play active, or Apple pre-provisioned/active). */
  purchaseReady?: boolean;
  provisionStatus?: 'pending' | 'active' | 'error';
  provisionDetail?: string;
  expiresAt?: string;
  autoRenewing?: boolean;
  subscriptionState?: string;
}

export interface IAPProduct {
  id: string;
  title: string;
  description: string;
  price: string;
  priceAmountMicros: number;
  coins: number;
}

export interface IAPPurchaseResult {
  success: boolean;
  transactionId?: string;
  receipt?: string;
  error?: string;
  coins?: number;
  /** Authoritative wallet balance after server verification (prefer over local math). */
  newBalance?: number;
}

let _billingSupported: boolean | null = null;
let _plugin: typeof import('@capgo/native-purchases').NativePurchases | null = null;
let _PURCHASE_TYPE: typeof import('@capgo/native-purchases').PURCHASE_TYPE | null = null;

/**
 * Fire-and-forget diagnostic beacon for the IAP flow. In the store build `console.*`
 * is stripped, so this lands the stage in `elix_analytics_events` (event `iap_debug`)
 * where it is queryable. Never allowed to throw / block a purchase.
 */
function reportIapStage(stage: string, data: Record<string, unknown> = {}): void {
  try {
    // eslint-disable-next-line no-console
    console.info?.(`[IAP] ${stage}`, data);
  } catch { /* ignore */ }
  try {
    void request('/api/analytics/track', {
      method: 'POST',
      body: JSON.stringify({
        event: 'iap_debug',
        properties: {
          stage,
          platform: platform.isIOS ? 'ios' : platform.isAndroid ? 'android' : 'web',
          ...data,
        },
      }),
    });
  } catch { /* diagnostics must never break a purchase */ }
}

/** Optional Android store-completion methods not present in every plugin version. */
type StoreCompletionMethods = {
  consumePurchase(options: { purchaseToken: string }): Promise<unknown>;
  acknowledgePurchase(options: { transactionIdentifier: string; purchaseToken: string }): Promise<unknown>;
};

async function getPlugin() {
  if (_plugin) return { NativePurchases: _plugin, PURCHASE_TYPE: (_PURCHASE_TYPE as NonNullable<typeof _PURCHASE_TYPE>) };
  try {
    const mod = await import('@capgo/native-purchases');
    _plugin = mod.NativePurchases;
    _PURCHASE_TYPE = mod.PURCHASE_TYPE;
    return { NativePurchases: _plugin, PURCHASE_TYPE: _PURCHASE_TYPE };
  } catch {
    return null;
  }
}

export async function initializeIAP(): Promise<void> {
  if (!platform.isNative) return;

  try {
    const mod = await getPlugin();
    if (!mod) return;

    const { isBillingSupported } = await mod.NativePurchases.isBillingSupported();
    _billingSupported = isBillingSupported;
  } catch {
    _billingSupported = false;
  }
}

export async function isBillingAvailable(): Promise<boolean> {
  if (!platform.isNative) return false;
  if (_billingSupported !== null) return _billingSupported;
  await initializeIAP();
  return _billingSupported ?? false;
}

export async function loadProducts(): Promise<IAPProduct[]> {
  if (!platform.isNative) return [];

  try {
    const mod = await getPlugin();
    if (!mod) return [];

    const { products } = await mod.NativePurchases.getProducts({
      productIdentifiers: [...IAP_PRODUCT_IDS],
      productType: mod.PURCHASE_TYPE.INAPP,
    });

    if (!products || products.length === 0) {
      // Empty here almost always means: product IDs not created/active in Play Console,
      // app not installed from a Play track, or the build is signed with the wrong key.
      reportIapStage('products_empty', { requested: [...IAP_PRODUCT_IDS] });
    } else {
      reportIapStage('products_loaded', {
        count: products.length,
        requested: IAP_PRODUCT_IDS.length,
        ids: products.map((p: { identifier?: string; productIdentifier?: string }) => p.identifier || p.productIdentifier),
      });
    }

    return products.map((p: {
      identifier?: string;
      productIdentifier?: string;
      title?: string;
      description?: string;
      priceString?: string;
      priceAmountMicros?: number;
    }) => ({
      id: p.identifier || p.productIdentifier,
      title: p.title || '',
      description: p.description || '',
      price: p.priceString || `$${(p.priceAmountMicros / 1_000_000).toFixed(2)}`,
      priceAmountMicros: p.priceAmountMicros || 0,
      coins: IAP_PRODUCTS[p.identifier as IAPProductId]?.coins ?? 0,
    }));
  } catch (err) {
    reportIapStage('load_products_error', { error: (err as { message?: string })?.message || String(err) });
    return [];
  }
}

let purchaseInProgress = false;

/** Deterministic UUID (v5-style) from a user id for StoreKit appAccountToken. */
function appAccountTokenForUser(userId: string): string {
  const nsHex = '6ba7b8109dad11d180b400c04fd430c8';
  const pairs = nsHex.match(/.{2}/g) || [];
  const ns = new Uint8Array(pairs.map((b) => parseInt(b, 16)));
  const data = new TextEncoder().encode(userId);
  const bytes = new Uint8Array(20);
  for (let i = 0; i < ns.length; i++) bytes[i % 20] ^= ns[i];
  for (let i = 0; i < data.length; i++) bytes[i % 20] ^= data[i] + i;
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

type NativePurchasesPlugin = NonNullable<Awaited<ReturnType<typeof getPlugin>>>;

/** Launch the native Google Play / StoreKit purchase flow for a coin SKU. */
function launchPurchase(mod: NativePurchasesPlugin, productId: IAPProductId) {
  const { user } = useAuthStore.getState();
  return mod.NativePurchases.purchaseProduct({
    productIdentifier: productId,
    productType: mod.PURCHASE_TYPE.INAPP,
    quantity: 1,
    ...(user?.id ? { appAccountToken: appAccountTokenForUser(user.id) } : {}),
  });
}

/**
 * Consume the purchase after the server has credited coins.
 * Coins are consumable, so Android MUST consume the token, otherwise the same SKU
 * cannot be bought again (Google returns ITEM_ALREADY_OWNED on the next attempt).
 */
async function completeCoinPurchase(
  mod: NativePurchasesPlugin,
  transactionId: string,
  receipt: string,
): Promise<void> {
  try {
    if (platform.isAndroid && 'consumePurchase' in mod.NativePurchases && receipt) {
      await (mod.NativePurchases as unknown as StoreCompletionMethods).consumePurchase({ purchaseToken: receipt });
      reportIapStage('consumed');
    } else if ('acknowledgePurchase' in mod.NativePurchases) {
      await (mod.NativePurchases as unknown as StoreCompletionMethods).acknowledgePurchase({
        transactionIdentifier: transactionId,
        purchaseToken: receipt,
      });
      reportIapStage('acknowledged');
    }
  } catch (e) {
    reportIapStage('consume_error', { error: (e as { message?: string })?.message });
  }
}

/**
 * Verify + credit + consume any coin purchase the store still considers "owned".
 * This clears the stuck ITEM_ALREADY_OWNED state that occurs when an earlier
 * purchase was paid for but never consumed (e.g. a prior verification failure).
 * Returns the number of purchases successfully credited.
 */
export async function reconcileOwnedCoinPurchases(): Promise<number> {
  if (!platform.isNative) return 0;
  const mod = await getPlugin();
  if (!mod) return 0;

  let credited = 0;
  try {
    const { purchases } = await mod.NativePurchases.getPurchases();
    for (const purchase of purchases || []) {
      const productId = String(purchase.productIdentifier || '');
      const transactionId = String(purchase.transactionId || '');
      const receipt = purchase.receipt || purchase.purchaseToken || '';
      if (!(productId in IAP_PRODUCTS) || !receipt || !transactionId) continue;

      reportIapStage('reconcile_found_owned', { productId });
      const verified = await verifyAndCreditPurchase(productId as IAPProductId, transactionId, receipt);
      if (verified.success) {
        credited += 1;
        await completeCoinPurchase(mod, transactionId, receipt);
        reportIapStage('reconcile_credited', { productId });
      } else {
        reportIapStage('reconcile_verify_failed', { productId, error: verified.error });
      }
    }
  } catch (err) {
    reportIapStage('reconcile_error', { error: (err as { message?: string })?.message || String(err) });
  }
  return credited;
}

function isAlreadyOwnedError(msg: string): boolean {
  return /already own|ITEM_ALREADY_OWNED|not purchased/i.test(msg);
}

function isCancelError(msg: string): boolean {
  return /cancel/i.test(msg) || msg.includes('USER_CANCELED');
}

export async function purchaseProduct(productId: IAPProductId): Promise<IAPPurchaseResult> {
  if (!platform.isNative) {
    return { success: false, error: 'In-app purchases are only available in the app' };
  }

  if (purchaseInProgress) {
    return { success: false, error: 'A purchase is already in progress' };
  }

  const mod = await getPlugin();
  if (!mod) {
    reportIapStage('plugin_unavailable');
    return { success: false, error: 'Purchase service not available' };
  }

  const available = await isBillingAvailable();
  if (!available) {
    reportIapStage('billing_unavailable');
    return { success: false, error: 'Purchases are not supported on this device' };
  }

  purchaseInProgress = true;
  try {
    reportIapStage('purchase_start', { productId });
    let result: Awaited<ReturnType<typeof launchPurchase>>;
    try {
      result = await launchPurchase(mod, productId);
    } catch (err) {
      const msg = (err as { message?: string })?.message || String(err);
      if (isCancelError(msg)) {
        reportIapStage('purchase_cancelled', { productId });
        return { success: false, error: 'Purchase cancelled' };
      }
      if (isAlreadyOwnedError(msg)) {
        // A previous purchase is stuck "owned" and blocks a new buy. Credit + consume
        // it, then retry once so the customer gets what they paid for.
        reportIapStage('already_owned_recovering', { productId, msg });
        const recovered = await reconcileOwnedCoinPurchases();
        if (recovered > 0) {
          reportIapStage('already_owned_recovered', { productId, recovered });
          return { success: true, coins: IAP_PRODUCTS[productId]?.coins ?? 0 };
        }
        try {
          result = await launchPurchase(mod, productId);
        } catch (err2) {
          const msg2 = (err2 as { message?: string })?.message || String(err2);
          reportIapStage('retry_failed', { productId, error: msg2 });
          return { success: false, error: isCancelError(msg2) ? 'Purchase cancelled' : (msg2 || 'Purchase failed') };
        }
      } else {
        reportIapStage('purchase_launch_error', { productId, error: msg });
        return { success: false, error: msg || 'Purchase failed' };
      }
    }

    const transactionId = result.transactionId;
    const receipt = result.receipt || result.purchaseToken || '';
    reportIapStage('purchase_returned', { productId, hasTxn: !!transactionId, hasReceipt: !!receipt });

    if (!transactionId) {
      return { success: false, error: 'Purchase could not be verified' };
    }

    const verifyResult = await verifyAndCreditPurchase(productId, transactionId, receipt);
    reportIapStage('verify_result', { productId, success: verifyResult.success, error: verifyResult.error });

    if (!verifyResult.success) {
      return { success: false, error: verifyResult.error || 'Verification failed. Please contact support if you were charged.' };
    }

    await completeCoinPurchase(mod, transactionId, receipt);

    return {
      success: true,
      transactionId,
      receipt,
      coins: IAP_PRODUCTS[productId]?.coins ?? 0,
      newBalance: verifyResult.newBalance,
    };
  } catch (err) {
    const msg = (err as { message?: string })?.message || String(err);
    reportIapStage('purchase_unexpected_error', { productId, error: msg });
    if (isCancelError(msg)) {
      return { success: false, error: 'Purchase cancelled' };
    }
    return { success: false, error: msg || 'Purchase failed' };
  } finally {
    purchaseInProgress = false;
  }
}

export async function getMembershipStatus(
  creatorId: string,
): Promise<{ status?: MembershipStatus; error?: string }> {
  if (!creatorId) return { error: 'Creator unavailable' };
  const store = platform.isIOS ? 'apple' : 'google';
  const { data, error } = await request(
    `/api/membership/${encodeURIComponent(creatorId)}/status?store=${store}`,
  );
  if (error) return { error: error.message || 'Could not load membership status' };
  if (!data || typeof data.productId !== 'string' || typeof data.basePlanId !== 'string') {
    return { error: 'Membership is not configured for this creator' };
  }
  return {
    status: {
      active: data.active === true,
      productId: data.productId,
      basePlanId: data.basePlanId,
      purchaseReady: data.purchaseReady === true,
      provisionStatus:
        data.provisionStatus === 'active' ||
        data.provisionStatus === 'pending' ||
        data.provisionStatus === 'error'
          ? data.provisionStatus
          : undefined,
      provisionDetail:
        typeof data.provisionDetail === 'string' ? data.provisionDetail : undefined,
      expiresAt: typeof data.expiresAt === 'string' ? data.expiresAt : undefined,
      autoRenewing: data.autoRenewing === true,
      subscriptionState:
        typeof data.subscriptionState === 'string' ? data.subscriptionState : undefined,
    },
  };
}

let membershipPurchaseInProgress = false;

/**
 * Purchase a creator-specific recurring membership through Google Play or
 * Apple StoreKit, then persist the server-verified entitlement.
 */
export async function purchaseMembership(
  creatorId: string,
): Promise<{ success: boolean; status?: MembershipStatus; error?: string }> {
  if (!platform.isNative) {
    return { success: false, error: 'Membership is only available in the app' };
  }
  if (!platform.isAndroid && !platform.isIOS) {
    return { success: false, error: 'Creator memberships require the mobile app' };
  }
  if (membershipPurchaseInProgress || purchaseInProgress) {
    return { success: false, error: 'A purchase is already in progress' };
  }
  const mod = await getPlugin();
  if (!mod) return { success: false, error: 'Purchase service not available' };
  const available = await isBillingAvailable();
  if (!available) return { success: false, error: 'Purchases are not supported on this device' };

  const { session, user } = useAuthStore.getState();
  if (!session?.access_token || !user?.id) return { success: false, error: 'Not authenticated' };
  if (!creatorId || creatorId === user.id) {
    return { success: false, error: 'You cannot subscribe to your own membership' };
  }

  const current = await getMembershipStatus(creatorId);
  if (current.error || !current.status) {
    return { success: false, error: current.error || 'Membership is not configured' };
  }
  if (current.status.active) {
    return { success: true, status: current.status };
  }
  if (current.status.purchaseReady !== true) {
    return {
      success: false,
      error:
        current.status.provisionDetail ||
        (platform.isIOS
          ? 'Membership is still being set up in App Store Connect. Please try again later.'
          : 'Membership is still being set up in Google Play. Please try again in a moment.'),
    };
  }

  membershipPurchaseInProgress = true;
  try {
    const accountToken = appAccountTokenForUser(user.id);
    const result = await mod.NativePurchases.purchaseProduct({
      productIdentifier: current.status.productId,
      ...(platform.isAndroid ? { planIdentifier: current.status.basePlanId } : {}),
      productType: mod.PURCHASE_TYPE.SUBS,
      quantity: 1,
      appAccountToken: accountToken,
      autoAcknowledgePurchases: false,
    });
    const transactionId = result.transactionId;
    const receipt = result.receipt || result.purchaseToken || '';
    const jwsRepresentation =
      typeof result.jwsRepresentation === 'string' ? result.jwsRepresentation : '';
    if (!transactionId || (platform.isAndroid && !receipt)) {
      return { success: false, error: 'Purchase could not be verified' };
    }

    const { data, error } = await request('/api/membership/iap-complete', {
      method: 'POST',
      body: JSON.stringify({
        transactionId,
        receipt,
        jwsRepresentation: jwsRepresentation || undefined,
        provider: platform.isIOS ? 'apple' : 'google',
        productId: current.status.productId,
        basePlanId: current.status.basePlanId,
        creatorId,
      }),
    });
    if (error) return { success: false, error: error.message || 'Membership verification failed' };

    try {
      if ('acknowledgePurchase' in mod.NativePurchases) {
        await (mod.NativePurchases as unknown as StoreCompletionMethods).acknowledgePurchase({
          transactionIdentifier: transactionId,
          purchaseToken: receipt,
        });
      }
    } catch {
      /* best-effort store completion */
    }

    return {
      success: true,
      status: {
        active: data?.active === true,
        productId: current.status.productId,
        basePlanId: current.status.basePlanId,
        purchaseReady: true,
        provisionStatus: 'active',
        expiresAt: typeof data?.expiresAt === 'string' ? data.expiresAt : undefined,
        autoRenewing: data?.autoRenewing === true,
        subscriptionState:
          typeof data?.subscriptionState === 'string' ? data.subscriptionState : undefined,
      },
    };
  } catch (err) {
    const msg = (err as { message?: string })?.message || String(err);
    if (msg.includes('cancel') || msg.includes('Cancel') || msg.includes('USER_CANCELED')) {
      return { success: false, error: 'Purchase cancelled' };
    }
    return { success: false, error: msg || 'Purchase failed' };
  } finally {
    membershipPurchaseInProgress = false;
  }
}

/**
 * Purchase a promote boost via Apple/Google IAP. Does NOT credit coins.
 * Client must then call POST /api/promote-iap-complete with transactionId, receipt, goal, contentType, contentId.
 */
export async function purchasePromoteProduct(productId: PromoteProductId): Promise<{ success: boolean; transactionId?: string; receipt?: string; error?: string }> {
  if (!platform.isNative) {
    return { success: false, error: 'Promote via IAP is only available in the app' };
  }

  const mod = await getPlugin();
  if (!mod) return { success: false, error: 'Purchase service not available' };

  const available = await isBillingAvailable();
  if (!available) return { success: false, error: 'Purchases are not supported on this device' };

  try {
    const result = await mod.NativePurchases.purchaseProduct({
      productIdentifier: productId,
      productType: mod.PURCHASE_TYPE.INAPP,
      quantity: 1,
    });

    const transactionId = result.transactionId;
    const receipt = result.receipt || result.purchaseToken || '';

    if (!transactionId) return { success: false, error: 'Purchase could not be verified' };

    return { success: true, transactionId, receipt };
  } catch (err) {
    const msg = err?.message || String(err);
    if (msg.includes('cancel') || msg.includes('Cancel') || msg.includes('USER_CANCELED')) {
      return { success: false, error: 'Purchase cancelled' };
    }
    return { success: false, error: msg || 'Purchase failed' };
  }
}

/** Acknowledge/consume after server records success (required for Google Play). */
export async function finalizeNativePurchase(opts: {
  transactionId: string;
  receipt?: string;
}): Promise<void> {
  if (!platform.isNative || !opts.transactionId) return;
  const mod = await getPlugin();
  if (!mod) return;
  try {
    if (platform.isAndroid && 'consumePurchase' in mod.NativePurchases && opts.receipt) {
      await (mod.NativePurchases as unknown as StoreCompletionMethods).consumePurchase({ purchaseToken: opts.receipt });
    } else if ('acknowledgePurchase' in mod.NativePurchases) {
      await (mod.NativePurchases as unknown as StoreCompletionMethods).acknowledgePurchase({
        transactionIdentifier: opts.transactionId,
        purchaseToken: opts.receipt || '',
      });
    }
  } catch {
    /* best-effort store completion */
  }
}

async function verifyAndCreditPurchase(
  packageId: string,
  transactionId: string,
  receipt: string,
): Promise<{ success: boolean; error?: string; newBalance?: number }> {
  try {
    const { session, user } = useAuthStore.getState();
    if (!session?.access_token || !user?.id) return { success: false, error: 'Not authenticated' };

    const provider = platform.isIOS ? 'apple' : 'google';

    reportIapStage('verify_request', { packageId, provider, hasReceipt: !!receipt });

    const { data, error } = await request('/api/verify-purchase', {
      method: 'POST',
      body: JSON.stringify({
        userId: user.id,
        packageId,
        provider,
        receipt,
        transactionId,
      }),
    });

    if (error) {
      // error.message already includes the server `detail` (folded in by apiClient),
      // e.g. "Invalid receipt: google-verify-410: ...".
      reportIapStage('verify_server_error', { packageId, message: error.message });
      return { success: false, error: error.message || 'Server verification failed' };
    }

    const newBalance =
      data && typeof data.newBalance === 'number' && Number.isFinite(data.newBalance)
        ? Math.max(0, Math.floor(data.newBalance))
        : undefined;

    return { success: true, newBalance };
  } catch {
    return { success: false, error: 'Could not reach verification server' };
  }
}

/**
 * Store restore + server reconciliation.
 * - Syncs the native store queue
 * - Re-verifies coin IAPs and creator memberships against the backend
 * Does NOT refund or reverse purchases.
 */
export async function restorePurchases(): Promise<{
  restoredCoins: number;
  restoredMemberships: number;
  errors: string[];
}> {
  const empty = { restoredCoins: 0, restoredMemberships: 0, errors: [] as string[] };
  if (!platform.isNative) return empty;

  const mod = await getPlugin();
  if (!mod) return { ...empty, errors: ['Purchase service not available'] };

  const { session, user } = useAuthStore.getState();
  if (!session?.access_token || !user?.id) {
    return { ...empty, errors: ['Not authenticated'] };
  }

  try {
    await mod.NativePurchases.restorePurchases();
  } catch (err) {
    const msg = (err as { message?: string })?.message || String(err);
    return { ...empty, errors: [msg || 'Store restore failed'] };
  }

  let restoredCoins = 0;
  let restoredMemberships = 0;
  const errors: string[] = [];

  try {
    const { purchases } = await mod.NativePurchases.getPurchases();
    for (const purchase of purchases || []) {
      const productId = String(purchase.productIdentifier || '');
      const transactionId = String(purchase.transactionId || '');
      const receipt = purchase.receipt || purchase.purchaseToken || '';
      if (!productId || !transactionId) continue;

      if (productId in IAP_PRODUCTS) {
        const credited = await verifyAndCreditPurchase(productId as IAPProductId, transactionId, receipt);
        if (credited.success) restoredCoins += 1;
        else if (credited.error) errors.push(credited.error);
        continue;
      }

      if (productId.startsWith('elix.creator.')) {
        const { error } = await request('/api/membership/iap-complete', {
          method: 'POST',
          body: JSON.stringify({
            transactionId,
            receipt,
            jwsRepresentation:
              typeof purchase.jwsRepresentation === 'string'
                ? purchase.jwsRepresentation
                : undefined,
            provider: platform.isIOS ? 'apple' : 'google',
            productId,
          }),
        });
        if (!error) restoredMemberships += 1;
        else if (error.message) errors.push(error.message);
      }
    }
  } catch (err) {
    errors.push((err as { message?: string })?.message || 'Could not read store purchases');
  }

  return { restoredCoins, restoredMemberships, errors };
}
