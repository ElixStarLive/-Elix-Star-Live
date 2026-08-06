/**
 * Store product catalogues — Apple App Store vs Google Play.
 *
 * These lists are separate by design. Never merge them into one request array.
 * Internal coin amounts may match across stores; product IDs never do for
 * platform-exclusive SKUs (e.g. Apple coins500 vs Google coins500a).
 */

export type StoreIapProvider = "apple" | "google";

/** Apple App Store coin SKUs only. */
export const APPLE_IAP_PRODUCTS = {
  coins100: { coins: 100, label: "100 Coins" },
  coins500: { coins: 500, label: "500 Coins" },
  coins1000: { coins: 1000, label: "1,000 Coins" },
  coins5000: { coins: 5000, label: "5,000 Coins" },
  coins10000: { coins: 10000, label: "10,000 Coins" },
  coins50000: { coins: 50000, label: "50,000 Coins" },
  coins100000: { coins: 100000, label: "100,000 Coins" },
  coins150000: { coins: 150000, label: "150,000 Coins" },
  coins200000: { coins: 200000, label: "200,000 Coins" },
  coins350000: { coins: 350000, label: "350,000 Coins" },
} as const;

/** Google Play coin SKUs only. */
export const GOOGLE_PLAY_PRODUCTS = {
  coins100: { coins: 100, label: "100 Coins" },
  coins500a: { coins: 500, label: "500 Coins" },
  coins1000: { coins: 1000, label: "1,000 Coins" },
  coins5000: { coins: 5000, label: "5,000 Coins" },
  coins10000: { coins: 10000, label: "10,000 Coins" },
  coins50000: { coins: 50000, label: "50,000 Coins" },
  coins100000: { coins: 100000, label: "100,000 Coins" },
  coins150000: { coins: 150000, label: "150,000 Coins" },
  coins200000: { coins: 200000, label: "200,000 Coins" },
  coins350000: { coins: 350000, label: "350,000 Coins" },
} as const;

export type AppleIapProductId = keyof typeof APPLE_IAP_PRODUCTS;
export type GooglePlayProductId = keyof typeof GOOGLE_PLAY_PRODUCTS;
export type StoreCoinProductId = AppleIapProductId | GooglePlayProductId;

export const APPLE_IAP_PRODUCT_IDS = Object.freeze(
  Object.keys(APPLE_IAP_PRODUCTS) as AppleIapProductId[],
);

export const GOOGLE_PLAY_PRODUCT_IDS = Object.freeze(
  Object.keys(GOOGLE_PLAY_PRODUCTS) as GooglePlayProductId[],
);

const APPLE_SET = new Set<string>(APPLE_IAP_PRODUCT_IDS);
const GOOGLE_SET = new Set<string>(GOOGLE_PLAY_PRODUCT_IDS);

export function isAppleIapProductId(productId: string): productId is AppleIapProductId {
  return APPLE_SET.has(productId);
}

export function isGooglePlayProductId(
  productId: string,
): productId is GooglePlayProductId {
  return GOOGLE_SET.has(productId);
}

/** True when productId is allowed for the declared store provider. */
export function isProductAllowedForProvider(
  provider: StoreIapProvider,
  productId: string,
): boolean {
  if (provider === "apple") return isAppleIapProductId(productId);
  if (provider === "google") return isGooglePlayProductId(productId);
  return false;
}

export function coinAmountForProviderProduct(
  provider: StoreIapProvider,
  productId: string,
): number {
  if (provider === "apple" && isAppleIapProductId(productId)) {
    return APPLE_IAP_PRODUCTS[productId].coins;
  }
  if (provider === "google" && isGooglePlayProductId(productId)) {
    return GOOGLE_PLAY_PRODUCTS[productId].coins;
  }
  return 0;
}

/**
 * Catalogue for a native platform. Call this BEFORE StoreKit / Play Billing.
 * Returns a fresh array from the platform catalogue — never a filtered merge.
 */
export function storeCoinProductIdsForNativePlatform(
  nativePlatform: "ios" | "android" | "web" | string,
): readonly string[] {
  if (nativePlatform === "ios") return APPLE_IAP_PRODUCT_IDS;
  if (nativePlatform === "android") return GOOGLE_PLAY_PRODUCT_IDS;
  return Object.freeze([]);
}

export function assertNoCrossStoreProductIds(): {
  appleOnly: string[];
  googleOnly: string[];
} {
  const appleOnly = APPLE_IAP_PRODUCT_IDS.filter((id) => !GOOGLE_SET.has(id));
  const googleOnly = GOOGLE_PLAY_PRODUCT_IDS.filter((id) => !APPLE_SET.has(id));
  return { appleOnly, googleOnly };
}
