import React, { useEffect, useState } from "react";
import { Calendar } from "lucide-react";
import { EngagementShell } from "./EngagementShell";
import { request } from "../../lib/apiClient";
import { showToast } from "../../lib/toast";

type Daily = {
  can_claim: boolean;
  streak_day: number;
  claimed_today: boolean;
  next_reward: {
    streak_day: number;
    reward_xp: number;
    reward_promo_coins: number;
    reward_label: string;
  } | null;
};

export default function EngagementDailyLogin() {
  const [daily, setDaily] = useState<Daily | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await request("/api/engagement/daily-login");
      if (error) throw new Error(error.message);
      setDaily((data?.daily as Daily) || null);
    } catch {
      showToast("Could not load daily login");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const claim = async () => {
    if (busy || !daily?.can_claim) return;
    setBusy(true);
    try {
      const { data, error } = await request("/api/engagement/daily-login/claim", {
        method: "POST",
      });
      if (error) {
        showToast(error.message || "Already claimed");
        return;
      }
      const label = data?.reward?.reward_label || "Reward claimed";
      showToast(label);
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <EngagementShell title="Daily Login" icon={Calendar}>
      {loading ? (
        <div className="py-10 text-center text-white/50 text-sm">Loading...</div>
      ) : (
        <div className="rounded-2xl border border-[#C9A227]/30 bg-gradient-to-br from-[#1a1608] to-[#111111] p-4">
          <p className="text-xs text-[#C9A227] uppercase tracking-wide mb-1">
            7-day streak
          </p>
          <p className="text-2xl font-bold mb-2">
            Day {daily?.streak_day ?? 1}
          </p>
          {daily?.next_reward ? (
            <p className="text-sm text-white/70 mb-4">
              Next: {daily.next_reward.reward_label}
              {daily.next_reward.reward_xp > 0
                ? ` · ${daily.next_reward.reward_xp} XP`
                : ""}
              {daily.next_reward.reward_promo_coins > 0
                ? ` · ${daily.next_reward.reward_promo_coins} Promo`
                : ""}
            </p>
          ) : daily?.claimed_today ? (
            <p className="text-sm text-white/60 mb-4">
              Already claimed today. Come back tomorrow.
            </p>
          ) : null}
          <div className="grid grid-cols-7 gap-1.5 mb-4">
            {Array.from({ length: 7 }, (_, i) => i + 1).map((d) => {
              const filled =
                daily?.claimed_today
                  ? d <= (daily?.streak_day ?? 0)
                  : d < (daily?.streak_day ?? 1);
              const current = !daily?.claimed_today && d === daily?.streak_day;
              return (
                <div
                  key={d}
                  className={`aspect-square rounded-lg flex items-center justify-center text-[11px] font-bold border ${
                    filled
                      ? "bg-[#C9A227]/30 border-[#C9A227]/50 text-[#C9A227]"
                      : current
                        ? "bg-white/10 border-[#C9A227] text-white"
                        : "bg-white/[0.03] border-white/10 text-white/40"
                  }`}
                >
                  {d}
                </div>
              );
            })}
          </div>
          <button
            type="button"
            disabled={!daily?.can_claim || busy}
            onClick={() => void claim()}
            className="w-full rounded-xl py-2.5 text-sm font-semibold border border-[#C9A227]/50 bg-[#C9A227]/20 text-[#C9A227] disabled:opacity-40"
          >
            {daily?.claimed_today ? "Claimed" : "Claim today"}
          </button>
          <p className="mt-3 text-[11px] text-white/40">
            Rewards are XP, Promotional Coins, or cosmetics only — never Purchased
            Coins stakes.
          </p>
        </div>
      )}
    </EngagementShell>
  );
}
