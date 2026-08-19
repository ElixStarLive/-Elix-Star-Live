/** Resolve creator display name + avatar from /api/profiles response (camelCase or snake_case). */
export function profileToLiveDisplay(body: unknown): { name: string; avatar: string } {
  const root = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const p =
    (root.profile && typeof root.profile === "object" ? root.profile : null) ||
    (root.data && typeof root.data === "object" ? root.data : null) ||
    root;
  const row = p as Record<string, unknown>;
  const name =
    (typeof row.displayName === "string" && row.displayName.trim()) ||
    (typeof row.display_name === "string" && row.display_name.trim()) ||
    (typeof row.username === "string" && row.username.trim()) ||
    (typeof row.name === "string" && row.name.trim()) ||
    "";
  const avatar =
    (typeof row.avatarUrl === "string" && row.avatarUrl.trim()) ||
    (typeof row.avatar_url === "string" && row.avatar_url.trim()) ||
    (typeof row.avatar === "string" && row.avatar.trim()) ||
    "";
  return { name, avatar };
}

/** Generated initials avatars — not real profile photos. */
export function isUiAvatarsUrl(url: string | undefined | null): boolean {
  return !!url && /ui-avatars\.com/i.test(url);
}

/** Drop placeholder avatar URLs so live cards wait for real profile photos. */
export function sanitizeLiveAvatar(avatar: string | undefined | null): string {
  const direct = typeof avatar === "string" ? avatar.trim() : "";
  if (!direct || isUiAvatarsUrl(direct)) return "";
  return direct;
}

/** True when the URL is empty / generated / brand mark — not a user photo. */
export function isPlaceholderLiveAvatar(avatar: string | undefined | null): boolean {
  const direct = typeof avatar === "string" ? avatar.trim() : "";
  if (!direct) return true;
  if (isUiAvatarsUrl(direct)) return true;
  const lower = direct.toLowerCase();
  if (lower.includes("elix-logo") || lower.includes("elix-mark") || lower.includes("default-avatar")) {
    return true;
  }
  return false;
}

/** Placeholder labels that should be replaced with a real profile name. */
export function isGenericLiveCreatorName(name: string | undefined | null): boolean {
  if (!name || !name.trim()) return true;
  const n = name.trim();
  if (n === "Creator" || n === "Live") return true;
  if (/^User [a-f0-9-]{4,}/i.test(n)) return true;
  if (/^Creator [A-F0-9-]{4,}/i.test(n)) return true;
  if (/^[a-f0-9-]{8,}$/i.test(n)) return true;
  return false;
}

export function liveNameFromStreamFields(
  title?: unknown,
  displayName?: unknown,
  _userId?: string,
): string {
  const t =
    (typeof title === "string" && title.trim()) ||
    (typeof displayName === "string" && displayName.trim()) ||
    "";
  return t || "Creator";
}

/** Backend may return snake_case or camelCase; accept both. */
export type RawLiveStreamFields = {
  stream_key?: string;
  streamKey?: string;
  room_id?: string;
  roomId?: string;
  id?: string;
  user_id?: string;
  userId?: string;
  hostUserId?: string;
  title?: string;
  display_name?: string;
  displayName?: string;
  viewer_count?: number;
  viewerCount?: number;
};

function rawLiveStreamKey(s: RawLiveStreamFields): string {
  return String(s.stream_key ?? s.streamKey ?? s.room_id ?? s.roomId ?? s.id ?? "");
}

/** Shared core fields for Live Discover + For You live cards. */
export function parseRawLiveStreamCore(s: RawLiveStreamFields): {
  streamKey: string;
  userId: string;
  name: string;
  viewers: number;
  title: string | undefined;
} {
  const streamKey = rawLiveStreamKey(s);
  const userId = String(s.user_id ?? s.userId ?? s.hostUserId ?? "");
  const titleRaw = s.title ?? s.display_name ?? s.displayName;
  const title = typeof titleRaw === "string" ? titleRaw : undefined;
  const viewers = Number(s.viewer_count ?? s.viewerCount ?? 0);
  const name = liveNameFromStreamFields(s.title, s.display_name ?? s.displayName, userId);
  return { streamKey, userId, name, viewers, title };
}

/** Key from stream_ended / presence payload (snake or short room id). */
export function liveStreamEndedKey(data: {
  stream_key?: unknown;
  room_id?: unknown;
}): string {
  return String(data.stream_key ?? data.room_id ?? "");
}
