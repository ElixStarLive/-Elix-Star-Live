/**
 * Voice-only video download — never attaches licensed in-app music layers.
 * Source URLs must be HTTPS on allowed Bunny CDN hosts only (SSRF guard).
 */

import { stripVideoToVoiceOnly } from "./ffmpegMedia";
import { logger } from "../lib/logger";

const MAX_DOWNLOAD_BYTES = 500 * 1024 * 1024;

function normalizeHost(raw: string): string {
  return raw
    .trim()
    .replace(/^https?:\/\//i, "")
    .split("/")[0]
    .toLowerCase();
}

function allowedMediaHosts(): Set<string> {
  const hosts = [
    process.env.BUNNY_CDN_HOSTNAME,
    process.env.VITE_BUNNY_CDN_HOSTNAME,
    process.env.BUNNY_STORAGE_HOSTNAME,
  ]
    .filter((h): h is string => typeof h === "string" && h.trim().length > 0)
    .map(normalizeHost);
  return new Set(hosts);
}

function isPrivateOrLocalHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host === "metadata.google.internal" ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return true;
  }
  if (host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80")) {
    return true;
  }
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if ([a, b, Number(m[3]), Number(m[4])].some((n) => n > 255)) return true;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

function isAllowedBunnyHost(hostname: string, allow: Set<string>): boolean {
  const host = hostname.toLowerCase();
  if (allow.has(host)) return true;
  // Bunny pull-zone CDN / storage public hostnames
  if (host.endsWith(".b-cdn.net")) return true;
  if (host === "storage.bunnycdn.com" || host.endsWith(".storage.bunnycdn.com")) return true;
  return false;
}

/** Reject non-CDN / private / non-HTTPS media URLs at the trust boundary. */
export function assertSafeMediaFetchUrl(sourceUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(sourceUrl);
  } catch {
    throw new Error("INVALID_URL");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("URL_SCHEME_NOT_ALLOWED");
  }
  if (parsed.username || parsed.password) {
    throw new Error("URL_CREDENTIALS_NOT_ALLOWED");
  }
  if (isPrivateOrLocalHostname(parsed.hostname)) {
    throw new Error("URL_HOST_PRIVATE");
  }
  if (!isAllowedBunnyHost(parsed.hostname, allowedMediaHosts())) {
    throw new Error("URL_HOST_NOT_ALLOWED");
  }
  return parsed;
}

export function isSafeMediaUrl(sourceUrl: string): boolean {
  try {
    assertSafeMediaFetchUrl(sourceUrl);
    return true;
  } catch {
    return false;
  }
}

export async function fetchVoiceOnlyVideoBuffer(sourceUrl: string): Promise<Buffer> {
  assertSafeMediaFetchUrl(sourceUrl);

  // Do not follow redirects — a CDN 302 to an internal host would reintroduce SSRF.
  const res = await fetch(sourceUrl, { redirect: "manual" });
  if (res.status >= 300 && res.status < 400) {
    throw new Error(`SOURCE_REDIRECT_${res.status}`);
  }
  if (!res.ok) {
    throw new Error(`SOURCE_FETCH_${res.status}`);
  }

  const len = Number(res.headers.get("content-length") || 0);
  if (len > MAX_DOWNLOAD_BYTES) {
    throw new Error("SOURCE_TOO_LARGE");
  }

  const arrayBuffer = await res.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_DOWNLOAD_BYTES) {
    throw new Error("SOURCE_TOO_LARGE");
  }

  const raw = Buffer.from(arrayBuffer);
  try {
    return await stripVideoToVoiceOnly(raw);
  } catch (err) {
    logger.warn({ err, sourceUrl: sourceUrl.slice(0, 80) }, "voice-only strip failed");
    return raw;
  }
}
