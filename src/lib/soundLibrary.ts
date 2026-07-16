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
