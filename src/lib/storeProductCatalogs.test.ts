import { describe, expect, it } from "vitest";
import {
  APPLE_IAP_PRODUCT_IDS,
  APPLE_IAP_PRODUCTS,
  GOOGLE_PLAY_PRODUCT_IDS,
  GOOGLE_PLAY_PRODUCTS,
  assertNoCrossStoreProductIds,
  coinAmountForProviderProduct,
  isAppleIapProductId,
  isGooglePlayProductId,
  isProductAllowedForProvider,
  storeCoinProductIdsForNativePlatform,
} from "./storeProductCatalogs";

describe("store product catalogues — platform separation", () => {
  it("keeps APPLE_IAP_PRODUCT_IDS free of Android-only SKUs", () => {
    expect(APPLE_IAP_PRODUCT_IDS).not.toContain("coins500a");
    expect(isAppleIapProductId("coins500a")).toBe(false);
    expect(isProductAllowedForProvider("apple", "coins500a")).toBe(false);
  });

  it("keeps GOOGLE_PLAY_PRODUCT_IDS free of Apple-only SKUs", () => {
    expect(GOOGLE_PLAY_PRODUCT_IDS).not.toContain("coins500");
    expect(isGooglePlayProductId("coins500")).toBe(false);
    expect(isProductAllowedForProvider("google", "coins500")).toBe(false);
  });

  it("selects Apple catalogue for ios before any store call", () => {
    const ids = storeCoinProductIdsForNativePlatform("ios");
    expect(ids).toBe(APPLE_IAP_PRODUCT_IDS);
    expect(ids).not.toContain("coins500a");
    expect(ids).toContain("coins500");
  });

  it("selects Google catalogue for android before any store call", () => {
    const ids = storeCoinProductIdsForNativePlatform("android");
    expect(ids).toBe(GOOGLE_PLAY_PRODUCT_IDS);
    expect(ids).not.toContain("coins500");
    expect(ids).toContain("coins500a");
  });

  it("returns empty catalogue for non-native platforms", () => {
    expect(storeCoinProductIdsForNativePlatform("web")).toEqual([]);
  });

  it("does not expose a merged request array API", () => {
    const ios = storeCoinProductIdsForNativePlatform("ios");
    const android = storeCoinProductIdsForNativePlatform("android");
    expect(ios).not.toBe(android);
    expect([...ios, ...android].filter((id) => id === "coins500a")).toEqual([
      "coins500a",
    ]);
  });

  it("credits the same internal coin amount for Apple coins500 and Google coins500a", () => {
    expect(coinAmountForProviderProduct("apple", "coins500")).toBe(500);
    expect(coinAmountForProviderProduct("google", "coins500a")).toBe(500);
    expect(APPLE_IAP_PRODUCTS.coins500.coins).toBe(
      GOOGLE_PLAY_PRODUCTS.coins500a.coins,
    );
  });

  it("reports exclusive SKUs via assertNoCrossStoreProductIds", () => {
    const { appleOnly, googleOnly } = assertNoCrossStoreProductIds();
    expect(appleOnly).toContain("coins500");
    expect(googleOnly).toContain("coins500a");
  });
});
