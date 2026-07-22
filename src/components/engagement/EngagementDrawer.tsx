import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Trophy,
  Target,
  Star,
  Crown,
  Zap,
  Calendar,
  Wallet,
  ChevronRight,
  X,
  Map,
  Sticker,
  IdCard,
} from "lucide-react";
import { RoyceBackIcon } from "../royce";
import { request } from "../../lib/apiClient";
import { showToast } from "../../lib/toast";
import { engagementFlags } from "../../config/engagementFlags";

export type EngagementPanel =
  | "hub"
  | "missions"
  | "fan-level"
  | "mvp"
  | "battle-energy"
  | "achievements"
  | "daily-login"
  | "rewards"
  | "treasure"
  | "stickers"
  | "creator-cards";

const PANEL_TITLES: Record<EngagementPanel, string> = {
  hub: "Engagement Hub",
  missions: "Missions",
  "fan-level": "Fan Level",
  mvp: "MVP Leaderboard",
  "battle-energy": "Battle Energy",
  achievements: "Achievements",
  "daily-login": "Daily Login",
  rewards: "Reward Wallet",
  treasure: "Treasure Hunt",
  stickers: "Sticker Collection",
  "creator-cards": "Creator Collections",
};

const HUB_LINKS: {
  id: EngagementPanel;
  title: string;
  subtitle: string;
  icon: typeof Trophy;
}[] = [
  { id: "missions", title: "Daily / Weekly Missions", subtitle: "Goals & claims", icon: Target },
  { id: "treasure", title: "Treasure Hunt", subtitle: "Hidden chests", icon: Map },
  { id: "stickers", title: "Sticker Collection", subtitle: "Complete sets", icon: Sticker },
  { id: "creator-cards", title: "Creator Collections", subtitle: "Collectible cards", icon: IdCard },
  { id: "fan-level", title: "Fan Level", subtitle: "XP and tiers", icon: Star },
  { id: "mvp", title: "MVP Leaderboard", subtitle: "LIVE / Today / Week", icon: Crown },
  { id: "battle-energy", title: "Battle Energy", subtitle: "Boost Fan Energy", icon: Zap },
  { id: "achievements", title: "Achievements", subtitle: "Permanent unlocks", icon: Trophy },
  { id: "daily-login", title: "Daily Login", subtitle: "7-day streak", icon: Calendar },
  { id: "rewards", title: "Reward Wallet", subtitle: "Separated balances", icon: Wallet },
];

type Props = {
  open: boolean;
  activePanel: EngagementPanel;
  liveSessionId?: string;
  battleId?: string;
  creatorId?: string;
  onOpenChange: (open: boolean) => void;
  onPanelChange: (panel: EngagementPanel) => void;
};

