import React, { useEffect, useState } from "react";
import { Users, Sparkles, X } from "lucide-react";
import {
  type EngagementMilestoneEvent,
  type EngagementPublicState,
} from "../lib/liveEngagement";

type Props = {
  state: EngagementPublicState;
  nowMs: number;
  milestoneFlash: EngagementMilestoneEvent | null;
  stageFlash: number | null;
  onVote?: (optionIndex: number) => void;
};

/**
 * Live engagement sheets + flashes only.
 * Top Power / Results / Ranks / streak chips removed — they covered the battle bar.
 * Poll opens from the bottom Poll control via `elix-open-live-poll`.
 */
export function LiveEngagementOverlay({
  state,
  nowMs: _nowMs,
  milestoneFlash,
  stageFlash,
  onVote,
}: Props) {
  const [showLb, setShowLb] = useState(false);
  const [showPollSheet, setShowPollSheet] = useState(false);
  const features = state.features;

  const hasVoted =
    !!state.poll &&
    !!state.me?.userId &&
    state.poll.votedUserIds.includes(state.me.userId);

  const pollId = state.poll?.id ?? null;
  useEffect(() => {
    if (pollId) setShowPollSheet(false);
  }, [pollId]);

  useEffect(() => {
    const openPoll = () => {
      if (features.poll && state.poll) {
        setShowPollSheet(true);
        return;
      }
      try {
        window.dispatchEvent(
          new CustomEvent("elix-toast", {
            detail: { message: "No active poll right now" },
          }),
        );
      } catch {
        /* ignore */
      }
    };
    const openLb = () => {
      if (features.leaderboard) setShowLb(true);
    };
    window.addEventListener("elix-open-live-poll", openPoll);
    window.addEventListener("elix-open-live-ranks", openLb);
    return () => {
      window.removeEventListener("elix-open-live-poll", openPoll);
      window.removeEventListener("elix-open-live-ranks", openLb);
    };
  }, [features.poll, features.leaderboard, state.poll]);

  if (!milestoneFlash && stageFlash == null && !showLb && !showPollSheet) {
    return null;
  }

  return (
    <>
      {showPollSheet && state.poll && features.poll ? (
        <>
          <div
            className="fixed inset-0 bg-black/40 pointer-events-auto z-[99998]"
            onClick={() => setShowPollSheet(false)}
          />
          <div className="fixed bottom-0 left-0 right-0 z-[99999] pointer-events-auto max-w-[480px] mx-auto">
            <div
              className="bg-[#111111]/95 rounded-t-2xl p-3 pb-safe max-h-[40vh] flex flex-col shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-center mb-2">
                <div className="w-10 h-1 bg-white/20 rounded-full" />
              </div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Sparkles className="w-3.5 h-3.5 text-[#D4AF37] flex-shrink-0" />
                  <span className="text-sm font-bold text-white truncate">
                    {state.poll.kind === "trivia" ? "Trivia" : "Live poll"}
                  </span>
                </div>
                <button type="button" className="p-1" onClick={() => setShowPollSheet(false)}>
                  <X className="w-4 h-4 text-white/60" />
                </button>
              </div>
              <p className="text-white text-[12px] font-semibold mb-2">{state.poll.question}</p>
              <div className="flex-1 overflow-y-auto no-scrollbar flex flex-col gap-1.5">
                {state.poll.options.map((opt, i) => {
                  const total = state.poll!.votes.reduce((a, b) => a + b, 0) || 1;
                  const pct = Math.round(((state.poll!.votes[i] || 0) / total) * 100);
                  return (
                    <button
                      key={`${state.poll!.id}-${i}`}
                      type="button"
                      disabled={hasVoted}
                      onClick={() => {
                        onVote?.(i);
                      }}
                      className="relative overflow-hidden rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-left disabled:opacity-90 active:scale-[0.99]"
                    >
                      <div
                        className="absolute inset-y-0 left-0 bg-[#D4AF37]/25"
                        style={{ width: hasVoted ? `${pct}%` : "0%" }}
                      />
                      <div className="relative flex justify-between gap-2">
                        <span className="text-[12px] font-bold text-white">{opt}</span>
                        {hasVoted ? (
                          <span className="text-[11px] text-[#D4AF37] tabular-nums font-bold">{pct}%</span>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      ) : null}

      {showLb ? (
        <>
          <div
            className="fixed inset-0 bg-black/40 pointer-events-auto z-[99998]"
            onClick={() => setShowLb(false)}
          />
          <div className="fixed bottom-0 left-0 right-0 z-[99999] pointer-events-auto max-w-[480px] mx-auto">
            <div
              className="bg-[#111111]/95 rounded-t-2xl p-3 pb-safe h-[40dvh] max-h-[40dvh] flex flex-col shadow-2xl w-full overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-center mb-2">
                <div className="w-10 h-1 bg-white/20 rounded-full" />
              </div>
              <div className="flex items-center justify-between mb-2 flex-shrink-0">
                <div className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-[#D4AF37]" />
                  <span className="text-sm font-bold text-white">Current live</span>
                </div>
                <button type="button" onClick={() => setShowLb(false)} className="p-1">
                  <X className="w-4 h-4 text-white/60" />
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar">
                {state.leaderboard.length === 0 ? (
                  <p className="text-white/40 text-xs text-center py-6">No rankings yet — keep watching</p>
                ) : (
                  state.leaderboard.map((row, i) => (
                    <div key={row.userId} className="flex items-center gap-2 py-1.5">
                      <span className="w-5 text-[10px] font-bold text-white/40 tabular-nums">{i + 1}</span>
                      <div className="w-7 h-7 rounded-full overflow-hidden bg-white/10 flex-shrink-0">
                        {row.avatarUrl ? (
                          <img src={row.avatarUrl} alt="" className="w-full h-full object-cover" />
                        ) : null}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-[11px] font-semibold truncate">{row.username}</p>
                        {row.title ? (
                          <p className="text-[8px] text-[#D4AF37] truncate">{row.title}</p>
                        ) : null}
                      </div>
                      <span className="text-[10px] font-bold text-[#F5E6A8] tabular-nums">{row.score}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </>
      ) : null}

      {(milestoneFlash || stageFlash != null) && (
        <div className="pointer-events-none fixed inset-0 z-[100] flex items-start justify-center pt-[28%] max-w-[480px] mx-auto">
          <div className="px-4 py-3 rounded-2xl bg-[#111111]/92 border border-[#D4AF37]/50 shadow-[0_0_24px_rgba(212,175,55,0.35)]">
            {milestoneFlash ? (
              <p className="text-[#F5E6A8] text-sm font-black text-center">
                {milestoneFlash.milestones.map((m) => `${m}m`).join(", ")} streak!
                {milestoneFlash.title ? ` · ${milestoneFlash.title}` : ""}
              </p>
            ) : (
              <p className="text-[#F5E6A8] text-sm font-black text-center">
                Community Stage {stageFlash} unlocked!
              </p>
            )}
            <p className="text-white/50 text-[9px] text-center mt-1">Digital XP only — no cash value</p>
          </div>
        </div>
      )}
    </>
  );
}
