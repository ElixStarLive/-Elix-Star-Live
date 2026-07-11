/**
 * Epidemic Sound Partner Content API — server-only.
 * https://partner-content-api.epidemicsound.com
 */

import { logger } from "../lib/logger";
import {
  musicCacheKey,
  MUSIC_CACHE_TTL_MS,
  previewCacheKey,
  previewCacheTtlMs,
} from "../lib/musicCacheValkey";
import { valkeyGet, valkeySet } from "../lib/valkey";

const BASE_URL =
  process.env.EPIDEMIC_SOUND_API_BASE ||
  "https://partner-content-api.epidemicsound.com";

const EPIDEMIC_KEY_ENV_NAMES = [
  "EPIDEMIC_SOUND_API_KEY",
  "EPIDEMIC_API_KEY",
  "EPIDEMIC_SOUND_KEY",
] as const;

function normalizeEnvSecret(raw: string | undefined): string {
  if (!raw) return "";
  let value = raw.trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim();
  }
  if (value.startsWith("Set ") && value.toLowerCase().includes("coolify")) {
    return "";
  }
  return value;
}

/** Resolve Epidemic key from common Coolify / env variable names. */
export function resolveEpidemicSoundApiKey(): string {
  for (const name of EPIDEMIC_KEY_ENV_NAMES) {
    const value = normalizeEnvSecret(process.env[name]);
    if (value) return value;
  }
  return "";
}

export type EpidemicTrack = {
  id: string;
  title: string;
  artist: string;
  lengthSeconds: number;
  coverUrl: string | null;
  isPreviewOnly: boolean;
  bpm?: number;
};

export function isEpidemicSoundConfigured(): boolean {
  return Boolean(resolveEpidemicSoundApiKey());
}

function apiKey(): string {
  const key = resolveEpidemicSoundApiKey();
  if (!key) throw new Error("EPIDEMIC_SOUND_API_KEY not configured");
  return key;
}

export async function epidemicFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const url = path.startsWith("http") ? path : `${BASE_URL}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey()}`,
      ...(init?.headers || {}),
    },
  });

  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = (await res.json()) as { message?: string };
      if (body?.message) message = body.message;
    } catch {
      // ignore parse errors
    }
    throw new Error(`Epidemic Sound ${res.status}: ${message}`);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function formatArtist(mainArtists?: string[], featuredArtists?: string[]): string {
  const main = (mainArtists || []).filter(Boolean).join(", ");
  const feat = (featuredArtists || []).filter(Boolean).join(", ");
  if (main && feat) return `${main} ft. ${feat}`;
  return main || feat || "Epidemic Sound";
}

function mapTrack(raw: Record<string, unknown>): EpidemicTrack {
  const images = raw.images as Record<string, string> | undefined;
  return {
    id: String(raw.id),
    title: String(raw.title ?? ""),
    artist: formatArtist(
      raw.mainArtists as string[] | undefined,
      raw.featuredArtists as string[] | undefined,
    ),
    lengthSeconds: Number(raw.length ?? 0),
    coverUrl: images?.default || images?.S || null,
    isPreviewOnly: Boolean(raw.isPreviewOnly),
    bpm: typeof raw.bpm === "number" ? raw.bpm : undefined,
  };
}

export async function fetchCollections(limit = 10, offset = 0) {
  const cacheKey = musicCacheKey("collections", `${limit}:${offset}`);
  const cached = await valkeyGet(cacheKey);
  if (cached) return JSON.parse(cached) as { collections: unknown[] };

  const qs = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  const data = await epidemicFetch<{ collections?: unknown[] }>(
    `/v0/collections?${qs}`,
  );
  await valkeySet(cacheKey, JSON.stringify(data), MUSIC_CACHE_TTL_MS.collections);
  return data;
}

export async function searchTracks(
  term: string,
  opts?: { limit?: number; offset?: number },
) {
  const limit = opts?.limit ?? 50;
  const offset = opts?.offset ?? 0;
  const cacheKey = musicCacheKey(
    "search",
    `${term.toLowerCase().trim()}:${limit}:${offset}`,
  );
  const cached = await valkeyGet(cacheKey);
  if (cached) return JSON.parse(cached) as { tracks: EpidemicTrack[]; pagination?: unknown };

  const qs = new URLSearchParams({
    term: term.trim(),
    limit: String(limit),
    offset: String(offset),
  });
  const data = await epidemicFetch<{ tracks?: Record<string, unknown>[]; pagination?: unknown }>(
    `/v0/tracks/search?${qs}`,
  );
  const mapped = {
    tracks: (data.tracks || []).map(mapTrack),
    pagination: data.pagination,
  };
  await valkeySet(cacheKey, JSON.stringify(mapped), MUSIC_CACHE_TTL_MS.search);
  return mapped;
}

