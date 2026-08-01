import { Request, Response } from "express";
import { logger } from "../lib/logger";
import {
  FREE_CLIP_MAX_SECONDS,
  FREE_SOUND_TRACKS,
  clipWindowForTrack,
  formatDurationLabel,
  getFreeTrackById,
  isFreeSoundCatalogConfigured,
  listFreePlaylists,
  searchFreeTracks,
  type FreeCatalogTrack,
} from "../services/freeSoundCatalog";

export { isFreeSoundCatalogConfigured };

/** In-app clip length for picker / bake. */
export const MUSIC_CLIP_MAX_SECONDS = FREE_CLIP_MAX_SECONDS;

export type ClientSoundTrack = {
  id: string;
  title: string;
  artist: string;
  duration: string;
  url: string;
  license: string;
  source: string;
  provider: "custom" | "local";
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

export function freeTrackToClientSound(track: FreeCatalogTrack): ClientSoundTrack {
  const clip = clipWindowForTrack(track);
  const clipLen = Math.max(5, clip.clipEndSeconds - clip.clipStartSeconds);
  return {
    id: track.id,
    title: track.title,
    artist: track.artist,
    duration: formatDurationLabel(clipLen),
    url: track.audioUrl,
    license: "Mixkit Stock Music — free for social & video",
    source: "Mixkit",
    provider: "local",
    clipStartSeconds: clip.clipStartSeconds,
    clipEndSeconds: clip.clipEndSeconds,
    coverUrl: track.coverUrl ?? null,
    isPreviewOnly: false,
  };
}

export function buildFreeSoundTracksForClient(limit = 60): ClientSoundTrack[] {
  return FREE_SOUND_TRACKS.slice(0, Math.max(1, Math.min(80, limit))).map(
    freeTrackToClientSound,
  );
}

export function buildGlobalMusicPlaylist(limit = 80): ClientMusicPlaylist {
  return {
    id: "for-you",
    name: "For You",
    coverUrl: null,
    tracks: buildFreeSoundTracksForClient(limit),
  };
}

export function buildMusicPlaylistsForClient(): ClientMusicPlaylist[] {
  return listFreePlaylists().map((p) => ({
    id: p.id,
    name: p.name,
    coverUrl: null,
    tracks: p.tracks.map(freeTrackToClientSound),
  }));
}

export async function handleMusicStatus(_req: Request, res: Response) {
  return res.status(200).json({
    configured: isFreeSoundCatalogConfigured(),
    provider: isFreeSoundCatalogConfigured() ? "mixkit_free" : null,
  });
}

export async function handleMusicGlobal(_req: Request, res: Response) {
  try {
    const playlist = buildGlobalMusicPlaylist(80);
    res.setHeader("Cache-Control", "public, s-maxage=300, max-age=60");
    return res.status(200).json({
      playlist,
      configured: true,
      licensed: true,
      clipMaxSeconds: MUSIC_CLIP_MAX_SECONDS,
    });
  } catch (err) {
    logger.error({ err }, "handleMusicGlobal failed");
    return res.status(200).json({
      playlist: null,
      configured: true,
      error: "MUSIC_PROVIDER_ERROR",
      clipMaxSeconds: MUSIC_CLIP_MAX_SECONDS,
    });
  }
}

export async function handleMusicPlaylists(_req: Request, res: Response) {
  try {
    const playlists = buildMusicPlaylistsForClient();
    res.setHeader("Cache-Control", "public, s-maxage=300, max-age=60");
    return res.status(200).json({
      playlists,
      configured: true,
      clipMaxSeconds: MUSIC_CLIP_MAX_SECONDS,
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

export async function handleMusicCollections(_req: Request, res: Response) {
  const playlists = listFreePlaylists().filter((p) => p.id !== "all");
  res.setHeader("Cache-Control", "public, s-maxage=300, max-age=60");
  return res.status(200).json({
    collections: playlists.map((p) => ({
      id: p.id,
      name: p.name,
      trackCount: p.tracks.length,
    })),
  });
}

export async function handleMusicSearch(req: Request, res: Response) {
  const term = String(req.query.term || "").trim();
  if (!term) {
    return res.status(400).json({ error: "term is required" });
  }
  try {
    const limit = Math.min(60, Math.max(1, Number(req.query.limit) || 50));
    const tracks = searchFreeTracks(term, limit).map(freeTrackToClientSound);
    res.setHeader("Cache-Control", "public, s-maxage=120, max-age=30");
    return res.status(200).json({ tracks, pagination: { total: tracks.length } });
  } catch (err) {
    logger.error({ err, term }, "handleMusicSearch failed");
    return res.status(502).json({ error: "MUSIC_PROVIDER_ERROR" });
  }
}

export async function handleMusicTrackPreview(req: Request, res: Response) {
  const trackId = String(req.params.trackId || "").trim();
  if (!trackId) {
    return res.status(400).json({ error: "trackId is required" });
  }

  const track = getFreeTrackById(trackId);
  if (!track) {
    return res.status(404).json({ error: "TRACK_NOT_FOUND" });
  }

  const wantsJson =
    req.query.format === "json" ||
    req.headers.accept?.includes("application/json");
  if (wantsJson) {
    return res.status(200).json({
      previewUrl: track.audioUrl,
      expires: null,
      format: "mp3",
    });
  }

  res.setHeader("Cache-Control", "public, max-age=3600");
  return res.redirect(302, track.audioUrl);
}
