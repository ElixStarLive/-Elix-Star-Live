-- Engagement Phase 1.5 — Collection & Exploration
-- Applied by Coolify `npm run migrate` from server/migrations/.
--
-- Rewards: Promo Coins / XP / Battle Energy / cosmetics only — never Diamonds.

CREATE TABLE IF NOT EXISTS treasure_chest_defs (
  id TEXT PRIMARY KEY,
  rarity TEXT NOT NULL CHECK (rarity IN ('common','rare','epic','legendary','mythic')),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  reward_xp INTEGER NOT NULL DEFAULT 0,
  reward_promo_coins INTEGER NOT NULL DEFAULT 0,
  reward_energy INTEGER NOT NULL DEFAULT 0,
  reward_label TEXT NOT NULL DEFAULT '',
  enabled BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS user_treasure_chests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  chest_def_id TEXT NOT NULL REFERENCES treasure_chest_defs(id),
  source TEXT NOT NULL DEFAULT 'activity',
  location_hint TEXT NOT NULL DEFAULT 'hub',
  status TEXT NOT NULL DEFAULT 'found' CHECK (status IN ('found','opened','expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  opened_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_user_treasure_user_status
  ON user_treasure_chests(user_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS sticker_defs (
  id TEXT PRIMARY KEY,
  set_id TEXT NOT NULL,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '✨',
  rarity TEXT NOT NULL DEFAULT 'common',
  sort_order INTEGER NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS sticker_sets (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  theme TEXT NOT NULL DEFAULT '',
  complete_reward_label TEXT NOT NULL DEFAULT '',
  enabled BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS user_stickers (
  user_id TEXT NOT NULL,
  sticker_id TEXT NOT NULL REFERENCES sticker_defs(id),
  count INTEGER NOT NULL DEFAULT 1 CHECK (count > 0),
  first_earned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, sticker_id)
);

CREATE TABLE IF NOT EXISTS creator_card_defs (
  tier TEXT PRIMARY KEY CHECK (tier IN ('bronze','silver','gold','diamond','legend')),
  title TEXT NOT NULL,
  stars INTEGER NOT NULL DEFAULT 1,
  watch_minutes_required INTEGER NOT NULL DEFAULT 0,
  gifts_required INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS user_creator_cards (
  user_id TEXT NOT NULL,
  creator_id TEXT NOT NULL,
  tier TEXT NOT NULL REFERENCES creator_card_defs(tier),
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, creator_id, tier)
);
CREATE INDEX IF NOT EXISTS idx_user_creator_cards_user
  ON user_creator_cards(user_id, unlocked_at DESC);

INSERT INTO treasure_chest_defs (id, rarity, title, description, reward_xp, reward_promo_coins, reward_energy, reward_label) VALUES
  ('chest_common_watch', 'common', 'Watch Chest', 'Appears after watching LIVE', 50, 25, 10, '50 XP + 25 Promo'),
  ('chest_rare_missions', 'rare', 'Mission Chest', 'Complete daily missions', 100, 75, 20, '100 XP + 75 Promo'),
  ('chest_epic_streams', 'epic', 'Explorer Chest', 'Visit multiple LIVE streams', 200, 150, 40, '200 XP + 150 Promo'),
  ('chest_legendary_streak', 'legendary', 'Streak Chest', 'Login streak milestone', 400, 300, 80, '400 XP + 300 Promo'),
  ('chest_mythic_event', 'mythic', 'Mythic Chest', 'Rare world discovery', 1000, 1000, 200, 'Mystery haul')
ON CONFLICT (id) DO NOTHING;

INSERT INTO sticker_sets (id, title, theme, complete_reward_label) VALUES
  ('animals', 'Animals', 'Wildlife', 'Animal frame'),
  ('space', 'Space', 'Cosmos', 'Galaxy badge'),
  ('fantasy', 'Fantasy', 'Magic', 'Enchanted border'),
  ('countries', 'Countries', 'Travel', 'Globe sticker pack'),
  ('sports', 'Sports', 'Arena', 'Champion chat bubble')
ON CONFLICT (id) DO NOTHING;

INSERT INTO sticker_defs (id, set_id, name, emoji, rarity, sort_order) VALUES
  ('animals_fox', 'animals', 'Fox', '🦊', 'common', 1),
  ('animals_wolf', 'animals', 'Wolf', '🐺', 'rare', 2),
  ('animals_panda', 'animals', 'Panda', '🐼', 'epic', 3),
  ('animals_tiger', 'animals', 'Tiger', '🐯', 'legendary', 4),
  ('space_star', 'space', 'Star', '⭐', 'common', 1),
  ('space_rocket', 'space', 'Rocket', '🚀', 'rare', 2),
  ('space_planet', 'space', 'Planet', '🪐', 'epic', 3),
  ('fantasy_dragon', 'fantasy', 'Dragon', '🐉', 'legendary', 1),
  ('fantasy_wand', 'fantasy', 'Wand', '🪄', 'rare', 2),
  ('countries_uk', 'countries', 'UK', '🇬🇧', 'common', 1),
  ('countries_us', 'countries', 'USA', '🇺🇸', 'common', 2),
  ('sports_trophy', 'sports', 'Trophy', '🏆', 'epic', 1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO creator_card_defs (tier, title, stars, watch_minutes_required, gifts_required) VALUES
  ('bronze', 'Bronze Creator Card', 2, 5, 0),
  ('silver', 'Silver Creator Card', 3, 30, 1),
  ('gold', 'Gold Creator Card', 4, 120, 5),
  ('diamond', 'Diamond Creator Card', 5, 300, 20),
  ('legend', 'Legend Creator Card', 5, 600, 50)
ON CONFLICT (tier) DO NOTHING;
