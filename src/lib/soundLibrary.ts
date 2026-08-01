import { apiUrl } from "./api";
import { request } from "./apiClient";

export type SoundTrack = {
  id: string;
  title: string;
  artist: string;
  duration: string;
  url: string;
  license: string;
  source: string;
  provider?: "epidemic_sound" | "custom" | "local";
  clipStartSeconds: number;
  clipEndSeconds: number;
  coverUrl?: string | null;
  isPreviewOnly?: boolean;
};

/** Resolve relative preview proxy paths for `<audio>` on native (Capacitor). */
export function resolveSoundTrackPlaybackUrl(url: string): string {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return apiUrl(url);
}

const previewSignedUrlCache = new Map<string, { url: string; expiresAt: number }>();

/** Extract Epidemic track id from our preview proxy path (relative or absolute). */
export function extractMusicPreviewTrackId(url: string): string | null {
  if (!url) return null;
  const m = String(url).match(/\/api\/music\/tracks\/([^/?#]+)\/preview/i);
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

/**
 * Resolve a URL that `<audio>` can actually play.
 * Our `/api/music/tracks/:id/preview` endpoint 302-redirects to a short-lived
 * Epidemic CDN URL — many WebViews (and some browsers) fail to play that via
 * redirect. Fetch `?format=json` and use the signed URL directly instead.
 */
export async function resolvePlayableSoundUrl(url: string): Promise<string> {
  const resolved = resolveSoundTrackPlaybackUrl(url);
  if (!resolved) return "";

  const trackId = extractMusicPreviewTrackId(resolved);
  if (!trackId) return resolved;

  const cached = previewSignedUrlCache.get(trackId);
  if (cached && cached.expiresAt > Date.now() + 15_000) {
    return cached.url;
  }

  const path = `/api/music/tracks/${encodeURIComponent(trackId)}/preview?format=json`;
  const { data, error } = await request<{ previewUrl?: string; expires?: string }>(path);
  const previewUrl = typeof data?.previewUrl === "string" ? data.previewUrl.trim() : "";
  if (error || !previewUrl) return "";

  let expiresAt = Date.now() + 4 * 60_000;
  if (data?.expires) {
    const parsed = Date.parse(data.expires);
    if (Number.isFinite(parsed)) expiresAt = parsed;
  }
  previewSignedUrlCache.set(trackId, { url: previewUrl, expiresAt });
  return previewUrl;
}

/** Load src, seek to clip start, then play (avoids currentTime-before-ready failures). */
export async function playAudioClip(
  audio: HTMLAudioElement,
  src: string,
  clipStartSeconds = 0,
): Promise<void> {
  if (!src) throw new Error("no_audio_src");
  audio.pause();
  if (audio.src !== src) {
    audio.src = src;
  }
  audio.load();

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const done = (err?: Error) => {
      if (settled) return;
      settled = true;
      audio.removeEventListener("canplay", onReady);
      audio.removeEventListener("loadedmetadata", onReady);
      audio.removeEventListener("error", onErr);
      if (err) reject(err);
      else resolve();
    };
    const onReady = () => done();
    const onErr = () => done(new Error("audio_load_failed"));
    audio.addEventListener("canplay", onReady);
    audio.addEventListener("loadedmetadata", onReady);
    audio.addEventListener("error", onErr);
    if (audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) done();
  });

  const start = Math.max(0, clipStartSeconds || 0);
  try {
    if (Number.isFinite(start)) audio.currentTime = start;
  } catch {
    /* ignore seek errors */
  }
  await audio.play();
}

export type SoundCatalogResponse = {
  tracks: SoundTrack[];
  configured: boolean;
  source: string | null;
  error?: string | null;
};

function mapSoundTracks(tracks: SoundTrack[]): SoundTrack[] {
  return tracks.map((track) => ({
    ...track,
    url: resolveSoundTrackPlaybackUrl(track.url),
  }));
}

/** Licensed sound tracks from server (Epidemic Sound when configured, else Neon catalog). */
export async function fetchSoundTracksFromDatabase(): Promise<SoundTrack[]> {
  const catalog = await fetchSoundCatalog();
  return catalog.tracks;
}

export async function fetchSoundCatalog(): Promise<SoundCatalogResponse> {
  const { data, error } = await request<{
    tracks?: SoundTrack[];
    configured?: boolean;
    source?: string | null;
    error?: string;
  }>("/api/sounds");
  if (error) {
    return { tracks: [], configured: false, source: null, error: error.message };
  }
  return {
    tracks: mapSoundTracks(data?.tracks ?? []),
    configured: Boolean(data?.configured),
    source: data?.source ?? null,
    error: data?.error ?? null,
  };
}

export const EMPTY_TRACK: SoundTrack = {
  id: "0",
  title: "No Music",
  artist: "-",
  duration: "0:00",
  url: "",
  license: "-",
  source: "Local",
  clipStartSeconds: 0,
  clipEndSeconds: 0,
};

/** Default camera / create picker — use mic audio from the clip. */
export const ORIGINAL_SOUND_TRACK: SoundTrack = {
  id: "original",
  title: "Original Sound",
  artist: "Your recording",
  duration: "0:00",
  url: "",
  license: "Original",
  source: "Camera",
  provider: "local",
  clipStartSeconds: 0,
  clipEndSeconds: 0,
};

export function getLocalSoundPickerTracks(): SoundTrack[] {
  return [ORIGINAL_SOUND_TRACK];
}

export type MusicPlaylist = {
  id: string;
  name: string;
  coverUrl: string | null;
  tracks: SoundTrack[];
};

export async function fetchGlobalMusicPlaylist(): Promise<{
  playlist: MusicPlaylist | null;
  configured: boolean;
  clipMaxSeconds?: number;
  error?: string | null;
}> {
  const { data, error } = await request<{
    playlist?: MusicPlaylist | null;
    configured?: boolean;
    clipMaxSeconds?: number;
    error?: string;
  }>("/api/music/global");
  if (error) {
    return { playlist: null, configured: false, error: error.message };
  }
  const playlist = data?.playlist
    ? {
        ...data.playlist,
        tracks: mapSoundTracks(data.playlist.tracks ?? []),
      }
    : null;
  return {
    playlist,
    configured: Boolean(data?.configured),
    clipMaxSeconds: data?.clipMaxSeconds,
    error: data?.error ?? null,
  };
}

export async function fetchMusicPlaylists(): Promise<{
  playlists: MusicPlaylist[];
  configured: boolean;
  clipMaxSeconds?: number;
  error?: string | null;
}> {
  const { data, error } = await request<{
    playlists?: MusicPlaylist[];
    configured?: boolean;
    clipMaxSeconds?: number;
    error?: string;
  }>("/api/music/playlists");
  if (error) {
    return { playlists: [], configured: false, error: error.message };
  }
  return {
    playlists: (data?.playlists ?? []).map((p) => ({
      ...p,
      tracks: mapSoundTracks(p.tracks ?? []),
    })),
    configured: Boolean(data?.configured),
    clipMaxSeconds: data?.clipMaxSeconds,
    error: data?.error ?? null,
  };
}

export async function searchLicensedTracks(term: string): Promise<SoundTrack[]> {
  const q = term.trim();
  if (!q) return [];
  const { data, error } = await request<{ tracks?: SoundTrack[] }>(
    `/api/music/search?term=${encodeURIComponent(q)}&limit=40`,
  );
  if (error) return [];
  return mapSoundTracks(data?.tracks ?? []);
}

const SAVED_SOUNDS_KEY = 'elix_saved_sounds_v1';

export function listSavedSounds(): SoundTrack[] {
  try {
    const raw = localStorage.getItem(SAVED_SOUNDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SoundTrack[]) : [];
  } catch {
    return [];
  }
}

export function isSoundSaved(trackId: string): boolean {
  return listSavedSounds().some((t) => t.id === trackId);
}

/** Returns true if the track is saved after the toggle. */
export function toggleSavedSound(track: SoundTrack): boolean {
  const prev = listSavedSounds();
  const exists = prev.some((t) => t.id === track.id);
  const next = exists ? prev.filter((t) => t.id !== track.id) : [...prev, track];
  try {
    localStorage.setItem(SAVED_SOUNDS_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota */
  }
  return !exists;
}
