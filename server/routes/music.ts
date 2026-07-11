import { Request, Response } from "express";
import { logger } from "../lib/logger";
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

export function epidemicTrackToClientSound(
  track: EpidemicTrack,
  clipStartSeconds = 0,
  clipEndSeconds?: number,
): ClientSoundTrack {
  const end = clipEndSeconds ?? Math.min(30, track.lengthSeconds || 30);
  return {
    id: track.id,
    title: track.title,
    artist: track.artist,
    duration: formatDurationLabel(track.lengthSeconds),
    url: previewProxyPath(track.id),
    license: "Epidemic Sound (sync + public performance pre-cleared)",
    source: "Epidemic Sound",
    provider: "epidemic_sound",
    clipStartSeconds,
    clipEndSeconds: Math.max(clipStartSeconds + 5, end),
    coverUrl: track.coverUrl,
    isPreviewOnly: track.isPreviewOnly,
  };
}

export async function buildMusicPlaylistsForClient(
  playlistLimit = 10,
  tracksPerPlaylist = 30,
): Promise<ClientMusicPlaylist[]> {
  const { collections } = await fetchCollections(playlistLimit, 0);
  const playlists: ClientMusicPlaylist[] = [];

  for (const col of collections || []) {
    const raw = col as {
      id?: string;
      name?: string;
      images?: Record<string, string>;
      tracks?: Record<string, unknown>[];
    };
    const tracks: ClientSoundTrack[] = [];
    for (const t of (raw.tracks || []).slice(0, tracksPerPlaylist)) {
      tracks.push(epidemicTrackToClientSound(parseEpidemicRawTrack(t)));
    }
    if (tracks.length === 0) continue;
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

  return playlists;
}

export async function buildEpidemicSoundTracksForClient(
  limit = 60,
): Promise<ClientSoundTrack[]> {
  const tracks = await fetchPickerTracks(limit);
  const result: ClientSoundTrack[] = [];

  for (const track of tracks) {
    let clipStartSeconds = 0;
    let clipEndSeconds = Math.min(30, track.lengthSeconds || 30);
    try {
      const hl = await fetchTrackHighlights(track.id, 30);
      clipStartSeconds = Math.max(0, Math.floor(hl.fromMs / 1000));
      clipEndSeconds = Math.max(
        clipStartSeconds + 5,
        Math.ceil(hl.toMs / 1000),
      );
    } catch {
      // highlights optional — use first 30s
    }

    result.push(
      epidemicTrackToClientSound(track, clipStartSeconds, clipEndSeconds),
    );
  }

  return result;
}

export async function handleMusicStatus(_req: Request, res: Response) {
  return res.status(200).json({
    configured: isEpidemicSoundConfigured(),
    provider: isEpidemicSoundConfigured() ? "epidemic_sound" : null,
  });
}

export async function handleMusicPlaylists(req: Request, res: Response) {
  if (!isEpidemicSoundConfigured()) {
    return res.status(200).json({ playlists: [], configured: false });
  }
  try {
    const limit = Math.min(15, Math.max(1, Number(req.query.limit) || 10));
    const perPlaylist = Math.min(40, Math.max(5, Number(req.query.perPlaylist) || 30));
    const playlists = await buildMusicPlaylistsForClient(limit, perPlaylist);
    res.setHeader("Cache-Control", "public, s-maxage=300, max-age=60");
    return res.status(200).json({ playlists, configured: true });
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
    const tracks = (data.tracks || []).map((t) => epidemicTrackToClientSound(t));
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
