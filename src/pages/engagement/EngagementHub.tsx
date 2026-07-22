import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Trophy,
  Target,
  Star,
  Crown,
  Zap,
  Gift,
  Calendar,
  Wallet,
  ChevronRight,
} from "lucide-react";
import { RoyceBackIcon } from "../../components/royce";
import { request } from "../../lib/apiClient";
import { showToast } from "../../lib/toast";

type Hub = {
  promotional_coins: number;
  battle_energy: number;
  total_xp: number;
  fan_level: number;
  fan_tier: string;
  missions_open: number;
  daily_login: {
    can_claim: boolean;
    streak_day: number;
    claimed_today: boolean;
  };
};

const LINKS: {
  path: string;
  title: string;
  subtitle: string;
  icon: typeof Trophy;
}[] = [
  {
    path: "/engagement/missions",
    title: "Missions",
    subtitle: "Daily & weekly goals",
    icon: Target,
  },
  {
    path: "/engagement/fan-level",
    title: "Fan Level",
    subtitle: "XP and fan tiers",
    icon: Star,
  },
  {
    path: "/engagement/mvp",
    title: "MVP Leaderboard",
    subtitle: "Today & this week",
    icon: Crown,
  },
  {
    path: "/engagement/achievements",
    title: "Achievements",
    subtitle: "Permanent unlocks",
    icon: Trophy,
  },
  {
    path: "/engagement/rewards",
    title: "Reward Wallet",
    subtitle: "Purchased, promo, energy, XP",
    icon: Wallet,
  },
  {
    path: "/engagement/daily-login",
    title: "Daily Login",
    subtitle: "7-day streak rewards",
    icon: Calendar,
  },
  {
    path: "/engagement/collections",
    title: "Collections",
    subtitle: "Treasure, stickers, creator cards",
    icon: Zap,
  },
];

export default function EngagementHub() {
  const navigate = useNavigate();
  const [hub, setHub] = useState<Hub | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const { data, error } = await request("/api/engagement/hub");
        if (error) throw new Error(error.message);
        setHub((data?.hub as Hub) || null);
      } catch {
        showToast("Could not load Engagement Hub");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="page-above-bottom-nav bg-[#111111] text-white">
      <div className="page-above-bottom-nav__inner">
        <div
          className="w-full shrink-0 bg-[#111111] z-10"
          style={{ paddingTop: "var(--topnav-anchor-top)" }}
        >
          <div
            className="w-full px-3 flex items-center justify-between"
            style={{ minHeight: "var(--topnav-bar-height)" }}
          >
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="p-1"
              aria-label="Back"
            >
              <RoyceBackIcon className="w-6 h-6 text-white" />
            </button>
            <div className="flex items-center gap-2">
              <Gift className="w-5 h-5 text-[#C9A227]" />
              <h1 className="text-base font-semibold">Engagement Hub</h1>
            </div>
            <div className="w-8" />
          </div>
        </div>

        <div className="px-3 pb-6">
          {loading ? (
            <div className="py-10 text-center text-white/50 text-sm">Loading...</div>
          ) : (
            <>
              <div className="rounded-2xl border border-[#C9A227]/30 bg-gradient-to-br from-[#1a1608] to-[#111111] p-4 mb-4">
                <p className="text-xs uppercase tracking-wide text-[#C9A227] mb-2">
                  {hub?.fan_tier || "Bronze Fan"} · Level {hub?.fan_level ?? 0}
                </p>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-[10px] text-white/50">Promo</p>
                    <p className="text-sm font-bold tabular-nums">
                      {hub?.promotional_coins ?? 0}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-white/50 flex items-center justify-center gap-0.5">
                      <Zap className="w-3 h-3 text-[#C9A227]" /> Energy
                    </p>
                    <p className="text-sm font-bold tabular-nums">
                      {hub?.battle_energy ?? 0}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-white/50">XP</p>
                    <p className="text-sm font-bold tabular-nums">
                      {hub?.total_xp ?? 0}
                    </p>
                  </div>
                </div>
                {hub?.daily_login?.can_claim ? (
                  <button
                    type="button"
                    onClick={() => navigate("/engagement/daily-login")}
                    className="mt-3 w-full rounded-xl bg-[#C9A227]/20 border border-[#C9A227]/40 py-2 text-xs font-semibold text-[#C9A227]"
                  >
                    Claim daily login · Day {hub.daily_login.streak_day}
                  </button>
                ) : null}
              </div>

              <div className="flex flex-col gap-2">
                {LINKS.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.path}
                      type="button"
                      onClick={() => navigate(item.path)}
                      className="w-full flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3 text-left active:bg-white/5"
                    >
                      <span className="royce-glow-disc shrink-0 flex items-center justify-center w-9 h-9">
                        <Icon className="w-[18px] h-[18px] text-[#C9A227]" />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[15px] text-white/90">
                          {item.title}
                          {item.path === "/engagement/missions" &&
                          (hub?.missions_open ?? 0) > 0
                            ? ` (${hub?.missions_open})`
                            : ""}
                        </span>
                        <span className="block text-[12px] text-white/45">
                          {item.subtitle}
                        </span>
                      </span>
                      <ChevronRight size={16} className="text-white/30 shrink-0" />
                    </button>
                  );
                })}
              </div>
              <p className="mt-4 text-[11px] text-white/35 leading-relaxed">
                Promotional Coins and Battle Energy are free rewards — separate from
                Purchased Coins. LIVE side mission chips are progress hints; claim
                rewards in this Hub or the LIVE Engagement drawer. Battle Predictor
                League comes in Phase 2.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
