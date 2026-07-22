import React, { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { EngagementShell } from "./EngagementShell";
import { request } from "../../lib/apiClient";
import { showToast } from "../../lib/toast";

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
        const { data, error } = await request("/api/engagement/fan-level");
        if (error) throw new Error(error.message);
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
        <div className="py-10 text-center text-white/50 text-sm">Loading...</div>
      ) : (
        <>
          <div className="rounded-2xl border border-[#C9A227]/30 bg-gradient-to-br from-[#1a1608] to-[#111111] p-4 mb-4">
            <p className="text-xs text-[#C9A227] uppercase tracking-wide mb-1">
              {fan?.tier || "Bronze Fan"}
            </p>
            <p className="text-3xl font-bold mb-1">Level {fan?.level ?? 0}</p>
            <p className="text-sm text-white/60 mb-3 tabular-nums">
              {fan?.total_xp ?? 0} XP
              {fan?.xp_to_next_level != null
                ? ` · ${fan.xp_to_next_level} to next`
                : ""}
            </p>
            <p className="text-[11px] text-white/40">
              Earn XP from watching, gifts, missions, and daily login. Rewards are
              badges and cosmetics only.
            </p>
          </div>
          <p className="text-[10px] text-white/30 uppercase tracking-[0.12em] mb-2">
            Tiers
          </p>
          <div className="flex flex-col gap-2">
            {TIERS.map((t) => {
              const active = (fan?.level ?? 0) >= t.min;
              return (
                <div
                  key={t.name}
                  className={`rounded-xl border px-3 py-2.5 flex items-center justify-between ${
                    active
                      ? "border-[#C9A227]/40 bg-[#C9A227]/10"
                      : "border-white/10 bg-white/[0.03]"
                  }`}
                >
                  <span
                    className={`text-sm ${active ? "text-[#C9A227]" : "text-white/50"}`}
                  >
                    {t.name}
                  </span>
                  <span className="text-[11px] text-white/40">Lv {t.min}+</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </EngagementShell>
  );
}
