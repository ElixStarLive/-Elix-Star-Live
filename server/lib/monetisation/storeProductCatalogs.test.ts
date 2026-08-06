import { describe, expect, it } from "vitest";
import {
  APPLE_IAP_PRODUCT_IDS,
  GOOGLE_PLAY_PRODUCT_IDS,
  coinAmountForProviderProduct,
  gateProviderProduct,
  isProductAllowedForProvider,
} from "./storeProductCatalogs";

describe("server store product catalogues", () => {
  it("rejects Google-only SKU submitted as Apple", () => {
    const gate = gateProviderProduct("apple", "coins500a");
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.code).toBe("google_product_as_apple");
  });

  it("rejects Apple-only SKU submitted as Google", () => {
    const gate = gateProviderProduct("google", "coins500");
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.code).toBe("apple_product_as_google");
  });

  it("allows Apple SKU with apple provider", () => {
    expect(gateProviderProduct("apple", "coins500")).toEqual({ ok: true });
    expect(isProductAllowedForProvider("apple", "coins100")).toBe(true);
  });

  it("allows Google SKU with google provider", () => {
    expect(gateProviderProduct("google", "coins500a")).toEqual({ ok: true });
    expect(isProductAllowedForProvider("google", "coins100")).toBe(true);
  });

  it("never lists coins500a on Apple catalogue", () => {
    expect(APPLE_IAP_PRODUCT_IDS.includes("coins500a" as never)).toBe(false);
  });

  it("never lists coins500 on Google catalogue", () => {
    expect(GOOGLE_PLAY_PRODUCT_IDS.includes("coins500" as never)).toBe(false);
  });

  it("maps shared coin amounts without merging catalogues", () => {
    expect(coinAmountForProviderProduct("apple", "coins500")).toBe(500);
    expect(coinAmountForProviderProduct("google", "coins500a")).toBe(500);
    expect(coinAmountForProviderProduct("apple", "coins500a")).toBe(0);
    expect(coinAmountForProviderProduct("google", "coins500")).toBe(0);
  });
});
