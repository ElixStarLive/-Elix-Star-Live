import { valkeyDel, valkeyGet, valkeySet, isValkeyConfigured } from "../lib/valkey";

export type StoredGiftGoal = {
  giftId: string;
  giftName: string;
  giftIcon: string;
  targetCount: number;
  currentCount: number;
};

const GIFT_GOAL_TTL_MS = 24 * 60 * 60 * 1000;
const memGoals = new Map<string, StoredGiftGoal>();

function key(roomId: string): string {
  return `gift_goal:${roomId}`;
}

function normalizeGoal(raw: Record<string, unknown>): StoredGiftGoal | null {
  const giftId = typeof raw.giftId === "string" ? raw.giftId.trim() : "";
  if (!giftId) return null;
  const targetCount = Math.max(1, Math.min(9999, Math.floor(Number(raw.targetCount) || 1)));
  const currentCount = Math.max(
    0,
    Math.min(targetCount, Math.floor(Number(raw.currentCount) || 0)),
  );
  return {
    giftId,
    giftName: typeof raw.giftName === "string" ? raw.giftName : "Gift",
    giftIcon: typeof raw.giftIcon === "string" ? raw.giftIcon : "",
    targetCount,
    currentCount,
  };
}

export async function getGiftGoal(roomId: string): Promise<StoredGiftGoal | null> {
  if (isValkeyConfigured()) {
    const raw = await valkeyGet(key(roomId));
    if (!raw) return null;
    try {
      return normalizeGoal(JSON.parse(raw) as Record<string, unknown>);
    } catch {
      return null;
    }
  }
  return memGoals.get(roomId) ?? null;
}

export async function setGiftGoal(roomId: string, goal: StoredGiftGoal): Promise<void> {
  const normalized = normalizeGoal(goal as unknown as Record<string, unknown>);
  if (!normalized) return;
  if (isValkeyConfigured()) {
    await valkeySet(key(roomId), JSON.stringify(normalized), GIFT_GOAL_TTL_MS);
  } else {
    memGoals.set(roomId, normalized);
  }
}

export async function clearGiftGoal(roomId: string): Promise<void> {
  if (isValkeyConfigured()) {
    await valkeyDel(key(roomId));
  } else {
    memGoals.delete(roomId);
  }
}

export async function incrementGiftGoal(
  roomId: string,
  giftId: string,
  quantity = 1,
): Promise<StoredGiftGoal | null> {
  const goal = await getGiftGoal(roomId);
  if (!goal || goal.giftId !== giftId) return null;
  const add = Math.max(1, Math.floor(Number(quantity) || 1));
  const next: StoredGiftGoal = {
    ...goal,
    currentCount: Math.min(goal.targetCount, goal.currentCount + add),
  };
  await setGiftGoal(roomId, next);
  return next;
}
