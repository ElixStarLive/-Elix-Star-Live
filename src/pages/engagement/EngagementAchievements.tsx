import React, { useEffect, useState } from "react";
import { Trophy } from "lucide-react";
import { EngagementShell } from "./EngagementShell";
import { showToast } from "../../lib/toast";
import { apiEngagementAchievements } from "../../features/live/engagement/liveEngagementApi";

type Achievement = {
  id: string;
  name: string;
  description: string;
  icon: string;
  goal_count: number;
  reward_xp: number;
  reward_promo_coins: number;
  rarity: string;
  progress: number;
  unlocked: boolean;
};

export default function EngagementAchievements() {
  const [items, setItems] = useState<Achievement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const { data, error } = await apiEngagementAchievements();
        if (error) throw new Error(error);
        setItems((data?.achievements as Achievement[]) || []);
      } catch {
        showToast("Could not load achievements");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <EngagementShell title="Achievements" icon={Trophy}>
      {loading ? (
        <div className="py-10 text-center text-sm">
          <span className="elix-silver-red-text opacity-50">Loading...</span>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((a) => {
            const pct = Math.min(
              100,
              (Math.max(0, a.progress) / Math.max(1, a.goal_count)) * 100,
            );
            return (
              <div
                key={a.id}
                className={`rounded-xl border p-3 ${
                  a.unlocked
                    ? "border-[#D8D9DD]/40 bg-white/[0.04]"
                    : "border-white/10 bg-white/[0.03]"
                }`}
              >
                <div className="flex items-start gap-2 mb-1.5">
                  <span className="text-xl leading-none">{a.icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">
                      <span className="elix-silver-red-text">{a.name}</span>
                    </p>
                    <p className="text-[11px]">
                      <span className="elix-silver-red-text opacity-55">{a.description}</span>
                    </p>
                  </div>
                  <span className="text-[10px] uppercase shrink-0">
                    <span className="elix-silver-red-text opacity-70">{a.rarity}</span>
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-white/10 overflow-hidden mb-1">
                  <div
                    className="h-full rounded-full bg-[#E6E9EE]"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="text-[10px] tabular-nums">
                  <span className="elix-silver-red-text opacity-55">
                    {a.progress}/{a.goal_count}
                    {a.reward_xp > 0 ? ` · ${a.reward_xp} XP` : ""}
                    {a.reward_promo_coins > 0
                      ? ` · ${a.reward_promo_coins} Promo`
                      : ""}
                    {a.unlocked ? " · Unlocked" : ""}
                  </span>
                </p>
              </div>
            );
          })}
        </div>
      )}
    </EngagementShell>
  );
}
