import React, { useEffect, useState } from "react";
import { Trophy } from "lucide-react";
import { EngagementShell } from "./EngagementShell";
import { request } from "../../lib/apiClient";
import { showToast } from "../../lib/toast";

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
        const { data, error } = await request("/api/engagement/achievements");
        if (error) throw new Error(error.message);
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
        <div className="py-10 text-center text-white/50 text-sm">Loading...</div>
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
                    ? "border-[#C9A227]/40 bg-[#C9A227]/10"
                    : "border-white/10 bg-white/[0.03]"
                }`}
              >
                <div className="flex items-start gap-2 mb-1.5">
                  <span className="text-xl leading-none">{a.icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white/90">{a.name}</p>
                    <p className="text-[11px] text-white/45">{a.description}</p>
                  </div>
                  <span className="text-[10px] text-white/40 uppercase shrink-0">
                    {a.rarity}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-white/10 overflow-hidden mb-1">
                  <div
                    className="h-full rounded-full bg-[#C9A227]"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="text-[10px] text-white/50 tabular-nums">
                  {a.progress}/{a.goal_count}
                  {a.reward_xp > 0 ? ` · ${a.reward_xp} XP` : ""}
                  {a.reward_promo_coins > 0
                    ? ` · ${a.reward_promo_coins} Promo`
                    : ""}
                  {a.unlocked ? " · Unlocked" : ""}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </EngagementShell>
  );
}
