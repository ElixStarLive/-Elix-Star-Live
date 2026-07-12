import { Request, Response } from "express";
import { logger } from "../lib/logger";
import { musicCacheKey, MUSIC_CACHE_TTL_MS } from "../lib/musicCacheValkey";
import { valkeyGet, valkeySet } from "../lib/valkey";
import {
  fetchCollections,
  fetchPickerTracks,
  fetchTrackHighlights,
  isEpidemicSoundConfigured,
  parseEpidemicRawTrack,
  previewProxyPath,
  reportTrackPreviewed,
  resolvePreviewDownloadUrl,
  searchTracks,
  formatDurationLabel,
  type EpidemicTrack,
} from "../services/epidemicSound";

export { isEpidemicSoundConfigured } from "../services/epidemicSound";

/** TikTok-style licensed clip length — highlight segment only, never full song. */
export const LICENSED_CLIP_MAX_SECONDS = 60;

export type ClientSoundTrack = {
  id: string;
  title: string;
  artist: string;
  duration: string;
  url: string;
  license: string;
  source: string;
  provider: "epidemic_sound" | "custom" | "local";
  clipStartSeconds: number;
  clipEndSeconds: number;
  coverUrl?: string | null;
  isPreviewOnly?: boolean;
};

export type ClientMusicPlaylist = {
  id: string;
  name: string;
  coverUrl: string | null;
  tracks: ClientSoundTrack[];
};

export async function resolveLicensedClipWindow(
  track: EpidemicTrack,
  clipMaxSec = LICENSED_CLIP_MAX_SECONDS,
): Promise<{ clipStartSeconds: number; clipEndSeconds: number }> {
  let clipStartSeconds = 0;
  let clipEndSeconds = Math.min(clipMaxSec, track.lengthSeconds || clipMaxSec);
  try {
    const hl = await fetchTrackHighlights(track.id, clipMaxSec);
    clipStartSeconds = Math.max(0, Math.floor(hl.fromMs / 1000));
    const hlEnd = Math.ceil(hl.toMs / 1000);
    clipEndSeconds = Math.max(clipStartSeconds + 5, hlEnd);
    if (clipEndSeconds - clipStartSeconds > clipMaxSec) {
      clipEndSeconds = clipStartSeconds + clipMaxSec;
    }
    if (track.lengthSeconds > 0) {
      clipEndSeconds = Math.min(clipEndSeconds, track.lengthSeconds);
    }
  } catch {
    clipEndSeconds = Math.min(clipMaxSec, track.lengthSeconds || clipMaxSec);
  }
  return { clipStartSeconds, clipEndSeconds };
}

export function epidemicTrackToClientSound(
  track: EpidemicTrack,
  clipStartSeconds = 0,
  clipEndSeconds?: number,
): ClientSoundTrack {
  const end =
    clipEndSeconds ??
    Math.min(LICENSED_CLIP_MAX_SECONDS, track.lengthSeconds || LICENSED_CLIP_MAX_SECONDS);
  const clipLen = Math.max(5, end - clipStartSeconds);
  return {
    id: track.id,
    title: track.title,
    artist: track.artist,
    duration: formatDurationLabel(clipLen),
    url: previewProxyPath(track.id),
    license: "Epidemic Sound — in-app clip only",
    source: "Epidemic Sound",
    provider: "epidemic_sound",
    clipStartSeconds,
    clipEndSeconds: Math.max(clipStartSeconds + 5, end),
    coverUrl: track.coverUrl,
    isPreviewOnly: track.isPreviewOnly,
  };
}

export async function epidemicTrackToLicensedClientSound(
  track: EpidemicTrack,
  clipMaxSec = LICENSED_CLIP_MAX_SECONDS,
): Promise<ClientSoundTrack> {
  const clip = await resolveLicensedClipWindow(track, clipMaxSec);
  return epidemicTrackToClientSound(
    track,
    clip.clipStartSeconds,
    clip.clipEndSeconds,
  );
}

