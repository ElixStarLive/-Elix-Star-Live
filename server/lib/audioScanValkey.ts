import { valkeyGet, valkeySet } from "./valkey";
import type { AudioScanResult } from "../services/audioScan";

const TTL_MS = 2 * 60 * 60 * 1000;

function key(videoId: string): string {
  return `elix:audiocan:${videoId}`;
}

export async function cacheAudioScanResult(
  videoId: string,
  result: AudioScanResult,
): Promise<void> {
  if (!result.detectedTrack) return;
  await valkeySet(key(videoId), JSON.stringify(result), TTL_MS);
}

export async function getCachedAudioScanResult(
  videoId: string,
): Promise<AudioScanResult | null> {
  const raw = await valkeyGet(key(videoId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AudioScanResult;
  } catch {
    return null;
  }
}

export async function clearCachedAudioScanResult(videoId: string): Promise<void> {
  const { valkeyDel } = await import("./valkey");
  await valkeyDel(key(videoId));
}