export async function fetchTrackHighlights(
  trackId: string,
  durationSec = 30,
): Promise<{ fromMs: number; toMs: number }> {
  const cacheKey = musicCacheKey("highlights", `${trackId}:${durationSec}`);
  const cached = await valkeyGet(cacheKey);
  if (cached) return JSON.parse(cached) as { fromMs: number; toMs: number };

  const qs = new URLSearchParams({ duration: String(durationSec) });
  const data = await epidemicFetch<{ highlights?: { from: number; to: number }[] }>(
    `/v0/tracks/${encodeURIComponent(trackId)}/highlights?${qs}`,
  );
  const first = data.highlights?.[0];
  const result = {
    fromMs: first?.from ?? 0,
    toMs: first?.to ?? durationSec * 1000,
  };
  await valkeySet(cacheKey, JSON.stringify(result), MUSIC_CACHE_TTL_MS.highlights);
  return result;
}

export async function resolvePreviewDownloadUrl(
  trackId: string,
): Promise<{ url: string; expires: string }> {
  const cacheKey = previewCacheKey(trackId);
  const cached = await valkeyGet(cacheKey);
  if (cached) {
    const parsed = JSON.parse(cached) as { url: string; expires: string };
    const expiresMs = Date.parse(parsed.expires);
    if (Number.isFinite(expiresMs) && expiresMs > Date.now() + 60_000) {
      return parsed;
    }
  }

  const data = await epidemicFetch<{ url: string; expires: string }>(
    `/v0/tracks/${encodeURIComponent(trackId)}/download?quality=normal&format=mp3`,
  );
  const ttlMs = previewCacheTtlMs(data.expires);
  await valkeySet(cacheKey, JSON.stringify(data), ttlMs);
  return data;
}

/** Curated picker list for upload flow — first collection + free-tier tracks. */
export async function fetchPickerTracks(limit = 60): Promise<EpidemicTrack[]> {
  const cacheKey = musicCacheKey("picker", String(limit));
  const cached = await valkeyGet(cacheKey);
  if (cached) return JSON.parse(cached) as EpidemicTrack[];

  const tracks: EpidemicTrack[] = [];
  const seen = new Set<string>();

  try {
    const { collections } = await fetchCollections(5, 0);
    for (const col of collections || []) {
      const rawTracks = (col as { tracks?: Record<string, unknown>[] }).tracks || [];
      for (const t of rawTracks) {
        const mapped = mapTrack(t);
        if (seen.has(mapped.id)) continue;
        seen.add(mapped.id);
        tracks.push(mapped);
        if (tracks.length >= limit) break;
      }
      if (tracks.length >= limit) break;
    }
  } catch (err) {
    logger.warn({ err }, "fetchPickerTracks collections failed");
  }

  if (tracks.length < 10) {
    try {
      const { tracks: searched } = await searchTracks("happy", { limit: 30 });
      for (const t of searched) {
        if (seen.has(t.id)) continue;
        seen.add(t.id);
        tracks.push(t);
        if (tracks.length >= limit) break;
      }
    } catch (err) {
      logger.warn({ err }, "fetchPickerTracks search fallback failed");
    }
  }

  await valkeySet(cacheKey, JSON.stringify(tracks), MUSIC_CACHE_TTL_MS.picker);
  return tracks;
}

export async function reportTrackPreviewed(userId: string, trackId: string): Promise<void> {
  if (!isEpidemicSoundConfigured()) return;
  try {
    await epidemicFetch("/v0/analytics/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        events: [
          {
            userId,
            timestamp: new Date().toISOString(),
            userConnected: false,
            analyticsEvent: { trackId, type: "trackPreviewed" },
          },
        ],
      }),
    });
  } catch (err) {
    logger.warn({ err, trackId, userId }, "reportTrackPreviewed failed");
  }
}

export async function reportTracksExported(
  userId: string,
  trackIds: string[],
  platform: "TIKTOK" | "INSTAGRAM" | "YOUTUBE" | "OTHER" = "OTHER",
): Promise<void> {
  if (!isEpidemicSoundConfigured() || trackIds.length === 0) return;
  try {
    await epidemicFetch("/v0/analytics/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        events: [
          {
            userId,
            timestamp: new Date().toISOString(),
            analyticsEvent: {
              trackIds,
              platform,
              type: "tracksExported",
            },
          },
        ],
      }),
    });
  } catch (err) {
    logger.warn({ err, trackIds, userId }, "reportTracksExported failed");
  }
}

export function previewProxyPath(trackId: string): string {
  return `/api/music/tracks/${encodeURIComponent(trackId)}/preview`;
}

export function formatDurationLabel(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
