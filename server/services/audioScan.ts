/**
 * Upload audio fingerprint gate — Pex / Audible Magic ready.
 * When no provider key is set, uploads pass through unchanged.
 */

import { logger } from "../lib/logger";

export type AudioScanAction = "allow" | "mute" | "reject";

export type DetectedTrack = {
  id: string;
  title: string;
  artist: string;
};

export type AudioScanResult = {
  scanned: boolean;
  action: AudioScanAction;
  provider?: "pex" | "audible_magic" | null;
  detectedTrack?: DetectedTrack;
  reason?: string;
};

const VIDEO_TYPES = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "application/octet-stream",
]);

export function isAudioScanEnabled(): boolean {
  if (process.env.AUDIO_SCAN_ENABLED === "0") return false;
  return isAudioScanConfigured();
}

export function isAudioScanConfigured(): boolean {
  return Boolean(
    process.env.PEX_API_KEY?.trim() ||
      process.env.AUDIBLE_MAGIC_API_KEY?.trim(),
  );
}

/** Extract video UUID from paths like videos/{userId}/{videoId}/original.mp4 */
export function extractVideoIdFromStoragePath(storagePath: string): string | null {
  const m = storagePath.match(
    /videos\/[^/]+\/([0-9a-f-]{36}|[a-zA-Z0-9_-]+)\//i,
  );
  return m?.[1] ?? null;
}

export function isVideoUpload(contentType: string, storagePath: string): boolean {
  const ct = contentType.split(";")[0].trim().toLowerCase();
  if (VIDEO_TYPES.has(ct) && ct !== "application/octet-stream") return true;
  return /\.(mp4|webm|mov)$/i.test(storagePath);
}

/**
 * Scan uploaded video audio before Bunny storage.
 * Requires PEX_API_KEY (or AUDIBLE_MAGIC_API_KEY) — otherwise no-op allow.
 */
export async function scanVideoUpload(params: {
  buffer: Buffer;
  contentType: string;
  storagePath: string;
  userId: string;
}): Promise<AudioScanResult> {
  const { buffer, contentType, storagePath, userId } = params;

  if (!isVideoUpload(contentType, storagePath)) {
    return { scanned: false, action: "allow" };
  }

  if (!isAudioScanEnabled()) {
    return { scanned: false, action: "allow" };
  }

  const pexKey = process.env.PEX_API_KEY?.trim();
  if (pexKey) {
    return scanWithPex({ buffer, storagePath, userId }, pexKey);
  }

  const amKey = process.env.AUDIBLE_MAGIC_API_KEY?.trim();
  if (amKey) {
    logger.info({ storagePath, userId }, "Audible Magic key set — integration pending");
    return { scanned: false, action: "allow", provider: "audible_magic" };
  }

  return { scanned: false, action: "allow" };
}

async function scanWithPex(
  params: { buffer: Buffer; storagePath: string; userId: string },
  apiKey: string,
): Promise<AudioScanResult> {
  const baseUrl = (
    process.env.PEX_API_URL || "https://api.pex.com/v1"
  ).replace(/\/$/, "");

  try {
    // Pex Attribution Engine: send fingerprint/audio sample for identification.
    // Full production path should extract audio via ffmpeg before this call.
    const maxSample = Math.min(params.buffer.length, 512 * 1024);
    const sample = params.buffer.subarray(0, maxSample);

    const res = await fetch(`${baseUrl}/identify`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/octet-stream",
        "X-Partner-User-Id": params.userId,
      },
      body: sample,
    });

    if (res.status === 404 || res.status === 204) {
      return { scanned: true, action: "allow", provider: "pex" };
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      logger.warn(
        { status: res.status, body: text.slice(0, 200), path: params.storagePath },
        "Pex scan non-OK — allowing upload",
      );
      return { scanned: true, action: "allow", provider: "pex", reason: "scan_inconclusive" };
    }

    const data = (await res.json()) as {
      match?: { id?: string; title?: string; artist?: string };
      action?: AudioScanAction;
      blocked?: boolean;
    };

    if (data.blocked) {
      return {
        scanned: true,
        action: "reject",
        provider: "pex",
        reason: "copyright_blocked",
      };
    }

    if (data.match?.title || data.match?.artist) {
      const title = String(data.match.title || "Unknown Track");
      const artist = String(data.match.artist || "Unknown Artist");
      return {
        scanned: true,
        action: data.action === "mute" ? "mute" : "allow",
        provider: "pex",
        detectedTrack: {
          id: String(data.match.id || `pex:${title}`),
          title,
          artist,
        },
      };
    }

    return { scanned: true, action: "allow", provider: "pex" };
  } catch (err) {
    logger.warn({ err, path: params.storagePath }, "Pex scan failed — allowing upload");
    return { scanned: true, action: "allow", provider: "pex", reason: "scan_error" };
  }
}

/** TikTok-style label for detected in-file audio. */
export function detectedTrackToMusicMeta(
  track: DetectedTrack,
  userDisplayName: string,
): Record<string, string> {
  return {
    id: track.id,
    title: track.title,
    artist: track.artist,
    duration: "0:30",
    provider: "detected",
    source: "original_sound",
    displayLabel: `Original Sound - ${track.artist || userDisplayName}`,
  };
}
