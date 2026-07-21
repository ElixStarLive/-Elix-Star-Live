import React, { useEffect, useMemo, useState } from "react";
import { Trophy, Timer, Users, Sparkles, X, Wrench } from "lucide-react";
import {
  formatWatchClock,
  mysteryRemainingMs,
  type EngagementMilestoneEvent,
  type EngagementPublicState,
} from "../lib/liveEngagement";

type Props = {
  state: EngagementPublicState;
  nowMs: number;
  milestoneFlash: EngagementMilestoneEvent | null;
  stageFlash: number | null;
  isHost?: boolean;
  onVote?: (optionIndex: number) => void;
  onStartMystery?: (mins: 5 | 10 | 15) => void;
  onStartPoll?: () => void;
};

/**
 * Engagement HUD — top strip only + optional compact poll.
 * Must NOT cover the live chat zone (lower ~40% of the screen).
 */
export function LiveEngagementOverlay({
  state,
  nowMs,
  milestoneFlash,
  stageFlash,
  isHost = false,
  onVote,
  onStartMystery,
  onStartPoll,
}: Props) {
  const [showLb, setShowLb] = useState(false);
  const [hostToolsOpen, setHostToolsOpen] = useState(false);
  const [pollMinimized, setPollMinimized] = useState(false);
  const features = state.features;
  const streakSec = state.me?.streakSeconds ?? state.me?.watchSeconds ?? 0;
  const mysteryLeft = mysteryRemainingMs(state.mystery, nowMs);
  const mysteryLabel = useMemo(() => {
    if (!state.mystery || state.mystery.triggered || mysteryLeft <= 0) return null;
    return formatWatchClock(Math.ceil(mysteryLeft / 1000));
  }, [state.mystery, mysteryLeft]);

  const hasVoted =
    !!state.poll &&
    !!state.me?.userId &&
    state.poll.votedUserIds.includes(state.me.userId);

  const pollId = state.poll?.id ?? null;
  useEffect(() => {
    setPollMinimized(false);
  }, [pollId]);

  useEffect(() => {
    if (hasVoted) setPollMinimized(true);
  }, [hasVoted]);

  return (
    <div className="pointer-events-none fixed inset-0 z-[92] max-w-[480px] mx-auto">
      {/* TOP ONLY — keep clear of chat (bottom of live) */}
      <div className="pointer-events-none absolute top-0 left-0 right-0 flex justify-between items-start gap-2 px-3 pt-[calc(var(--topnav-bar-height,56px)+48px)]">
        <div className="pointer-events-none flex flex-col gap-1 items-start min-w-0 max-w-[58%]">
          {features.streak && (
            <div className="pointer-events-auto flex items-center gap-1.5 px-2 py-1 rounded-full bg-[#111111]/85 border border-[#C9A227]/35 backdrop-blur-md">
              <Timer className="w-3 h-3 text-[#D4AF37] flex-shrink-0" strokeWidth={2.5} />
              <span className="text-[9px] font-bold text-[#F5E6A8] tabular-nums">
                Watch {formatWatchClock(streakSec)}
              </span>
              {state.nextMilestoneMin != null ? (
                <span className="text-[8px] text-white/50">→ {state.nextMilestoneMin}m</span>
              ) : null}
              {state.me?.sessionXp ? (
                <span className="text-[8px] text-[#D4AF37] font-bold">+{state.me.sessionXp} XP</span>
              ) : null}
            </div>
          )}

          {features.mystery && mysteryLabel ? (
            <div className="pointer-events-auto max-w-full px-2 py-1 rounded-xl bg-[#111111]/88 border border-[#C9A227]/40">
              <p className="text-[9px] font-bold text-[#F5E6A8] leading-tight">
                Mystery in {mysteryLabel}
              </p>
            </div>
          ) : null}

          {features.community ? (
            <div className="pointer-events-auto w-full max-w-[200px] px-2 py-1 rounded-xl bg-[#111111]/85 border border-[#C9A227]/30">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[8px] font-bold text-white/80">Community Power</span>
                <span className="text-[8px] font-bold text-[#D4AF37] tabular-nums">
                  {Math.round(state.communityProgress)}%
                </span>
              </div>
              <div className="h-1 rounded-full bg-white/15 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#D4AF37] to-[#E8D5A3] transition-all duration-500"
                  style={{ width: `${Math.min(100, state.communityProgress)}%` }}
                />
              </div>
            </div>
          ) : null}

          {/* Compact poll — top stack only, never over chat */}
          {state.poll && features.poll && !pollMinimized ? (
            <div className="pointer-events-auto w-full max-w-[220px] bg-[#111111]/95 border border-[#C9A227]/40 rounded-xl p-2 shadow-lg">
              <div className="flex items-center justify-between gap-1 mb-1">
                <div className="flex items-center gap-1 min-w-0">
                  <Sparkles className="w-3 h-3 text-[#D4AF37] flex-shrink-0" />
                  <span className="text-[9px] font-bold text-[#F5E6A8] truncate">
                    {state.poll.kind === "trivia" ? "Trivia" : "Poll"}
                  </span>
                </div>
                <button
                  type="button"
                  className="p-0.5 flex-shrink-0"
                  onClick={() => setPollMinimized(true)}
                  aria-label="Hide poll"
                >
                  <X className="w-3.5 h-3.5 text-white/50" />
                </button>
              </div>
              <p className="text-white text-[10px] font-semibold mb-1.5 leading-tight line-clamp-2">
                {state.poll.question}
              </p>
              <div className="flex flex-col gap-1">
                {state.poll.options.map((opt, i) => {
                  const total = state.poll!.votes.reduce((a, b) => a + b, 0) || 1;
                  const pct = Math.round(((state.poll!.votes[i] || 0) / total) * 100);
                  return (
                    <button
                      key={`${state.poll!.id}-${i}`}
                      type="button"
                      disabled={hasVoted}
                      onClick={() => onVote?.(i)}
                      className="relative overflow-hidden rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-left disabled:opacity-80 active:scale-[0.99]"
                    >
                      <div
                        className="absolute inset-y-0 left-0 bg-[#D4AF37]/25"
                        style={{ width: hasVoted ? `${pct}%` : "0%" }}
                      />
                      <div className="relative flex justify-between gap-1">
                        <span className="text-[9px] font-bold text-white truncate">{opt}</span>
                        {hasVoted ? (
                          <span className="text-[8px] text-[#D4AF37] tabular-nums flex-shrink-0">{pct}%</span>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {state.poll && features.poll && pollMinimized ? (
            <button
              type="button"
              className="pointer-events-auto flex items-center gap-1 px-2 py-1 rounded-full bg-[#111111]/85 border border-[#C9A227]/35 active:scale-95"
              onClick={() => setPollMinimized(false)}
            >
              <Sparkles className="w-3 h-3 text-[#D4AF37]" />
              <span className="text-[9px] font-bold text-[#F5E6A8]">Poll</span>
            </button>
          ) : null}
        </div>

        <div className="pointer-events-none flex flex-col gap-1 items-end flex-shrink-0">
          {features.leaderboard ? (
            <button
              type="button"
              className="pointer-events-auto flex items-center gap-1 px-2 py-1 rounded-full bg-[#111111]/85 border border-[#C9A227]/35 active:scale-95"
              onClick={() => setShowLb(true)}
            >
              <Trophy className="w-3 h-3 text-[#D4AF37]" />
              <span className="text-[9px] font-bold text-[#F5E6A8]">Ranks</span>
            </button>
          ) : null}

          {isHost ? (
            <div className="pointer-events-auto flex flex-col items-end gap-1">
              <button
                type="button"
                className="flex items-center gap-1 px-2 py-1 rounded-full bg-[#111111]/85 border border-[#C9A227]/40 active:scale-95"
                onClick={() => setHostToolsOpen((v) => !v)}
              >
                <Wrench className="w-3 h-3 text-[#D4AF37]" />
                <span className="text-[9px] font-bold text-[#F5E6A8]">Tools</span>
              </button>
              {hostToolsOpen ? (
                <div className="flex flex-col gap-1 items-end">
                  <div className="flex gap-1 flex-wrap justify-end max-w-[160px]">
                    {([5, 10, 15] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        className="px-2 py-1 rounded-full bg-[#111111]/85 border border-[#C9A227]/40 text-[8px] font-bold text-[#F5E6A8] active:scale-95"
                        onClick={() => {
                          onStartMystery?.(m);
                          setHostToolsOpen(false);
                        }}
                      >
                        Mystery {m}m
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="px-2 py-1 rounded-full bg-[#D4AF37] text-black text-[8px] font-bold active:scale-95"
                    onClick={() => {
                      onStartPoll?.();
                      setHostToolsOpen(false);
                    }}
                  >
                    Start poll
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {showLb ? (
        <>
          <div
            className="pointer-events-auto fixed inset-0 bg-black/40 z-[99998]"
            onClick={() => setShowLb(false)}
          />
          <div className="pointer-events-auto fixed bottom-0 left-0 right-0 z-[99999] max-w-[480px] mx-auto bg-[#111111]/95 rounded-t-2xl p-3 pb-safe max-h-[40vh] flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span className="text-sm font-bold text-white">Current live</span>
              </div>
              <button type="button" onClick={() => setShowLb(false)} className="p-1">
                <X className="w-4 h-4 text-white/60" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto no-scrollbar">
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
        </>
      ) : null}

      {(milestoneFlash || stageFlash != null) && (
        <div className="pointer-events-none absolute inset-0 flex items-start justify-center pt-[30%] z-[100]">
          <div className="px-4 py-3 rounded-2xl bg-[#111111]/92 border border-[#D4AF37]/50 shadow-[0_0_24px_rgba(212,175,55,0.35)] animate-pulse">
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
            <p className="text-white/50 text-[9px] text-center mt-1">Digital reward only — no cash value</p>
          </div>
        </div>
      )}
    </div>
  );
}
