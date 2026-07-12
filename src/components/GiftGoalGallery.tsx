import React, { useMemo, useState } from "react";
import { Gift, Target } from "lucide-react";
import {
  fetchGiftsFromDatabase,
  resolveGiftAssetUrl,
  type GiftItem,
} from "../lib/giftsCatalog";
import { giftGoalProgressPct, type LiveGiftGoal } from "../lib/liveGiftGoal";

type PickerProps = {
  mode: "picker";
  selectedGiftId: string | null;
  targetCount: number;
  onSelectGift: (gift: GiftItem) => void;
  onTargetCountChange: (count: number) => void;
  onSave: () => void;
  onClear: () => void;
  saving?: boolean;
};

type ReadonlyProps = {
  mode: "readonly";
  goal: LiveGiftGoal;
  onSend?: () => void;
};

type Props = PickerProps | ReadonlyProps;

const GOAL_TARGETS = [10, 25, 50, 100, 200];

export function GiftGoalGallery(props: Props) {
  const [gifts, setGifts] = useState<GiftItem[]>([]);
  const [loading, setLoading] = useState(true);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchGiftsFromDatabase()
      .then((items) => {
        if (!cancelled) setGifts(items.filter((g) => g.isActive));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const galleryGifts = useMemo(
    () => [...gifts].sort((a, b) => a.coins - b.coins).slice(0, 16),
    [gifts],
  );

  if (props.mode === "readonly") {
    const { goal, onSend } = props;
    const pct = giftGoalProgressPct(goal);
    return (
      <div className="bg-white/5 rounded-xl p-3 border border-[#C9A227]/20">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-gold-metallic font-bold text-[10px] flex items-center gap-1">
            <Target className="w-3 h-3 text-[#D4AF37]" strokeWidth={2.5} />
            Gift Goal
          </h3>
          <span className="text-[#D4AF37] text-[9px] font-bold tabular-nums">
            {goal.currentCount}/{goal.targetCount}
          </span>
        </div>
        <div className="flex items-center gap-2 mb-2">
          {goal.giftIcon ? (
            <img
              src={resolveGiftAssetUrl(goal.giftIcon)}
              alt=""
              className="w-10 h-10 object-contain flex-shrink-0"
            />
          ) : (
            <Gift className="w-8 h-8 text-[#D4AF37]" strokeWidth={2} />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-white text-[11px] font-bold truncate">{goal.giftName}</p>
            <p className="text-white/50 text-[9px]">Help reach the goal!</p>
          </div>
        </div>
        <div className="h-1.5 rounded-full bg-white/10 overflow-hidden mb-2">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#D4AF37] to-[#E8D5A3] transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        {onSend && (
          <button
            type="button"
            onClick={onSend}
            className="w-full py-2 bg-gradient-to-r from-[#D4AF37] to-[#E8D5A3] text-black font-bold text-[10px] uppercase tracking-wide rounded-xl active:scale-[0.98] transition-all"
          >
            Send {goal.giftName}
          </button>
        )}
      </div>
    );
  }

  const {
    selectedGiftId,
    targetCount,
    onSelectGift,
    onTargetCountChange,
    onSave,
    onClear,
    saving,
  } = props;

  const selectedGift = galleryGifts.find((g) => g.id === selectedGiftId) ?? null;

  return (
    <div className="bg-white/5 rounded-xl p-3 border border-[#C9A227]/20">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-gold-metallic font-bold text-[10px] flex items-center gap-1">
          <Gift className="w-3 h-3 text-[#D4AF37]" strokeWidth={2.5} />
          Gift Goal Gallery
        </h3>
        <span className="text-white/40 text-[8px]">Pick a gift for fans to send</span>
      </div>

      {loading ? (
        <p className="text-white/40 text-[9px] text-center py-4">Loading gifts...</p>
      ) : (
        <div className="grid grid-cols-4 gap-1.5 mb-2">
          {galleryGifts.map((gift) => (
            <button
              key={gift.id}
              type="button"
              onClick={() => onSelectGift(gift)}
              className={[
                "aspect-square rounded-lg border p-1 flex flex-col items-center justify-center gap-0.5 active:scale-95 transition-all",
                selectedGiftId === gift.id
                  ? "border-[#D4AF37] bg-[#C9A227]/15"
                  : "border-[#C9A227]/15 bg-white/5 hover:bg-white/10",
              ].join(" ")}
            >
              <img
                src={resolveGiftAssetUrl(gift.icon)}
                alt=""
                className="w-full h-full object-contain pointer-events-none"
                draggable={false}
              />
              <span className="text-[7px] text-white/80 truncate w-full text-center">{gift.name}</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 mb-2">
        {GOAL_TARGETS.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onTargetCountChange(n)}
            className={[
              "px-2 py-0.5 rounded-full text-[9px] font-bold border active:scale-95 transition-all",
              targetCount === n
                ? "bg-[#C9A227]/25 border-[#D4AF37] text-[#D4AF37]"
                : "bg-white/5 border-white/10 text-white/60",
            ].join(" ")}
          >
            {n}
          </button>
        ))}
      </div>

      {selectedGift && (
        <p className="text-white/50 text-[8px] mb-2 text-center">
          Goal: {targetCount} × {selectedGift.name} ({selectedGift.coins.toLocaleString()} coins each)
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={!selectedGift || saving}
          onClick={onSave}
          className="flex-1 py-2 bg-gradient-to-r from-[#D4AF37] to-[#E8D5A3] text-black font-bold text-[10px] uppercase tracking-wide rounded-xl active:scale-[0.98] transition-all disabled:opacity-50"
        >
          {saving ? "Saving..." : "Set Goal"}
        </button>
        <button
          type="button"
          onClick={onClear}
          className="px-3 py-2 rounded-xl border border-white/15 text-white/60 text-[10px] font-bold active:scale-95"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
