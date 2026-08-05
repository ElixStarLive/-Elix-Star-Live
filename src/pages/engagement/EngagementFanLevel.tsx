import React, { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { EngagementShell } from "./EngagementShell";
import { showToast } from "../../lib/toast";
import { apiEngagementFanLevel } from "../../features/live/engagement/liveEngagementApi";

const TIERS = [
  { name: "Bronze Fan", min: 0 },
  { name: "Silver Fan", min: 10 },
  { name: "Gold Fan", min: 20 },
  { name: "Diamond Fan", min: 30 },
  { name: "Elite Fan", min: 40 },
  { name: "Legend Fan", min: 50 },
];

type FanLevel = {
  level: number;
  tier: string;
  total_xp: number;
  title: string | null;
  next_level_total_xp: number | null;
  xp_to_next_level: number | null;
};

export default function EngagementFanLevel() {
  const [fan, setFan] = useState<FanLevel | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const { data, error } = await apiEngagementFanLevel();
        if (error) throw new Error(error);
        setFan((data?.fan_level as FanLevel) || null);
      } catch {
        showToast("Could not load fan level");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <EngagementShell title="Fan Level" icon={Star}>
      {loading ? (
        <div className="py-10 text-center text-sm">
          <span className="elix-silver-red-text opacity-50">Loading...</span>
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-[#E5E5E7]/30 bg-gradient-to-br from-[#1a1608] to-[#121215] p-4 mb-4">
            <p className="text-xs uppercase tracking-wide mb-1">
              <span className="elix-silver-red-text">{fan?.tier || "Bronze Fan"}</span>
            </p>
            <p className="text-3xl font-bold mb-1">
              <span className="elix-silver-red-text">Level {fan?.level ?? 0}</span>
            </p>
            <p className="text-sm mb-3 tabular-nums">
              <span className="elix-silver-red-text opacity-70">
                {fan?.total_xp ?? 0} XP
                {fan?.xp_to_next_level != null
                  ? ` · ${fan.xp_to_next_level} to next`
                  : ""}
              </span>
            </p>
            <p className="text-[11px]">
              <span className="elix-silver-red-text opacity-55">
                Earn XP from watching, gifts, missions, and daily login. Rewards are
                badges and cosmetics only.
              </span>
            </p>
          </div>
          <p className="text-[10px] uppercase tracking-[0.12em] mb-2">
            <span className="elix-silver-red-text opacity-55">Tiers</span>
          </p>
          <div className="flex flex-col gap-2">
            {TIERS.map((t) => {
              const active = (fan?.level ?? 0) >= t.min;
              return (
                <div
                  key={t.name}
                  className={`rounded-xl border px-3 py-2.5 flex items-center justify-between ${
                    active
                      ? "border-[#E5E5E7]/40 bg-white/[0.04]"
                      : "border-white/10 bg-white/[0.03]"
                  }`}
                >
                  <span className="text-sm">
                    <span className={`elix-silver-red-text ${active ? "" : "opacity-50"}`}>
                      {t.name}
                    </span>
                  </span>
                  <span className="text-[11px]">
                    <span className="elix-silver-red-text opacity-55">Lv {t.min}+</span>
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </EngagementShell>
  );
}
