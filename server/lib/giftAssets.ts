/** Public Bunny CDN URLs for gift catalog media (server-side source of truth). */

const DEFAULT_GIFT_CDN_ORIGIN = "https://elixstorage.b-cdn.net";

export function getGiftCdnOrigin(): string {
  const raw = (
    process.env.BUNNY_CDN_HOSTNAME ||
    process.env.VITE_BUNNY_CDN_HOSTNAME ||
    process.env.VITE_CDN_URL ||
    ""
  )
    .trim()
    .replace(/\/+$/, "");
  if (!raw) return DEFAULT_GIFT_CDN_ORIGIN;
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  return `https://${raw.split("/")[0]}`;
}

export function resolveGiftMediaUrl(path: string | null | undefined): string | null {
  if (path == null) return null;
  const trimmed = String(path).trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  const rel = trimmed.startsWith("/") ? trimmed.slice(1) : trimmed;
  return `${getGiftCdnOrigin()}/${rel}`;
}

export function giftIconUrlFromAnimation(animationUrl: string | null | undefined): string | null {
  if (!animationUrl) return null;
  const pathOnly = animationUrl.split("?")[0];
  if (/\.(mp4|webm|mov)$/i.test(pathOnly)) {
    return pathOnly.replace(/\.(mp4|webm|mov)$/i, ".png");
  }
  return pathOnly;
}
