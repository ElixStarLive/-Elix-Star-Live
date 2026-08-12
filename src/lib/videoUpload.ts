/**
 * Video Upload — Node backend + Bunny Storage CDN.
 * Flow: validate → upload binary/thumbnail via /api/media/upload-file → POST /api/videos → FYP boost.
 */

import { bunnyUpload } from "./bunnyStorage";
import { useAuthStore } from "../store/useAuthStore";
import { trackEvent } from "./analytics";
import { showToast } from "./toast";
import { apiBoostVideoFyp, apiCreateVideo } from "../features/upload/uploadApi";

interface UploadProgress {
  stage: "validating" | "compressing" | "uploading" | "processing" | "complete";
  progress: number; // 0-100
  message: string;
}

interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
  size: number;
  format: string;
}

interface VideoUploadMetadata {
  description: string;
  hashtags: string[];
  isPrivate: boolean;
  music?: unknown;
  duetWithVideoId?: string;
  duetLayout?: "split" | "overlay";
  /** Optional JPEG/PNG data URL selected in AI tools — uploaded as the real thumb. */
  thumbnailDataUrl?: string;
}

// ── Config ──────────────────────────────────────────────────────────────────
const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500 MB
const ALLOWED_FORMATS = ["video/mp4", "video/quicktime", "video/webm"];

// ── Service class ─────────────────────────────────────────────────────────────

class VideoUploadService {
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

