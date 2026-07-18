import { api } from './apiClient';

export type GiftCatalogRow = {
  gift_id: string;
  name: string;
  gift_type: 'universe' | 'big' | 'small';
  coin_cost: number;
  animation_url: string | null;
  icon_url?: string | null;
  sfx_url: string | null;
  is_active: boolean;
};

export type GiftType = 'universe' | 'big' | 'small';

export type GiftUiItem = {
  id: string;
  name: string;
  coins: number;
  giftType: GiftType;
  isActive: boolean;
  icon: string;
  video: string;
  preview: string;
};

export type GiftItem = GiftUiItem;

export const GIFT_COMBO_MAX = 5000;

// Fetch gifts from database - NO HARDCODED DATA
export async function fetchGiftsFromDatabase(): Promise<GiftUiItem[]> {
  try {
    const { data, error } = await api.gifts.getCatalog();

    if (error) {
      return [];
    }

    const giftsData = Array.isArray(data) ? data : (data?.catalog ?? data?.gifts ?? []);
    return buildGiftUiItemsFromCatalog(giftsData);
  } catch {
    return [];
  }
}

export async function fetchGiftPriceMap(): Promise<Map<string, number>> {
  try {
    const { data, error } = await api.gifts.getCatalog();

    if (error) {
      return new Map();
    }

    const giftsData = Array.isArray(data) ? data : (data?.catalog ?? data?.gifts ?? []);
    const map = new Map<string, number>();
    for (const gift of giftsData) {
      if (gift.gift_id && gift.coin_cost != null) {
        map.set(gift.gift_id, gift.coin_cost);
      }
    }
    return map;
  } catch {
    return new Map();
  }
}

/** Public Bunny CDN for all gift icons/videos (never use storage.bunnycdn.com in browser). */
export const GIFT_CDN_ORIGIN = 'https://elixstorage.b-cdn.net';

function giftPathFromUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    try {
      return new URL(path).pathname;
    } catch {
      return path;
    }
  }
  return path.startsWith('/') ? path : `/${path}`;
}

/** Normalize any gift media path/URL to a public Bunny CDN URL. */
export function isGiftVideoPath(value: string): boolean {
  const p = value.split('?')[0].toLowerCase();
  return p.endsWith('.mp4') || p.endsWith('.webm') || p.endsWith('.mov');
}

/** Map legacy DB gift ids to real Bunny Storage filenames. */
const GIFT_ANIMATION_OVERRIDES: Record<string, string> = {
  rose: '/gifts/treasure_drake_cub.mp4',
  heart: '/gifts/pink_love_jet.mp4',
  kiss: '/gifts/romantic_jet.mp4',
  crown: '/gifts/crown_kitty_treasure.mp4',
  diamond: '/gifts/celestial_star_wand.mp4',
  rocket: '/gifts/lightning_hypercar.mp4',
};

/** Resolve playable gift video URL from WS payload + optional catalog row. */
export function pickGiftVideoUrl(
  data: Record<string, unknown>,
  catalog?: GiftUiItem[],
): string | null {
  const giftId =
    (typeof data.giftId === 'string' && data.giftId.trim()) ||
    (typeof data.gift_id === 'string' && data.gift_id.trim()) ||
    '';
  const giftDef = giftId && catalog?.length ? catalog.find((g) => g.id === giftId) : undefined;
  const override = giftId ? GIFT_ANIMATION_OVERRIDES[giftId] : undefined;

  const candidates = [
    typeof data.video === 'string' ? data.video.trim() : '',
    typeof data.animation_url === 'string' ? data.animation_url.trim() : '',
    typeof giftDef?.video === 'string' ? giftDef.video.trim() : '',
    typeof override === 'string' ? override : '',
  ].filter(Boolean);

  for (const raw of candidates) {
    if (!isGiftVideoPath(raw)) continue;
    if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
    return resolveGiftAssetUrl(raw.startsWith('/') ? raw : `/${raw}`);
  }
  return null;
}

