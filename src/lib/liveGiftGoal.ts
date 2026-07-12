export type LiveGiftGoal = {
  giftId: string;
  giftName: string;
  giftIcon: string;
  targetCount: number;
  currentCount: number;
};

export function parseLiveGiftGoal(data: unknown): LiveGiftGoal | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const giftId = typeof d.giftId === "string" ? d.giftId.trim() : "";
  if (!giftId) return null;
  const targetCount = Math.max(1, Math.min(9999, Math.floor(Number(d.targetCount) || 1)));
  const currentCount = Math.max(0, Math.min(targetCount, Math.floor(Number(d.currentCount) || 0)));
  return {
    giftId,
    giftName: typeof d.giftName === "string" ? d.giftName : "Gift",
    giftIcon: typeof d.giftIcon === "string" ? d.giftIcon : "",
    targetCount,
    currentCount,
  };
}

export function giftGoalProgressPct(goal: LiveGiftGoal): number {
  if (goal.targetCount <= 0) return 0;
  return Math.min(100, Math.round((goal.currentCount / goal.targetCount) * 100));
}

export function giftGoalRemaining(goal: LiveGiftGoal): number {
  return Math.max(0, goal.targetCount - goal.currentCount);
}

export function isGiftGoalComplete(goal: LiveGiftGoal): boolean {
  return goal.currentCount >= goal.targetCount;
}
