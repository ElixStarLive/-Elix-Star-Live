import { Request, Response } from "express";
import { logger } from "../lib/logger";
import {
  fetchCollections,
  fetchPickerTracks,
  fetchTrackHighlights,
  isEpidemicSoundConfigured,
  previewProxyPath,
  reportTrackPreviewed,
  resolvePreviewDownloadUrl,
  searchTracks,
  formatDurationLabel,
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

    result.push({
      id: track.id,
      title: track.title,
      artist: track.artist,
      duration: formatDurationLabel(track.lengthSeconds),
      url: previewProxyPath(track.id),
      license: "Epidemic Sound (sync + public performance pre-cleared)",
      source: "Epidemic Sound",
      provider: "epidemic_sound",
      clipStartSeconds,
      clipEndSeconds,
      coverUrl: track.coverUrl,
      isPreviewOnly: track.isPreviewOnly,
    });
  }

  return result;
}

export async function handleMusicStatus(_req: Request, res: Response) {
  return res.status(200).json({
    configured: isEpidemicSoundConfigured(),
    provider: isEpidemicSoundConfigured() ? "epidemic_sound" : null,
  });
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
    res.setHeader("Cache-Control", "public, s-maxage=120, max-age=30");
    return res.status(200).json(data);
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
