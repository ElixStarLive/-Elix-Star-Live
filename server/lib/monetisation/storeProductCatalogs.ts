/**
 * Server entry for store product catalogues.
 * Single source of truth: src/lib/storeProductCatalogs.ts (no duplicated SKU lists).
 */
export {
  APPLE_IAP_PRODUCTS,
  GOOGLE_PLAY_PRODUCTS,
  APPLE_IAP_PRODUCT_IDS,
  GOOGLE_PLAY_PRODUCT_IDS,
  type StoreIapProvider,
  type AppleIapProductId,
  type GooglePlayProductId,
  type StoreCoinProductId,
  type ProviderProductGate,
  isAppleIapProductId,
  isGooglePlayProductId,
  isProductAllowedForProvider,
  coinAmountForProviderProduct,
  storeCoinProductIdsForNativePlatform,
  assertNoCrossStoreProductIds,
  gateProviderProduct,
} from "../../../src/lib/storeProductCatalogs";
