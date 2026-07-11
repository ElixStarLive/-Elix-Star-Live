/**
 * Download posted video without in-app licensed music (server strips extra audio streams).
 */

import { Capacitor } from "@capacitor/core";
import { apiUrl } from "./api";
import { useAuthStore } from "../store/useAuthStore";
import { trackEvent } from "./analytics";

function authHeaders(): Record<string, string> {
  const token = useAuthStore.getState().session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function requestCredentials(): RequestCredentials {
  return Capacitor.isNativePlatform() ? "omit" : "include";
}

export async function downloadVideoWithoutMusic(
  videoId: string,
  filename?: string,
): Promise<void> {
  const safeId = encodeURIComponent(videoId);
  const res = await fetch(apiUrl(`/api/videos/${safeId}/download`), {
    method: "GET",
    credentials: requestCredentials(),
    headers: authHeaders(),
  });

  if (!res.ok) {
    let message = "Download failed";
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      message = `Download failed (${res.status})`;
    }
    throw new Error(message);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || `elix_${videoId}.mp4`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  trackEvent("video_download", { videoId, voiceOnly: true });
}
