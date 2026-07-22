/**
 * Engagement Phase 1.5 — Treasure Hunt, Stickers, Creator Collections.
 * Soft-fails without Neon schema. Reward writes require ENGAGEMENT_NEON_APPROVED
 * and never create Diamonds / touch purchased wallet.
 */
import { getPool } from "./postgres";
import { logger } from "./logger";
import {
  canWriteEngagementWallets,
  getEngagementFlags,
} from "./engagementFlags";
import { creditPromoCoins, creditBattleEnergy } from "./engagement";

export type ChestRarity = "common" | "rare" | "epic" | "legendary" | "mythic";

const CHEST_CATALOG = [
  {
    id: "chest_common_watch",
    rarity: "common" as ChestRarity,
    title: "Watch Chest",
    description: "Appears after watching LIVE",
    reward_xp: 50,
    reward_promo_coins: 25,
    reward_energy: 10,
    reward_label: "50 XP + 25 Promo",
  },
  {
    id: "chest_rare_missions",
    rarity: "rare" as ChestRarity,
    title: "Mission Chest",
    description: "Complete daily missions",
    reward_xp: 100,
    reward_promo_coins: 75,
    reward_energy: 20,
    reward_label: "100 XP + 75 Promo",
  },
  {
    id: "chest_epic_streams",
    rarity: "epic" as ChestRarity,
    title: "Explorer Chest",
    description: "Visit multiple LIVE streams",
    reward_xp: 200,
    reward_promo_coins: 150,
    reward_energy: 40,
    reward_label: "200 XP + 150 Promo",
  },
  {
    id: "chest_legendary_streak",
    rarity: "legendary" as ChestRarity,
    title: "Streak Chest",
    description: "Login streak milestone",
    reward_xp: 400,
    reward_promo_coins: 300,
    reward_energy: 80,
    reward_label: "400 XP + 300 Promo",
  },
  {
    id: "chest_mythic_event",
    rarity: "mythic" as ChestRarity,
    title: "Mythic Chest",
    description: "Rare world discovery",
    reward_xp: 1000,
    reward_promo_coins: 1000,
    reward_energy: 200,
    reward_label: "Mystery haul",
  },
];

const STICKER_SETS = [
  { id: "animals", title: "Animals", theme: "Wildlife", complete_reward_label: "Animal frame" },
  { id: "space", title: "Space", theme: "Cosmos", complete_reward_label: "Galaxy badge" },
  { id: "fantasy", title: "Fantasy", theme: "Magic", complete_reward_label: "Enchanted border" },
  { id: "countries", title: "Countries", theme: "Travel", complete_reward_label: "Globe sticker pack" },
  { id: "sports", title: "Sports", theme: "Arena", complete_reward_label: "Champion chat bubble" },
];

const STICKER_DEFS = [
  { id: "animals_fox", set_id: "animals", name: "Fox", emoji: "🦊", rarity: "common", sort_order: 1 },
  { id: "animals_wolf", set_id: "animals", name: "Wolf", emoji: "🐺", rarity: "rare", sort_order: 2 },
  { id: "animals_panda", set_id: "animals", name: "Panda", emoji: "🐼", rarity: "epic", sort_order: 3 },
  { id: "animals_tiger", set_id: "animals", name: "Tiger", emoji: "🐯", rarity: "legendary", sort_order: 4 },
  { id: "space_star", set_id: "space", name: "Star", emoji: "⭐", rarity: "common", sort_order: 1 },
  { id: "space_rocket", set_id: "space", name: "Rocket", emoji: "🚀", rarity: "rare", sort_order: 2 },
  { id: "space_planet", set_id: "space", name: "Planet", emoji: "🪐", rarity: "epic", sort_order: 3 },
  { id: "fantasy_dragon", set_id: "fantasy", name: "Dragon", emoji: "🐉", rarity: "legendary", sort_order: 1 },
  { id: "fantasy_wand", set_id: "fantasy", name: "Wand", emoji: "🪄", rarity: "rare", sort_order: 2 },
  { id: "countries_uk", set_id: "countries", name: "UK", emoji: "🇬🇧", rarity: "common", sort_order: 1 },
  { id: "countries_us", set_id: "countries", name: "USA", emoji: "🇺🇸", rarity: "common", sort_order: 2 },
  { id: "sports_trophy", set_id: "sports", name: "Trophy", emoji: "🏆", rarity: "epic", sort_order: 1 },
];

