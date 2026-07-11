/**
 * Voice-only video download — never attaches licensed in-app music layers.
 */

import { stripVideoToVoiceOnly } from "./ffmpegMedia";
import { logger } from "../lib/logger";

const MAX_DOWNLOAD_BYTES = 500 * 1024 * 1024;

export async function fetchVoiceOnlyVideoBuffer(sourceUrl: string): Promise<Buffer> {
  const res = await fetch(sourceUrl, { redirect: "follow" });
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
