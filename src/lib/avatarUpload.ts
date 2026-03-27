import { bunnyUpload } from "./bunnyStorage";
import { apiUrl } from "./api";
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
    const token = useAuthStore.getState().session?.access_token;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const patchRes = await fetch(apiUrl(`/api/profiles/${userId}`), {
      method: "PATCH",
      headers,
      credentials: "include",
      body: JSON.stringify({ avatarUrl: cdnUrl }),
    });

    if (!patchRes.ok) {
      const detail = await patchRes.text().catch(() => "");
      throw new Error(
        `Profile did not save (${patchRes.status}). Photo uploaded but avatar URL was not stored.`,
      );
    }

    return cdnUrl;
  } catch (err: any) {
    throw new Error(err?.message || "Failed to upload avatar");
  }
}
