import React, { useEffect, useState } from "react";
import { Calendar } from "lucide-react";
import { EngagementShell } from "./EngagementShell";
import { showToast } from "../../lib/toast";
import {
  apiEngagementDailyLogin,
  apiEngagementDailyLoginClaim,
} from "../../features/live/engagement/liveEngagementApi";

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
      const { data, error } = await apiEngagementDailyLogin();
      if (error) throw new Error(error);
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
      const { data, error } = await apiEngagementDailyLoginClaim();
      if (error) {
        showToast(error || "Already claimed");
        return;
      }
      const reward = (data?.reward ?? null) as { reward_label?: string } | null;
      const label = reward?.reward_label || "Reward claimed";
      showToast(label);
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <EngagementShell title="Daily Login" icon={Calendar}>
      {loading ? (
        <div className="py-10 text-center text-sm">
          <span className="elix-silver-red-text opacity-50">Loading...</span>
        </div>
      ) : (
        <div className="rounded-2xl border border-[#D8D9DD]/30 bg-gradient-to-br from-[#1a1608] to-[#09090B] p-4">
          <p className="text-xs uppercase tracking-wide mb-1">
            <span className="elix-silver-red-text">7-day streak</span>
          </p>
          <p className="text-2xl font-bold mb-2">
            <span className="elix-silver-red-text">Day {daily?.streak_day ?? 1}</span>
          </p>
          {daily?.next_reward ? (
            <p className="text-sm mb-4">
              <span className="elix-silver-red-text opacity-70">
                Next: {daily.next_reward.reward_label}
                {daily.next_reward.reward_xp > 0
                  ? ` · ${daily.next_reward.reward_xp} XP`
                  : ""}
                {daily.next_reward.reward_promo_coins > 0
                  ? ` · ${daily.next_reward.reward_promo_coins} Promo`
                  : ""}
              </span>
            </p>
          ) : daily?.claimed_today ? (
            <p className="text-sm mb-4">
              <span className="elix-silver-red-text opacity-70">
                Already claimed today. Come back tomorrow.
              </span>
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
                      ? "bg-transparent border-white/40"
                      : current
                        ? "bg-white/10 border-white/50"
                        : "bg-white/[0.03] border-white/10"
                  }`}
                >
                  <span className={`elix-silver-red-text ${filled || current ? "" : "opacity-40"}`}>
                    {d}
                  </span>
                </div>
              );
            })}
          </div>
          <button
            type="button"
            disabled={!daily?.can_claim || busy}
            onClick={() => void claim()}
            className="w-full rounded-xl py-2.5 text-sm font-semibold border border-white/30 bg-transparent disabled:opacity-40 active:opacity-70"
          >
            <span className="elix-silver-red-text">
              {daily?.claimed_today ? "Claimed" : "Claim today"}
            </span>
          </button>
          <p className="mt-3 text-[11px]">
            <span className="elix-silver-red-text opacity-55">
              Rewards are XP, Promotional Coins, or cosmetics only — never Purchased
              Coins stakes.
            </span>
          </p>
        </div>
      )}
    </EngagementShell>
  );
}
