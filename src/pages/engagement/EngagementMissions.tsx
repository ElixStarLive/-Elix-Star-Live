import React, { useEffect, useState } from "react";
import { Target } from "lucide-react";
import { EngagementShell } from "./EngagementShell";
import { showToast } from "../../lib/toast";
import {
  apiEngagementMissionClaim,
  apiEngagementMissions,
} from "../../features/live/engagement/liveEngagementApi";

type Mission = {
  id: string;
  scope: string;
  title: string;
  description: string;
  goal_count: number;
  reward_xp: number;
  reward_promo_coins: number;
  reward_energy: number;
  progress: number;
  completed: boolean;
  claimed: boolean;
};

export default function EngagementMissions() {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await apiEngagementMissions();
      if (error) throw new Error(error);
      setMissions((data?.missions as Mission[]) || []);
    } catch {
      showToast("Could not load missions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const claim = async (id: string) => {
    if (claiming) return;
    setClaiming(id);
    try {
      const { error } = await apiEngagementMissionClaim(id);
      if (error) {
        showToast(error || "Claim failed");
        return;
      }
      showToast("Reward claimed");
      await load();
    } finally {
      setClaiming(null);
    }
  };

  const daily = missions.filter((m) => m.scope === "daily");
  const weekly = missions.filter((m) => m.scope === "weekly");

  const Section = ({ title, items }: { title: string; items: Mission[] }) => (
    <div className="mb-4">
      <p className="text-[10px] uppercase tracking-[0.12em] mb-2">
        <span className="elix-silver-red-text opacity-55">{title}</span>
      </p>
      <div className="flex flex-col gap-2">
        {items.map((m) => {
          const pct = Math.min(
            100,
            (Math.max(0, m.progress) / Math.max(1, m.goal_count)) * 100,
          );
          return (
            <div
              key={m.id}
              className="rounded-xl border border-white/10 bg-white/[0.03] p-3"
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    <span className="elix-silver-red-text">{m.title}</span>
                  </p>
                  <p className="text-[11px]">
                    <span className="elix-silver-red-text opacity-55">{m.description}</span>
                  </p>
                </div>
                {m.completed && !m.claimed ? (
                  <button
                    type="button"
                    disabled={claiming === m.id}
                    onClick={() => void claim(m.id)}
                    className="shrink-0 rounded-lg bg-transparent border border-white/30 px-2.5 py-1 text-[11px] font-bold active:opacity-70"
                  >
                    <span className="elix-silver-red-text">Claim</span>
                  </button>
                ) : m.claimed ? (
                  <span className="text-[11px] shrink-0">
                    <span className="elix-silver-red-text opacity-45">Done</span>
                  </span>
                ) : null}
              </div>
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden mb-1.5">
                <div
                  className="h-full rounded-full bg-[#6F3FF5]"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="text-[10px] tabular-nums">
                <span className="elix-silver-red-text opacity-55">
                  {m.progress}/{m.goal_count} · {m.reward_xp} XP
                  {m.reward_promo_coins > 0
                    ? ` · ${m.reward_promo_coins} Promo`
                    : ""}
                  {m.reward_energy > 0 ? ` · ${m.reward_energy} Energy` : ""}
                </span>
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <EngagementShell title="Missions" icon={Target}>
      {loading ? (
        <div className="py-10 text-center text-sm">
          <span className="elix-silver-red-text opacity-50">Loading...</span>
        </div>
      ) : (
        <>
          <Section title="Daily" items={daily} />
          <Section title="Weekly" items={weekly} />
        </>
      )}
    </EngagementShell>
  );
}