const CREATOR_TIERS = [
  { tier: "bronze", title: "Bronze Creator Card", stars: 2, watch_minutes_required: 5, gifts_required: 0 },
  { tier: "silver", title: "Silver Creator Card", stars: 3, watch_minutes_required: 30, gifts_required: 1 },
  { tier: "gold", title: "Gold Creator Card", stars: 4, watch_minutes_required: 120, gifts_required: 5 },
  { tier: "diamond", title: "Diamond Creator Card", stars: 5, watch_minutes_required: 300, gifts_required: 20 },
  { tier: "legend", title: "Legend Creator Card", stars: 5, watch_minutes_required: 600, gifts_required: 50 },
];

async function awardXp(userId: string, xp: number): Promise<void> {
  const db = getPool();
  const gain = Math.max(0, Math.floor(xp));
  if (!db || !userId || gain <= 0) return;
  try {
    await db.query(
      `INSERT INTO user_progression (user_id, total_xp, current_level)
       VALUES ($1, $2, 0)
       ON CONFLICT (user_id) DO UPDATE SET
         total_xp = user_progression.total_xp + $2,
         updated_at = NOW()`,
      [userId, gain],
    );
  } catch (err) {
    logger.warn({ err, userId }, "phase15 awardXp failed");
  }
}

export function getTreasureCatalog() {
  return CHEST_CATALOG;
}

export async function listUserChests(userId: string) {
  const db = getPool();
  if (!db || !userId) {
    return { catalog: CHEST_CATALOG, chests: [] as Array<Record<string, unknown>>, neon_ready: false };
  }
  try {
    const r = await db.query(
      `SELECT c.id, c.chest_def_id, c.source, c.location_hint, c.status, c.created_at, c.opened_at,
              d.rarity, d.title, d.reward_label, d.reward_xp, d.reward_promo_coins, d.reward_energy
         FROM user_treasure_chests c
         JOIN treasure_chest_defs d ON d.id = c.chest_def_id
        WHERE c.user_id = $1
        ORDER BY c.created_at DESC
        LIMIT 50`,
      [userId],
    );
    return {
      catalog: CHEST_CATALOG,
      chests: r.rows.map((row) => ({
        id: row.id,
        chest_def_id: row.chest_def_id,
        rarity: row.rarity,
        title: row.title,
        source: row.source,
        location_hint: row.location_hint,
        status: row.status,
        reward_label: row.reward_label,
        reward_xp: Number(row.reward_xp),
        reward_promo_coins: Number(row.reward_promo_coins),
        reward_energy: Number(row.reward_energy),
        created_at: row.created_at,
        opened_at: row.opened_at,
      })),
      neon_ready: true,
    };
  } catch {
    return { catalog: CHEST_CATALOG, chests: [], neon_ready: false };
  }
}

/** Spawn a found chest from activity (watch / missions / streams). Rate-limited simply. */
export async function spawnTreasureChest(
  userId: string,
  chestDefId: string,
  locationHint = "hub",
): Promise<{ ok: boolean; error?: string; chest_id?: string }> {
  if (!getEngagementFlags().treasureHuntEnabled) {
    return { ok: false, error: "TREASURE_HUNT_DISABLED" };
  }
  if (!canWriteEngagementWallets()) {
    return { ok: false, error: "ENGAGEMENT_NEON_PENDING_APPROVAL" };
  }
  const def = CHEST_CATALOG.find((c) => c.id === chestDefId);
  if (!def) return { ok: false, error: "UNKNOWN_CHEST" };
  const db = getPool();
  if (!db) return { ok: false, error: "DATABASE_UNAVAILABLE" };
  try {
    const recent = await db.query(
      `SELECT id FROM user_treasure_chests
        WHERE user_id = $1 AND chest_def_id = $2 AND created_at > NOW() - INTERVAL '6 hours'
        LIMIT 1`,
      [userId, chestDefId],
    );
    if (recent.rows[0]) return { ok: false, error: "COOLDOWN" };
    const ins = await db.query(
      `INSERT INTO user_treasure_chests (user_id, chest_def_id, source, location_hint, status)
       VALUES ($1, $2, 'activity', $3, 'found')
       RETURNING id`,
      [userId, chestDefId, locationHint],
    );
    return { ok: true, chest_id: String(ins.rows[0]?.id || "") };
  } catch (err) {
    logger.warn({ err, userId, chestDefId }, "spawnTreasureChest failed");
    return { ok: false, error: "SPAWN_FAILED" };
  }
}

