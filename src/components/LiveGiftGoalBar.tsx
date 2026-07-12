import React from "react";
import { resolveGiftAssetUrl } from "../lib/giftsCatalog";
import {
  giftGoalProgressPct,
  giftGoalRemaining,
  isGiftGoalComplete,
  type LiveGiftGoal,
} from "../lib/liveGiftGoal";

type Props = {
  goal: LiveGiftGoal;
  onTap?: () => void;
  showSend?: boolean;
};

export function LiveGiftGoalBar({ goal, onTap, showSend = true }: Props) {
  const pct = giftGoalProgressPct(goal);
  const done = isGiftGoalComplete(goal);
  const remaining = giftGoalRemaining(goal);

  return (
    <button
      type="button"
      onClick={onTap}
      className="pointer-events-auto flex items-center gap-2 max-w-[min(240px,72vw)] px-2 py-1.5 rounded-full bg-[#111111]/85 border border-[#C9A227]/35 backdrop-blur-md active:scale-[0.98] transition-transform shadow-lg"
    >
      {goal.giftIcon ? (
        <img
          src={resolveGiftAssetUrl(goal.giftIcon)}
          alt=""
          className="w-7 h-7 object-contain flex-shrink-0"
        />
      ) : null}
      <div className="flex-1 min-w-0 text-left">
        <p className="text-[9px] font-bold text-white truncate leading-tight">
          {done ? "Goal reached!" : goal.giftName}
        </p>
        <div className="h-1 rounded-full bg-white/15 overflow-hidden mt-0.5">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#D4AF37] to-[#E8D5A3] transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      <span className="text-[9px] font-bold text-[#D4AF37] tabular-nums flex-shrink-0">
        {done ? "✓" : `${remaining}`}
      </span>
      {showSend && !done && (
        <span className="text-[8px] font-bold text-black bg-[#D4AF37] px-1.5 py-0.5 rounded-full flex-shrink-0">
          Send
        </span>
      )}
    </button>
  );
}
