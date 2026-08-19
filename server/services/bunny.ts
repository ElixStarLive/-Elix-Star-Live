/**
 * Bunny Storage service: upload files to Bunny.
 * Bunny Storage API (PUT to storage.bunnycdn.com) is the only upload path.
 */

import { logger } from "../lib/logger";

const STORAGE_HOST = process.env.BUNNY_STORAGE_HOST || 'storage.bunnycdn.com';
const STORAGE_REGION = process.env.BUNNY_STORAGE_REGION || 'de';
const STORAGE_ZONE_RAW = process.env.BUNNY_STORAGE_ZONE || '';
const STORAGE_ZONE_NAME = STORAGE_ZONE_RAW.split('.')[0] || STORAGE_ZONE_RAW;
const ACCESS_KEY = process.env.BUNNY_STORAGE_API_KEY;

export function isBunnyConfigured(): boolean {
  return Boolean(ACCESS_KEY && STORAGE_ZONE_NAME);
}

/**
 * Bounded, single-line form of a Bunny error body. The whole upstream response
 * used to go into the log and into the error returned to the caller, so an
 * unexpected HTML or verbose JSON error page was reproduced in full.
 */
function bunnyErrorDetail(text: string): string {
  return String(text || "").replace(/\s+/g, " ").trim().slice(0, 200);
}

function getBunnyConfigError(): string {
  if (!STORAGE_ZONE_NAME) {
    return 'Bunny not configured. Set BUNNY_STORAGE_ZONE.';
  }
  if (!ACCESS_KEY) {
    return 'Bunny API key missing. Set BUNNY_STORAGE_API_KEY.';
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

  try {
    const res = await fetch(url, {
      method: 'PUT',
      headers,
      body,
      duplex: 'half',
    } as RequestInit);

    if (!res.ok) {
      const text = await res.text();
      logger.error(
        { path, status: res.status, body: bunnyErrorDetail(text) },
        "Bunny Storage upload failed",
      );
      return { success: false, path, error: `Bunny API ${res.status}: ${bunnyErrorDetail(text)}` };
    }

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
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message, path }, "Bunny Storage upload exception");
    return { success: false, path, error: message };
  }
}

/**
 * Upload a file to Bunny Storage.
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

  // All files go to Bunny Storage (served via elix-storage.b-cdn.net pull zone).
  // isBunnyConfigured() above already proved the Storage credentials are present.
  const result = await uploadViaStorage(path, bodyBuffer, contentType);
  if (!result.success) {
    // Callers surface result.error; replacing it with a generic message here hid
    // the actual Bunny status from the operator and the client.
    logger.warn({ error: result.error }, "Storage API failed");
  }
  return result;
}
