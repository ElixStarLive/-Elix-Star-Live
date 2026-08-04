-- Add 18 new gift videos from Desktop/Gift Video (uploaded to Bunny /gifts/).
-- Prices continue unique ladder above existing catalog max (50,000).
BEGIN;

INSERT INTO elix_gifts (gift_id, name, gift_type, coin_cost, animation_url, sfx_url, is_active, battle_points) VALUES
  ('balloon_love_voyage', 'Balloon Love Voyage', 'big', 50100, '/gifts/balloon_love_voyage.mp4', NULL, TRUE, 250500),
  ('castle_sky_kingdom', 'Castle Sky Kingdom', 'big', 50200, '/gifts/castle_sky_kingdom.mp4', NULL, TRUE, 251000),
  ('celestial_leopard', 'Celestial Leopard', 'big', 50300, '/gifts/celestial_leopard.mp4', NULL, TRUE, 251500),
  ('cosmic_leviathan', 'Cosmic Leviathan', 'big', 50400, '/gifts/cosmic_leviathan.mp4', NULL, TRUE, 252000),
  ('dark_fantasy_castle', 'Dark Fantasy Castle', 'big', 50500, '/gifts/dark_fantasy_castle.mp4', NULL, TRUE, 252500),
  ('elix_star_dark_mage', 'Elix Star Dark Mage', 'big', 50600, '/gifts/elix_star_dark_mage.mp4', NULL, TRUE, 253000),
  ('flying_saucer', 'Flying Saucer', 'big', 50700, '/gifts/flying_saucer.mp4', NULL, TRUE, 253500),
  ('golden_magical_castle', 'Golden Magical Castle', 'big', 50800, '/gifts/golden_magical_castle.mp4', NULL, TRUE, 254000),
  ('magic_book', 'Magic Book', 'big', 50900, '/gifts/magic_book.mp4', NULL, TRUE, 254500),
  ('mystic_chest', 'Mystic Chest', 'big', 51000, '/gifts/mystic_chest.mp4', NULL, TRUE, 255000),
  ('mystic_hyena', 'Mystic Hyena', 'big', 51100, '/gifts/mystic_hyena.mp4', NULL, TRUE, 255500),
  ('phantom_lambo', 'Phantom Lambo', 'big', 51200, '/gifts/phantom_lambo.mp4', NULL, TRUE, 256000),
  ('rocket_cosmic_launch', 'Rocket Cosmic Launch', 'big', 51300, '/gifts/rocket_cosmic_launch.mp4', NULL, TRUE, 256500),
  ('rose_paradise', 'Rose Paradise', 'big', 51400, '/gifts/rose_paradise.mp4', NULL, TRUE, 257000),
  ('whale', 'Whale', 'big', 51500, '/gifts/whale.mp4', NULL, TRUE, 257500),
  ('yacht_royal_voyager', 'Yacht Royal Voyager', 'big', 51600, '/gifts/yacht_royal_voyager.mp4', NULL, TRUE, 258000),
  ('gods_of_elix', 'Gods Of Elix', 'universe', 51700, '/gifts/gods_of_elix.mp4', NULL, TRUE, 51700),
  ('zeus', 'Zeus', 'universe', 51800, '/gifts/zeus.mp4', NULL, TRUE, 51800)
ON CONFLICT (gift_id) DO UPDATE SET
  name = EXCLUDED.name,
  gift_type = EXCLUDED.gift_type,
  coin_cost = EXCLUDED.coin_cost,
  animation_url = EXCLUDED.animation_url,
  is_active = EXCLUDED.is_active,
  battle_points = EXCLUDED.battle_points;

COMMIT;
