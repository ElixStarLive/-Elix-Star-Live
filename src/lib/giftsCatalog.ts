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

/** Display-only name fixes (does not change gift_id / pricing). */
export function formatGiftDisplayName(name: string): string {
  if (name === 'A Gleaming Treasure Chest In A Cave') {
    return 'Gleaming Treasure Chest In Cave';
  }
  return name;
}

// Fetch gifts from database - NO HARDCODED DATA
async function warnCatalogLoadFailed(reason: string) {
  try {
    const { showToast } = await import('./toast');
    showToast(reason || 'Could not load gifts catalog');
  } catch {
    /* toast is best-effort */
  }
}

export async function fetchGiftsFromDatabase(): Promise<GiftUiItem[]> {
  try {
    const { data, error } = await api.gifts.getCatalog();

    if (error) {
      throw new Error(error.message || 'Could not load gifts catalog');
    }

    const giftsData = Array.isArray(data) ? data : (data?.catalog ?? data?.gifts ?? []);
    return buildGiftUiItemsFromCatalog(giftsData);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Could not load gifts catalog';
    await warnCatalogLoadFailed(msg);
    throw e instanceof Error ? e : new Error(msg);
  }
}

/** Public Bunny CDN for all gift icons/videos (never use storage.bunnycdn.com in browser). */
const GIFT_CDN_ORIGIN = 'https://elixstorage.b-cdn.net';

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
function isGiftVideoPath(value: string): boolean {
  const p = value.split('?')[0].toLowerCase();
  return p.endsWith('.mp4') || p.endsWith('.webm') || p.endsWith('.mov');
}

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

  const candidates = [
    typeof data.video === 'string' ? data.video.trim() : '',
    typeof data.animation_url === 'string' ? data.animation_url.trim() : '',
    typeof giftDef?.video === 'string' ? giftDef.video.trim() : '',
  ].filter(Boolean);

  for (const raw of candidates) {
    if (!isGiftVideoPath(raw)) continue;
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      return preferPlayableGiftVideoUrl(raw);
    }
    return preferPlayableGiftVideoUrl(
      resolveGiftAssetUrl(raw.startsWith('/') ? raw : `/${raw}`),
    );
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

/**
 * Prefer MP4 for gift playback on every platform.
 * WebM/VP9 often fails or looks different in Capacitor / some browsers;
 * Celestial Star Wand and other Bunny assets ship paired .mp4 files.
 */
export function preferPlayableGiftVideoUrl(url: string): string {
  if (!url) return url;
  if (/\.webm(\?|#|$)/i.test(url)) {
    // Universe gifts are currently cataloged as .webm assets (no paired .mp4),
    // so converting breaks playback. Keep the original URL for universe assets.
    if (/universe/i.test(url)) return url;
    return url.replace(/\.webm(\?|#|$)/i, '.mp4$1');
  }
  return url;
}

function giftPosterPath(animationPath: string): string {
  const pathOnly = animationPath.split('?')[0];
  if (/\.(mp4|webm|mov)$/i.test(pathOnly)) {
    return pathOnly.replace(/\.(mp4|webm|mov)$/i, '.png');
  }
  return pathOnly;
}

function buildGiftUiItemsFromCatalog(rows: GiftCatalogRow[]): GiftUiItem[] {
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
      const animation = sanitizeGiftUrl(row.animation_url);
      const videoRaw = animation ? resolveGiftAssetUrl(animation) : '';
      const video = videoRaw && isGiftVideoPath(videoRaw)
        ? preferPlayableGiftVideoUrl(videoRaw)
        : videoRaw;
      const iconFromApi = row.icon_url ? resolveGiftAssetUrl(row.icon_url) : null;
      const icon =
        iconFromApi
        ?? (animation ? resolveGiftAssetUrl(giftPosterPath(animation)) : '/Icons/Elix%20Star%20Live.png');

      return {
        id: row.gift_id,
        name: formatGiftDisplayName(row.name),
        coins: row.coin_cost,
        giftType: row.gift_type,
        isActive: row.is_active,
        icon,
        video,
        preview: icon,
      };
    });
}