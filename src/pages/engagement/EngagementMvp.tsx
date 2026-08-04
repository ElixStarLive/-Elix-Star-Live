import React, { useEffect, useState } from "react";
import { Crown } from "lucide-react";
import { EngagementShell } from "./EngagementShell";
import { showToast } from "../../lib/toast";
import { apiEngagementMvp } from "../../features/live/engagement/liveEngagementApi";

type Row = { rank: number; user_id: string; points: number };

export default function EngagementMvp() {
  const [period, setPeriod] = useState<"today" | "week" | "all">("today");
  const [rows, setRows] = useState<Row[]>([]);
  const [viewerId, setViewerId] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const { data, error } = await apiEngagementMvp(period);
        if (error) throw new Error(error);
        setRows((data?.leaderboard as Row[]) || []);
        setViewerId(String(data?.viewer_id || ""));
      } catch {
        showToast("Could not load MVP board");
      } finally {
        setLoading(false);
      }
    })();
  }, [period]);

  return (
    <EngagementShell title="MVP Leaderboard" icon={Crown}>
      <div className="flex gap-2 mb-4">
        {(
          [
            ["today", "Today"],
            ["week", "Week"],
            ["all", "All"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setPeriod(id)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold border ${
              period === id
                ? "border-[#D4AF37] bg-[#D4AF37]/20 text-[#D4AF37]"
                : "border-white/15 text-white/60"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-white/40 mb-3">
        Live room MVP circles stay on the stream. This board is session/day/week
        aggregates from gift support. Battle Energy boosts Fan Energy separately.
      </p>
      {loading ? (
        <div className="py-10 text-center text-white/50 text-sm">Loading...</div>
      ) : rows.length === 0 ? (
        <div className="py-10 text-center text-white/50 text-sm">
          No MVP scores yet.
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {rows.map((r) => {
            const mine = viewerId && r.user_id === viewerId;
            return (
              <div
                key={`${r.rank}-${r.user_id}`}
                className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
                  mine
                    ? "border-[#D4AF37]/40 bg-[#D4AF37]/10"
                    : "border-white/10 bg-white/[0.03]"
                }`}
              >
                <span className="w-7 text-sm font-bold text-[#D4AF37] tabular-nums">
                  #{r.rank}
                </span>
                <span className="flex-1 text-sm text-white/80 truncate">
                  {mine ? "You" : r.user_id.slice(0, 10)}
                </span>
                <span className="text-sm font-semibold tabular-nums text-white/90">
                  {r.points}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </EngagementShell>
  );
}
