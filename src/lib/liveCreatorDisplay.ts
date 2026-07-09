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
