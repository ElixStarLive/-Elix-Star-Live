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
  /** True only when Google Play has an ACTIVE monthly base plan for this creator. */
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
  } catch {
    return [];
  }
}

let purchaseInProgress = false;

export async function purchaseProduct(productId: IAPProductId): Promise<IAPPurchaseResult> {
  if (!platform.isNative) {
    return { success: false, error: 'In-app purchases are only available in the app' };
  }

  if (purchaseInProgress) {
    return { success: false, error: 'A purchase is already in progress' };
  }

  const mod = await getPlugin();
  if (!mod) {
    return { success: false, error: 'Purchase service not available' };
  }

  const available = await isBillingAvailable();
  if (!available) {
    return { success: false, error: 'Purchases are not supported on this device' };
  }

  purchaseInProgress = true;
  try {
    const result = await mod.NativePurchases.purchaseProduct({
      productIdentifier: productId,
      productType: mod.PURCHASE_TYPE.INAPP,
      quantity: 1,
    });

    const transactionId = result.transactionId;
    const receipt = result.receipt || result.purchaseToken || '';

    if (!transactionId) {
      return { success: false, error: 'Purchase could not be verified' };
    }

    const verifyResult = await verifyAndCreditPurchase(
      productId,
      transactionId,
      receipt,
    );

    if (!verifyResult.success) {
      return { success: false, error: verifyResult.error || 'Verification failed. Please contact support if you were charged.' };
    }

    // Coins are consumable. Android must consume the purchase token after credit
    // so the same SKU can be bought again; acknowledge alone is not enough.
    try {
      if (platform.isAndroid && 'consumePurchase' in mod.NativePurchases && receipt) {
        await (mod.NativePurchases as unknown as StoreCompletionMethods).consumePurchase({ purchaseToken: receipt });
      } else if ('acknowledgePurchase' in mod.NativePurchases) {
        await (mod.NativePurchases as unknown as StoreCompletionMethods).acknowledgePurchase({
          transactionIdentifier: transactionId,
          purchaseToken: receipt,
        });
      }
    } catch { /* best-effort store completion */ }

    return {
      success: true,
      transactionId,
      receipt,
      coins: IAP_PRODUCTS[productId]?.coins ?? 0,
      newBalance: verifyResult.newBalance,
    };
  } catch (err) {
    const msg = err?.message || String(err);
    if (msg.includes('cancel') || msg.includes('Cancel') || msg.includes('USER_CANCELED')) {
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
  const { data, error } = await request(
    `/api/membership/${encodeURIComponent(creatorId)}/status`,
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
 * Purchase a creator-specific recurring membership through Google Play, then
 * persist the server-verified entitlement.
 */
export async function purchaseMembership(
  creatorId: string,
): Promise<{ success: boolean; status?: MembershipStatus; error?: string }> {
  if (!platform.isNative) {
    return { success: false, error: 'Membership is only available in the app' };
  }
  if (!platform.isAndroid) {
    return { success: false, error: 'Creator memberships are not configured for iOS yet' };
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
        'Membership is still being set up in Google Play. Please try again in a moment.',
    };
  }

  membershipPurchaseInProgress = true;
  try {
    const result = await mod.NativePurchases.purchaseProduct({
      productIdentifier: current.status.productId,
      planIdentifier: current.status.basePlanId,
      productType: mod.PURCHASE_TYPE.SUBS,
      quantity: 1,
      autoAcknowledgePurchases: false,
    });
    const transactionId = result.transactionId;
    const receipt = result.receipt || result.purchaseToken || '';
    if (!transactionId || !receipt) {
      return { success: false, error: 'Purchase could not be verified' };
    }

    const { data, error } = await request('/api/membership/iap-complete', {
      method: 'POST',
      body: JSON.stringify({
        transactionId,
        receipt,
        provider: 'google',
        productId: current.status.productId,
        basePlanId: current.status.basePlanId,
        creatorId,
      }),
    });
    if (error) return { success: false, error: error.message || 'Membership verification failed' };

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

// Apple/Google store compliance: re-delivers unfinished transactions only.
// This does NOT refund coins or reverse purchases. All purchases are final.
export async function restorePurchases(): Promise<void> {
  if (!platform.isNative) return;

  const mod = await getPlugin();
  if (!mod) return;
  await mod.NativePurchases.restorePurchases();
}
