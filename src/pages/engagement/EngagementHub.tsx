import React, { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
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
import { showToast } from "../../lib/toast";
import SettingsOptionSheet from "../../components/SettingsOptionSheet";
import { apiEngagementHub } from "../../features/live/engagement/liveEngagementApi";
import {
  SETTINGS_HOME,
  containerReturnState,
  exitToFromLocationState,
  returnToFromLocationState,
} from "../../lib/settingsNav";

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
  const location = useLocation();
  const [hub, setHub] = useState<Hub | null>(null);
  const [loading, setLoading] = useState(true);

  const exit = useCallback(() => {
    navigate(exitToFromLocationState(location.state, SETTINGS_HOME), { replace: true });
  }, [navigate, location.state]);
  const childReturnState = containerReturnState(
    returnToFromLocationState(location.state) || "/engagement",
  );
  const goDailyLogin = useCallback(
    () => navigate("/engagement/daily-login", { state: childReturnState }),
    [navigate, childReturnState],
  );
  const openEngagementPath = useCallback(
    (path: string) => navigate(path, { state: childReturnState }),
    [navigate, childReturnState],
  );

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
    <SettingsOptionSheet onClose={exit} title="Engagement Hub">
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-3 pt-2 pb-[3mm]">
        {loading ? (
          <div className="py-10 text-center text-sm text-[#8B9099]">Loading...</div>
        ) : (
          <div className="flex flex-col gap-0 max-w-full min-h-full">
            <div className="px-2.5 py-2">
              <div className="text-[10px] uppercase tracking-[0.12em] text-[#8B9099] mb-2">
                {hub?.fan_tier || "Bronze Fan"} · Level {hub?.fan_level ?? 0}
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-[10px] text-[#8B9099]">Promo</div>
                  <div className="text-sm font-bold tabular-nums text-[#E6E9EE]">
                    {hub?.promotional_coins ?? 0}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-[#8B9099] flex items-center justify-center gap-0.5">
                    <Zap className="w-3 h-3 royce-icon-gold" /> Energy
                  </div>
                  <div className="text-sm font-bold tabular-nums text-[#E6E9EE]">
                    {hub?.battle_energy ?? 0}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-[#8B9099]">XP</div>
                  <div className="text-sm font-bold tabular-nums text-[#E6E9EE]">
                    {hub?.total_xp ?? 0}
                  </div>
                </div>
              </div>
              {hub?.daily_login?.can_claim ? (
                <button
                  type="button"
                  onClick={goDailyLogin}
                  className="mt-3 w-full rounded-md border border-white/15 py-2 text-xs font-semibold text-[#E6E9EE] active:opacity-70"
                >
                  Claim daily login · Day {hub.daily_login.streak_day}
                </button>
              ) : null}
            </div>

            {LINKS.map((item) => {
              const Icon = item.icon;
              const titleExtra =
                item.path === "/engagement/missions" && (hub?.missions_open ?? 0) > 0
                  ? ` (${hub?.missions_open})`
                  : "";
              return (
                <button
                  key={item.path}
                  type="button"
                  onClick={() => openEngagementPath(item.path)}
                  className="w-full flex items-center gap-3 px-2.5 py-2.5 text-left active:bg-white/5 rounded-md"
                >
                  <span
                    className="royce-glow-disc shrink-0 [&_svg]:size-[18px]"
                    style={{ width: "36px", height: "36px" }}
                  >
                    <Icon className="royce-icon-gold" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[15px] leading-tight text-[#E6E9EE]">
                      {item.title}
                      {titleExtra}
                    </span>
                    <span className="block text-xs text-[#8B9099] mt-0.5">{item.subtitle}</span>
                  </span>
                  <ChevronRight size={16} className="text-white/30 shrink-0" />
                </button>
              );
            })}

            <div className="mt-4 px-2.5 text-[11px] leading-relaxed text-[#8B9099]">
              Promotional Coins and Battle Energy are free rewards — separate from Purchased Coins.
              LIVE side mission chips are progress hints; claim rewards in this Hub or the LIVE
              Engagement drawer. Battle Predictor League comes in Phase 2.
            </div>
            <div className="px-2.5 pt-2 pb-1 flex items-center gap-1.5 text-[10px] text-[#8B9099]">
              <Gift size={12} className="royce-icon-gold" /> Engagement rewards
            </div>
          </div>
        )}
      </div>
    </SettingsOptionSheet>
  );
}
