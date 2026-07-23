import type { SoundTrack } from './soundLibrary';

/** In-memory handoff from Create compose → Upload (blob URL + optional caption/hashtags/sound). */
export type CachedRecordedMedia = {
  url: string;
  kind: 'video' | 'image';
  caption?: string;
  hashtags?: string;
  /** Selected Add-sound track from Create (applied on Upload). */
  sound?: SoundTrack | null;
};

let cached: CachedRecordedMedia | null = null;

export function setCachedRecordedMedia(
  url: string,
  kind: 'video' | 'image',
  extra?: { caption?: string; hashtags?: string; sound?: SoundTrack | null },
): void {
  cached = {
    url,
    kind,
    caption: extra?.caption,
    hashtags: extra?.hashtags,
    sound: extra?.sound ?? null,
  };
}

/** Read and clear so the URL is only consumed once. */
export function takeCachedRecordedMedia(): CachedRecordedMedia | null {
  const next = cached;
  cached = null;
  return next;
}
