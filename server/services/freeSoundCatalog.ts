/**
 * Free in-app music catalog — Mixkit Stock Music (royalty-free for social/video).
 * https://mixkit.co/license/#musicFree
 *
 * Direct HTTPS MP3 URLs — no partner music API.
 * Social / YouTube / ads OK; not for games, TV/radio, or CD/DVD distribution.
 */

export type FreeCatalogTrack = {
  id: string;
  title: string;
  artist: string;
  audioUrl: string;
  lengthSeconds: number;
  playlist: string;
  coverUrl?: string | null;
};

const CLIP_MAX_SECONDS = 60;

function track(
  numericId: number,
  title: string,
  artist: string,
  lengthSeconds: number,
  playlist: string,
): FreeCatalogTrack {
  return {
    id: `mixkit-${numericId}`,
    title,
    artist,
    audioUrl: `https://assets.mixkit.co/music/${numericId}/${numericId}.mp3`,
    lengthSeconds,
    playlist,
    coverUrl: null,
  };
}

/** Curated Mixkit free tracks — URLs verified live (200 audio/mpeg). */
export const FREE_SOUND_TRACKS: FreeCatalogTrack[] = [
  track(100, "Sunrise Drive", "Mixkit", 120, "Chill"),
  track(120, "City Lights", "Mixkit", 130, "Hip Hop"),
  track(150, "Soft Focus", "Mixkit", 125, "Chill"),
  track(200, "Pulse Check", "Mixkit", 140, "Electronic"),
  track(250, "Night Runner", "Mixkit", 135, "Hip Hop"),
  track(300, "Open Road", "Mixkit", 128, "Pop"),
  track(350, "Golden Hour", "Mixkit", 132, "Chill"),
  track(371, "Cat Walk", "Arulo", 124, "House"),
  track(380, "Afterglow", "Mixkit", 118, "Chill"),
  track(400, "Block Party", "Mixkit", 145, "Hip Hop"),
  track(403, "NBA Type Beat", "Arulo", 180, "Hip Hop"),
  track(500, "Neon Streets", "Mixkit", 138, "Electronic"),
  track(550, "Easy Days", "Mixkit", 122, "Pop"),
  track(600, "Bass Line", "Mixkit", 150, "Hip Hop"),
  track(650, "Coastal", "Mixkit", 126, "Chill"),
  track(700, "Uptown", "Mixkit", 142, "Pop"),
  track(745, "House Vibez", "Lily J", 150, "House"),
  track(800, "Arcade Night", "Mixkit", 136, "Electronic"),
  track(841, "Tonight", "Michael Ramir C.", 120, "Hip Hop"),
  track(900, "Skyline", "Mixkit", 134, "Electronic"),
  track(950, "Warm Breeze", "Mixkit", 128, "Chill"),
  track(1000, "Main Stage", "Mixkit", 148, "House"),
  track(1100, "Loft Session", "Mixkit", 130, "House"),
  track(1200, "Friday Flow", "Mixkit", 140, "Pop"),
  track(1300, "Deep Cut", "Mixkit", 155, "Electronic"),
];

export const FREE_CLIP_MAX_SECONDS = CLIP_MAX_SECONDS;

export function isFreeSoundCatalogConfigured(): boolean {
  return FREE_SOUND_TRACKS.length > 0;
}

export function getFreeTrackById(trackId: string): FreeCatalogTrack | null {
  const id = String(trackId || "").trim();
  if (!id) return null;
  return FREE_SOUND_TRACKS.find((t) => t.id === id) ?? null;
}

export function searchFreeTracks(term: string, limit = 50): FreeCatalogTrack[] {
  const q = term.trim().toLowerCase();
  const pool = !q
    ? FREE_SOUND_TRACKS
    : FREE_SOUND_TRACKS.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.artist.toLowerCase().includes(q) ||
          t.playlist.toLowerCase().includes(q) ||
          t.id.toLowerCase().includes(q),
      );
  return pool.slice(0, Math.max(1, Math.min(60, limit)));
}

export function listFreePlaylists(): { id: string; name: string; tracks: FreeCatalogTrack[] }[] {
  const byName = new Map<string, FreeCatalogTrack[]>();
  for (const t of FREE_SOUND_TRACKS) {
    const list = byName.get(t.playlist) ?? [];
    list.push(t);
    byName.set(t.playlist, list);
  }
  const playlists = [...byName.entries()].map(([name, tracks]) => ({
    id: name.toLowerCase().replace(/\s+/g, "-"),
    name,
    tracks,
  }));
  playlists.unshift({
    id: "all",
    name: "For You",
    tracks: FREE_SOUND_TRACKS,
  });
  return playlists;
}

export function formatDurationLabel(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export function clipWindowForTrack(track: FreeCatalogTrack): {
  clipStartSeconds: number;
  clipEndSeconds: number;
} {
  const end = Math.min(CLIP_MAX_SECONDS, Math.max(15, track.lengthSeconds || CLIP_MAX_SECONDS));
  return { clipStartSeconds: 0, clipEndSeconds: end };
}
