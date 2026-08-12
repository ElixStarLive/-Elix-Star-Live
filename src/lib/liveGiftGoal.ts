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
  const targetCount = Math.max(1, Math.min(20_000, Math.floor(Number(d.targetCount) || 1)));
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

export function isGiftGoalComplete(goal: LiveGiftGoal): boolean {
  return goal.currentCount >= goal.targetCount;
}

/** Short celebration tone when gift goal hits target (Web Audio — no asset file). */
let giftGoalAudioCtx: AudioContext | null = null;
let lastGiftGoalReachAt = 0;

export function playGiftGoalReachedSound(): void {
  if (typeof window === "undefined") return;
  const now = Date.now();
  if (now - lastGiftGoalReachAt < 2500) return;
  lastGiftGoalReachAt = now;
  try {
    if (!giftGoalAudioCtx) giftGoalAudioCtx = new AudioContext();
    const ac = giftGoalAudioCtx;
    if (ac.state === "suspended") void ac.resume();
    const beep = (freq: number, when: number, dur: number, gain = 0.09) => {
      const osc = ac.createOscillator();
      const g = ac.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0, ac.currentTime + when);
      g.gain.linearRampToValueAtTime(gain, ac.currentTime + when + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + when + dur);
      osc.connect(g);
      g.connect(ac.destination);
      osc.start(ac.currentTime + when);
      osc.stop(ac.currentTime + when + dur + 0.02);
    };
    beep(523, 0, 0.12);
    beep(659, 0.1, 0.14);
    beep(784, 0.2, 0.22, 0.1);
  } catch {
    /* ignore audio failures */
  }
}
