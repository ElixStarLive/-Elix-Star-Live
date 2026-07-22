import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Coins, ShieldCheck, Sparkles } from "lucide-react";
import { request } from "../../lib/apiClient";
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

  useEffect(() => {
    void loadConfig();
  }, []);

  const loadConfig = async () => {
    const [configRes, levelsRes] = await Promise.all([
      request("/api/admin/progression/config"),
      request("/api/admin/progression/levels"),
    ]);
    if (configRes.error || levelsRes.error) {
      showToast(
        configRes.error?.message ||
          levelsRes.error?.message ||
          "Failed to load progression controls",
      );
      return;
    }
    setConfig(configRes.data?.config || []);
    setLevels(levelsRes.data?.levels || []);
  };

  const saveConfig = async (row: XpConfig) => {
    setBusy(true);
    try {
      const { error } = await request("/api/admin/progression/config", {
        method: "PATCH",
        body: JSON.stringify(row),
      });
      if (error) {
        showToast(error.message);
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
      const { error } = await request("/api/admin/progression/levels", {
        method: "PUT",
        body: JSON.stringify(row),
      });
      if (error) {
        showToast(error.message);
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
    const { data, error } = await request(
      `/api/admin/progression/users/${encodeURIComponent(userId.trim())}`,
    );
    if (error) {
      showToast(error.message);
      return;
    }
    setUserProgression(data?.progression || null);
    setXpHistory(data?.xp_history || []);
    setStarterHistory(data?.starter_history || []);
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
      const { error } = await request(
        `/api/admin/progression/${endpoint}`,
        {
          method: "POST",
          body: JSON.stringify({
            user_id: userId.trim(),
            amount_delta: amount,
            reason: adjustment.reason.trim(),
            idempotency_key: crypto.randomUUID(),
          }),
        },
      );
      if (error) {
        showToast(error.message);
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
    <div className="min-h-screen bg-[#111111] text-white p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="w-7 h-7 text-[#C9A227]" />
            Starter Coins & XP
          </h1>
          <button
            type="button"
            onClick={() => navigate("/admin")}
            className="text-sm text-white/60"
          >
            Back
          </button>
        </div>

        <section className="rounded-xl border border-[#C9A227]/25 bg-[#C9A227]/5 p-4 mb-6 text-sm text-white/70">
          <p className="font-semibold text-[#C9A227] mb-1">Engagement Phase 1 + 1.5 (live)</p>
          <p className="mb-2">
            Migrations:{" "}
            <code className="text-white/50">20260722190000_engagement_phase1.sql</code>,{" "}
            <code className="text-white/50">20260722200000_engagement_phase15_collections.sql</code>.
            Run Coolify release <code className="text-white/50">npm run migrate</code>.
          </p>
          <p>
            Promo / Energy / Treasure / Stickers / Creator cards are ON by default.
            Battle Energy affects battle score only. Promo gifts create zero Diamonds.
          </p>
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
                  className="py-2 rounded-lg bg-[#C9A227] text-black text-xs font-semibold disabled:opacity-40"
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
            <ShieldCheck className="w-5 h-5 text-[#C9A227]" />
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
                    <Coins className="w-4 h-4 text-[#C9A227]" />
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
                  className="px-3 rounded-lg bg-[#C9A227] text-black text-xs font-semibold disabled:opacity-40"
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
      </div>
    </div>
  );
}
