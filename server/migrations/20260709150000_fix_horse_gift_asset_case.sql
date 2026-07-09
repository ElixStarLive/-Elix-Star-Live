-- Bunny stores Horse.mp4 with capital H; lowercase path 404s on CDN.
BEGIN;

UPDATE elix_gifts
SET animation_url = '/gifts/Horse.mp4'
WHERE gift_id = 'horse';

COMMIT;