  /** Surface thumbnail failure without blocking the video upload. */
  private warnThumbnailFailure(reason: string) {
    const message = reason || "Thumbnail upload failed";
    this.updateProgress(
      "processing",
      78,
      `${message} — continuing without thumbnail`,
    );
    showToast(message);
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
    metadata: VideoUploadMetadata,
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
          metadata.thumbnailDataUrl
            ? this.uploadThumbnailDataUrl(
                metadata.thumbnailDataUrl,
                userId,
                videoId,
              )
            : this.generateAndUploadThumbnail(file, userId, videoId),
          new Promise<string>((_, reject) =>
            setTimeout(
              () => reject(new Error("Thumbnail timed out")),
              10_000,
            ),
          ),
        ]);
        if (!thumbnailUrl) {
          this.warnThumbnailFailure("Thumbnail could not be created");
        }
      } catch (thumbErr: unknown) {
        const msg =
          thumbErr instanceof Error
            ? thumbErr.message
            : "Thumbnail upload failed";
        this.warnThumbnailFailure(msg);
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
        ...(metadata.music && { music: metadata.music }),
        ...(metadata.duetWithVideoId && {
          duetWithVideoId: metadata.duetWithVideoId,
        }),
        ...(metadata.duetLayout && { duetLayout: metadata.duetLayout }),
      };

      const { id: createdId, error: createError } = await apiCreateVideo(payload);
      if (createError) {
        throw new Error(
          createError || "Failed to create video record",
        );
      }

      const finalId = createdId ?? videoId;

      // ── FYP boost for new video ──────────────────────────────────────
      this.updateProgress("processing", 92, "Boosting visibility…");
      const { error: fypError } = await apiBoostVideoFyp(finalId);
      if (fypError) {
        // Non-blocking — video is already created
        this.updateProgress(
          "processing",
          95,
          "Video saved (visibility boost skipped)",
        );
      }

      this.updateProgress("complete", 100, "Video uploaded successfully!");

      trackEvent("video_upload", {
        video_id: finalId,
        duration: videoMeta.duration,
        size_mb: Number((file.size / 1024 / 1024).toFixed(2)),
      });

      return finalId;
    } catch (error) {
      trackEvent("video_upload_failed", { error: String(error) });
      const msg =
        (error as { message?: string; error_description?: string })?.message ??
        (error as { error_description?: string })?.error_description ??
        String(error);
      throw new Error(msg || "Upload failed");
    }
  }

  /** Upload a 24h story to Bunny + Neon `/api/stories` (not For You videos). */
  async uploadStory(
    file: File,
    userId: string,
    opts?: { mediaType?: "video" | "image"; thumbnailDataUrl?: string },
  ): Promise<string> {
    try {
      const storeUser = useAuthStore.getState().user;
      if (!storeUser || storeUser.id !== userId) {
        throw new Error("You must be logged in to upload. Try signing in again.");
      }
      if (!file || file.size === 0) {
        throw new Error("Story file is empty. Record or choose a valid clip.");
      }

      const isImage =
        opts?.mediaType === "image" ||
        (!!file.type && file.type.startsWith("image/"));

      if (isImage) {
        if (file.size > MAX_FILE_SIZE) {
          throw new Error(
            `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024} MB.`,
          );
        }
        this.updateProgress("validating", 30, "Validation complete");
      } else {
        this.validateVideo(file);
      }

      this.updateProgress("uploading", 40, "Uploading story to Bunny CDN…");

      const storyId = crypto.randomUUID();
      const fileExt =
        file.name.split(".").pop() ||
        (isImage
          ? file.type.includes("png")
            ? "png"
            : "jpg"
          : "mp4");
      const storagePath = `stories/${userId}/${storyId}/original.${fileExt}`;
      const { cdnUrl: mediaUrl } = await bunnyUpload(
        file,
        storagePath,
        file.type || (isImage ? "image/jpeg" : "video/mp4"),
      );

      this.updateProgress("processing", 75, "Generating thumbnail…");
      let thumbnailUrl = "";
      if (isImage) {
        thumbnailUrl = mediaUrl;
      } else {
        try {
          thumbnailUrl = await Promise.race([
            opts?.thumbnailDataUrl
              ? this.uploadThumbnailDataUrl(
                  opts.thumbnailDataUrl,
                  userId,
                  storyId,
                )
              : this.generateAndUploadThumbnail(file, userId, storyId),
            new Promise<string>((_, reject) =>
              setTimeout(
                () => reject(new Error("Thumbnail timed out")),
                10_000,
              ),
            ),
          ]);
          if (!thumbnailUrl) {
            this.warnThumbnailFailure("Thumbnail could not be created");
          }
        } catch (thumbErr: unknown) {
          const msg =
            thumbErr instanceof Error
              ? thumbErr.message
              : "Thumbnail upload failed";
          this.warnThumbnailFailure(msg);
        }
      }

      this.updateProgress("processing", 88, "Saving story to Neon…");
      const { createStoryRecord } = await import("./storiesApi");
      await createStoryRecord({
        id: storyId,
        url: mediaUrl,
        thumbnailUrl,
        mediaType: isImage ? "image" : "video",
      });

      this.updateProgress("complete", 100, "Story posted!");
      trackEvent("story_upload", { story_id: storyId, media_type: isImage ? "image" : "video" });
      return storyId;
    } catch (error) {
      trackEvent("story_upload_failed", { error: String(error) });
      const msg =
        error instanceof Error
          ? error.message
          : (error as { message?: string })?.message || "Story upload failed";
      throw new Error(msg);
    }
  }

  // ── Private: thumbnail ──────────────────────────────────────────────────────

  private async uploadThumbnailDataUrl(
    dataUrl: string,
    userId: string,
    videoId: string,
  ): Promise<string> {
    const blob = await dataUrlToJpegBlob(dataUrl);
    if (!blob || blob.size === 0) {
      throw new Error("Selected thumbnail is empty");
    }
    const thumbPath = `thumbnails/${userId}/${videoId}/thumb.jpg`;
    const { cdnUrl } = await bunnyUpload(blob, thumbPath, "image/jpeg");
    if (!cdnUrl) throw new Error("Thumbnail upload returned no URL");
    return cdnUrl;
  }

  private generateAndUploadThumbnail(
    file: File,
    userId: string,
    videoId: string,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const video = document.createElement("video");
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      let settled = false;

      const fail = (reason: string) => {
        if (settled) return;
        settled = true;
        if (video.src) URL.revokeObjectURL(video.src);
        reject(new Error(reason));
      };

      const succeed = (url: string) => {
        if (settled) return;
        settled = true;
        resolve(url);
      };

      video.onloadedmetadata = () => {
        video.currentTime = Math.min(1, video.duration / 2);
      };

      video.onseeked = async () => {
        try {
          canvas.width = video.videoWidth || 640;
          canvas.height = video.videoHeight || 360;
          if (!ctx) {
            fail("Canvas unavailable for thumbnail");
            return;
          }
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

          canvas.toBlob(
            async (blob) => {
              URL.revokeObjectURL(video.src);
              if (!blob) {
                fail("Could not capture thumbnail frame");
                return;
              }

              try {
                const thumbPath = `thumbnails/${userId}/${videoId}/thumb.jpg`;
                const { cdnUrl } = await bunnyUpload(
                  blob,
                  thumbPath,
                  "image/jpeg",
                );
                if (!cdnUrl) {
                  fail("Thumbnail upload returned no URL");
                  return;
                }
                succeed(cdnUrl);
              } catch (e: unknown) {
                fail(
                  e instanceof Error
                    ? e.message
                    : "Thumbnail upload to CDN failed",
                );
              }
            },
            "image/jpeg",
            0.85,
          );
        } catch (e: unknown) {
          fail(
            e instanceof Error ? e.message : "Thumbnail frame capture failed",
          );
        }
      };

      video.onerror = () => {
        fail("Could not load video for thumbnail");
      };

      video.src = URL.createObjectURL(file);
    });
  }
}

async function dataUrlToJpegBlob(dataUrl: string): Promise<Blob | null> {
  if (!dataUrl || typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) {
    return null;
  }
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  if (blob.type === "image/jpeg" || blob.type === "image/jpg") return blob;

  // Re-encode non-JPEG data URLs so storage path stays .jpg
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth || img.width || 320;
      canvas.height = img.naturalHeight || img.height || 180;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(blob);
        return;
      }
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((jpeg) => resolve(jpeg || blob), "image/jpeg", 0.85);
    };
    img.onerror = () => resolve(blob);
    img.src = dataUrl;
  });
}

export const videoUploadService = new VideoUploadService();
