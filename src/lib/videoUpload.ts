/**
 * Video Upload — Node backend + Bunny Storage CDN.
 * Flow: validate → upload binary/thumbnail via /api/media/upload-file → POST /api/videos → FYP boost.
 */

import { bunnyUpload } from "./bunnyStorage";
import { apiUrl } from "./api";
import { useAuthStore } from "../store/useAuthStore";
import { trackEvent } from "./analytics";

export interface UploadProgress {
  stage: "validating" | "compressing" | "uploading" | "processing" | "complete";
  progress: number; // 0-100
  message: string;
}

export interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
  size: number;
  format: string;
}

// ── Config ──────────────────────────────────────────────────────────────────
const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500 MB
const ALLOWED_FORMATS = ["video/mp4", "video/quicktime", "video/webm"];

// ── Helpers ──────────────────────────────────────────────────────────────────

function authHeaders(): Record<string, string> {
  const token = useAuthStore.getState().session?.access_token;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

// ── Service class ─────────────────────────────────────────────────────────────

export class VideoUploadService {
  private onProgressCallback: ((progress: UploadProgress) => void) | null =
    null;

  /** Register callback for upload progress updates. */
  onProgress(callback: (progress: UploadProgress) => void) {
    this.onProgressCallback = callback;
  }

  private updateProgress(
    stage: UploadProgress["stage"],
    progress: number,
    message: string,
  ) {
    this.onProgressCallback?.({ stage, progress, message });
  }

  // ── Public: validate ────────────────────────────────────────────────────────

  /**
   * Synchronous validation — no async IO so the upload never blocks on this step.
   */
  validateVideo(file: File): VideoMetadata {
    this.updateProgress("validating", 10, "Validating video…");

    const okType =
      ALLOWED_FORMATS.includes(file.type) ||
      (!!file.type && file.type.startsWith("video/"));

    if (!okType) {
      throw new Error("Invalid format. Please use MP4 or WebM.");
    }
    if (file.size > MAX_FILE_SIZE) {
      throw new Error(
        `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024} MB.`,
      );
    }

    this.updateProgress("validating", 30, "Validation complete");
    return {
      duration: 0,
      width: 0,
      height: 0,
      size: file.size,
      format: file.type,
    };
  }

  // ── Public: upload ──────────────────────────────────────────────────────────

  async uploadVideo(
    file: File,
    userId: string,
    metadata: {
      description: string;
      hashtags: string[];
      isPrivate: boolean;
      music?: any;
      duetWithVideoId?: string;
    },
  ): Promise<string> {
    try {
      // ── Auth check ──────────────────────────────────────────────────
      const storeUser = useAuthStore.getState().user;
      if (!storeUser || storeUser.id !== userId) {
        throw new Error(
          "You must be logged in to upload. Try signing in again.",
        );
      }
      if (!file || file.size === 0) {
        throw new Error("Video file is empty. Record or choose a valid video.");
      }

      const videoMeta = this.validateVideo(file);

      this.updateProgress("uploading", 40, "Uploading video to Bunny CDN…");

      // ── Generate IDs ─────────────────────────────────────────────────
      const videoId = crypto.randomUUID();
      const fileExt = file.name.split(".").pop() || "mp4";
      const storagePath = `videos/${userId}/${videoId}/original.${fileExt}`;

      // ── Upload video to Bunny via Hetzner backend ────────────────────
      const { cdnUrl: videoUrl } = await bunnyUpload(
        file,
        storagePath,
        file.type || "video/mp4",
      );

      this.updateProgress("uploading", 70, "Video uploaded to CDN");

      // ── Generate & upload thumbnail ──────────────────────────────────
      this.updateProgress("processing", 75, "Generating thumbnail…");
      let thumbnailUrl = "";
      try {
        thumbnailUrl = await Promise.race([
          this.generateAndUploadThumbnail(file, userId, videoId),
          new Promise<string>((_, reject) =>
            setTimeout(() => reject(new Error("timeout")), 10_000),
          ),
        ]);
      } catch {
        // Non-critical — video still uploads without a thumbnail
      }

      this.updateProgress("processing", 82, "Creating video record on server…");

      // ── Create video record on Hetzner backend ────────────────────────
      const payload: Record<string, unknown> = {
        id: videoId,
        url: videoUrl,
        thumbnailUrl,
        description: metadata.description || "",
        hashtags: metadata.hashtags || [],
        isPublic: !metadata.isPrivate,
        ...(metadata.duetWithVideoId && {
          duetWithVideoId: metadata.duetWithVideoId,
        }),
      };

      const createRes = await fetch(apiUrl("/api/videos"), {
        method: "POST",
        headers: authHeaders(),
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!createRes.ok) {
        const err = (await createRes.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(
          err.error ?? `Failed to create video record (${createRes.status})`,
        );
      }

      const createData = (await createRes.json()) as { id?: string };
      const finalId = createData.id ?? videoId;

      // ── FYP boost for new video ──────────────────────────────────────
      this.updateProgress("processing", 92, "Boosting visibility…");
      try {
        await fetch(apiUrl(`/api/videos/${finalId}/fyp`), {
          method: "POST",
          headers: authHeaders(),
          credentials: "include",
          body: JSON.stringify({ boost: true }),
        });
      } catch {
        // Non-critical
      }

      this.updateProgress("complete", 100, "Video uploaded successfully!");

      trackEvent("video_upload", {
        video_id: finalId,
        duration: videoMeta.duration,
        size_mb: Number((file.size / 1024 / 1024).toFixed(2)),
      });

      return finalId;
    } catch (error: any) {
      trackEvent("video_upload_failed", { error: String(error) });
      const msg = error?.message ?? error?.error_description ?? String(error);
      throw new Error(msg || "Upload failed");
    }
  }

  // ── Private: thumbnail ──────────────────────────────────────────────────────

  private generateAndUploadThumbnail(
    file: File,
    userId: string,
    videoId: string,
  ): Promise<string> {
    return new Promise((resolve) => {
      const video = document.createElement("video");
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      video.onloadedmetadata = () => {
        video.currentTime = Math.min(1, video.duration / 2);
      };

      video.onseeked = async () => {
        try {
          canvas.width = video.videoWidth || 640;
          canvas.height = video.videoHeight || 360;
          ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);

          canvas.toBlob(
            async (blob) => {
              URL.revokeObjectURL(video.src);
              if (!blob) {
                resolve("");
                return;
              }

              try {
                const thumbPath = `thumbnails/${userId}/${videoId}/thumb.jpg`;
                const { cdnUrl } = await bunnyUpload(
                  blob,
                  thumbPath,
                  "image/jpeg",
                );
                resolve(cdnUrl);
              } catch {
                resolve("");
              }
            },
            "image/jpeg",
            0.85,
          );
        } catch {
          URL.revokeObjectURL(video.src);
          resolve("");
        }
      };

      video.onerror = () => {
        if (video.src) URL.revokeObjectURL(video.src);
        resolve(""); // Non-fatal — upload continues without thumbnail
      };

      video.src = URL.createObjectURL(file);
    });
  }
}

export const videoUploadService = new VideoUploadService();
