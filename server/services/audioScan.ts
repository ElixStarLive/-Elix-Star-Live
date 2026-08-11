/**
 * Upload audio fingerprint gate — Pex when configured.
 * When no Pex key is set / scan disabled, uploads pass through unchanged.
 */

import { logger } from "../lib/logger";
import { extractAudioSampleFromVideo } from "./ffmpegMedia";

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
  if (process.env.AUDIO_SCAN_ENABLED === "1") return isAudioScanConfigured();
  // Default: scan when a provider key is configured.
  return isAudioScanConfigured();
}

export function isAudioScanConfigured(): boolean {
  // Only Pex is implemented. Audible Magic key alone must not mark scanning "configured"
  // (that previously allowed uploads while pretending a fingerprint gate existed).
  return Boolean(process.env.PEX_API_KEY?.trim());
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

  // Scan enabled but no implemented provider — fail closed (do not fake allow).
  logger.error({ storagePath, userId }, "Audio scan enabled but no Pex provider key");
  return {
    scanned: false,
    action: "reject",
    reason: "AUDIO_SCAN_PROVIDER_UNAVAILABLE",
  };
}

async function scanWithPex(
  params: { buffer: Buffer; storagePath: string; userId: string },
  apiKey: string,
): Promise<AudioScanResult> {
  const baseUrl = (
    process.env.PEX_API_URL || "https://api.pex.com/v1"
  ).replace(/\/$/, "");

  try {
    const extracted = await extractAudioSampleFromVideo(params.buffer);
    const maxSample = Math.min(params.buffer.length, 512 * 1024);
    const sample = extracted ?? params.buffer.subarray(0, maxSample);

    const res = await fetch(`${baseUrl}/identify`, {
      method: "POST",
      // Bound the scan so a hung Pex request cannot pin the upload handler.
      // On timeout/error the catch fails closed (action: "reject").
      signal: AbortSignal.timeout(20_000),
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
        "Pex scan non-OK — rejecting upload (fail closed)",
      );
      return {
        scanned: true,
        action: "reject",
        provider: "pex",
        reason: "scan_provider_error",
      };
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
      const allowMatch = data.action === "allow";
      return {
        scanned: true,
        action: allowMatch ? "allow" : "reject",
        provider: "pex",
        detectedTrack: {
          id: String(data.match.id || `pex:${title}`),
          title,
          artist,
        },
        reason: allowMatch ? undefined : "copyright_detected",
      };
    }

    return { scanned: true, action: "allow", provider: "pex" };
  } catch (err) {
    logger.warn({ err, path: params.storagePath }, "Pex scan failed — rejecting upload (fail closed)");
    return {
      scanned: true,
      action: "reject",
      provider: "pex",
      reason: "scan_error",
    };
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
