import React, { useCallback, useEffect, useState } from "react";
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
import { showToast } from "../../lib/toast";
import { apiEngagementHub } from "../../features/live/engagement/liveEngagementApi";
import { SETTINGS_HOME } from "../../lib/settingsNav";

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

  const exit = useCallback(() => {
    navigate(SETTINGS_HOME, { replace: true });
  }, [navigate]);
  const goDailyLogin = useCallback(() => navigate("/engagement/daily-login"), [navigate]);
  const openEngagementPath = useCallback((path: string) => navigate(path), [navigate]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const { data, error } = await apiEngagementHub();
        if (error) throw new Error(error);
        setHub((data?.hub as Hub) || null);
      } catch {
        showToast("Could not load Engagement Hub");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="page-above-bottom-nav bg-[rgba(10,10,10,0.72)] backdrop-blur-md text-white">
      <div className="page-above-bottom-nav__inner engagement-panel-writing">
        <div
          className="w-full shrink-0 bg-[rgba(0,0,0,0.35)] z-10"
          style={{ paddingTop: "var(--topnav-anchor-top)" }}
        >
          <div
            className="w-full px-3 flex items-center"
            style={{ minHeight: "var(--topnav-bar-height)" }}
          >
            <div className="w-10 shrink-0" aria-hidden />
            <div className="flex-1 flex items-center justify-center gap-2 min-w-0">
              <Gift className="w-5 h-5 royce-icon-gold shrink-0" />
              <h1 className="text-base font-semibold truncate">
                <span className="elix-silver-red-text">Engagement Hub</span>
              </h1>
            </div>
            <button
              type="button"
              onClick={exit}
              className="w-10 h-10 shrink-0 flex items-center justify-center"
              aria-label="Close"
              title="Close"
            >
              <RoyceBackIcon className="w-6 h-6 text-white" />
            </button>
          </div>
        </div>

        <div className="px-3 pb-6">
          {loading ? (
            <div className="py-10 text-center text-sm">
              <span className="elix-silver-red-text opacity-50">Loading...</span>
            </div>
          ) : (
            <>
              <div className="rounded-2xl border border-[#D8D9DD]/30 bg-gradient-to-br from-[#1a1608] to-[#09090B] p-4 mb-4">
                <p className="text-xs uppercase tracking-wide mb-2">
                  <span className="elix-silver-red-text">
                    {hub?.fan_tier || "Bronze Fan"} · Level {hub?.fan_level ?? 0}
                  </span>
                </p>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-[10px]">
                      <span className="elix-silver-red-text opacity-55">Promo</span>
                    </p>
                    <p className="text-sm font-bold tabular-nums">
                      <span className="elix-silver-red-text">{hub?.promotional_coins ?? 0}</span>
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] flex items-center justify-center gap-0.5">
                      <Zap className="w-3 h-3 royce-icon-gold" />
                      <span className="elix-silver-red-text opacity-55">Energy</span>
                    </p>
                    <p className="text-sm font-bold tabular-nums">
                      <span className="elix-silver-red-text">{hub?.battle_energy ?? 0}</span>
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px]">
                      <span className="elix-silver-red-text opacity-55">XP</span>
                    </p>
                    <p className="text-sm font-bold tabular-nums">
                      <span className="elix-silver-red-text">{hub?.total_xp ?? 0}</span>
                    </p>
                  </div>
                </div>
                {hub?.daily_login?.can_claim ? (
                  <button
                    type="button"
                    onClick={goDailyLogin}
                    className="mt-3 w-full rounded-xl bg-transparent border border-white/25 py-2 text-xs font-semibold active:opacity-70"
                  >
                    <span className="elix-silver-red-text">
                      Claim daily login · Day {hub.daily_login.streak_day}
                    </span>
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
                      onClick={() => openEngagementPath(item.path)}
                      className="w-full flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3 text-left active:bg-white/5"
                    >
                      <span className="royce-glow-disc shrink-0 flex items-center justify-center w-9 h-9">
                        <Icon className="w-[18px] h-[18px] royce-icon-gold" />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[15px]">
                          <span className="elix-silver-red-text">
                            {item.title}
                            {item.path === "/engagement/missions" &&
                            (hub?.missions_open ?? 0) > 0
                              ? ` (${hub?.missions_open})`
                              : ""}
                          </span>
                        </span>
                        <span className="block text-[12px]">
                          <span className="elix-silver-red-text opacity-55">{item.subtitle}</span>
                        </span>
                      </span>
                      <ChevronRight size={16} className="text-white/30 shrink-0" />
                    </button>
                  );
                })}
              </div>
              <p className="mt-4 text-[11px] leading-relaxed">
                <span className="elix-silver-red-text opacity-55">
                  Promotional Coins and Battle Energy are free rewards — separate from
                  Purchased Coins. LIVE side mission chips are progress hints; claim
                  rewards in this Hub or the LIVE Engagement drawer. Battle Predictor
                  League comes in Phase 2.
                </span>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
