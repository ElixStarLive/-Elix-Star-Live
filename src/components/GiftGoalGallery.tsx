import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Gift, Target } from "lucide-react";
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

const GOAL_COUNT_MIN = 1;
const GOAL_COUNT_MAX = 20_000;
/** How many gifts show in the top strip at once. */
const GALLERY_VISIBLE = 4;
/** Auto-advance one gift so people see the full gallery. */
const GALLERY_AUTO_MS = 2800;

function clampGoalCount(n: number) {
  if (!Number.isFinite(n)) return GOAL_COUNT_MIN;
  return Math.max(GOAL_COUNT_MIN, Math.min(GOAL_COUNT_MAX, Math.floor(n)));
}

function giftPanelSort(a: GiftItem, b: GiftItem) {
  const typeRank = (t: GiftItem["giftType"]) =>
    t === "universe" ? 0 : t === "big" ? 1 : t === "small" ? 2 : 3;
  const tr = typeRank(a.giftType) - typeRank(b.giftType);
  if (tr !== 0) return tr;
  return a.coins - b.coins;
}

export function GiftGoalGallery(props: Props) {
  const [gifts, setGifts] = useState<GiftItem[]>([]);
  const [loading, setLoading] = useState(true);
  /** Start index into gallery — advances one gift at a time. */
  const [startIndex, setStartIndex] = useState(0);
  const pauseAutoUntilRef = useRef(0);

  const selectedGiftId = props.mode === "picker" ? props.selectedGiftId : null;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    // Same catalog source as GiftPanel — include every panel gift.
    fetchGiftsFromDatabase()
      .then((items) => {
        if (!cancelled) setGifts(items);
      })
      .catch(() => {
        if (!cancelled) setGifts([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const galleryGifts = useMemo(() => [...gifts].sort(giftPanelSort), [gifts]);
  const maxStart = Math.max(0, galleryGifts.length - GALLERY_VISIBLE);

  useEffect(() => {
    setStartIndex((i) => Math.min(i, Math.max(0, galleryGifts.length - GALLERY_VISIBLE)));
  }, [galleryGifts.length]);

  // One-by-one auto scroll through the gallery (pauses briefly after manual arrows).
  useEffect(() => {
    if (props.mode !== "picker") return;
    if (galleryGifts.length <= GALLERY_VISIBLE) return;
    const id = window.setInterval(() => {
      if (Date.now() < pauseAutoUntilRef.current) return;
      setStartIndex((i) => {
        const cap = Math.max(0, galleryGifts.length - GALLERY_VISIBLE);
        if (cap <= 0) return 0;
        return i >= cap ? 0 : i + 1;
      });
    }, GALLERY_AUTO_MS);
    return () => window.clearInterval(id);
  }, [props.mode, galleryGifts.length]);

  // Keep selected gift visible when it changes from outside.
  useEffect(() => {
    if (!selectedGiftId || galleryGifts.length === 0) return;
    const idx = galleryGifts.findIndex((g) => g.id === selectedGiftId);
    if (idx < 0) return;
    setStartIndex((cur) => {
      if (idx >= cur && idx < cur + GALLERY_VISIBLE) return cur;
      return Math.max(0, Math.min(maxStart, idx - Math.floor(GALLERY_VISIBLE / 2)));
    });
  }, [selectedGiftId, galleryGifts, maxStart]);

  const pauseAuto = () => {
    pauseAutoUntilRef.current = Date.now() + 6000;
  };

  const stepGallery = (dir: -1 | 1) => {
    pauseAuto();
    setStartIndex((i) => {
      const cap = Math.max(0, galleryGifts.length - GALLERY_VISIBLE);
      return Math.max(0, Math.min(cap, i + dir));
    });
  };

  if (props.mode === "readonly") {
    const { goal, onSend } = props;
    const pct = giftGoalProgressPct(goal);
    return (
      <div className="bg-white/5 rounded-xl p-3 border border-[#D8D9DD]/20">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-gold-metallic font-bold text-[10px] flex items-center gap-1">
            <Target className="w-3 h-3 text-[#F5F5F7]" strokeWidth={2.5} />
            Gift Goal
          </h3>
          <span className="text-[#F5F5F7] text-[9px] font-bold tabular-nums">
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
            <Gift className="w-8 h-8 text-[#F5F5F7]" strokeWidth={2} />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-white text-[11px] font-bold truncate">{goal.giftName}</p>
            <p className="text-white/50 text-[9px]">Help reach the goal!</p>
          </div>
        </div>
        <div className="h-1.5 rounded-full bg-white/10 overflow-hidden mb-2">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#D8D9DD] to-[#D8D9DD] transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        {onSend && (
          <button
            type="button"
            onClick={onSend}
            className="w-full py-2 bg-gradient-to-r from-[#D8D9DD] to-[#D8D9DD] text-black font-bold text-[10px] uppercase tracking-wide rounded-xl active:scale-[0.98] transition-all"
          >
            Send {goal.giftName}
          </button>
        )}
      </div>
    );
  }

  const {
    targetCount,
    onSelectGift,
    onTargetCountChange,
    onSave,
    onClear,
    saving,
  } = props;

  const selectedGift = galleryGifts.find((g) => g.id === selectedGiftId) ?? null;
  const safeTargetCount = clampGoalCount(targetCount);
  const safeStart = Math.min(startIndex, maxStart);
  const visibleGifts = galleryGifts.slice(safeStart, safeStart + GALLERY_VISIBLE);
  const canPrev = safeStart > 0;
  const canNext = safeStart < maxStart;

  return (
    <div className="bg-white/5 rounded-xl p-3 border border-[#D8D9DD]/20">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-gold-metallic font-bold text-[10px] flex items-center gap-1">
          <Gift className="w-3 h-3 text-[#F5F5F7]" strokeWidth={2.5} />
          Gift Goal Gallery
        </h3>
        <span className="text-white/40 text-[8px]">
          {galleryGifts.length > 0
            ? `${safeStart + 1}–${Math.min(galleryGifts.length, safeStart + GALLERY_VISIBLE)} / ${galleryGifts.length}`
            : "Pick a gift for fans to send"}
        </span>
      </div>

      {loading ? (
        <p className="text-white/40 text-[9px] text-center py-4">Loading gifts...</p>
      ) : galleryGifts.length === 0 ? (
        <p className="text-white/40 text-[9px] text-center py-4">No gifts available</p>
      ) : (
        <div className="flex items-center gap-1 mb-2">
          <button
            type="button"
            title="Previous gift"
            disabled={!canPrev}
            onClick={() => stepGallery(-1)}
            className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-full border border-[#2A2D33] bg-black/35 active:scale-95 disabled:opacity-35"
          >
            <ChevronLeft size={16} className="text-[#F5F5F7]" strokeWidth={2.4} />
          </button>
          <div className="grid grid-cols-4 gap-1.5 flex-1 min-w-0">
            {visibleGifts.map((gift) => (
              <button
                key={gift.id}
                type="button"
                onClick={() => {
                  pauseAuto();
                  onSelectGift(gift);
                }}
                className={[
                  "aspect-square rounded-lg border p-1 flex flex-col items-center justify-center gap-0.5 active:scale-95 transition-all",
                  selectedGiftId === gift.id
                    ? "border-[#D8D9DD] bg-white/10"
                    : "border-[#D8D9DD]/15 bg-white/5 hover:bg-white/10",
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
          <button
            type="button"
            title="Next gift"
            disabled={!canNext}
            onClick={() => stepGallery(1)}
            className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-full border border-[#2A2D33] bg-black/35 active:scale-95 disabled:opacity-35"
          >
            <ChevronRight size={16} className="text-[#F5F5F7]" strokeWidth={2.4} />
          </button>
        </div>
      )}

      <div className="flex items-center justify-center gap-2 mb-2">
        <button
          type="button"
          title="Decrease goal count"
          disabled={safeTargetCount <= GOAL_COUNT_MIN}
          onClick={() => onTargetCountChange(clampGoalCount(safeTargetCount - 1))}
          className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-full border border-[#2A2D33] bg-black/35 active:scale-95 disabled:opacity-35"
        >
          <ChevronLeft size={16} className="text-[#F5F5F7]" strokeWidth={2.4} />
        </button>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          aria-label="Gift goal count"
          value={String(safeTargetCount)}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, "");
            if (!digits) {
              onTargetCountChange(GOAL_COUNT_MIN);
              return;
            }
            onTargetCountChange(clampGoalCount(Number(digits)));
          }}
          className="w-[72px] h-8 text-center rounded-full border border-[#D8D9DD] bg-transparent text-[#F5F5F7] text-[11px] font-bold tabular-nums outline-none"
        />
        <button
          type="button"
          title="Increase goal count"
          disabled={safeTargetCount >= GOAL_COUNT_MAX}
          onClick={() => onTargetCountChange(clampGoalCount(safeTargetCount + 1))}
          className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-full border border-[#2A2D33] bg-black/35 active:scale-95 disabled:opacity-35"
        >
          <ChevronRight size={16} className="text-[#F5F5F7]" strokeWidth={2.4} />
        </button>
      </div>

      {selectedGift && (
        <p className="text-white/50 text-[8px] mb-2 text-center">
          Goal: {safeTargetCount} × {selectedGift.name} ({selectedGift.coins.toLocaleString()} coins each)
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={!selectedGift || saving}
          onClick={onSave}
          className="flex-1 py-2 bg-gradient-to-r from-[#D8D9DD] to-[#D8D9DD] text-black font-bold text-[10px] uppercase tracking-wide rounded-xl active:scale-[0.98] transition-all disabled:opacity-50"
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
