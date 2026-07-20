-- Unique coin price per gift: every gift gets a DIFFERENT value, spread across
-- 5,000 → 50,000 (max 50k). Supersedes the tiered ladder (which reused 25k/35k/50k
-- across many gifts). Prices are ABSOLUTE per gift_id, so this is idempotent.
--
-- battle_points keep the original ratio: universe = unchanged, big = coins*5,
-- small/other = coins.
BEGIN;

UPDATE elix_gifts g SET
  coin_cost = v.coin_cost,
  battle_points = CASE
                    WHEN g.gift_type = 'universe' THEN g.battle_points
                    WHEN g.gift_type = 'big' THEN v.coin_cost * 5
                    ELSE v.coin_cost
                  END
FROM (VALUES
  -- Starter / small tier (cheapest, each distinct)
  ('horse', 5000),
  ('ember_dragon_egg', 5500),
  ('frost_wolf', 6000),
  ('rose', 6500),
  ('heart', 7000),
  ('rex_dinosaur', 7500),
  ('night_panther', 8000),
  ('kiss', 8500),
  ('stormborn_night_owl', 9000),
  ('treasure_drake_cub', 9500),
  ('pink_love_jet', 10000),
  ('romantic_jet', 11000),
  ('beast_relic_of_the_ancients', 12000),
  ('rocket', 13000),
  -- Mid tier
  ('elix_ice_sorceress', 14000),
  ('lightning_hypercar', 15000),
  ('diamond', 16000),
  -- Big tier (each distinct)
  ('a_gleaming_treasure_chest_in_a_cave', 17000),
  ('celestial_star_wand', 18000),
  ('crown_kitty_treasure', 19000),
  ('crystal_rhino', 20000),
  ('crystal_voyager_ship', 21000),
  ('elix_thunder_falcon', 22000),
  ('fantasy_celestial_war_bird', 23000),
  ('fantasy_unicorn', 24000),
  ('ferocious_wolf_in_misty_terrain', 25000),
  ('fiery_lion_in_blazing_glory', 26000),
  ('fiery_power_of_the_blazing_wizard', 27000),
  ('golden_rage_lion', 28000),
  ('crown', 29000),
  -- Premium tier (each distinct)
  ('aelyra_flameveil', 30000),
  ('arcane_storm_phoenix', 31000),
  ('cosmic_panther', 32000),
  ('dragon_s_wrath_ride', 33000),
  ('earth_titan_gorilla', 34000),
  ('eternal_guardian', 35000),
  ('fire_phoenix', 36000),
  ('flames_and_royalty_on_fiery_ground', 37000),
  ('froststorm_lion', 38000),
  ('infernal_lion_king', 39000),
  ('lava_demon', 40000),
  ('lavarok', 41000),
  ('legendary_guardians_of_treasure_chest', 42000),
  ('majestic_ice_blue_mythic_bird', 43000),
  ('majestic_phoenix_soaring_in_flames', 44000),
  ('molten_fury_of_the_lava_dragon', 45000),
  ('mythic_beast_vault_phoenix_lion_dragon_bear_wolf', 46000),
  ('mythic_fire_unicorn', 47000),
  ('rampage_of_the_lava_beast', 48000),
  ('storm_warrior_in_electric_fury', 48500),
  ('the_flame_king', 49000),
  -- Universe (top, each distinct, capped at 50k)
  ('elix_live_universe', 49500),
  ('elix_gold_universe', 49800),
  ('elix_global_universe', 50000)
) AS v(gift_id, coin_cost)
WHERE g.gift_id = v.gift_id;

-- Safety net: anything not listed (added later) is clamped into 5k..50k.
UPDATE elix_gifts
   SET coin_cost = LEAST(50000, GREATEST(5000, coin_cost)),
       battle_points = CASE
                         WHEN gift_type = 'universe' THEN battle_points
                         WHEN gift_type = 'big'
                           THEN LEAST(50000, GREATEST(5000, coin_cost)) * 5
                         ELSE LEAST(50000, GREATEST(5000, coin_cost)) END
 WHERE coin_cost > 50000 OR coin_cost < 5000;

COMMIT;
