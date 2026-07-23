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
 * True when running in production. Retained for reference and for any future
 * money-path gating. NOTE: this no longer blocks test-coin BATTLE SCORE —
 * test coins add battle points + animation like the free tap vote and never
 * touch money, so battle-only scoring is allowed in every environment. Money
 * (wallet / earnings / revenue / paid gift goals) is still test-coin-blocked
 * by the gift handler and REST path, not by this flag.
 */
export function isProductionTestCoinsBlocked(
  nodeEnv: string | undefined = process.env.NODE_ENV,
): boolean {
  return String(nodeEnv || "").toLowerCase() === "production";
}

/**
 * Whether a test-coin gift may apply BATTLE SCORE + ANIMATION only.
 *
 * Test coins behave exactly like the free tap vote: they add VS/battle points
 * and play the gift animation, but they NEVER touch the wallet, creator
 * earnings, revenue, or paid gift-goal progression (that money separation is
 * enforced in the gift handler / REST path, not here). Because no money is ever
 * involved, battle-only scoring is safe in every environment — including
 * production — so gift QA works against the real backend. The real Google Play
 * (store) build disables test coins on the client, so this only affects dev /
 * test builds. Operators keep a hard kill-switch via ALLOW_TEST_COINS_BATTLE_SCORE=0.
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
