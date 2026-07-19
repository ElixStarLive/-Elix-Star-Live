-- Professional gift price ladder: 5,000 → 50,000 coins (max 50k).
--
-- Background: the catalog was seeded at 15..500 coins, then
-- 20260718003000_gift_prices_min_15k.sql multiplied every price by 1000,
-- producing 15,000..500,000 (the 350k/500k the owner sees). This resets the
-- whole catalog to a clean, well-spaced ladder with clear gaps between tiers:
--
--   5,000  8,000  12,000  18,000  25,000  35,000  50,000
--
-- Prices are set by gift_id to ABSOLUTE values, so this is fully idempotent and
-- correct no matter what the current (inflated or not) price is.
--
-- battle_points keep the original ratio: small = coins, big = coins * 5.
BEGIN;

UPDATE elix_gifts g SET
  coin_cost = v.coin_cost,
  -- Universe gifts keep their existing (large) battle_points; only the coin price
  -- is capped. big = coins*5, small = coins.
  battle_points = CASE
                    WHEN g.gift_type = 'universe' THEN g.battle_points
                    WHEN g.gift_type = 'big' THEN v.coin_cost * 5
                    ELSE v.coin_cost
                  END
FROM (VALUES
  -- Core starter gifts (rose/heart/kiss) + crown/diamond/rocket + universe
  ('rose', 5000),
  ('heart', 5000),
  ('kiss', 8000),
  ('rocket', 18000),
  ('diamond', 25000),
  ('crown', 35000),
  ('elix_live_universe', 50000),
  ('elix_gold_universe', 50000),
  ('elix_global_universe', 50000),
  -- Small gifts (cheapest → entry tiers)
  ('horse', 5000),
  ('ember_dragon_egg', 5000),
  ('frost_wolf', 5000),
  ('rex_dinosaur', 8000),
  ('night_panther', 8000),
  ('stormborn_night_owl', 8000),
  ('treasure_drake_cub', 12000),
  ('pink_love_jet', 12000),
  ('romantic_jet', 12000),
  ('beast_relic_of_the_ancients', 12000),
  -- Big gifts, 250-tier
  ('elix_ice_sorceress', 18000),
  ('lightning_hypercar', 18000),
  -- Big gifts, 350-tier
  ('a_gleaming_treasure_chest_in_a_cave', 25000),
  ('celestial_star_wand', 25000),
  ('crown_kitty_treasure', 25000),
  ('crystal_rhino', 25000),
  ('crystal_voyager_ship', 25000),
  ('elix_thunder_falcon', 25000),
  ('fantasy_celestial_war_bird', 25000),
  ('fantasy_unicorn', 25000),
  ('ferocious_wolf_in_misty_terrain', 25000),
  ('fiery_lion_in_blazing_glory', 25000),
  ('fiery_power_of_the_blazing_wizard', 25000),
  ('golden_rage_lion', 25000),
  -- Big gifts, 500-tier (premium spread across 35k and 50k)
  ('aelyra_flameveil', 35000),
  ('arcane_storm_phoenix', 35000),
  ('cosmic_panther', 35000),
  ('dragon_s_wrath_ride', 35000),
  ('earth_titan_gorilla', 35000),
  ('eternal_guardian', 35000),
  ('fire_phoenix', 35000),
  ('flames_and_royalty_on_fiery_ground', 35000),
  ('froststorm_lion', 35000),
  ('infernal_lion_king', 35000),
  ('lava_demon', 35000),
  ('lavarok', 50000),
  ('legendary_guardians_of_treasure_chest', 50000),
  ('majestic_ice_blue_mythic_bird', 50000),
  ('majestic_phoenix_soaring_in_flames', 50000),
  ('molten_fury_of_the_lava_dragon', 50000),
  ('mythic_beast_vault_phoenix_lion_dragon_bear_wolf', 50000),
  ('mythic_fire_unicorn', 50000),
  ('rampage_of_the_lava_beast', 50000),
  ('storm_warrior_in_electric_fury', 50000),
  ('the_flame_king', 50000)
) AS v(gift_id, coin_cost)
WHERE g.gift_id = v.gift_id;

-- Safety net: any gift not listed above (e.g. added later) is clamped into the
-- 5k..50k band so nothing can ever exceed 50,000 coins again.
UPDATE elix_gifts
   SET coin_cost = LEAST(50000, GREATEST(5000, coin_cost)),
       battle_points = CASE
                         WHEN gift_type = 'universe' THEN battle_points
                         WHEN gift_type = 'big'
                           THEN LEAST(50000, GREATEST(5000, coin_cost)) * 5
                         ELSE LEAST(50000, GREATEST(5000, coin_cost)) END
 WHERE coin_cost > 50000 OR coin_cost < 5000;

COMMIT;
