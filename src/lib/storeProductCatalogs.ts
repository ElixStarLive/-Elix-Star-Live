/**
 * Store product catalogues — Apple App Store vs Google Play.
 *
 * Single owner for client + server. Never merge catalogues into one request array.
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

type ProviderProductGate =
  | { ok: true }
  | { ok: false; code: string; error: string };

/** Reject Apple SKU as Google, Google SKU as Apple, or unknown SKU for provider. */
export function gateProviderProduct(
  provider: StoreIapProvider,
  productId: string,
): ProviderProductGate {
  if (provider !== "apple" && provider !== "google") {
    return { ok: false, code: "unknown_provider", error: "Unknown store provider" };
  }
  if (!productId) {
    return { ok: false, code: "missing_product", error: "Missing product id" };
  }
  if (provider === "apple") {
    if (isGooglePlayProductId(productId) && !isAppleIapProductId(productId)) {
      return {
        ok: false,
        code: "google_product_as_apple",
        error: "Google Play product submitted as Apple",
      };
    }
    if (!isAppleIapProductId(productId)) {
      return {
        ok: false,
        code: "product_not_allowed_for_apple",
        error: "Product ID not allowed for Apple",
      };
    }
    return { ok: true };
  }
  if (isAppleIapProductId(productId) && !isGooglePlayProductId(productId)) {
    return {
      ok: false,
      code: "apple_product_as_google",
      error: "Apple product submitted as Google",
    };
  }
  if (!isGooglePlayProductId(productId)) {
    return {
      ok: false,
      code: "product_not_allowed_for_google",
      error: "Product ID not allowed for Google Play",
    };
  }
  return { ok: true };
}

/** Apple IAP promote boost SKUs — shared client + server (must match App Store Connect). */
export const PROMOTE_IAP_PRODUCTS = {
  "com.elixstarlive.promote_views": {
    goal: "views",
    label: "More video views",
    amountGbp: 5,
  },
  "com.elixstarlive.promote_likes": {
    goal: "likes",
    label: "More likes & comments",
    amountGbp: 10,
  },
  "com.elixstarlive.promote_profile": {
    goal: "profile",
    label: "More profile views",
    amountGbp: 20,
  },
  "com.elixstarlive.promote_followers": {
    goal: "followers",
    label: "More followers",
    amountGbp: 30,
  },
} as const;

export type PromoteIapProductId = keyof typeof PROMOTE_IAP_PRODUCTS;

export function isPromoteIapProductId(id: string): id is PromoteIapProductId {
  return Object.prototype.hasOwnProperty.call(PROMOTE_IAP_PRODUCTS, id);
}

/**
 * Deterministic UUID for StoreKit appAccountToken / server binding.
 * Client and server must produce the same value for a given user id.
 */
export function appAccountTokenForUserId(userId: string): string {
  const nsHex = "6ba7b8109dad11d180b400c04fd430c8";
  const pairs = nsHex.match(/.{2}/g) || [];
  const ns = new Uint8Array(pairs.map((b) => parseInt(b, 16)));
  const data = new TextEncoder().encode(userId);
  const bytes = new Uint8Array(20);
  for (let i = 0; i < ns.length; i++) bytes[i % 20] ^= ns[i];
  for (let i = 0; i < data.length; i++) bytes[i % 20] ^= data[i] + i;
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
