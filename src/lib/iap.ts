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
}

let _billingSupported: boolean | null = null;
let _plugin: typeof import('@capgo/native-purchases').NativePurchases | null = null;
let _PURCHASE_TYPE: typeof import('@capgo/native-purchases').PURCHASE_TYPE | null = null;

async function getPlugin() {
  if (_plugin) return { NativePurchases: _plugin, PURCHASE_TYPE: _PURCHASE_TYPE! };
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

    return products.map((p: any) => ({
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

    // Acknowledge the transaction (Android requires this; iOS StoreKit 2 handles it automatically)
    try {
      if ('acknowledgePurchase' in mod.NativePurchases) {
        await (mod.NativePurchases as any).acknowledgePurchase({
          transactionIdentifier: transactionId,
          purchaseToken: receipt,
        });
      }
    } catch { /* best-effort acknowledge */ }

    if (!verifyResult.success) {
      return { success: false, error: verifyResult.error || 'Verification failed. Please contact support if you were charged.' };
    }

    return {
      success: true,
      transactionId,
      receipt,
      coins: IAP_PRODUCTS[productId]?.coins ?? 0,
    };
  } catch (err: any) {
    const msg = err?.message || String(err);
    if (msg.includes('cancel') || msg.includes('Cancel') || msg.includes('USER_CANCELED')) {
      return { success: false, error: 'Purchase cancelled' };
    }
    return { success: false, error: msg || 'Purchase failed' };
  } finally {
    purchaseInProgress = false;
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
  } catch (err: any) {
    const msg = err?.message || String(err);
    if (msg.includes('cancel') || msg.includes('Cancel') || msg.includes('USER_CANCELED')) {
      return { success: false, error: 'Purchase cancelled' };
    }
    return { success: false, error: msg || 'Purchase failed' };
  }
}

async function verifyAndCreditPurchase(
  packageId: string,
  transactionId: string,
  receipt: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { session, user } = useAuthStore.getState();
    if (!session?.access_token || !user?.id) return { success: false, error: 'Not authenticated' };

    const provider = platform.isIOS ? 'apple' : 'google';

    const { error } = await request('/api/verify-purchase', {
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

    return { success: true };
  } catch {
    return { success: false, error: 'Could not reach verification server' };
  }
}

// Apple/Google store compliance: re-delivers unfinished transactions only.
// This does NOT refund coins or reverse purchases. All purchases are final.
export async function restorePurchases(): Promise<void> {
  if (!platform.isNative) return;

  try {
    const mod = await getPlugin();
    if (!mod) return;
    await mod.NativePurchases.restorePurchases();
  } catch (e) {
    throw e;
  }
}
