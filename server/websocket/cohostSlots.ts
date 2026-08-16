type CohostSlotStatus = "invited" | "accepted" | "live" | "pending_accept";

export type CohostSlot = {
  id: string;
  userId: string;
  name: string;
  avatar: string;
  status: CohostSlotStatus;
};

const ALLOWED_STATUS = new Set<CohostSlotStatus>([
  "invited",
  "accepted",
  "live",
  "pending_accept",
]);

export const MAX_COHOST_SLOTS = 8;

function normalizeStatus(raw: unknown): CohostSlotStatus {
  return typeof raw === "string" && ALLOWED_STATUS.has(raw as CohostSlotStatus)
    ? (raw as CohostSlotStatus)
    : "invited";
}

export function normalizeCohostSlots(
  rawSlots: unknown,
  hostUserId: string,
  limit = MAX_COHOST_SLOTS,
): CohostSlot[] {
  if (!Array.isArray(rawSlots) || !hostUserId) return [];
  const seen = new Set<string>();
  const out: CohostSlot[] = [];
  for (const item of rawSlots) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const userId = typeof row.userId === "string" ? row.userId.trim() : "";
    if (!userId || userId === hostUserId || seen.has(userId)) continue;
    seen.add(userId);
    out.push({
      id:
        typeof row.id === "string" && row.id.trim()
          ? row.id.trim()
          : `cohost-${userId}`,
      userId,
      name: typeof row.name === "string" ? row.name : "Co-host",
      avatar: typeof row.avatar === "string" ? row.avatar : "",
      status: normalizeStatus(row.status),
    });
    if (out.length >= limit) break;
  }
  return out;
}

export function upsertCohostSlot(
  slots: CohostSlot[],
  slot: Omit<CohostSlot, "id"> & { id?: string },
  limit = MAX_COHOST_SLOTS,
): { slots: CohostSlot[]; changed: boolean; full: boolean } {
  const userId = String(slot.userId || "").trim();
  if (!userId) return { slots, changed: false, full: false };
  const idx = slots.findIndex((s) => s.userId === userId);
  if (idx >= 0) {
    const next = [...slots];
    const prev = next[idx];
    const merged: CohostSlot = {
      ...prev,
      id: slot.id && slot.id.trim() ? slot.id.trim() : prev.id,
      name: slot.name || prev.name,
      avatar: slot.avatar || prev.avatar,
      status: normalizeStatus(slot.status),
      userId,
    };
    const changed =
      merged.id !== prev.id ||
      merged.name !== prev.name ||
      merged.avatar !== prev.avatar ||
      merged.status !== prev.status;
    if (!changed) return { slots, changed: false, full: false };
    next[idx] = merged;
    return { slots: next, changed: true, full: false };
  }
  if (slots.length >= limit) {
    return { slots, changed: false, full: true };
  }
  return {
    slots: [
      ...slots,
      {
        id: slot.id && slot.id.trim() ? slot.id.trim() : `cohost-${userId}`,
        userId,
        name: slot.name || "Co-host",
        avatar: slot.avatar || "",
        status: normalizeStatus(slot.status),
      },
    ],
    changed: true,
    full: false,
  };
}