export async function openTreasureChest(userId: string, chestId: string) {
  if (!getEngagementFlags().treasureHuntEnabled) {
    return { ok: false as const, error: "TREASURE_HUNT_DISABLED" };
  }
  if (!canWriteEngagementWallets()) {
    return { ok: false as const, error: "ENGAGEMENT_NEON_PENDING_APPROVAL" };
  }
  const db = getPool();
  if (!db) return { ok: false as const, error: "DATABASE_UNAVAILABLE" };
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const row = await client.query(
      `SELECT c.id, c.status, c.chest_def_id, d.reward_xp, d.reward_promo_coins, d.reward_energy, d.reward_label, d.title, d.rarity
         FROM user_treasure_chests c
         JOIN treasure_chest_defs d ON d.id = c.chest_def_id
        WHERE c.id = $1 AND c.user_id = $2
        FOR UPDATE OF c`,
      [chestId, userId],
    );
    const chest = row.rows[0];
    if (!chest) {
      await client.query("ROLLBACK");
      return { ok: false as const, error: "NOT_FOUND" };
    }
    if (chest.status === "opened") {
      await client.query("COMMIT");
      return {
        ok: true as const,
        already_opened: true,
        reward: {
          reward_xp: Number(chest.reward_xp),
          reward_promo_coins: Number(chest.reward_promo_coins),
          reward_energy: Number(chest.reward_energy),
          reward_label: String(chest.reward_label),
          title: String(chest.title),
          rarity: String(chest.rarity),
        },
      };
    }
    if (chest.status !== "found") {
      await client.query("ROLLBACK");
      return { ok: false as const, error: "NOT_OPENABLE" };
    }
    await client.query(
      `UPDATE user_treasure_chests SET status = 'opened', opened_at = NOW() WHERE id = $1`,
      [chestId],
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error({ err, userId, chestId }, "openTreasureChest failed");
    return { ok: false as const, error: "OPEN_FAILED" };
  } finally {
    client.release();
  }

  // Re-read rewards after commit (idempotent credits via ledger reasons).
  let reward = {
    reward_xp: 0,
    reward_promo_coins: 0,
    reward_energy: 0,
    reward_label: "",
    title: "",
    rarity: "common",
  };
  try {
    const r = await db.query(
      `SELECT d.reward_xp, d.reward_promo_coins, d.reward_energy, d.reward_label, d.title, d.rarity
         FROM user_treasure_chests c
         JOIN treasure_chest_defs d ON d.id = c.chest_def_id
        WHERE c.id = $1 AND c.user_id = $2`,
      [chestId, userId],
    );
    const row = r.rows[0];
    if (row) {
      reward = {
        reward_xp: Number(row.reward_xp),
        reward_promo_coins: Number(row.reward_promo_coins),
        reward_energy: Number(row.reward_energy),
        reward_label: String(row.reward_label),
        title: String(row.title),
        rarity: String(row.rarity),
      };
    }
  } catch {
    /* catalog fallback unused */
  }

  if (reward.reward_xp > 0) await awardXp(userId, reward.reward_xp);
  if (reward.reward_promo_coins > 0) {
    await creditPromoCoins(userId, reward.reward_promo_coins, "treasure_chest", chestId);
  }
  if (reward.reward_energy > 0) {
    await creditBattleEnergy(userId, reward.reward_energy, "treasure_chest", chestId);
  }
  return { ok: true as const, reward };
}

export async function listStickersForUser(userId: string) {
  const db = getPool();
  let owned: Record<string, number> = {};
  let neon_ready = false;
  if (db && userId) {
    try {
      const r = await db.query(
        `SELECT sticker_id, count FROM user_stickers WHERE user_id = $1`,
        [userId],
      );
      for (const row of r.rows) {
        owned[String(row.sticker_id)] = Number(row.count) || 1;
      }
      neon_ready = true;
    } catch {
      owned = {};
    }
  }
  const sets = STICKER_SETS.map((s) => {
    const stickers = STICKER_DEFS.filter((d) => d.set_id === s.id).map((d) => ({
      ...d,
      owned: owned[d.id] || 0,
      unlocked: (owned[d.id] || 0) > 0,
    }));
    const total = stickers.length;
    const have = stickers.filter((x) => x.unlocked).length;
    return {
      ...s,
      progress: have,
      total,
      complete: have >= total && total > 0,
      stickers,
    };
  });
  return { sets, neon_ready };
}

