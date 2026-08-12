/**
 * TEST COINS = BATTLE GAME SCORE ONLY. Not a financial asset.
 *
 * Allowed:
 * - gift animation broadcast (when used as a gift)
 * - battle / VS scoreboard points so they can help win the Battle
 *
 * Forbidden (always £0):
 * - wallet debit/credit
 * - creator revenue / 60% earnings
 * - platform financial revenue / 40%
 * - GBP balance / Stripe payout / withdrawal
 * - paidCoinLots / Apple IAP / Google Play settlement
 * - paid gift-goal progression treated as money
 *
 * Separate systems (do not merge):
 * - LIVE LIKE TAP → +1 like per tap, unlimited, £0, no battle score
 * - BATTLE SCREEN TAP → +5 battle points once per unique viewer per battle, £0
 * - TEST-COIN GIFT → animation + battle score, £0 money
 * - REAL PAID-COIN GIFT → animation + battle score + eligible creator revenue
 */
export function isTestCoinsGiftSource(data: {
  giftSource?: unknown;
  gift_source?: unknown;
} | null | undefined): boolean {
  return data?.giftSource === "test_coins" || data?.gift_source === "test_coins";
}

/**
 * True when running in production. Retained for reference / future money-path gating.
 * Does NOT block test-coin BATTLE SCORE — money separation is enforced in the gift
 * handler and REST path (test coins never credit earnings).
 */
export function isProductionTestCoinsBlocked(
  nodeEnv: string | undefined = process.env.NODE_ENV,
): boolean {
  return String(nodeEnv || "").toLowerCase() === "production";
}

/**
 * Whether a test-coin gift may apply BATTLE SCORE + ANIMATION only (£0 money).
 *
 * Production: OFF unless ALLOW_TEST_COINS_BATTLE_SCORE=1|true|on.
 * Non-production: ON unless ALLOW_TEST_COINS_BATTLE_SCORE=0|false|off.
 */
export function canAcceptTestCoinsBattleScore(
  nodeEnv: string | undefined = process.env.NODE_ENV,
): boolean {
  const raw = String(process.env.ALLOW_TEST_COINS_BATTLE_SCORE || "")
    .trim()
    .toLowerCase();
  const isProd = String(nodeEnv || "").toLowerCase() === "production";
  if (isProd) {
    return raw === "1" || raw === "true" || raw === "on";
  }
  if (raw === "0" || raw === "false" || raw === "off") return false;
  return true;
}