async function mapTracksWithLicensedClips(
  tracks: EpidemicTrack[],
  clipMaxSec = LICENSED_CLIP_MAX_SECONDS,
): Promise<ClientSoundTrack[]> {
  const result: ClientSoundTrack[] = [];
  for (const track of tracks) {
    result.push(await epidemicTrackToLicensedClientSound(track, clipMaxSec));
  }
  return result;
}

export async function buildGlobalLicensedPlaylist(
  limit = 80,
  clipMaxSec = LICENSED_CLIP_MAX_SECONDS,
): Promise<ClientMusicPlaylist> {
  const cacheKey = musicCacheKey("global_playlist", `${limit}:${clipMaxSec}`);
  const cached = await valkeyGet(cacheKey);
  if (cached) return JSON.parse(cached) as ClientMusicPlaylist;

  const pickerTracks = await fetchPickerTracks(limit);
  const tracks = await mapTracksWithLicensedClips(pickerTracks, clipMaxSec);
  const playlist: ClientMusicPlaylist = {
    id: "global",
    name: "For You",
    coverUrl: tracks[0]?.coverUrl ?? null,
    tracks,
  };
  await valkeySet(cacheKey, JSON.stringify(playlist), MUSIC_CACHE_TTL_MS.globalPlaylist);
  return playlist;
}

export async function buildMusicPlaylistsForClient(
  playlistLimit = 10,
  tracksPerPlaylist = 30,
  clipMaxSec = LICENSED_CLIP_MAX_SECONDS,
): Promise<ClientMusicPlaylist[]> {
  const cacheKey = musicCacheKey(
    "playlists_bundle",
    `${playlistLimit}:${tracksPerPlaylist}:${clipMaxSec}`,
  );
  const cached = await valkeyGet(cacheKey);
  if (cached) return JSON.parse(cached) as ClientMusicPlaylist[];

  const global = await buildGlobalLicensedPlaylist(
    Math.min(80, tracksPerPlaylist * 2),
    clipMaxSec,
  );
  const { collections } = await fetchCollections(playlistLimit, 0);
  const playlists: ClientMusicPlaylist[] = [global];

  for (const col of collections || []) {
    const raw = col as {
      id?: string;
      name?: string;
      images?: Record<string, string>;
      tracks?: Record<string, unknown>[];
    };
    if (String(raw.name || "").toLowerCase() === "for you") continue;
    const parsed: EpidemicTrack[] = (raw.tracks || [])
      .slice(0, tracksPerPlaylist)
      .map((t) => parseEpidemicRawTrack(t));
    if (parsed.length === 0) continue;
    const tracks = await mapTracksWithLicensedClips(parsed, clipMaxSec);
    playlists.push({
      id: String(raw.id || raw.name || tracks[0].id),
      name: String(raw.name || "Playlist"),
      coverUrl:
        raw.images?.default ||
        raw.images?.S ||
        tracks[0]?.coverUrl ||
        null,
      tracks,
    });
  }

  await valkeySet(cacheKey, JSON.stringify(playlists), MUSIC_CACHE_TTL_MS.playlistsBundle);
  return playlists;
}

export async function buildEpidemicSoundTracksForClient(
  limit = 60,
  clipMaxSec = LICENSED_CLIP_MAX_SECONDS,
): Promise<ClientSoundTrack[]> {
  const tracks = await fetchPickerTracks(limit);
  return mapTracksWithLicensedClips(tracks, clipMaxSec);
}

export async function handleMusicStatus(_req: Request, res: Response) {
  return res.status(200).json({
    configured: isEpidemicSoundConfigured(),
    provider: isEpidemicSoundConfigured() ? "epidemic_sound" : null,
  });
}

export async function handleMusicGlobal(_req: Request, res: Response) {
  if (!isEpidemicSoundConfigured()) {
    return res.status(200).json({
      playlist: null,
      configured: false,
      clipMaxSeconds: LICENSED_CLIP_MAX_SECONDS,
    });
  }
  try {
    const playlist = await buildGlobalLicensedPlaylist(80, LICENSED_CLIP_MAX_SECONDS);
    res.setHeader("Cache-Control", "public, s-maxage=300, max-age=60");
    return res.status(200).json({
      playlist,
      configured: true,
      licensed: true,
      clipMaxSeconds: LICENSED_CLIP_MAX_SECONDS,
    });
  } catch (err) {
    logger.error({ err }, "handleMusicGlobal failed");
    return res.status(200).json({
      playlist: null,
      configured: true,
      error: "MUSIC_PROVIDER_ERROR",
      clipMaxSeconds: LICENSED_CLIP_MAX_SECONDS,
    });
  }
}

