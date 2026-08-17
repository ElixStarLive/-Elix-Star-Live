/**
 * Server entry for store product catalogues.
 * Single source of truth: src/lib/storeProductCatalogs.ts (no duplicated SKU lists).
 * Re-export only symbols the server actually imports.
 */
export {
  APPLE_IAP_PRODUCT_IDS,
  GOOGLE_PLAY_PRODUCT_IDS,
  PROMOTE_IAP_PRODUCTS,
  isProductAllowedForProvider,
  coinAmountForProviderProduct,
  gateProviderProduct,
  isPromoteIapProductId,
  appAccountTokenForUserId,
} from "../../../src/lib/storeProductCatalogs";
