import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Coins, ShieldCheck, Sparkles } from "lucide-react";
import {
  apiAdminProgressionAdjust,
  apiAdminProgressionArchiveMission,
  apiAdminProgressionLoadConfig,
  apiAdminProgressionLoadEngagementAdmin,
  apiAdminProgressionLoadUser,
  apiAdminProgressionSaveBattleEnergyCaps,
  apiAdminProgressionSaveConfig,
  apiAdminProgressionSaveDailyPolicy,
  apiAdminProgressionSaveDailyReward,
  apiAdminProgressionSaveLevel,
  apiAdminProgressionSaveMission,
  apiAdminProgressionToggleFeatureFlag,
} from "../../features/admin/adminApi";
import { showToast } from "../../lib/toast";

interface XpConfig {
  source: string;
  xp_amount: number;
  enabled: boolean;
  description: string;
}

interface LevelRequirement {
  level: number;
  total_xp_required: number;
  title: string | null;
  badge_code: string | null;
}

interface Progression {
  starter_coin_balance: number;
  total_xp: number;
  current_level: number;
}

export default function AdminProgression() {
  const navigate = useNavigate();
  const goAdmin = useCallback(() => navigate("/admin"), [navigate]);
  const [config, setConfig] = useState<XpConfig[]>([]);
  const [levels, setLevels] = useState<LevelRequirement[]>([]);
  const [userId, setUserId] = useState("");
  const [userProgression, setUserProgression] =
    useState<Progression | null>(null);
  const [xpHistory, setXpHistory] = useState<Array<Record<string, unknown>>>([]);
  const [starterHistory, setStarterHistory] = useState<
    Array<Record<string, unknown>>
  >([]);
  const [adjustment, setAdjustment] = useState({
    amount: "",
    reason: "",
  });
  const [busy, setBusy] = useState(false);
  const [engagementFlags, setEngagementFlags] = useState<Record<
    string,
    boolean
  > | null>(null);
  const [missions, setMissions] = useState<
    Array<{
      id: string;
      title: string;
      goal_count: number;
      reward_xp: number;
      reward_promo_coins: number;
      reward_energy: number;
      enabled: boolean;
      metric_key: string;
      scope: string;
      audience?: string;
      starts_at?: string | null;
      ends_at?: string | null;
      sort_order?: number;
    }>
  >([]);
  const [dailyRewards, setDailyRewards] = useState<
    Array<{
      streak_day: number;
      reward_xp: number;
      reward_promo_coins: number;
      reward_label: string | null;
    }>
  >([]);
  const [energyCaps, setEnergyCaps] = useState({
    watch_amount: 5,
    comment_amount: 2,
    share_amount: 20,
    watch_cap: 300,
    comment_cap: 20,
    share_cap: 1,
    storage_cap: 10000,
    session_cap: 500,
    daily_cap: 2000,
    minimum_boost: 1,
    allowed_boost_values: [1, 2, 5, 10] as number[],
    fan_energy_threshold: 10000,
    score_multiplier: 1.2,
    boost_duration_sec: 5,
    enabled: true,
  });
  const [dailyPolicy, setDailyPolicy] = useState({
    streak_reset_policy: "miss_one_day" as "miss_one_day" | "never",
    effective_start: "" as string,
    effective_end: "" as string,
    active: true,
  });
  const [flagRows, setFlagRows] = useState<
    Array<{
      key: string;
      effective: boolean;
      default_value: boolean;
      env_value: boolean;
      admin_value: boolean | null;
      last_changed_by: string | null;
      last_changed_at: string | null;
      reason: string | null;
    }>
  >([]);
  const [auditEntries, setAuditEntries] = useState<
    Array<Record<string, unknown>>
  >([]);

  const loadEngagementAdmin = async () => {
    const data = await apiAdminProgressionLoadEngagementAdmin();
    if (data.flags) {
      setEngagementFlags(data.flags);
    }
    if (Array.isArray(data.rows)) {
      setFlagRows(data.rows as typeof flagRows);
    }
    if (Array.isArray(data.missions)) {
      setMissions(data.missions as typeof missions);
    }
    if (Array.isArray(data.rewards)) {
      setDailyRewards(data.rewards as typeof dailyRewards);
    }
    if (data.policy) {
      const p = data.policy;
      setDailyPolicy({
        streak_reset_policy: String(p.streak_reset_policy || "miss_one_day") as
          | "miss_one_day"
          | "never",
        effective_start: String(p.effective_start || ""),
        effective_end: String(p.effective_end || ""),
        active: p.active !== false,
      });
    }
    if (data.caps) {
      setEnergyCaps((prev) => ({ ...prev, ...data.caps }));
    }
    if (Array.isArray(data.entries)) {
      setAuditEntries(data.entries as typeof auditEntries);
    }
  };

  useEffect(() => {
    void loadConfig();
    void loadEngagementAdmin();
  }, []);

  const loadConfig = async () => {
    const data = await apiAdminProgressionLoadConfig();
    if (data.error) {
      showToast(data.error || "Failed to load progression controls");
      return;
    }
    setConfig(data.config as XpConfig[]);
    setLevels(data.levels as LevelRequirement[]);
  };

  const saveConfig = async (row: XpConfig) => {
    setBusy(true);
    try {
      const { error } = await apiAdminProgressionSaveConfig(
        row as unknown as Record<string, unknown>,
      );
      if (error) {
        showToast(error);
        return;
      }
      showToast("XP reward updated");
      await loadConfig();
    } finally {
      setBusy(false);
    }
  };

  const saveLevel = async (row: LevelRequirement) => {
    setBusy(true);
    try {
      const { error } = await apiAdminProgressionSaveLevel(
        row as unknown as Record<string, unknown>,
      );
      if (error) {
        showToast(error);
        return;
      }
      showToast("Level requirement updated");
      await loadConfig();
    } finally {
      setBusy(false);
    }
  };

  const loadUser = async () => {
    if (!userId.trim()) return;
    const { progression, xp_history, starter_history, error } =
      await apiAdminProgressionLoadUser(userId.trim());
    if (error) {
      showToast(error);
      return;
    }
    setUserProgression((progression as unknown as Progression | null) || null);
    setXpHistory(xp_history as Array<Record<string, unknown>>);
    setStarterHistory(starter_history as Array<Record<string, unknown>>);
  };

  const adjust = async (kind: "xp" | "starter") => {
    const amount = Number(adjustment.amount);
    if (!userId.trim() || !Number.isInteger(amount) || !adjustment.reason.trim()) {
      showToast("User ID, integer amount, and reason are required");
      return;
    }
    setBusy(true);
    try {
      const endpoint =
        kind === "xp" ? "xp-adjustments" : "starter-adjustments";
      const { error } = await apiAdminProgressionAdjust(endpoint, {
        user_id: userId.trim(),
        amount_delta: amount,
        reason: adjustment.reason.trim(),
        idempotency_key: crypto.randomUUID(),
      });
      if (error) {
        showToast(error);
        return;
      }
      showToast(kind === "xp" ? "XP adjusted" : "Starter Coins adjusted");
      setAdjustment({ amount: "", reason: "" });
      await loadUser();
    } finally {
      setBusy(false);
    }
  };

  const inputClass =
    "bg-[#0f1218] border border-white/10 rounded-lg px-3 py-2 text-sm text-white";

  return (
    <div className="min-h-screen bg-[rgba(0,0,0,0.35)] text-white p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="w-7 h-7 text-[#F5F5F7]" />
            Starter Coins & XP
          </h1>
          <button
            type="button"
            onClick={goAdmin}
            className="text-sm text-white/60"
          >
            Back
          </button>
        </div>

        <section className="rounded-xl border border-[#D8D9DD]/25 bg-[#F0C86B]/5 p-4 mb-6 text-sm text-white/70">
          <p className="font-semibold text-[#F5F5F7] mb-1">Engagement Phase 1 + 1.5 (live)</p>
          <p className="mb-2">
            Migrations through{" "}
            <code className="text-white/50">20260722250000_engagement_admin_and_gifts_mission.sql</code>.
            Coolify: <code className="text-white/50">npm run migrate</code>.
          </p>
          <p className="mb-2">
            Battle Energy affects battle score only. Promo gifts create zero Diamonds.
            Treasure spawn is server-only. Feature flags persist in{" "}
            <code className="text-white/50">engagement_settings</code> (env Neon kill-switch still wins).
          </p>
        </section>

        <section className="rounded-xl border border-white/10 p-4 mb-6">
          <h2 className="font-semibold mb-3">Feature flags</h2>
          {engagementFlags ? (
            <ul className="space-y-2">
              {Object.entries(engagementFlags).map(([k, v]) => {
                const row = flagRows.find((r) => r.key === k);
                return (
                <li key={k} className="flex flex-col gap-1 text-xs border-b border-white/5 pb-2">
                  <div className="flex items-center justify-between gap-2">
                  <span className="text-white/70">{k}</span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      void (async () => {
                        const highImpact = [
                          "engagementNeonApproved",
                          "promotionalCoinsEnabled",
                          "promoGiftSpendEnabled",
                          "battleEnergyEnabled",
                        ].includes(k);
                        if (
                          highImpact &&
                          !window.confirm(
                            `Change high-impact flag "${k}"? This affects live economy behavior.`,
                          )
                        ) {
                          return;
                        }
                        const reason =
                          window.prompt("Reason for flag change (optional):") ||
                          "";
                        setBusy(true);
                        const { flags, rows, error } =
                          await apiAdminProgressionToggleFeatureFlag({
                            [k]: !v,
                            reason,
                            ...(highImpact ? { confirm: true } : {}),
                          });
                        setBusy(false);
                        if (error) {
                          showToast(error);
                          return;
                        }
                        if (flags) setEngagementFlags(flags);
                        if (Array.isArray(rows))
                          setFlagRows(rows as typeof flagRows);
                        showToast("Flag updated");
                      })();
                    }}
                    className={`px-2 py-1 rounded-full font-bold ${
                      v ? "bg-emerald-500/20 text-emerald-400" : "bg-white/10 text-white/40"
                    }`}
                  >
                    {v ? "ON" : "OFF"}
                  </button>
                  </div>
                  {row ? (
                    <div className="text-[10px] text-white/35">
                      effective={String(row.effective)} · env={String(row.env_value)} ·
                      admin={String(row.admin_value)} · default=
                      {String(row.default_value)}
                      {row.last_changed_at
                        ? ` · changed ${row.last_changed_at}`
                        : ""}
                      {row.reason ? ` · ${row.reason}` : ""}
                    </div>
                  ) : null}
                </li>
              );
              })}
            </ul>
          ) : (
            <p className="text-xs text-white/40">Loading flags…</p>
          )}
        </section>

        <section className="rounded-xl border border-white/10 p-4 mb-6">
          <h2 className="font-semibold mb-3">Missions</h2>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {missions.map((m, index) => (
              <div key={m.id} className="rounded-lg border border-white/10 p-3 space-y-2">
                <div className="flex justify-between gap-2 text-xs">
                  <span className="font-semibold text-white">{m.title}</span>
                  <span className="text-white/40">
                    {m.scope} · {m.metric_key}
                  </span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <label className="text-[10px] text-white/40">
                    Goal
                    <input
                      type="number"
                      className={inputClass}
                      value={m.goal_count}
                      onChange={(e) =>
                        setMissions((cur) =>
                          cur.map((row, i) =>
                            i === index
                              ? { ...row, goal_count: Number(e.target.value) || 1 }
                              : row,
                          ),
                        )
                      }
                    />
                  </label>
                  <label className="text-[10px] text-white/40">
                    XP
                    <input
                      type="number"
                      className={inputClass}
                      value={m.reward_xp}
                      onChange={(e) =>
                        setMissions((cur) =>
                          cur.map((row, i) =>
                            i === index
                              ? { ...row, reward_xp: Number(e.target.value) || 0 }
                              : row,
                          ),
                        )
                      }
                    />
                  </label>
                  <label className="text-[10px] text-white/40">
                    Promo coins
                    <input
                      type="number"
                      className={inputClass}
                      value={m.reward_promo_coins}
                      onChange={(e) =>
                        setMissions((cur) =>
                          cur.map((row, i) =>
                            i === index
                              ? {
                                  ...row,
                                  reward_promo_coins: Number(e.target.value) || 0,
                                }
                              : row,
                          ),
                        )
                      }
                    />
                  </label>
                  <label className="text-[10px] text-white/40">
                    Energy
                    <input
                      type="number"
                      className={inputClass}
                      value={m.reward_energy}
                      onChange={(e) =>
                        setMissions((cur) =>
                          cur.map((row, i) =>
                            i === index
                              ? {
                                  ...row,
                                  reward_energy: Number(e.target.value) || 0,
                                }
                              : row,
                          ),
                        )
                      }
                    />
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-[10px] text-white/40">
                    Audience
                    <select
                      className={inputClass}
                      value={m.audience || "all_authenticated"}
                      onChange={(e) =>
                        setMissions((cur) =>
                          cur.map((row, i) =>
                            i === index
                              ? { ...row, audience: e.target.value }
                              : row,
                          ),
                        )
                      }
                    >
                      <option value="all_authenticated">All authenticated</option>
                      <option value="creators_only">Creators only</option>
                      <option value="viewers_only">Viewers only</option>
                      <option value="new_users">New users</option>
                    </select>
                  </label>
                  <label className="text-xs flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={m.enabled}
                      onChange={(e) =>
                        setMissions((cur) =>
                          cur.map((row, i) =>
                            i === index
                              ? { ...row, enabled: e.target.checked }
                              : row,
                          ),
                        )
                      }
                    />
                    Enabled
                  </label>
                  <button
                    type="button"
                    disabled={busy}
                    className="ml-auto px-3 py-1.5 rounded-lg bg-[#F0C86B] text-white text-xs font-semibold disabled:opacity-40"
                    onClick={() => {
                      void (async () => {
                        setBusy(true);
                        const { error } =
                          await apiAdminProgressionSaveMission(m.id, {
                            goal_count: m.goal_count,
                            reward_xp: m.reward_xp,
                            reward_promo_coins: m.reward_promo_coins,
                            reward_energy: m.reward_energy,
                            enabled: m.enabled,
                            audience: m.audience || "all_authenticated",
                            sort_order: m.sort_order,
                          });
                        setBusy(false);
                        if (error) showToast(error);
                        else showToast("Mission saved");
                      })();
                    }}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className="px-3 py-1.5 rounded-lg bg-white/10 text-xs disabled:opacity-40"
                    onClick={() => {
                      void (async () => {
                        if (!window.confirm(`Archive mission ${m.id}?`)) return;
                        setBusy(true);
                        const { error } = await apiAdminProgressionArchiveMission(
                          m.id,
                        );
                        setBusy(false);
                        if (error) showToast(error);
                        else {
                          showToast("Mission archived");
                          void loadEngagementAdmin();
                        }
                      })();
                    }}
                  >
                    Archive
                  </button>
                </div>
              </div>
            ))}
            {missions.length === 0 ? (
              <p className="text-xs text-white/40">No missions loaded (run migrate).</p>
            ) : null}
          </div>
        </section>

        <section className="rounded-xl border border-white/10 p-4 mb-6">
          <h2 className="font-semibold mb-3">Daily login rewards</h2>
          <div className="space-y-2">
            {dailyRewards.map((r, index) => (
              <div
                key={r.streak_day}
                className="grid grid-cols-[50px_1fr_1fr_1fr_70px] gap-2 items-center"
              >
                <span className="text-xs">Day {r.streak_day}</span>
                <input
                  type="number"
                  className={inputClass}
                  value={r.reward_xp}
                  onChange={(e) =>
                    setDailyRewards((cur) =>
                      cur.map((row, i) =>
                        i === index
                          ? { ...row, reward_xp: Number(e.target.value) || 0 }
                          : row,
                      ),
                    )
                  }
                />
                <input
                  type="number"
                  className={inputClass}
                  value={r.reward_promo_coins}
                  onChange={(e) =>
                    setDailyRewards((cur) =>
                      cur.map((row, i) =>
                        i === index
                          ? {
                              ...row,
                              reward_promo_coins: Number(e.target.value) || 0,
                            }
                          : row,
                      ),
                    )
                  }
                />
                <input
                  className={inputClass}
                  value={r.reward_label || ""}
                  onChange={(e) =>
                    setDailyRewards((cur) =>
                      cur.map((row, i) =>
                        i === index
                          ? { ...row, reward_label: e.target.value }
                          : row,
                      ),
                    )
                  }
                />
                <button
                  type="button"
                  disabled={busy}
                  className="py-2 rounded-lg bg-white/10 text-xs disabled:opacity-40"
                  onClick={() => {
                    void (async () => {
                      setBusy(true);
                      const { error } = await apiAdminProgressionSaveDailyReward(
                        r as unknown as Record<string, unknown>,
                      );
                      setBusy(false);
                      if (error) showToast(error);
                      else showToast("Daily reward saved");
                    })();
                  }}
                >
                  Save
                </button>
              </div>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <label className="text-white/40">
              Streak reset
              <select
                className={inputClass}
                value={dailyPolicy.streak_reset_policy}
                onChange={(e) =>
                  setDailyPolicy((p) => ({
                    ...p,
                    streak_reset_policy: e.target.value as
                      | "miss_one_day"
                      | "never",
                  }))
                }
              >
                <option value="miss_one_day">Miss one day</option>
                <option value="never">Never</option>
              </select>
            </label>
            <label className="text-white/40 flex items-center gap-2 mt-5">
              <input
                type="checkbox"
                checked={dailyPolicy.active}
                onChange={(e) =>
                  setDailyPolicy((p) => ({ ...p, active: e.target.checked }))
                }
              />
              Active
            </label>
            <label className="text-white/40">
              Effective start (ISO)
              <input
                className={inputClass}
                value={dailyPolicy.effective_start}
                onChange={(e) =>
                  setDailyPolicy((p) => ({
                    ...p,
                    effective_start: e.target.value,
                  }))
                }
              />
            </label>
            <label className="text-white/40">
              Effective end (ISO)
              <input
                className={inputClass}
                value={dailyPolicy.effective_end}
                onChange={(e) =>
                  setDailyPolicy((p) => ({
                    ...p,
                    effective_end: e.target.value,
                  }))
                }
              />
            </label>
          </div>
          <button
            type="button"
            disabled={busy}
            className="mt-2 px-3 py-2 rounded-lg bg-white/10 text-xs disabled:opacity-40"
            onClick={() => {
              void (async () => {
                setBusy(true);
                const { error } = await apiAdminProgressionSaveDailyPolicy({
                  streak_reset_policy: dailyPolicy.streak_reset_policy,
                  active: dailyPolicy.active,
                  effective_start: dailyPolicy.effective_start || null,
                  effective_end: dailyPolicy.effective_end || null,
                });
                setBusy(false);
                if (error) showToast(error);
                else showToast("Daily policy saved");
              })();
            }}
          >
            Save daily policy
          </button>
          <p className="text-[10px] text-white/30 mt-2">
            Claims already recorded keep the reward awarded at claim time.
          </p>
        </section>

        <section className="rounded-xl border border-white/10 p-4 mb-6">
          <h2 className="font-semibold mb-3">Battle Energy caps</h2>
          <p className="text-[10px] text-white/35 mb-2">
            Score/battle only — never affects Diamonds.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-3">
            {(
              [
                "watch_amount",
                "comment_amount",
                "share_amount",
                "watch_cap",
                "comment_cap",
                "share_cap",
                "storage_cap",
                "session_cap",
                "daily_cap",
                "minimum_boost",
                "fan_energy_threshold",
                "score_multiplier",
                "boost_duration_sec",
              ] as const
            ).map((key) => (
              <label key={key} className="text-[10px] text-white/40">
                {key}
                <input
                  type="number"
                  className={inputClass}
                  value={energyCaps[key]}
                  onChange={(e) =>
                    setEnergyCaps((c) => ({
                      ...c,
                      [key]: Number(e.target.value) || 0,
                    }))
                  }
                />
              </label>
            ))}
            <label className="text-[10px] text-white/40">
              allowed_boost_values (csv)
              <input
                className={inputClass}
                value={energyCaps.allowed_boost_values.join(",")}
                onChange={(e) =>
                  setEnergyCaps((c) => ({
                    ...c,
                    allowed_boost_values: e.target.value
                      .split(",")
                      .map((x) => Number(x.trim()))
                      .filter((n) => Number.isFinite(n) && n >= 1),
                  }))
                }
              />
            </label>
            <label className="text-xs flex items-center gap-1 mt-4">
              <input
                type="checkbox"
                checked={energyCaps.enabled}
                onChange={(e) =>
                  setEnergyCaps((c) => ({ ...c, enabled: e.target.checked }))
                }
              />
              Enabled
            </label>
          </div>
          <button
            type="button"
            disabled={busy}
            className="px-3 py-2 rounded-lg bg-[#F0C86B] text-white text-xs font-semibold disabled:opacity-40"
            onClick={() => {
              void (async () => {
                setBusy(true);
                const { caps, error } =
                  await apiAdminProgressionSaveBattleEnergyCaps(
                    energyCaps as unknown as Record<string, unknown>,
                  );
                setBusy(false);
                if (error) showToast(error);
                else {
                  if (caps) setEnergyCaps((prev) => ({ ...prev, ...caps }));
                  showToast("Energy caps saved");
                }
              })();
            }}
          >
            Save energy caps
          </button>
        </section>

        <section className="rounded-xl border border-white/10 p-4 mb-6">
          <h2 className="font-semibold mb-3">XP rewards</h2>
          <div className="space-y-2">
            {config.map((row, index) => (
              <div
                key={row.source}
                className="grid grid-cols-[1fr_110px_80px_70px] gap-2 items-center"
              >
                <div>
                  <div className="text-sm">{row.source}</div>
                  <div className="text-xs text-white/40">{row.description}</div>
                </div>
                <input
                  type="number"
                  min={0}
                  className={inputClass}
                  value={row.xp_amount}
                  onChange={(e) =>
                    setConfig((current) =>
                      current.map((item, i) =>
                        i === index
                          ? { ...item, xp_amount: Number(e.target.value) || 0 }
                          : item,
                      ),
                    )
                  }
                />
                <label className="text-xs flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={row.enabled}
                    onChange={(e) =>
                      setConfig((current) =>
                        current.map((item, i) =>
                          i === index
                            ? { ...item, enabled: e.target.checked }
                            : item,
                        ),
                      )
                    }
                  />
                  Enabled
                </label>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void saveConfig(row)}
                  className="py-2 rounded-lg bg-[#F0C86B] text-white text-xs font-semibold disabled:opacity-40"
                >
                  Save
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-white/10 p-4 mb-6">
          <h2 className="font-semibold mb-3">Level requirements</h2>
          <div className="max-h-80 overflow-y-auto space-y-2">
            {levels.map((row, index) => (
              <div
                key={row.level}
                className="grid grid-cols-[60px_140px_1fr_1fr_70px] gap-2 items-center"
              >
                <span className="text-sm">Level {row.level}</span>
                <input
                  type="number"
                  className={inputClass}
                  value={row.total_xp_required}
                  onChange={(e) =>
                    setLevels((current) =>
                      current.map((item, i) =>
                        i === index
                          ? {
                              ...item,
                              total_xp_required: Number(e.target.value) || 1,
                            }
                          : item,
                      ),
                    )
                  }
                />
                <input
                  className={inputClass}
                  placeholder="Title"
                  value={row.title || ""}
                  onChange={(e) =>
                    setLevels((current) =>
                      current.map((item, i) =>
                        i === index ? { ...item, title: e.target.value } : item,
                      ),
                    )
                  }
                />
                <input
                  className={inputClass}
                  placeholder="Badge code"
                  value={row.badge_code || ""}
                  onChange={(e) =>
                    setLevels((current) =>
                      current.map((item, i) =>
                        i === index
                          ? { ...item, badge_code: e.target.value }
                          : item,
                      ),
                    )
                  }
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void saveLevel(row)}
                  className="py-2 rounded-lg bg-white/10 text-xs disabled:opacity-40"
                >
                  Save
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-white/10 p-4">
          <h2 className="font-semibold mb-3 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[#F5F5F7]" />
            User audit & abuse correction
          </h2>
          <div className="flex gap-2 mb-4">
            <input
              className={`${inputClass} flex-1`}
              placeholder="User ID"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
            />
            <button
              type="button"
              onClick={() => void loadUser()}
              className="px-4 rounded-lg bg-white/10 text-sm"
            >
              Load
            </button>
          </div>

          {userProgression && (
            <>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="rounded-lg bg-white/5 p-3">
                  <div className="text-xs text-white/40">Starter Coins</div>
                  <div className="font-bold flex items-center gap-1">
                    <Coins className="w-4 h-4 text-[#D9A62E]" />
                    {userProgression.starter_coin_balance.toLocaleString()}
                  </div>
                </div>
                <div className="rounded-lg bg-white/5 p-3">
                  <div className="text-xs text-white/40">Total XP</div>
                  <div className="font-bold">
                    {userProgression.total_xp.toLocaleString()}
                  </div>
                </div>
                <div className="rounded-lg bg-white/5 p-3">
                  <div className="text-xs text-white/40">Level</div>
                  <div className="font-bold">
                    {userProgression.current_level}
                  </div>
                </div>
              </div>

              <div className="grid md:grid-cols-[140px_1fr_auto_auto] gap-2 mb-5">
                <input
                  type="number"
                  className={inputClass}
                  placeholder="+/- amount"
                  value={adjustment.amount}
                  onChange={(e) =>
                    setAdjustment({ ...adjustment, amount: e.target.value })
                  }
                />
                <input
                  className={inputClass}
                  placeholder="Required audit reason"
                  value={adjustment.reason}
                  onChange={(e) =>
                    setAdjustment({ ...adjustment, reason: e.target.value })
                  }
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void adjust("xp")}
                  className="px-3 rounded-lg bg-white/10 text-xs disabled:opacity-40"
                >
                  Adjust XP
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void adjust("starter")}
                  className="px-3 rounded-lg bg-[#F0C86B] text-white text-xs font-semibold disabled:opacity-40"
                >
                  Adjust Starter
                </button>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <h3 className="text-sm font-semibold mb-2">XP history</h3>
                  <div className="max-h-64 overflow-y-auto text-xs space-y-1">
                    {xpHistory.map((row) => (
                      <div
                        key={String(row.id)}
                        className="border-b border-white/5 py-1"
                      >
                        {Number(row.xp_amount) > 0 ? "+" : ""}
                        {String(row.xp_amount)} XP · {String(row.source)} ·{" "}
                        {String(row.created_at)}
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-semibold mb-2">
                    Starter Coin history
                  </h3>
                  <div className="max-h-64 overflow-y-auto text-xs space-y-1">
                    {starterHistory.map((row) => (
                      <div
                        key={String(row.id)}
                        className="border-b border-white/5 py-1"
                      >
                        {Number(row.amount_delta) > 0 ? "+" : ""}
                        {String(row.amount_delta)} · {String(row.kind)} · balance{" "}
                        {String(row.balance_after)}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </section>

        <section className="rounded-xl border border-white/10 p-4 mb-6">
          <h2 className="font-semibold mb-3">Engagement admin audit</h2>
          <div className="max-h-64 overflow-y-auto text-[10px] space-y-1 text-white/50">
            {auditEntries.length === 0 ? (
              <p>No audit rows loaded.</p>
            ) : (
              auditEntries.map((row) => (
                <div key={String(row.id)} className="border-b border-white/5 py-1">
                  {String(row.created_at)} · {String(row.admin_user_id)} ·{" "}
                  {String(row.action)} · {String(row.target)}
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
