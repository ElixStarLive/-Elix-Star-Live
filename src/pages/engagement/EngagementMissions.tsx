import React, { useEffect, useState } from "react";
import { Target } from "lucide-react";
import { EngagementShell } from "./EngagementShell";
import { request } from "../../lib/apiClient";
import { showToast } from "../../lib/toast";

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
      const { data, error } = await request("/api/engagement/missions");
      if (error) throw new Error(error.message);
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
      const { error } = await request(`/api/engagement/missions/${id}/claim`, {
        method: "POST",
      });
      if (error) {
        showToast(error.message || "Claim failed");
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
      <p className="text-[10px] text-white/30 uppercase tracking-[0.12em] mb-2">
        {title}
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
                  <p className="text-sm font-semibold text-white/90">{m.title}</p>
                  <p className="text-[11px] text-white/45">{m.description}</p>
                </div>
                {m.completed && !m.claimed ? (
                  <button
                    type="button"
                    disabled={claiming === m.id}
                    onClick={() => void claim(m.id)}
                    className="shrink-0 rounded-lg bg-[#C9A227]/25 border border-[#C9A227]/50 px-2.5 py-1 text-[11px] font-bold text-[#C9A227]"
                  >
                    Claim
                  </button>
                ) : m.claimed ? (
                  <span className="text-[11px] text-white/40 shrink-0">Done</span>
                ) : null}
              </div>
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden mb-1.5">
                <div
                  className="h-full rounded-full bg-[#C9A227]"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="text-[10px] text-white/50 tabular-nums">
                {m.progress}/{m.goal_count} · {m.reward_xp} XP
                {m.reward_promo_coins > 0
                  ? ` · ${m.reward_promo_coins} Promo`
                  : ""}
                {m.reward_energy > 0 ? ` · ${m.reward_energy} Energy` : ""}
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
        <div className="py-10 text-center text-white/50 text-sm">Loading...</div>
      ) : (
        <>
          <Section title="Daily" items={daily} />
          <Section title="Weekly" items={weekly} />
        </>
      )}
    </EngagementShell>
  );
}
