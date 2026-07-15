/** In-memory handoff of a just-recorded clip from Create → Upload (same SPA session). */

export type RecordedMediaKind = 'video' | 'image';

type CachedRecordedMedia = {
  url: string;
  kind: RecordedMediaKind;
};

let cached: CachedRecordedMedia | null = null;

export function setCachedRecordedMedia(url: string, kind: RecordedMediaKind = 'video') {
  cached = { url, kind };
}

export function takeCachedRecordedMedia(): CachedRecordedMedia | null {
  const next = cached;
  cached = null;
  return next;
}

export function peekCachedRecordedMedia(): CachedRecordedMedia | null {
  return cached;
}
