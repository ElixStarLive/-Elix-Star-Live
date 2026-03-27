/**
 * Bunny Storage + Stream service: upload files to Bunny.
 * Primary: Bunny Storage API (PUT to storage.bunnycdn.com)
 * Fallback: Bunny Stream Library API (for videos when Storage key fails)
 */

import { logger } from "../lib/logger";

const STORAGE_HOST = process.env.BUNNY_STORAGE_HOST || 'storage.bunnycdn.com';
const STORAGE_REGION = process.env.BUNNY_STORAGE_REGION || 'de';
const STORAGE_ZONE_RAW = process.env.BUNNY_STORAGE_ZONE || '';
const STORAGE_ZONE_NAME = STORAGE_ZONE_RAW.split('.')[0] || STORAGE_ZONE_RAW;
const ACCESS_KEY = process.env.BUNNY_STORAGE_API_KEY;

const STREAM_LIBRARY_ID = process.env.BUNNY_LIBRARY_ID || '';
const STREAM_API_KEY = process.env.BUNNY_LIBRARY_API_KEY || '';

export function isBunnyConfigured(): boolean {
  return Boolean((ACCESS_KEY && STORAGE_ZONE_NAME) || (STREAM_LIBRARY_ID && STREAM_API_KEY));
}

export function getBunnyConfigError(): string {
  if (!STORAGE_ZONE_NAME && !STREAM_LIBRARY_ID) {
    return 'Bunny not configured. Set BUNNY_STORAGE_ZONE or BUNNY_LIBRARY_ID.';
  }
  if (!ACCESS_KEY && !STREAM_API_KEY) {
    return 'Bunny API key missing. Set BUNNY_STORAGE_API_KEY or BUNNY_LIBRARY_API_KEY.';
  }
  return 'Bunny is not configured.';
}

/**
 * Upload via Bunny Storage API (PUT to storage.bunnycdn.com)
 */
async function uploadViaStorage(
  path: string,
  body: Buffer,
  contentType?: string
): Promise<{ success: boolean; path: string; cdnUrl?: string; error?: string }> {
  if (!ACCESS_KEY || !STORAGE_ZONE_NAME) {
    return { success: false, path, error: 'Storage API not configured' };
  }

  const baseUrl = STORAGE_REGION === 'de'
    ? `https://${STORAGE_HOST}`
    : `https://${STORAGE_REGION}.${STORAGE_HOST}`;
  const url = `${baseUrl}/${STORAGE_ZONE_NAME}/${path.replace(/^\/+/, '')}`;

  const headers: Record<string, string> = { AccessKey: ACCESS_KEY };
  if (contentType) headers['Content-Type'] = contentType;


  const res = await fetch(url, {
    method: 'PUT',
    headers,
    body,
    duplex: 'half',
  } as RequestInit);

  if (!res.ok) {
    const text = await res.text();
    logger.error({ path, status: res.status, body: text }, "Bunny Storage upload failed");
    return { success: false, path, error: `Bunny API ${res.status}: ${text}` };
  }

  // Prefer explicit pull zone; fall back to BUNNY_STORAGE_HOSTNAME (same as env.js / Vite).
  const rawHost =
    process.env.BUNNY_CDN_HOSTNAME ||
    process.env.BUNNY_STORAGE_HOSTNAME ||
    '';
  const host = rawHost
    .trim()
    .replace(/^https?:\/\//i, '')
    .split('/')[0] || '';
  const storageCdnHost = host ? `https://${host}` : `https://elixstorage.b-cdn.net`;
  const cdnUrl = `${storageCdnHost}/${path.replace(/^\/+/, '')}`;

  return { success: true, path, cdnUrl };
}

/**
 * Upload via Bunny Stream Library API (for video files).
 * 1. Create video entry: POST /library/{id}/videos
 * 2. Upload file: PUT /library/{id}/videos/{videoId}
 * 3. Returns the CDN iframe/direct URL
 */
async function uploadViaStream(
  path: string,
  body: Buffer,
  contentType?: string
): Promise<{ success: boolean; path: string; cdnUrl?: string; error?: string }> {
  if (!STREAM_LIBRARY_ID || !STREAM_API_KEY) {
    return { success: false, path, error: 'Stream Library not configured' };
  }

  const filename = path.split('/').pop() || 'video.mp4';

  try {
    // Step 1: Create video entry
    const createRes = await fetch(`https://video.bunnycdn.com/library/${STREAM_LIBRARY_ID}/videos`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'AccessKey': STREAM_API_KEY,
      },
      body: JSON.stringify({ title: filename }),
    });

    if (!createRes.ok) {
      const text = await createRes.text();
      logger.error({ status: createRes.status, body: text }, "Bunny Stream create video failed");
      return { success: false, path, error: `Stream create failed (${createRes.status}): ${text}` };
    }

    const videoData = await createRes.json() as { guid?: string };
    const videoGuid = videoData.guid;
    if (!videoGuid) {
      return { success: false, path, error: 'Stream API did not return video GUID' };
    }

    // Step 2: Upload the video file
    const uploadRes = await fetch(`https://video.bunnycdn.com/library/${STREAM_LIBRARY_ID}/videos/${videoGuid}`, {
      method: 'PUT',
      headers: {
        'AccessKey': STREAM_API_KEY,
      },
      body,
      duplex: 'half',
    } as RequestInit);

    if (!uploadRes.ok) {
      const text = await uploadRes.text();
      logger.error({ status: uploadRes.status, body: text }, "Bunny Stream upload failed");
      return { success: false, path, error: `Stream upload failed (${uploadRes.status}): ${text}` };
    }

    logger.info({ videoGuid, libraryId: STREAM_LIBRARY_ID }, "Bunny Stream upload success");

    const cdnUrl = `https://vz-5a4105cf-3f6.b-cdn.net/${videoGuid}/play_720p.mp4`;

    return { success: true, path, cdnUrl };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, path }, "Bunny Stream upload exception");
    return { success: false, path, error: message };
  }
}

/**
 * Upload a file to Bunny. Tries Storage API first, falls back to Stream Library for videos.
 */
export async function uploadToBunny(
  path: string,
  body: Buffer | Blob | ArrayBuffer,
  contentType?: string
): Promise<{ success: boolean; path: string; cdnUrl?: string; error?: string }> {
  if (!isBunnyConfigured()) {
    return { success: false, path, error: getBunnyConfigError() };
  }

  const bodyBuffer = body instanceof Buffer ? body : Buffer.from(body instanceof ArrayBuffer ? body : await (body as Blob).arrayBuffer());

  // All files go to Bunny Storage (served via elix-storage.b-cdn.net pull zone)
  if (ACCESS_KEY && STORAGE_ZONE_NAME) {
    const result = await uploadViaStorage(path, bodyBuffer, contentType);
    if (result.success) return result;
    logger.warn({ error: result.error }, "Storage API failed");
  }

  return { success: false, path, error: 'All upload methods failed' };
}
