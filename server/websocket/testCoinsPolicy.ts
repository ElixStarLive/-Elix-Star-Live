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
 * Production must reject forged gift_sent + giftSource=test_coins for battle
 * points. Non-production may still allow animation + VS points for local QA.
 */
export function isProductionTestCoinsBlocked(
  nodeEnv: string | undefined = process.env.NODE_ENV,
): boolean {
  return String(nodeEnv || "").toLowerCase() === "production";
}

/**
 * Optional explicit allowlist for test-coin battle scoring outside store builds.
 * Default: only when NOT production.
 */
export function canAcceptTestCoinsBattleScore(
  nodeEnv: string | undefined = process.env.NODE_ENV,
): boolean {
  if (isProductionTestCoinsBlocked(nodeEnv)) return false;
  const raw = String(process.env.ALLOW_TEST_COINS_BATTLE_SCORE || "")
    .trim()
    .toLowerCase();
  if (raw === "0" || raw === "false" || raw === "off") return false;
  return true;
}
