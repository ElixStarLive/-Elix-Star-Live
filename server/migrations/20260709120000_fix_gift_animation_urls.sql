-- Point catalog gifts at real Bunny Storage media (legacy seed used missing rose.webm paths).
BEGIN;

UPDATE elix_gifts SET animation_url = '/gifts/treasure_drake_cub.mp4' WHERE gift_id = 'rose';
UPDATE elix_gifts SET animation_url = '/gifts/pink_love_jet.mp4' WHERE gift_id = 'heart';
UPDATE elix_gifts SET animation_url = '/gifts/romantic_jet.mp4' WHERE gift_id = 'kiss';
UPDATE elix_gifts SET animation_url = '/gifts/crown_kitty_treasure.mp4' WHERE gift_id = 'crown';
UPDATE elix_gifts SET animation_url = '/gifts/celestial_star_wand.mp4' WHERE gift_id = 'diamond';
UPDATE elix_gifts SET animation_url = '/gifts/lightning_hypercar.mp4' WHERE gift_id = 'rocket';

COMMIT;
