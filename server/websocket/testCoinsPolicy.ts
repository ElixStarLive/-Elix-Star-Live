/**
 * Test-coin gifts are animation-only (no wallet / IAP / Stripe).
 * Production may still broadcast the gift video so the creator sees it, but
 * must never apply battle scores or other competitive side effects.
 */
export function isTestCoinsGiftSource(data: {
  giftSource?: unknown;
  gift_source?: unknown;
} | null | undefined): boolean {
  return data?.giftSource === "test_coins" || data?.gift_source === "test_coins";
}

/** True when test-coin battle-score simulation must stay off. */
export function isProductionTestCoinsBlocked(
  nodeEnv: string | undefined = process.env.NODE_ENV,
): boolean {
  return nodeEnv === "production";
}
