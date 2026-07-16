/** In-memory handoff from Create compose → Upload (blob URL + optional caption/hashtags). */
export type CachedRecordedMedia = {
  url: string;
  kind: 'video' | 'image';
  caption?: string;
  hashtags?: string;
};

let cached: CachedRecordedMedia | null = null;

export function setCachedRecordedMedia(
  url: string,
  kind: 'video' | 'image',
  extra?: { caption?: string; hashtags?: string },
): void {
  cached = {
    url,
    kind,
    caption: extra?.caption,
    hashtags: extra?.hashtags,
  };
}

/** Read and clear so the URL is only consumed once. */
export function takeCachedRecordedMedia(): CachedRecordedMedia | null {
  const next = cached;
  cached = null;
  return next;
}