export function resolveGiftAssetUrl(path: string): string {
  if (!path || path.startsWith('data:')) return path;
  if (path.startsWith('/Icons/')) return path;

  const pathname = giftPathFromUrl(path);
  const rel = pathname.replace(/^\/+/, '');
  if (!rel) return `${GIFT_CDN_ORIGIN}/`;

  if (
    path.startsWith('http://') ||
    path.startsWith('https://')
  ) {
    if (/elixstorage\.b-cdn\.net/i.test(path)) return path;
  }

  return `${GIFT_CDN_ORIGIN}/${rel}`;
}

function giftPosterPath(animationPath: string): string {
  const pathOnly = animationPath.split('?')[0];
  if (/\.(mp4|webm|mov)$/i.test(pathOnly)) {
    return pathOnly.replace(/\.(mp4|webm|mov)$/i, '.png');
  }
  return pathOnly;
}

export function buildGiftUiItemsFromCatalog(rows: GiftCatalogRow[]): GiftUiItem[] {
  const faceArFallback: Record<string, { icon: string; video: string }> = {
    face_ar_crown: { icon: '/royce/elix-mark.svg', video: '/gifts/elix_global_universe.webm' },
    face_ar_glasses: { icon: '/royce/elix-mark.svg', video: '/gifts/elix_live_universe.webm' },
    face_ar_hearts: { icon: '/royce/elix-mark.svg', video: '/gifts/elix_gold_universe.webm' },
    face_ar_mask: { icon: '/royce/elix-mark.svg', video: '/gifts/beast_relic_of_the_ancients.webm' },
    face_ar_ears: { icon: '/royce/elix-mark.svg', video: '/gifts/elix_live_universe.webm' },
    face_ar_stars: { icon: '/royce/elix-mark.svg', video: '/gifts/elix_global_universe.webm' },
  };

  const sanitizeGiftUrl = (url: string | null): string | null => {
      if (!url) return null;
      
      try {
          const isUrl = url.startsWith('http');
          const pathPart = isUrl ? new URL(url).pathname : url;
          const filename = pathPart.split('/').pop() || '';
          
          if (!filename) return url;
          
          let newFilename = filename
            .replace(/%20/g, '_')
            .replace(/\s+/g, '_')
            .replace(/[^a-zA-Z0-9.]/g, '_')
            .replace(/_+/g, '_')
            .replace(/_\./g, '.');
            
           const parts = newFilename.split('.');
           if (parts.length > 1) {
               const ext = parts.pop();
               const name = parts.join('.').replace(/^_/, '').replace(/_$/, '');
               newFilename = `${name}.${ext}`;
           }

           if (isUrl && url.includes('elixlive.co.uk')) {
               return `gifts/${newFilename}`;
           }

           return url.replace(filename, newFilename).replace(/%20/g, '_').replace(/ /g, '_');
      } catch {
          return url;
      }
  };

  return rows
    .filter((r) => r.is_active)
    .filter(
      (r) =>
        typeof r.gift_id === 'string' &&
        r.gift_id.trim().length > 0 &&
        typeof r.name === 'string' &&
        r.name.trim().length > 0 &&
        typeof r.coin_cost === 'number' &&
        Number.isFinite(r.coin_cost),
    )
    .map((row) => {
      const fallback = faceArFallback[row.gift_id];
      const dbAnimation = sanitizeGiftUrl(row.animation_url);
      const overrideAnimation = GIFT_ANIMATION_OVERRIDES[row.gift_id];

      const animation = overrideAnimation ?? dbAnimation ?? (fallback ? fallback.video : null);
      const video = animation ? resolveGiftAssetUrl(animation) : '/Icons/Gift%20icon.png?v=3';
      const iconFromApi = row.icon_url ? resolveGiftAssetUrl(row.icon_url) : null;
      const icon = fallback?.icon
        ?? iconFromApi
        ?? (animation ? resolveGiftAssetUrl(giftPosterPath(animation)) : '/Icons/Gift%20icon.png?v=3');

      return {
        id: row.gift_id,
        name: row.name,
        coins: row.coin_cost,
        giftType: row.gift_type,
        isActive: row.is_active,
        icon,
        video,
        preview: icon,
      };
    });
}