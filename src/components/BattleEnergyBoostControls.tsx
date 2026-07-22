import React, { useCallback, useRef, useState } from "react";
import { Zap } from "lucide-react";
import { request } from "../lib/apiClient";
import { showToast } from "../lib/toast";
import { engagementFlags } from "../config/engagementFlags";

/**
 * Minimal Battle Energy BOOST control for live battle chrome.
 * Behind battleEnergyEnabled — Fan Energy is separate from gift score /
 * Purchased Coins / Diamonds. Server decides multiplier; client never applies it.
 */
export function BattleEnergyBoostControls({
  roomId,
  preferredSide = "host",
}: {
  roomId: string;
  preferredSide?: "host" | "opponent";
}) {
  const [busy, setBusy] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const inflight = useRef(false);

  const boost = useCallback(
    async (side: "host" | "opponent") => {
      if (!roomId || inflight.current || !engagementFlags.battleEnergyEnabled) return;
      inflight.current = true;
      setBusy(true);
      try {
        const { data, error } = await request("/api/engagement/battle-energy/boost", {
          method: "POST",
          body: JSON.stringify({ roomId, side, amount: 100 }),
        });
        if (error) {
          showToast(
            String(error.message || "").includes("INSUFFICIENT")
              ? "Not enough Battle Energy"
              : "Boost unavailable",
          );
          return;
        }
        if (typeof data?.remainingEnergy === "number") {
          setBalance(data.remainingEnergy);
        }
        showToast(
          data?.boostActivated
            ? `Boost active ×${data.boostMultiplier || 1.2} (battle score only)`
            : `Boosted ${side} (+Fan Energy)`,
        );
      } finally {
        inflight.current = false;
        setBusy(false);
      }
    },
    [roomId],
  );

  if (!roomId || !engagementFlags.battleEnergyEnabled) return null;

  return (
    <div className="pointer-events-auto flex items-center gap-1.5">
      <button
        type="button"
        disabled={busy}
        onClick={(e) => {
          e.stopPropagation();
          void boost(preferredSide);
        }}
        className="flex items-center gap-1 rounded-full bg-black/50 border border-[#C9A227]/45 px-2 py-1 active:scale-95 disabled:opacity-50"
        title="Spend Battle Energy to boost creator Fan Energy (battle score only — never Diamonds)"
      >
        <Zap size={11} className="text-[#C9A227]" fill="#C9A227" />
        <span className="text-[9px] font-black text-[#C9A227] tracking-wide">
          BOOST
        </span>
        {balance != null ? (
          <span className="text-[8px] text-white/70 tabular-nums">{balance}</span>
        ) : null}
      </button>
    </div>
  );
}

/** Fire-and-forget capped energy earn (watch/comment/share). No-op when flag off. */
export function earnBattleEnergyQuiet(
  source: "watch" | "comment" | "share",
  roomId?: string,
): void {
  if (!engagementFlags.battleEnergyEnabled) return;
  void request("/api/engagement/battle-energy/earn", {
    method: "POST",
    body: JSON.stringify({ source, roomId }),
  }).catch(() => {});
}
