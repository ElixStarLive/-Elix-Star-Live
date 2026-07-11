/**
 * FFmpeg helpers — audio fingerprint extraction + download strip (video + primary audio only).
 * Requires `ffmpeg` on PATH (installed in production Dockerfile).
 */

import { spawn } from "child_process";
import { randomUUID } from "crypto";
import { readFile, unlink, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { logger } from "../lib/logger";

let ffmpegChecked = false;
let ffmpegAvailable = false;

export function isFfmpegAvailable(): boolean {
  return ffmpegAvailable;
}

export async function probeFfmpeg(): Promise<boolean> {
  if (ffmpegChecked) return ffmpegAvailable;
  ffmpegChecked = true;
  ffmpegAvailable = await new Promise<boolean>((resolve) => {
    const proc = spawn("ffmpeg", ["-version"], { stdio: "ignore" });
    proc.on("error", () => resolve(false));
    proc.on("close", (code) => resolve(code === 0));
  });
  if (!ffmpegAvailable) {
    logger.warn("ffmpeg not found — audio scan uses raw sample; download strip skipped");
  }
  return ffmpegAvailable;
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", ["-y", ...args], { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    proc.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    proc.on("error", (err) => reject(err));
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.slice(-400) || `ffmpeg exit ${code}`));
    });
  });
}

/** First ~30s of mono PCM for Pex / fingerprint providers. */
export async function extractAudioSampleFromVideo(
  videoBuffer: Buffer,
): Promise<Buffer | null> {
  if (!(await probeFfmpeg())) return null;

  const id = randomUUID();
  const inputPath = join(tmpdir(), `elix-scan-in-${id}.mp4`);
  const outputPath = join(tmpdir(), `elix-scan-out-${id}.wav`);

  try {
    await writeFile(inputPath, videoBuffer);
    await runFfmpeg([
      "-i",
      inputPath,
      "-vn",
      "-acodec",
      "pcm_s16le",
      "-ar",
      "44100",
      "-ac",
      "1",
      "-t",
      "30",
      outputPath,
    ]);
    const wav = await readFile(outputPath);
    return wav.subarray(0, Math.min(wav.length, 512 * 1024));
  } catch (err) {
    logger.warn({ err }, "extractAudioSampleFromVideo failed");
    return null;
  } finally {
    await unlink(inputPath).catch(() => {});
    await unlink(outputPath).catch(() => {});
  }
}

/**
 * Keep video + first audio stream (mic). Drop extra audio streams (merged app music).
 * Falls back to original bytes when ffmpeg unavailable or strip fails.
 */
export async function stripVideoToVoiceOnly(videoBuffer: Buffer): Promise<Buffer> {
  if (!(await probeFfmpeg())) return videoBuffer;

  const id = randomUUID();
  const inputPath = join(tmpdir(), `elix-dl-in-${id}.mp4`);
  const outputPath = join(tmpdir(), `elix-dl-out-${id}.mp4`);

  try {
    await writeFile(inputPath, videoBuffer);
    await runFfmpeg([
      "-i",
      inputPath,
      "-map",
      "0:v:0?",
      "-map",
      "0:a:0?",
      "-c",
      "copy",
      outputPath,
    ]);
    return await readFile(outputPath);
  } catch (err) {
    logger.warn({ err }, "stripVideoToVoiceOnly failed — serving source file");
    return videoBuffer;
  } finally {
    await unlink(inputPath).catch(() => {});
    await unlink(outputPath).catch(() => {});
  }
}
