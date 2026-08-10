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
            className="fixed inset-0 bg-black/35 pointer-events-auto z-[99998]"
            onClick={() => setShowPollSheet(false)}
          />
          <div className="fixed bottom-0 left-0 right-0 z-[99999] pointer-events-auto max-w-[480px] mx-auto">
            <div
              className="elix-panel elix-live-sheet rounded-t-2xl p-3 pb-safe max-h-[40vh] flex flex-col shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="relative flex flex-col px-1 pt-0 pb-2 border-b border-white/10 mb-2">
                <div className="flex justify-center pb-2" aria-hidden>
                  <div className="w-10 h-1 rounded-full bg-white/25" />
                </div>
                <span className="text-sm font-bold text-[#F5F5F7] text-center w-full">
                  {state.poll.kind === "trivia" ? "Trivia" : "Live poll"}
                  {state.poll.endsAt && _nowMs >= state.poll.endsAt
                    ? " · Ended"
                    : ""}
                </span>
                <button type="button" className="absolute right-1 top-[26px] p-1" onClick={() => setShowPollSheet(false)}>
                  <X className="w-4 h-4 text-white/60" />
                </button>
              </div>
              <p className="text-white text-[12px] font-semibold mb-2">{state.poll.question}</p>
              <div className="flex-1 overflow-y-auto no-scrollbar flex flex-col gap-1.5">
                {(() => {
                  const poll = state.poll;
                  if (!poll) return null;
                  return poll.options.map((opt, i) => {
                  const total = poll.votes.reduce((a, b) => a + b, 0) || 1;
                  const pct = Math.round(((poll.votes[i] || 0) / total) * 100);
                  const ended =
                    !!poll.endsAt && _nowMs >= poll.endsAt;
                  return (
                    <button
                      key={`${poll.id}-${i}`}
                      type="button"
                      disabled={hasVoted || ended}
                      onClick={() => {
                        if (ended || hasVoted) return;
                        onVote?.(i);
                      }}
                      className="relative overflow-hidden rounded-xl border border-[#2A2D33] bg-white/5 px-3 py-2.5 text-left disabled:opacity-90 active:scale-[0.99]"
                    >
                      <div
                        className="absolute inset-y-0 left-0 bg-[#E6E9EE]/25"
                        style={{ width: hasVoted || ended ? `${pct}%` : "0%" }}
                      />
                      <div className="relative flex justify-between gap-2">
                        <span className="text-[12px] font-bold text-white">{opt}</span>
                        {hasVoted || ended ? (
                          <span className="text-[11px] text-[#F5F5F7] tabular-nums font-bold">{pct}%</span>
                        ) : null}
                      </div>
                    </button>
                  );
                  });
                })()}
              </div>
            </div>
          </div>
        </>
      ) : null}

      {showLb ? (
        <>
          <div
            className="fixed inset-0 bg-black/35 pointer-events-auto z-[99998]"
            onClick={() => setShowLb(false)}
          />
          <div className="fixed bottom-0 left-0 right-0 z-[99999] pointer-events-auto max-w-[480px] mx-auto">
            <div
              className="elix-panel elix-live-sheet rounded-t-2xl p-3 pb-safe h-[40dvh] max-h-[40dvh] flex flex-col shadow-2xl w-full overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="relative flex flex-col px-1 pt-0 pb-2 border-b border-white/10 mb-2 flex-shrink-0">
                <div className="flex justify-center pb-2" aria-hidden>
                  <div className="w-10 h-1 rounded-full bg-white/25" />
                </div>
                <span className="text-sm font-bold text-[#F5F5F7] text-center w-full">Current live</span>
                <button type="button" onClick={() => setShowLb(false)} className="absolute right-1 top-[26px] p-1">
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
                          <p className="text-[8px] text-[#F5F5F7] truncate">{row.title}</p>
                        ) : null}
                      </div>
                      <span className="text-[10px] font-bold text-[#E6E9EE] tabular-nums">{row.score}</span>
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
          <div className="px-4 py-3 rounded-2xl elix-panel border border-[#D8D9DD]/50 shadow-[0_0_24px_rgba(229, 229, 231,0.35)]">
            {milestoneFlash ? (
              <p className="text-[#E6E9EE] text-sm font-black text-center">
                {milestoneFlash.milestones.map((m) => `${m}m`).join(", ")} streak!
                {milestoneFlash.title ? ` · ${milestoneFlash.title}` : ""}
              </p>
            ) : (
              <p className="text-[#E6E9EE] text-sm font-black text-center">
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
