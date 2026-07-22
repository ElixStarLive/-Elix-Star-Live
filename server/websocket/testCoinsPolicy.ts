/**
 * Test-coin gifts never touch wallet / IAP / Stripe / creator earnings.
 *
 * Allowed:
 * - gift animation broadcast (test new gifts / upload QA)
 * - live battle match points (VS bar) so they can help in battle
 *
 * Forbidden:
 * - wallet debit/credit
 * - creator earnings / revenue
 * - gift goals that count as paid progression
 */
export function isTestCoinsGiftSource(data: {
  giftSource?: unknown;
  gift_source?: unknown;
} | null | undefined): boolean {
  return data?.giftSource === "test_coins" || data?.gift_source === "test_coins";
}

/**
 * Historically blocked test-coin battle scores in production.
 * Battle match points are now allowed; money stays gated by giftSource routing.
 * Always false so existing call sites no longer treat NODE_ENV as a money gate.
 */
export function isProductionTestCoinsBlocked(
  _nodeEnv: string | undefined = process.env.NODE_ENV,
): boolean {
  return false;
}
