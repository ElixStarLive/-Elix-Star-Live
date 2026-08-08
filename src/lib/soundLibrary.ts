import { apiUrl } from "./api";
import { request } from "./apiClient";
import Hls from "hls.js";

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

/** Extract Epidemic track id from our preview proxy path (relative or absolute). */
export function extractMusicPreviewTrackId(url: string): string | null {
  if (!url) return null;
  const m = String(url).match(/\/api\/music\/tracks\/([^/?#]+)\/preview/i);
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

function isHlsUrl(url: string): boolean {
  return /\.m3u8(\?|$)/i.test(url) || /\/hls\//i.test(url);
}

const hlsByAudio = new WeakMap<HTMLAudioElement, Hls>();

/** Tear down any HLS instance attached to this audio element and silence it. */
export function stopSoundPreview(audio: HTMLAudioElement | null | undefined): void {
  if (!audio) return;
  try {
    audio.pause();
  } catch {
    /* ignore */
  }
  try {
    audio.muted = true;
    audio.volume = 0;
  } catch {
    /* ignore */
  }
  const hls = hlsByAudio.get(audio);
  if (hls) {
    try {
      hls.destroy();
    } catch {
      /* ignore */
    }
    hlsByAudio.delete(audio);
  }
  try {
    audio.removeAttribute("src");
    audio.srcObject = null;
    // Clear MediaSource / residual buffer so nothing keeps audibling after leave.
    audio.load();
  } catch {
    /* ignore */
  }
}

/**
 * Resolve a URL that `<audio>` / HLS can play.
 * Asks the server for the Epidemic upstream URL (MP3 or HLS).
 */
export async function resolvePlayableSoundUrl(url: string): Promise<string> {
  const resolved = resolveSoundTrackPlaybackUrl(url);
  if (!resolved) return "";

  const trackId = extractMusicPreviewTrackId(resolved);
  if (!trackId) return resolved;

  const path = `/api/music/tracks/${encodeURIComponent(trackId)}/preview?format=json`;
  const { data, error } = await request<{
    previewUrl?: string;
    proxyPath?: string;
    format?: "mp3" | "hls";
  }>(path);
  if (error) return "";

  const previewUrl = typeof data?.previewUrl === "string" ? data.previewUrl.trim() : "";
  if (previewUrl) return previewUrl;

  const proxy =
    typeof data?.proxyPath === "string" && data.proxyPath.trim()
      ? data.proxyPath.trim()
      : `/api/music/tracks/${encodeURIComponent(trackId)}/preview`;
  return resolveSoundTrackPlaybackUrl(proxy);
}

async function attachHls(audio: HTMLAudioElement, src: string): Promise<void> {
  stopSoundPreview(audio);

  if (Hls.isSupported()) {
    const hls = new Hls({
      enableWorker: true,
      maxBufferLength: 30,
    });
    hlsByAudio.set(audio, hls);
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const done = (err?: Error) => {
        if (settled) return;
        settled = true;
        if (err) reject(err);
        else resolve();
      };
      hls.on(Hls.Events.MANIFEST_PARSED, () => done());
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data?.fatal) done(new Error(data.type || "hls_fatal"));
      });
      hls.loadSource(src);
      hls.attachMedia(audio);
    });
    return;
  }

  if (audio.canPlayType("application/vnd.apple.mpegurl")) {
    audio.src = src;
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const done = (err?: Error) => {
        if (settled) return;
        settled = true;
        audio.removeEventListener("loadedmetadata", onReady);
        audio.removeEventListener("error", onErr);
        if (err) reject(err);
        else resolve();
      };
      const onReady = () => done();
      const onErr = () => done(new Error("audio_load_failed"));
      audio.addEventListener("loadedmetadata", onReady);
      audio.addEventListener("error", onErr);
      audio.load();
    });
    return;
  }

  throw new Error("hls_unsupported");
}

/** Load src, seek to clip start, then play (MP3 or Epidemic HLS). */
export async function playAudioClip(
  audio: HTMLAudioElement,
  src: string,
  clipStartSeconds = 0,
  isCancelled?: () => boolean,
): Promise<void> {
  if (!src) throw new Error("no_audio_src");
  if (isCancelled?.()) {
    stopSoundPreview(audio);
    throw new Error("cancelled");
  }

  if (isHlsUrl(src)) {
    await attachHls(audio, src);
  } else {
    stopSoundPreview(audio);
    if (isCancelled?.()) throw new Error("cancelled");
    audio.pause();
    audio.src = src;
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
  }

  if (isCancelled?.()) {
    stopSoundPreview(audio);
    throw new Error("cancelled");
  }

  const start = Math.max(0, clipStartSeconds || 0);
  try {
    if (Number.isFinite(start) && start > 0) audio.currentTime = start;
  } catch {
    /* ignore seek errors */
  }
  if (isCancelled?.()) {
    stopSoundPreview(audio);
    throw new Error("cancelled");
  }
  try {
    audio.muted = false;
    if (audio.volume <= 0) audio.volume = 1;
  } catch {
    /* ignore */
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
