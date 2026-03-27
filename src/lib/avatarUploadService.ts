import { bunnyUpload, bunnyDelete } from "./bunnyStorage";
import { apiUrl } from "./api";
import { useAuthStore } from "../store/useAuthStore";

export interface AvatarUploadResult {
  success: boolean;
  publicUrl?: string;
  error?: string;
}

// ── Auth helpers ─────────────────────────────────────────────────────────────

function getAuthHeaders(): Record<string, string> {
  const token = useAuthStore.getState().session?.access_token;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

// ── Service ──────────────────────────────────────────────────────────────────

export class AvatarUploadService {
  /**
   * Upload and process avatar image.
   * Uploads to Bunny CDN via Hetzner backend, then updates the profile.
   */
  async uploadAvatar(file: File, userId: string): Promise<AvatarUploadResult> {
    try {
      // Validate file
      const validation = await this.validateImageFile(file);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }

      // Resize / compress before uploading
      const processedFile = await this.processImage(file);

      // Generate unique storage path: avatars/{userId}/{timestamp}.jpg
      const storagePath = `avatars/${userId}/${Date.now()}.jpg`;

      // Upload to Bunny CDN via Hetzner backend proxy
      const { cdnUrl: publicUrl } = await bunnyUpload(
        processedFile,
        storagePath,
        "image/jpeg",
      );

      // Update user profile with the new avatar URL (Hetzner backend)
      const patchRes = await fetch(apiUrl(`/api/profiles/${userId}`), {
        method: "PATCH",
        headers: getAuthHeaders(),
        credentials: "include",
        body: JSON.stringify({ avatarUrl: publicUrl }),
      });

      if (!patchRes.ok) {
        const errBody = (await patchRes.json().catch(() => ({}))) as {
          error?: string;
        };
        // Upload succeeded but profile update failed — clean up the orphaned file
        try {
          await bunnyDelete(storagePath);
        } catch {
          // Best-effort cleanup
        }
        throw new Error(
          errBody.error ?? `Profile update failed (${patchRes.status})`,
        );
      }

      return { success: true, publicUrl };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Upload failed",
      };
    }
  }

  /**
   * Remove the current avatar — deletes from Bunny CDN and clears the profile field.
   */
  async removeAvatar(userId: string): Promise<AvatarUploadResult> {
    try {
      // Fetch current avatar URL from backend
      const profileRes = await fetch(apiUrl(`/api/profiles/${userId}`), {
        headers: getAuthHeaders(),
        credentials: "include",
      });

      if (!profileRes.ok) {
        throw new Error(`Failed to fetch profile (${profileRes.status})`);
      }

      const { profile } = (await profileRes.json()) as {
        profile?: { avatarUrl?: string };
      };

      // Delete file from Bunny CDN if we can resolve the storage path
      if (profile?.avatarUrl) {
        const storagePath = this.extractStoragePathFromUrl(profile.avatarUrl);
        if (storagePath) {
          try {
            await bunnyDelete(storagePath);
          } catch {
            // Non-fatal — proceed to clear the profile field
          }
        }
      }

      // Clear avatar URL on the Hetzner backend
      const patchRes = await fetch(apiUrl(`/api/profiles/${userId}`), {
        method: "PATCH",
        headers: getAuthHeaders(),
        credentials: "include",
        body: JSON.stringify({ avatarUrl: null }),
      });

      if (!patchRes.ok) {
        const errBody = (await patchRes.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(
          errBody.error ?? `Failed to update profile (${patchRes.status})`,
        );
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Removal failed",
      };
    }
  }

  // ── Validation ─────────────────────────────────────────────────────────────

  private async validateImageFile(
    file: File,
  ): Promise<{ valid: boolean; error?: string }> {
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      return {
        valid: false,
        error: "Invalid file type. Please use JPG, PNG, or WebP.",
      };
    }

    const maxSize = 5 * 1024 * 1024; // 5 MB
    if (file.size > maxSize) {
      return {
        valid: false,
        error: "File too large. Please use an image under 5 MB.",
      };
    }

    return new Promise<{ valid: boolean; error?: string }>((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(url);
        if (img.width < 100 || img.height < 100) {
          resolve({
            valid: false,
            error: "Image too small. Please use at least 100×100 pixels.",
          });
        } else {
          resolve({ valid: true });
        }
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve({ valid: false, error: "Invalid image file." });
      };

      img.src = url;
    });
  }

  // ── Image processing ───────────────────────────────────────────────────────

  private processImage(file: File): Promise<File> {
    return new Promise((resolve) => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      const img = new Image();
      const url = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(url);

        // Crop / scale to max 400×400 while preserving aspect ratio
        const maxSize = 400;
        let { width, height } = img;

        if (width > height) {
          if (width > maxSize) {
            height = Math.round((height * maxSize) / width);
            width = maxSize;
          }
        } else {
          if (height > maxSize) {
            width = Math.round((width * maxSize) / height);
            height = maxSize;
          }
        }

        canvas.width = width;
        canvas.height = height;
        ctx?.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(
                new File([blob], "avatar.jpg", {
                  type: "image/jpeg",
                  lastModified: Date.now(),
                }),
              );
            } else {
              resolve(file); // Fallback to original
            }
          },
          "image/jpeg",
          0.82, // Good quality / size balance
        );
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(file);
      };

      img.src = url;
    });
  }

  // ── URL helpers ────────────────────────────────────────────────────────────

  /**
   * Extract the Bunny storage path from a full CDN URL.
   * e.g. "https://zone.b-cdn.net/avatars/userId/123.jpg" → "avatars/userId/123.jpg"
   */
  private extractStoragePathFromUrl(url: string): string | null {
    try {
      const parsed = new URL(url);
      // Strip leading slash
      const path = parsed.pathname.replace(/^\//, "");
      return path || null;
    } catch {
      return null;
    }
  }

  /**
   * Return a displayable avatar URL with a DiceBear fallback.
   */
  getAvatarUrl(avatarUrl: string | null | undefined, userId?: string): string {
    if (avatarUrl) return avatarUrl;
    if (userId) {
      return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(userId)}`;
    }
    return "/images/default-avatar.png";
  }

  /** Check that a URL is reachable (HEAD request). */
  async checkAvatarExists(avatarUrl: string): Promise<boolean> {
    try {
      const res = await fetch(avatarUrl, { method: "HEAD" });
      return res.ok;
    } catch {
      return false;
    }
  }

  /** Generate a base64 preview of a local File before uploading. */
  generatePreview(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          resolve(e.target.result as string);
        } else {
          reject(new Error("Failed to read file"));
        }
      };
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });
  }
}

// Singleton instance
export const avatarUploadService = new AvatarUploadService();
