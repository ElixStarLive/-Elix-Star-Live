/**
 * Bunny Storage CDN — Frontend upload service.
 *
 * All uploads are proxied through the Hetzner backend so the Bunny
 * API key never reaches the browser.
 *
 * Upload flow:
 *   POST /api/media/upload-file?path=...&ct=...   (raw binary body)
 *   → Hetzner backend PUTs to Bunny Storage with server-side API key
 *   → Returns { path, cdnUrl }
 *
 * CDN public URL is built from VITE_BUNNY_CDN_HOSTNAME env var
 * (e.g. "your-zone.b-cdn.net").  Falls back to the backend proxy URL
 * if the env var is not set.
 */

import { apiUrl } from "./api";
import { request } from "./apiClient";
import { useAuthStore } from "../store/useAuthStore";

const runtimeEnv =
  typeof window !== "undefined"
    ? ((window as any).__ENV as Record<string, string> | undefined)
    : undefined;

function getCdnHostname(): string {
  return (
    import.meta.env.VITE_BUNNY_CDN_HOSTNAME ??
    runtimeEnv?.VITE_BUNNY_CDN_HOSTNAME ??
    ""
  )
    .toString()
    .trim();
}

export interface BunnyUploadResult {
  /** Storage path that was written (mirrors the input path). */
  path: string;
  /** Full https CDN URL ready to use in <video> / <img> src. */
  cdnUrl: string;
}

/**
 * Upload a File or Blob to Bunny CDN via the Hetzner backend proxy.
 *
 * @param file        File or Blob to upload.
 * @param storagePath Storage path, e.g. "videos/userId/videoId/original.mp4".
 *                    Do NOT include a leading slash.
 * @param contentType MIME type.  Inferred from File.type when omitted.
 */
export async function bunnyUpload(
  file: File | Blob,
  storagePath: string,
  contentType?: string,
): Promise<BunnyUploadResult> {
  const ct =
    contentType ??
    ((file instanceof File ? file.type : "") || "application/octet-stream");

  const qs = new URLSearchParams({ path: storagePath, ct });

  const _storeState = useAuthStore.getState();
  const _token = _storeState.session?.access_token
    || (_storeState.session as any)?.accessToken
    || null;

  const res = await fetch(apiUrl(`/api/media/upload-file?${qs}`), {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      ...(_token ? { "Authorization": `Bearer ${_token}` } : {}),
    },
    credentials: "include",
    body: file,
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    throw new Error(
      (err.error as string) ?? `Bunny upload failed (${res.status} ${res.statusText})`,
    );
  }

  return (await res.json()) as BunnyUploadResult;
}

/**
 * Build a CDN public URL for a storage path without uploading anything.
 *
 * Uses VITE_BUNNY_CDN_HOSTNAME when set; otherwise falls back to the
 * backend proxy URL so links still resolve during local development.
 */
export function bunnyCdnUrl(storagePath: string): string {
  const hostname = getCdnHostname();
  if (hostname) {
    return `https://${hostname}/${storagePath}`;
  }
  // Development fallback — served via backend proxy
  return apiUrl(`/api/media/public/${storagePath}`);
}

/**
 * In storage, every video has a PNG image (same path, .png) to use as poster/thumbnail.
 * Given a video URL (e.g. https://cdn.../streams/xyz.mp4 or streams/xyz.mp4), returns the PNG URL.
 */
export function getVideoPosterUrl(videoUrl: string): string {
  if (!videoUrl || typeof videoUrl !== "string") return "";
  const trimmed = videoUrl.trim();
  if (!trimmed) return "";
  try {
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      const u = new URL(trimmed);
      let path = u.pathname;
      const qs = u.search ? u.search : "";
      if (/\.(mp4|webm|mov)$/i.test(path)) {
        path = path.replace(/\.(mp4|webm|mov)$/i, ".png");
        return u.origin + path + qs;
      }
      return "";
    }
    const pathOnly = trimmed.split("?")[0];
    if (/\.(mp4|webm|mov)$/i.test(pathOnly)) {
      const pngPath = pathOnly.replace(/\.(mp4|webm|mov)$/i, ".png").replace(/^\//, "");
      return bunnyCdnUrl(pngPath);
    }
  } catch {
    const m = trimmed.match(/^(.+?)\.(mp4|webm|mov)(\?.*)?$/i);
    if (m) return m[1] + ".png" + (m[3] || "");
  }
  return "";
}

/**
 * Delete a file from Bunny Storage via the Hetzner backend.
 */
export async function bunnyDelete(storagePath: string): Promise<void> {
  const { error } = await request("/api/media/delete", {
    method: "DELETE",
    body: JSON.stringify({ path: storagePath }),
  });

  if (error) {
    throw new Error(error.message ?? "Bunny delete failed");
  }
}
