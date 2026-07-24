/**
 * Test-coin gifts never touch wallet / IAP / Stripe / creator earnings.
 *
 * Allowed:
 * - gift animation broadcast (test new gifts / upload QA)
 * - live battle match points (VS bar) using the gift's catalog point value
 *   (e.g. a 50k gift adds 50k battle points — same magnitude as paid gifts,
 *   but these points are NOT money / revenue)
 *
 * Forbidden (payment-only separation — like free tap regarding money):
 * - wallet debit/credit
 * - creator earnings / revenue
 * - gift goals that count as paid progression
 * - REST /api/gifts/send (test coins are WS-only)
 */
export function isTestCoinsGiftSource(data: {
  giftSource?: unknown;
  gift_source?: unknown;
} | null | undefined): boolean {
  return data?.giftSource === "test_coins" || data?.gift_source === "test_coins";
}

/**
 * True when running in production. Retained for reference and for any future
 * money-path gating. NOTE: this no longer blocks test-coin BATTLE SCORE —
 * test coins add catalog battle points + animation and never touch money, so
 * battle-only scoring is allowed in every environment. Money (wallet /
 * earnings / revenue / paid gift goals) is still test-coin-blocked by the gift
 * handler and REST path, not by this flag.
 */
export function isProductionTestCoinsBlocked(
  nodeEnv: string | undefined = process.env.NODE_ENV,
): boolean {
  return String(nodeEnv || "").toLowerCase() === "production";
}

/**
 * Whether a test-coin gift may apply BATTLE SCORE + ANIMATION only.
 *
 * Payment rule (same spirit as free tap): NEVER wallet, creator earnings,
 * revenue, or paid gift-goal progression.
 *
 * Points rule: use the gift catalog value as battle VS points (50k gift →
 * 50k battle points) so QA can stress large gifts / videos. Animation always
 * broadcasts. Operators keep a hard kill-switch via
 * ALLOW_TEST_COINS_BATTLE_SCORE=0.
 */
export function canAcceptTestCoinsBattleScore(
  _nodeEnv: string | undefined = process.env.NODE_ENV,
): boolean {
  const raw = String(process.env.ALLOW_TEST_COINS_BATTLE_SCORE || "")
    .trim()
    .toLowerCase();
  if (raw === "0" || raw === "false" || raw === "off") return false;
  return true;
}
