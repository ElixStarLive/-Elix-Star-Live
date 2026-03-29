import { bunnyUpload } from "./bunnyStorage";
import { request } from "./apiClient";
import { useAuthStore } from "../store/useAuthStore";

export async function uploadAvatar(
  file: File,
  userId: string,
): Promise<string> {
  // Validate file type
  if (!file.type.startsWith("image/")) {
    throw new Error("Selected file is not an image.");
  }

  // Validate file size (max 5MB)
  const maxBytes = 5 * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new Error("Image is too large (max 5MB).");
  }

  // Ensure the caller is uploading their own avatar
  const currentUser = useAuthStore.getState().user;
  if (!currentUser || currentUser.id !== userId) {
    throw new Error("You must be logged in to upload an avatar.");
  }

  // Generate clean storage path: avatars/{userId}/{timestamp}.{ext}
  const fileExt = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const storagePath = `avatars/${userId}/${Date.now()}.${fileExt}`;

  try {
    // Upload to Bunny CDN via Hetzner backend proxy
    const { cdnUrl } = await bunnyUpload(file, storagePath, file.type);

    if (!cdnUrl) {
      throw new Error("Failed to retrieve public CDN URL after upload.");
    }

    // Persist the new avatar URL to the user's profile on the backend
    const { error: patchError } = await request(`/api/profiles/${userId}`, {
      method: "PATCH",
      body: JSON.stringify({ avatarUrl: cdnUrl }),
    });

    if (patchError) {
      throw new Error(
        patchError.message || "Profile did not save. Photo uploaded but avatar URL was not stored.",
      );
    }

    return cdnUrl;
  } catch (err: any) {
    throw new Error(err?.message || "Failed to upload avatar");
  }
}
