import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { NEW_USER_STARTER_COINS } from "./starterCoinsXp";

const read = (relative: string) =>
  readFileSync(resolve(__dirname, relative), "utf8");

describe("Starter Coin schema separation", () => {
  const sql = read("../migrations/20260717193000_starter_coins_user_progression.sql");
  const sqlWithoutComments = sql.replace(/--.*$/gm, "");

  it("uses the exact 50,000 onboarding grant", () => {
    expect(NEW_USER_STARTER_COINS).toBe(50_000);
  });

  it("creates isolated balance, transaction, XP, and level ledgers", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS starter_coin_balances");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS starter_coin_transactions");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS user_progression");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS xp_transactions");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS level_history");
    expect(sql).toContain("CREATE OR REPLACE VIEW user_xp");
    expect(sql).toContain("CREATE OR REPLACE VIEW user_level");
  });

  it("does not mutate paid wallet, IAP, Stripe, or creator earnings", () => {
    expect(sqlWithoutComments).not.toMatch(/\b(?:insert|update|delete)\b[\s\S]*?\belix_wallet_/i);
    expect(sqlWithoutComments).not.toContain("stripe");
    expect(sqlWithoutComments).not.toContain("iap_transactions");
    expect(sqlWithoutComments).not.toContain("creator_earnings");
  });

  it("records explicit paid or starter gift source", () => {
    expect(sql).toContain("gift_source IN ('starter_coins', 'paid_coins')");
    expect(sql).toContain("DEFAULT 'paid_coins'");
  });
});

describe("Starter Coin transactional contracts", () => {
  const auth = read("../routes/auth.ts");
  const gifts = read("../routes/gifts.ts");
  const progression = read("./starterCoinsXp.ts");
  const giftDelivery = read("../websocket/giftDelivery.ts");
  const adminRouter = read("../routes/adminProgression.router.ts");

  it("grants onboarding coins inside the registration transaction", () => {
    const begin = auth.indexOf('await client.query("BEGIN")');
    const initialize = auth.indexOf("initializeNewUserStarterProgression(client, user.id)");
    const commit = auth.indexOf('await client.query("COMMIT")', initialize);
    expect(begin).toBeGreaterThanOrEqual(0);
    expect(initialize).toBeGreaterThan(begin);
    expect(commit).toBeGreaterThan(initialize);
  });

  it("starter gifts do not call creator earning logic", () => {
    const starterStart = gifts.indexOf('if (gift_source === "starter_coins")');
    const starterEnd = gifts.indexOf("if (coinCost > 0)", starterStart);
    const starterBranch = gifts.slice(starterStart, starterEnd);
    expect(starterBranch).toContain("sendStarterCoinGift");
    expect(starterBranch).toContain("creator_earnings: 0");
    expect(starterBranch).toContain("wallet_update: false");
    expect(starterBranch).not.toContain("neonCreditCreatorEarning");
    expect(starterBranch).not.toContain("neonDebitGift");
  });

  it("atomically debits, records the gift, and awards XP", () => {
    expect(progression).toContain("UPDATE starter_coin_balances");
    expect(progression).toContain("INSERT INTO starter_coin_transactions");
    expect(progression).toContain("INSERT INTO elix_gift_transactions");
    expect(progression).toContain("INSERT INTO xp_transactions");
    expect(progression).toContain('await client.query("COMMIT")');
  });

  it("excludes starter gifts from goals and battle scores in giftDelivery", () => {
    // Gift-goal + battle-score side effects for verified REST gifts only run
    // inside the paid-coins branch. Test-coin match points are handled separately
    // in the WS gift_sent handler (animation + VS bar, never money).
    expect(giftDelivery).toContain('input.giftSource === "paid_coins"');
    const gate = giftDelivery.indexOf('input.giftSource === "paid_coins"');
    const paidBranch = giftDelivery.slice(gate);
    expect(paidBranch).toContain("incrementGiftGoal");
    expect(paidBranch).toContain("addBattleScoreForTarget");
  });

  it("protects admin progression APIs with both auth and admin checks", () => {
    expect(adminRouter).toContain("router.use(requireAuthWithRoles)");
    expect(adminRouter).toContain("router.use(requireAdmin)");
  });
});