export function EngagementDrawer({
  open,
  activePanel,
  liveSessionId = "",
  creatorId = "",
  onOpenChange,
  onPanelChange,
}: Props) {
  const touchStartX = useRef<number | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const backToHub = useCallback(() => {
    if (activePanel === "hub") close();
    else onPanelChange("hub");
  }, [activePanel, close, onPanelChange]);

  // Android back: close panel first (without leaving LIVE).
  useEffect(() => {
    if (!open) return;
    const onBack = (e: Event) => {
      e.preventDefault();
      if (activePanel !== "hub") onPanelChange("hub");
      else close();
    };
    document.addEventListener("app:back-button", onBack);
    return () => document.removeEventListener("app:back-button", onBack);
  }, [open, activePanel, close, onPanelChange]);

  // Escape key
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (!engagementFlags.engagementHubEnabled || !open) return null;

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStartX.current;
    touchStartX.current = null;
    if (start == null) return;
    const end = e.changedTouches[0]?.clientX ?? start;
    if (end - start > 72) close();
  };

  return (
    <div className="fixed inset-0 z-[100050] pointer-events-none" aria-modal="true" role="dialog">
      <button
        type="button"
        aria-label="Close engagement panel"
        className="absolute inset-0 bg-black/45 pointer-events-auto"
        onClick={close}
      />
      <div
        ref={panelRef}
        className="absolute top-0 right-0 h-full pointer-events-auto flex flex-col bg-[#111111] border-l border-white/10 shadow-2xl"
        style={{
          width: "min(420px, 92vw)",
          paddingTop: "env(safe-area-inset-top, 0px)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center gap-2 px-3 py-2.5 border-b border-white/10 shrink-0">
          <button
            type="button"
            onClick={backToHub}
            className="p-1.5 rounded-md active:bg-white/10"
            aria-label={activePanel === "hub" ? "Close" : "Back"}
          >
            <RoyceBackIcon className="w-5 h-5 text-white" />
          </button>
          <h2 className="flex-1 text-center text-sm font-semibold text-white truncate">
            {PANEL_TITLES[activePanel]}
          </h2>
          <button
            type="button"
            onClick={close}
            className="p-1.5 rounded-md active:bg-white/10"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-white/80" />
          </button>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-3">
          {activePanel === "hub" && (
            <HubBody
              onSelect={(id) => onPanelChange(id)}
            />
          )}
          {activePanel === "missions" && <MissionsBody />}
          {activePanel === "fan-level" && <FanLevelBody />}
          {activePanel === "mvp" && <MvpBody />}
          {activePanel === "battle-energy" && (
            <BattleEnergyBody roomId={liveSessionId} />
          )}
          {activePanel === "achievements" && <AchievementsBody />}
          {activePanel === "daily-login" && <DailyLoginBody />}
          {activePanel === "rewards" && <RewardsBody />}
          {activePanel === "treasure" && <TreasureBody />}
          {activePanel === "stickers" && <StickersBody />}
          {activePanel === "creator-cards" && (
            <CreatorCardsBody creatorId={creatorId} />
          )}
        </div>
      </div>
    </div>
  );
}

function HubBody({ onSelect }: { onSelect: (id: EngagementPanel) => void }) {
  const [hub, setHub] = useState<{
    promotional_coins?: number;
    battle_energy?: number;
    total_xp?: number;
    fan_level?: number;
    fan_tier?: string;
    missions_open?: number;
  } | null>(null);

  useEffect(() => {
    void request("/api/engagement/hub").then(({ data }) => {
      setHub((data?.hub as typeof hub) || null);
    });
  }, []);

  return (
    <>
      <div className="rounded-2xl border border-[#C9A227]/30 bg-gradient-to-br from-[#1a1608] to-[#111111] p-3 mb-3">
        <p className="text-[10px] uppercase tracking-wide text-[#C9A227] mb-1">
          {hub?.fan_tier || "Bronze Fan"} · Level {hub?.fan_level ?? 0}
        </p>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-[9px] text-white/45">Promo</p>
            <p className="text-sm font-bold tabular-nums">{hub?.promotional_coins ?? 0}</p>
          </div>
          <div>
            <p className="text-[9px] text-white/45">Energy</p>
            <p className="text-sm font-bold tabular-nums">{hub?.battle_energy ?? 0}</p>
          </div>
          <div>
            <p className="text-[9px] text-white/45">XP</p>
            <p className="text-sm font-bold tabular-nums">{hub?.total_xp ?? 0}</p>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        {HUB_LINKS.filter((item) => {
          if (item.id === "treasure") return engagementFlags.treasureHuntEnabled;
          if (item.id === "stickers") return engagementFlags.stickerCollectionEnabled;
          if (item.id === "creator-cards")
            return engagementFlags.creatorCollectionsEnabled;
          return true;
        }).map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              className="w-full flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-left active:bg-white/5"
            >
              <span className="royce-glow-disc shrink-0 flex items-center justify-center w-9 h-9">
                <Icon className="w-[18px] h-[18px] text-[#C9A227]" />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[14px] text-white/90">
                  {item.title}
                  {item.id === "missions" && (hub?.missions_open ?? 0) > 0
                    ? ` (${hub?.missions_open})`
                    : ""}
                </span>
                <span className="block text-[11px] text-white/40">{item.subtitle}</span>
              </span>
              <ChevronRight size={16} className="text-white/30 shrink-0" />
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-[10px] text-white/35 leading-relaxed">
        Battle continues behind this panel. Battle Energy never creates Diamonds.
      </p>
    </>
  );
}

function MissionsBody() {
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
  const [missions, setMissions] = useState<Mission[]>([]);
  const [claiming, setClaiming] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await request("/api/engagement/missions");
    setMissions((data?.missions as Mission[]) || []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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

  const Section = ({ title, items }: { title: string; items: Mission[] }) => (
    <div className="mb-3">
      <p className="text-[10px] text-white/30 uppercase tracking-[0.12em] mb-1.5">{title}</p>
      <div className="flex flex-col gap-2">
        {items.map((m) => {
          const pct = Math.min(100, (m.progress / Math.max(1, m.goal_count)) * 100);
          return (
            <div key={m.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
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
                    className="shrink-0 rounded-lg bg-[#C9A227]/25 border border-[#C9A227]/50 px-2 py-1 text-[10px] font-bold text-[#C9A227]"
                  >
                    Claim
                  </button>
                ) : m.claimed ? (
                  <span className="text-[10px] text-white/40">Done</span>
                ) : (
                  <span className="text-[10px] text-white/40">In progress</span>
                )}
              </div>
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden mb-1">
                <div className="h-full bg-[#C9A227]" style={{ width: `${pct}%` }} />
              </div>
              <p className="text-[10px] text-white/50 tabular-nums">
                {m.progress}/{m.goal_count}
                {m.reward_xp > 0 ? ` · ${m.reward_xp} XP` : ""}
                {m.reward_energy > 0 ? ` · ${m.reward_energy} Energy` : ""}
                {m.reward_promo_coins > 0 ? ` · ${m.reward_promo_coins} Promo` : ""}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <>
      <Section title="Daily" items={missions.filter((m) => m.scope === "daily")} />
      <Section title="Weekly" items={missions.filter((m) => m.scope === "weekly")} />
      {missions.length === 0 ? (
        <p className="text-sm text-white/45 text-center py-8">
          Missions will appear when the engagement database is ready.
        </p>
      ) : null}
    </>
  );
}

function FanLevelBody() {
  const [fan, setFan] = useState<{
    level?: number;
    tier?: string;
    total_xp?: number;
    xp_to_next_level?: number | null;
  } | null>(null);

  useEffect(() => {
    void request("/api/engagement/fan-level").then(({ data }) => {
      setFan((data?.fan_level as typeof fan) || null);
    });
  }, []);

  const tiers = [
    { name: "Bronze Fan", min: 0 },
    { name: "Silver Fan", min: 10 },
    { name: "Gold Fan", min: 20 },
    { name: "Diamond Fan", min: 30 },
    { name: "Elite Fan", min: 40 },
    { name: "Legend Fan", min: 50 },
  ];

  return (
    <>
      <div className="rounded-2xl border border-[#C9A227]/30 bg-gradient-to-br from-[#1a1608] to-[#111111] p-3 mb-3">
        <p className="text-[10px] text-[#C9A227] uppercase tracking-wide mb-1">
          {fan?.tier || "Bronze Fan"}
        </p>
        <p className="text-2xl font-bold mb-1">Level {fan?.level ?? 0}</p>
        <p className="text-sm text-white/60 tabular-nums mb-2">
          {fan?.total_xp ?? 0} XP
          {fan?.xp_to_next_level != null ? ` · ${fan.xp_to_next_level} to next` : ""}
        </p>
        <p className="text-[10px] text-white/40">
          Badges and cosmetics only — XP is not spendable currency.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        {tiers.map((t) => {
          const active = (fan?.level ?? 0) >= t.min;
          return (
            <div
              key={t.name}
              className={`rounded-xl border px-3 py-2 flex justify-between ${
                active
                  ? "border-[#C9A227]/40 bg-[#C9A227]/10"
                  : "border-white/10 bg-white/[0.03]"
              }`}
            >
              <span className={`text-sm ${active ? "text-[#C9A227]" : "text-white/50"}`}>
                {t.name}
              </span>
              <span className="text-[11px] text-white/40">Lv {t.min}+</span>
            </div>
          );
        })}
      </div>
    </>
  );
}

function MvpBody() {
  const [period, setPeriod] = useState<"today" | "week" | "all">("today");
  const [rows, setRows] = useState<
    { rank: number; user_id: string; points: number }[]
  >([]);
  const [viewerId, setViewerId] = useState("");

  useEffect(() => {
    void request(`/api/engagement/mvp?period=${period}`).then(({ data }) => {
      setRows((data?.leaderboard as typeof rows) || []);
      setViewerId(String(data?.viewer_id || ""));
    });
  }, [period]);

  return (
    <>
      <div className="flex gap-2 mb-3">
        {(
          [
            ["today", "Today"],
            ["week", "Week"],
            ["all", "LIVE / All"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setPeriod(id)}
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold border ${
              period === id
                ? "border-[#C9A227] bg-[#C9A227]/20 text-[#C9A227]"
                : "border-white/15 text-white/60"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="text-[10px] text-white/40 mb-2">
        Existing LIVE MVP circles stay on stream. This board is panel-only.
      </p>
      {rows.length === 0 ? (
        <p className="text-sm text-white/45 text-center py-8">No MVP scores yet.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {rows.map((r) => {
            const mine = viewerId && r.user_id === viewerId;
            return (
              <div
                key={`${r.rank}-${r.user_id}`}
                className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 ${
                  mine
                    ? "border-[#C9A227]/40 bg-[#C9A227]/10"
                    : "border-white/10 bg-white/[0.03]"
                }`}
              >
                <span className="w-7 text-sm font-bold text-[#C9A227] tabular-nums">
                  #{r.rank}
                </span>
                <span className="flex-1 text-sm truncate text-white/80">
                  {mine ? "You" : r.user_id.slice(0, 10)}
                </span>
                <span className="text-xs text-white/40">Gift</span>
                <span className="text-sm font-semibold tabular-nums">{r.points}</span>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function BattleEnergyBody({ roomId }: { roomId: string }) {
  const [balance, setBalance] = useState(0);
  const [fanEnergy, setFanEnergy] = useState(0);
  const [busy, setBusy] = useState(false);
  const [lastBoost, setLastBoost] = useState<{
    energySpent?: number;
    remainingEnergy?: number;
    battleFanEnergy?: number;
    boostActivated?: boolean;
    boostMultiplier?: number;
  } | null>(null);

  const refresh = useCallback(async () => {
    const [w, f] = await Promise.all([
      request("/api/engagement/wallet"),
      roomId
        ? request(`/api/engagement/battle-energy/fan?roomId=${encodeURIComponent(roomId)}`)
        : Promise.resolve({ data: null, error: null }),
    ]);
    const wallet = w.data?.wallet as Record<string, number> | undefined;
    setBalance(
      Number(wallet?.battleEnergy ?? wallet?.battle_energy ?? 0),
    );
    const fan = f.data?.fan as { host?: number; opponent?: number } | undefined;
    setFanEnergy(Number(fan?.host ?? 0));
  }, [roomId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const boost = async (amount: number) => {
    if (!roomId || busy || !engagementFlags.battleEnergyEnabled) {
      if (!engagementFlags.battleEnergyEnabled) {
        showToast("Battle Energy is currently disabled");
      }
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await request("/api/engagement/battle-energy/boost", {
        method: "POST",
        body: JSON.stringify({ roomId, side: "host", amount }),
      });
      if (error) {
        showToast(error.message || "Boost failed");
        return;
      }
      setLastBoost(data as typeof lastBoost);
      if (typeof data?.remainingEnergy === "number") setBalance(data.remainingEnergy);
      if (typeof data?.battleFanEnergy === "number") setFanEnergy(data.battleFanEnergy);
      showToast(
        data?.boostActivated
          ? `Boost ×${data.boostMultiplier || 1.2} (battle score only)`
          : "Fan Energy added",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="rounded-2xl border border-[#C9A227]/30 bg-gradient-to-br from-[#1a1608] to-[#111111] p-3 mb-3">
        <p className="text-[10px] text-[#C9A227] uppercase tracking-wide mb-1 flex items-center gap-1">
          <Zap className="w-3 h-3" /> Battle Energy
        </p>
        <p className="text-2xl font-bold tabular-nums mb-1">{balance}</p>
        <p className="text-sm text-white/60 tabular-nums">
          Current Fan Energy: {fanEnergy}
        </p>
        <p className="text-[10px] text-white/40 mt-2">
          Boosts battle score only — never Diamonds or creator earnings.
        </p>
      </div>
      <p className="text-[10px] text-white/30 uppercase tracking-[0.12em] mb-2">
        Support
      </p>
      <div className="flex gap-2 mb-3">
        {[100, 500, 1000].map((n) => (
          <button
            key={n}
            type="button"
            disabled={busy}
            onClick={() => void boost(n)}
            className="flex-1 rounded-xl border border-[#C9A227]/40 bg-[#C9A227]/10 py-2 text-sm font-bold text-[#C9A227] active:scale-95 disabled:opacity-40"
          >
            +{n}
          </button>
        ))}
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => void boost(100)}
        className="w-full rounded-xl border border-[#C9A227]/50 bg-[#C9A227]/20 py-2.5 text-sm font-semibold text-[#C9A227] disabled:opacity-40"
      >
        BOOST CREATOR
      </button>
      {lastBoost ? (
        <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-2.5 text-[11px] text-white/70 space-y-0.5">
          <p>Energy used: {lastBoost.energySpent ?? "—"}</p>
          <p>Remaining: {lastBoost.remainingEnergy ?? balance}</p>
          <p>Current Fan Energy: {lastBoost.battleFanEnergy ?? fanEnergy}</p>
          <p>
            Boost active:{" "}
            {lastBoost.boostActivated
              ? `x${lastBoost.boostMultiplier ?? 1.2}`
              : "no"}
          </p>
        </div>
      ) : null}
      {!engagementFlags.battleEnergyEnabled ? (
        <p className="mt-3 text-[10px] text-white/40">
          Battle Energy is disabled by config.
        </p>
      ) : null}
    </>
  );
}

function AchievementsBody() {
  type A = {
    id: string;
    name: string;
    description: string;
    icon: string;
    goal_count: number;
    progress: number;
    unlocked: boolean;
    unlocked_at?: string | null;
    reward_xp: number;
    reward_promo_coins: number;
    rarity: string;
  };
  const [items, setItems] = useState<A[]>([]);
  useEffect(() => {
    void request("/api/engagement/achievements").then(({ data }) => {
      setItems((data?.achievements as A[]) || []);
    });
  }, []);

  if (items.length === 0) {
    return (
      <p className="text-sm text-white/45 text-center py-8">
        Achievements will appear when the engagement database is ready.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {items.map((a) => {
        const pct = Math.min(100, (a.progress / Math.max(1, a.goal_count)) * 100);
        const status = a.unlocked
          ? "Unlocked"
          : a.progress > 0
            ? "In Progress"
            : "Locked";
        return (
          <div
            key={a.id}
            className={`rounded-xl border p-2.5 ${
              a.unlocked
                ? "border-[#C9A227]/40 bg-[#C9A227]/10"
                : "border-white/10 bg-white/[0.03]"
            }`}
          >
            <div className="flex gap-2 mb-1">
              <span className="text-lg">{a.icon}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{a.name}</p>
                <p className="text-[11px] text-white/45">{a.description}</p>
              </div>
              <span className="text-[10px] text-white/40 shrink-0">{status}</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/10 overflow-hidden mb-1">
              <div className="h-full bg-[#C9A227]" style={{ width: `${pct}%` }} />
            </div>
            <p className="text-[10px] text-white/50 tabular-nums">
              {a.progress}/{a.goal_count}
              {a.reward_xp > 0 ? ` · ${a.reward_xp} XP` : ""}
              {a.unlocked_at
                ? ` · ${new Date(a.unlocked_at).toLocaleDateString()}`
                : ""}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function DailyLoginBody() {
  const [daily, setDaily] = useState<{
    can_claim?: boolean;
    streak_day?: number;
    claimed_today?: boolean;
    next_reward?: { reward_label?: string } | null;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await request("/api/engagement/daily-login");
    setDaily((data?.daily as typeof daily) || null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const claim = async () => {
    if (busy || !daily?.can_claim) return;
    setBusy(true);
    try {
      const { data, error } = await request("/api/engagement/daily-login/claim", {
        method: "POST",
      });
      if (error) {
        showToast(error.message || "Claim unavailable");
        return;
      }
      showToast(
        (data as { reward?: { reward_label?: string } })?.reward?.reward_label ||
          "Claimed",
      );
      await load();
    } finally {
      setBusy(false);
    }
  };

  const day = daily?.streak_day ?? 1;

  return (
    <>
      <div className="rounded-2xl border border-[#C9A227]/30 bg-gradient-to-br from-[#1a1608] to-[#111111] p-3 mb-3">
        <p className="text-[10px] text-[#C9A227] uppercase tracking-wide mb-1">
          7-day streak
        </p>
        <p className="text-2xl font-bold mb-2">Day {day}</p>
        {daily?.next_reward?.reward_label ? (
          <p className="text-sm text-white/70 mb-2">
            Next: {daily.next_reward.reward_label}
          </p>
        ) : null}
        <div className="grid grid-cols-7 gap-1 mb-3">
          {Array.from({ length: 7 }, (_, i) => i + 1).map((d) => {
            const done =
              daily?.claimed_today ? d <= day : d < day;
            const current = !daily?.claimed_today && d === day;
            return (
              <div
                key={d}
                className={`aspect-square rounded-lg flex items-center justify-center text-[10px] font-bold border ${
                  done
                    ? "bg-[#C9A227]/30 border-[#C9A227]/50 text-[#C9A227]"
                    : current
                      ? "bg-white/10 border-[#C9A227] text-white"
                      : "bg-white/[0.03] border-white/10 text-white/35"
                }`}
              >
                {done ? "✓" : d}
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
          {daily?.claimed_today ? "Claimed today" : "Claim"}
        </button>
      </div>
      <p className="text-[10px] text-white/40">
        No auto popup on LIVE — claim only from this panel.
      </p>
    </>
  );
}

function RewardsBody() {
  const [wallet, setWallet] = useState<Record<string, number | string> | null>(
    null,
  );
  useEffect(() => {
    void request("/api/engagement/wallet").then(({ data }) => {
      setWallet((data?.wallet as typeof wallet) || null);
    });
  }, []);

  const n = (a: string, b: string) =>
    Number(wallet?.[a] ?? wallet?.[b] ?? 0);

  const rows = [
    { label: "Purchased Coins", value: n("purchasedCoins", "purchased_coins") },
    { label: "Starter Coins", value: n("starterCoins", "starter_coins") },
    {
      label: "Promotional Coins",
      value: n("promotionalCoins", "promotional_coins"),
    },
    { label: "Battle Energy", value: n("battleEnergy", "battle_energy") },
    { label: "XP", value: n("totalXp", "total_xp") },
    { label: "Diamonds", value: 0, note: "Creator earnings — shown on payout" },
  ];

  return (
    <>
      {rows.map((r) => (
        <div
          key={r.label}
          className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5 mb-2"
        >
          <div className="flex justify-between gap-2">
            <span className="text-sm text-white/90">{r.label}</span>
            <span className="text-sm font-bold tabular-nums text-[#C9A227]">
              {r.value}
            </span>
          </div>
          {"note" in r && r.note ? (
            <p className="text-[10px] text-white/40 mt-0.5">{r.note}</p>
          ) : null}
        </div>
      ))}
      <p className="text-[10px] text-white/35 mt-2">
        Balances stay separate. Test coins never appear here.
      </p>
    </>
  );
}

function TreasureBody() {
  type Chest = {
    id: string;
    rarity: string;
    title: string;
    status: string;
    reward_label: string;
    location_hint?: string;
  };
  type Catalog = {
    id: string;
    rarity: string;
    title: string;
    description: string;
    reward_label: string;
  };
  const [chests, setChests] = useState<Chest[]>([]);
  const [catalog, setCatalog] = useState<Catalog[]>([]);
  const [neonReady, setNeonReady] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await request("/api/engagement/treasure");
    setChests((data?.chests as Chest[]) || []);
    setCatalog((data?.catalog as Catalog[]) || []);
    setNeonReady(!!data?.neon_ready);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openChest = async (id: string) => {
    if (busy) return;
    setBusy(id);
    try {
      const { data, error } = await request(`/api/engagement/treasure/${id}/open`, {
        method: "POST",
      });
      if (error) {
        showToast(error.message || "Open unavailable");
        return;
      }
      const label =
        (data as { reward?: { reward_label?: string } })?.reward?.reward_label ||
        "Chest opened";
      showToast(label);
      await load();
    } finally {
      setBusy(null);
    }
  };

  const rarityColor = (r: string) => {
    if (r === "mythic") return "text-fuchsia-300 border-fuchsia-400/40";
    if (r === "legendary") return "text-amber-300 border-amber-400/40";
    if (r === "epic") return "text-purple-300 border-purple-400/40";
    if (r === "rare") return "text-sky-300 border-sky-400/40";
    return "text-white/70 border-white/15";
  };

  return (
    <>
      <div className="rounded-2xl border border-[#C9A227]/30 bg-gradient-to-br from-[#1a1608] to-[#111111] p-3 mb-3">
        <p className="text-[10px] text-[#C9A227] uppercase tracking-wide mb-1">
          Treasure Hunt
        </p>
        <p className="text-sm text-white/70">
          Chests appear from watching, missions, and exploration. Open them here —
          never on the battle screen.
        </p>
      </div>
      {!neonReady ? (
        <p className="text-[11px] text-white/40 mb-3">
          Catalog ready. If chests do not spawn, run server migrate for engagement tables.
        </p>
      ) : null}
      {chests.filter((c) => c.status === "found").length === 0 ? (
        <p className="text-sm text-white/45 mb-3">No found chests yet. Keep watching LIVE.</p>
      ) : (
        <div className="flex flex-col gap-2 mb-3">
          {chests
            .filter((c) => c.status === "found")
            .map((c) => (
              <div
                key={c.id}
                className={`rounded-xl border bg-white/[0.03] p-2.5 ${rarityColor(c.rarity)}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-white/90">{c.title}</p>
                    <p className="text-[10px] uppercase opacity-80">{c.rarity}</p>
                    <p className="text-[11px] text-white/50">{c.reward_label}</p>
                  </div>
                  <button
                    type="button"
                    disabled={busy === c.id}
                    onClick={() => void openChest(c.id)}
                    className="shrink-0 rounded-lg bg-[#C9A227]/25 border border-[#C9A227]/50 px-2.5 py-1 text-[11px] font-bold text-[#C9A227]"
                  >
                    Open
                  </button>
                </div>
              </div>
            ))}
        </div>
      )}
      <p className="text-[10px] text-white/30 uppercase tracking-[0.12em] mb-1.5">
        Chest rarities
      </p>
      <div className="flex flex-col gap-1.5">
        {catalog.map((c) => (
          <div
            key={c.id}
            className={`rounded-xl border px-2.5 py-2 bg-white/[0.02] ${rarityColor(c.rarity)}`}
          >
            <p className="text-sm text-white/85">{c.title}</p>
            <p className="text-[11px] text-white/45">{c.description}</p>
            <p className="text-[10px] text-white/40 mt-0.5">{c.reward_label}</p>
          </div>
        ))}
      </div>
    </>
  );
}

function StickersBody() {
  type SetRow = {
    id: string;
    title: string;
    theme: string;
    complete_reward_label: string;
    progress: number;
    total: number;
    complete: boolean;
    stickers: {
      id: string;
      name: string;
      emoji: string;
      rarity: string;
      unlocked: boolean;
      owned: number;
    }[];
  };
  const [sets, setSets] = useState<SetRow[]>([]);
  const [neonReady, setNeonReady] = useState(false);

  useEffect(() => {
    void request("/api/engagement/stickers").then(({ data }) => {
      setSets((data?.sets as SetRow[]) || []);
      setNeonReady(!!data?.neon_ready);
    });
  }, []);

  if (!engagementFlags.stickerCollectionEnabled) {
    return <p className="text-sm text-white/45 text-center py-8">Stickers disabled.</p>;
  }

  return (
    <>
      <p className="text-[11px] text-white/45 mb-3">
        Earn stickers from activity. Complete a set for cosmetic rewards.
        {!neonReady
          ? " If progress does not save, run server migrate for engagement tables."
          : ""}
      </p>
      {sets.map((s) => (
        <div key={s.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5 mb-2">
          <div className="flex justify-between gap-2 mb-1">
            <div>
              <p className="text-sm font-semibold text-white/90">{s.title}</p>
              <p className="text-[11px] text-white/45">{s.theme}</p>
            </div>
            <span className="text-[11px] tabular-nums text-[#C9A227]">
              {s.progress}/{s.total}
              {s.complete ? " ✓" : ""}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5 mb-1">
            {s.stickers.map((st) => (
              <div
                key={st.id}
                className={`w-10 h-10 rounded-lg border flex items-center justify-center text-lg ${
                  st.unlocked
                    ? "border-[#C9A227]/40 bg-[#C9A227]/10"
                    : "border-white/10 bg-black/30 opacity-40"
                }`}
                title={st.name}
              >
                {st.emoji}
              </div>
            ))}
          </div>
          <p className="text-[10px] text-white/40">
            Complete: {s.complete_reward_label}
          </p>
        </div>
      ))}
    </>
  );
}

function CreatorCardsBody({ creatorId }: { creatorId?: string }) {
  type Tier = {
    tier: string;
    title: string;
    stars: number;
    watch_minutes_required: number;
    gifts_required: number;
  };
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [unlocked, setUnlocked] = useState<
    { creator_id: string; tier: string; unlocked_at: string }[]
  >([]);
  const [neonReady, setNeonReady] = useState(false);

  useEffect(() => {
    const q = creatorId
      ? `?creatorId=${encodeURIComponent(creatorId)}`
      : "";
    void request(`/api/engagement/creator-cards${q}`).then(({ data }) => {
      setTiers((data?.tiers as Tier[]) || []);
      setUnlocked((data?.unlocked as typeof unlocked) || []);
      setNeonReady(!!data?.neon_ready);
    });
  }, [creatorId]);

  const unlockedTiers = new Set(
    unlocked
      .filter((u) => !creatorId || u.creator_id === creatorId)
      .map((u) => u.tier),
  );

  return (
    <>
      <div className="rounded-2xl border border-[#C9A227]/30 bg-gradient-to-br from-[#1a1608] to-[#111111] p-3 mb-3">
        <p className="text-[10px] text-[#C9A227] uppercase tracking-wide mb-1">
          Creator Collections
        </p>
        <p className="text-sm text-white/70">
          Unlock Bronze→Legend cards by watching and supporting creators.
          {creatorId ? ` Focus: ${creatorId.slice(0, 8)}…` : ""}
        </p>
        {!neonReady ? (
          <p className="text-[10px] text-white/40 mt-2">
            If unlocks do not save, run server migrate for engagement tables.
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-2">
        {tiers.map((t) => {
          const have = unlockedTiers.has(t.tier);
          return (
            <div
              key={t.tier}
              className={`rounded-xl border p-2.5 ${
                have
                  ? "border-[#C9A227]/40 bg-[#C9A227]/10"
                  : "border-white/10 bg-white/[0.03]"
              }`}
            >
              <div className="flex justify-between gap-2 mb-0.5">
                <p className="text-sm font-semibold text-white/90">{t.title}</p>
                <span className="text-[11px] text-[#C9A227]">
                  {"⭐".repeat(Math.max(1, t.stars))}
                </span>
              </div>
              <p className="text-[11px] text-white/45">
                Watch {t.watch_minutes_required}m
                {t.gifts_required > 0 ? ` · ${t.gifts_required} gifts` : ""}
              </p>
              <p className="text-[10px] text-white/40 mt-0.5">
                {have ? "Unlocked" : "Locked"}
              </p>
            </div>
          );
        })}
      </div>
      {unlocked.length > 0 && !creatorId ? (
        <div className="mt-3">
          <p className="text-[10px] text-white/30 uppercase tracking-[0.12em] mb-1.5">
            Your cards
          </p>
          {unlocked.slice(0, 20).map((u) => (
            <div
              key={`${u.creator_id}-${u.tier}`}
              className="text-[11px] text-white/60 py-1 border-b border-white/5"
            >
              {u.tier} · {u.creator_id.slice(0, 10)}
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}