export async function handleMusicPlaylists(req: Request, res: Response) {
  if (!isEpidemicSoundConfigured()) {
    return res.status(200).json({ playlists: [], configured: false });
  }
  try {
    const limit = Math.min(15, Math.max(1, Number(req.query.limit) || 10));
    const perPlaylist = Math.min(40, Math.max(5, Number(req.query.perPlaylist) || 30));
    const playlists = await buildMusicPlaylistsForClient(
      limit,
      perPlaylist,
      LICENSED_CLIP_MAX_SECONDS,
    );
    res.setHeader("Cache-Control", "public, s-maxage=300, max-age=60");
    return res.status(200).json({
      playlists,
      configured: true,
      clipMaxSeconds: LICENSED_CLIP_MAX_SECONDS,
      licensed: true,
    });
  } catch (err) {
    logger.error({ err }, "handleMusicPlaylists failed");
    return res.status(200).json({
      playlists: [],
      configured: true,
      error: "MUSIC_PROVIDER_ERROR",
    });
  }
}

export async function handleMusicCollections(req: Request, res: Response) {
  if (!isEpidemicSoundConfigured()) {
    return res.status(503).json({ error: "MUSIC_PROVIDER_NOT_CONFIGURED" });
  }
  try {
    const limit = Math.min(20, Math.max(1, Number(req.query.limit) || 10));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const data = await fetchCollections(limit, offset);
    res.setHeader("Cache-Control", "public, s-maxage=300, max-age=60");
    return res.status(200).json(data);
  } catch (err) {
    logger.error({ err }, "handleMusicCollections failed");
    return res.status(502).json({ error: "MUSIC_PROVIDER_ERROR" });
  }
}

export async function handleMusicSearch(req: Request, res: Response) {
  if (!isEpidemicSoundConfigured()) {
    return res.status(503).json({ error: "MUSIC_PROVIDER_NOT_CONFIGURED" });
  }
  const term = String(req.query.term || "").trim();
  if (!term) {
    return res.status(400).json({ error: "term is required" });
  }
  try {
    const limit = Math.min(60, Math.max(1, Number(req.query.limit) || 50));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const data = await searchTracks(term, { limit, offset });
    const tracks = await mapTracksWithLicensedClips(
      data.tracks || [],
      LICENSED_CLIP_MAX_SECONDS,
    );
    res.setHeader("Cache-Control", "public, s-maxage=120, max-age=30");
    return res.status(200).json({ tracks, pagination: data.pagination });
  } catch (err) {
    logger.error({ err, term }, "handleMusicSearch failed");
    return res.status(502).json({ error: "MUSIC_PROVIDER_ERROR" });
  }
}

export async function handleMusicTrackPreview(req: Request, res: Response) {
  if (!isEpidemicSoundConfigured()) {
    return res.status(503).json({ error: "MUSIC_PROVIDER_NOT_CONFIGURED" });
  }
  const trackId = String(req.params.trackId || "").trim();
  if (!trackId) {
    return res.status(400).json({ error: "trackId is required" });
  }

  try {
    const download = await resolvePreviewDownloadUrl(trackId);
    const userId = req.ip || "anonymous";
    void reportTrackPreviewed(String(userId), trackId);

    const wantsJson =
      req.query.format === "json" ||
      req.headers.accept?.includes("application/json");
    if (wantsJson) {
      return res.status(200).json({
        previewUrl: download.url,
        expires: download.expires,
      });
    }

    res.setHeader("Cache-Control", "private, max-age=300");
    return res.redirect(302, download.url);
  } catch (err) {
    logger.error({ err, trackId }, "handleMusicTrackPreview failed");
    return res.status(502).json({ error: "MUSIC_PREVIEW_UNAVAILABLE" });
  }
}
