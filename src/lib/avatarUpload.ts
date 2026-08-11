/**
 * Single owner for profile avatar upload / remove.
 * Contract: Bunny upload via existing proxy + PATCH `/api/profiles/:id` with `avatarUrl`.
 * Auth store is the identity source; Neon profile URL is the display source of truth.
 */
import { bunnyUpload, bunnyDelete } from "./bunnyStorage";
import { request } from "./apiClient";
import { useAuthStore } from "../store/useAuthStore";

export interface AvatarUploadResult {
  success: boolean;
  publicUrl?: string;
  error?: string;
}

export class AvatarUploadService {
  async uploadAvatar(file: File, userId: string): Promise<AvatarUploadResult> {
    try {
      const currentUser = useAuthStore.getState().user;
      if (!currentUser || currentUser.id !== userId) {
        return { success: false, error: "You must be logged in to upload an avatar." };
      }

      const validation = await this.validateImageFile(file);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }

      const processedFile = await this.processImage(file);
      const storagePath = `avatars/${userId}/${Date.now()}.jpg`;

      const { cdnUrl: publicUrl } = await bunnyUpload(
        processedFile,
        storagePath,
        "image/jpeg",
      );

      if (!publicUrl) {
        return { success: false, error: "Failed to retrieve public CDN URL after upload." };
      }

      const { error: patchError } = await request(`/api/profiles/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({ avatarUrl: publicUrl }),
      });

      if (patchError) {
        try {
          await bunnyDelete(storagePath);
        } catch {
          /* CDN cleanup after failed profile write — original error is returned below */
        }
        return {
          success: false,
          error: patchError.message ?? "Profile did not save. Photo uploaded but avatar URL was not stored.",
        };
      }

      return { success: true, publicUrl };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Upload failed",
      };
    }
  }

  async removeAvatar(userId: string): Promise<AvatarUploadResult> {
    try {
      const { data: profileBody, error: profileError } = await request<{
        profile?: { avatarUrl?: string };
      }>(`/api/profiles/${userId}`);

      if (profileError) {
        return {
          success: false,
          error: profileError.message ?? "Failed to fetch profile",
        };
      }

      const profile = profileBody?.profile;

      if (profile?.avatarUrl) {
        const storagePath = this.extractStoragePathFromUrl(profile.avatarUrl);
        if (storagePath) {
          try {
            await bunnyDelete(storagePath);
          } catch {
            /* proceed to clear profile field even if CDN delete fails */
          }
        }
      }

      const { error: clearError } = await request(`/api/profiles/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({ avatarUrl: null }),
      });

      if (clearError) {
        return {
          success: false,
          error: clearError.message ?? "Failed to update profile",
        };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Removal failed",
      };
    }
  }

  private async validateImageFile(
    file: File,
  ): Promise<{ valid: boolean; error?: string }> {
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    const allowedExt = ["jpg", "jpeg", "png", "webp"];
    const typeOk =
      (file.type && allowedTypes.includes(file.type)) ||
      (!file.type && allowedExt.includes(ext));
    if (!typeOk) {
      return {
        valid: false,
        error: "Invalid file type. Please use JPG, PNG, or WebP.",
      };
    }

    const maxSize = 5 * 1024 * 1024;
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

  private processImage(file: File): Promise<File> {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      const img = new Image();
      const url = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(url);

        const maxSize = 400;
        let { width, height } = img;

        if (width > height) {
          if (width > maxSize) {
            height = Math.round((height * maxSize) / width);
            width = maxSize;
          }
        } else if (height > maxSize) {
          width = Math.round((width * maxSize) / height);
          height = maxSize;
        }

        canvas.width = width;
        canvas.height = height;
        if (!ctx) {
          reject(new Error("Could not process image."));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("Could not process image."));
              return;
            }
            resolve(
              new File([blob], "avatar.jpg", {
                type: "image/jpeg",
                lastModified: Date.now(),
              }),
            );
          },
          "image/jpeg",
          0.82,
        );
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Could not process image."));
      };

      img.src = url;
    });
  }

  private extractStoragePathFromUrl(url: string): string | null {
    try {
      const parsed = new URL(url);
      const path = parsed.pathname.replace(/^\//, "");
      return path || null;
    } catch {
      return null;
    }
  }

  getAvatarUrl(avatarUrl: string | null | undefined, userId?: string): string {
    if (avatarUrl) return avatarUrl;
    if (userId) {
      return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(userId)}`;
    }
    return "/royce/default-avatar.svg";
  }

  async checkAvatarExists(avatarUrl: string): Promise<boolean> {
    try {
      const res = await fetch(avatarUrl, { method: "HEAD" });
      return res.ok;
    } catch {
      return false;
    }
  }

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

export const avatarUploadService = new AvatarUploadService();

/** Throws on failure — for callers that prefer exceptions over result objects. */
export async function uploadAvatar(file: File, userId: string): Promise<string> {
  const result = await avatarUploadService.uploadAvatar(file, userId);
  if (!result.success || !result.publicUrl) {
    throw new Error(result.error || "Failed to upload avatar");
  }
  return result.publicUrl;
}