export async function grantSticker(
  userId: string,
  stickerId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!getEngagementFlags().stickerCollectionEnabled) {
    return { ok: false, error: "STICKERS_DISABLED" };
  }
  if (!canWriteEngagementWallets()) {
    return { ok: false, error: "ENGAGEMENT_NEON_PENDING_APPROVAL" };
  }
  if (!STICKER_DEFS.some((s) => s.id === stickerId)) {
    return { ok: false, error: "UNKNOWN_STICKER" };
  }
  const db = getPool();
  if (!db) return { ok: false, error: "DATABASE_UNAVAILABLE" };
  try {
    await db.query(
      `INSERT INTO user_stickers (user_id, sticker_id, count)
       VALUES ($1, $2, 1)
       ON CONFLICT (user_id, sticker_id) DO UPDATE SET count = user_stickers.count + 1`,
      [userId, stickerId],
    );
    return { ok: true };
  } catch (err) {
    logger.warn({ err, userId, stickerId }, "grantSticker failed");
    return { ok: false, error: "GRANT_FAILED" };
  }
}

export async function listCreatorCardsForUser(userId: string, creatorId?: string) {
  const db = getPool();
  let unlocked: Array<{ creator_id: string; tier: string; unlocked_at: string }> = [];
  let neon_ready = false;
  if (db && userId) {
    try {
      const r = creatorId
        ? await db.query(
            `SELECT creator_id, tier, unlocked_at FROM user_creator_cards
              WHERE user_id = $1 AND creator_id = $2`,
            [userId, creatorId],
          )
        : await db.query(
            `SELECT creator_id, tier, unlocked_at FROM user_creator_cards
              WHERE user_id = $1 ORDER BY unlocked_at DESC LIMIT 100`,
            [userId],
          );
      unlocked = r.rows.map((row) => ({
        creator_id: String(row.creator_id),
        tier: String(row.tier),
        unlocked_at: String(row.unlocked_at),
      }));
      neon_ready = true;
    } catch {
      unlocked = [];
    }
  }
  return {
    tiers: CREATOR_TIERS,
    unlocked,
    neon_ready,
    focus_creator_id: creatorId || null,
  };
}

export async function unlockCreatorCard(
  userId: string,
  creatorId: string,
  tier: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!getEngagementFlags().creatorCollectionsEnabled) {
    return { ok: false, error: "CREATOR_COLLECTIONS_DISABLED" };
  }
  if (!canWriteEngagementWallets()) {
    return { ok: false, error: "ENGAGEMENT_NEON_PENDING_APPROVAL" };
  }
  if (!CREATOR_TIERS.some((t) => t.tier === tier)) {
    return { ok: false, error: "UNKNOWN_TIER" };
  }
  if (!userId || !creatorId || userId === creatorId) {
    return { ok: false, error: "INVALID" };
  }
  const db = getPool();
  if (!db) return { ok: false, error: "DATABASE_UNAVAILABLE" };
  try {
    await db.query(
      `INSERT INTO user_creator_cards (user_id, creator_id, tier)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, creator_id, tier) DO NOTHING`,
      [userId, creatorId, tier],
    );
    return { ok: true };
  } catch (err) {
    logger.warn({ err, userId, creatorId, tier }, "unlockCreatorCard failed");
    return { ok: false, error: "UNLOCK_FAILED" };
  }
}

/** Activity hook: maybe spawn a common watch chest + animal sticker (capped). */
export async function onWatchActivity(userId: string, roomId?: string): Promise<void> {
  if (!userId) return;
  try {
    if (getEngagementFlags().treasureHuntEnabled && canWriteEngagementWallets()) {
      await spawnTreasureChest(userId, "chest_common_watch", roomId || "live");
    }
    if (getEngagementFlags().stickerCollectionEnabled && canWriteEngagementWallets()) {
      await grantSticker(userId, "animals_fox");
    }
    if (
      getEngagementFlags().creatorCollectionsEnabled &&
      canWriteEngagementWallets() &&
      roomId &&
      roomId !== userId
    ) {
      await unlockCreatorCard(userId, roomId, "bronze");
    }
  } catch (err) {
    logger.warn({ err, userId }, "onWatchActivity phase15 failed");
  }
}
