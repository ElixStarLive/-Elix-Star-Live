import React, { useEffect, useState } from 'react';
import { Clock, Crown, Target } from 'lucide-react';
import { AvatarRing } from './AvatarRing';

export type LiveSideSupporter = {
  id: string;
  name: string;
  avatar: string;
  points: number;
};

export type LiveSideMissionProgress = {
  watchMin: number;
  watchGoal: number;
  giftsSent: number;
  giftsGoal: number;
  battleJoined: number;
  battleGoal: number;
};

function formatPointsShort(n: number) {
  const c = typeof n === 'number' && Number.isFinite(n) ? n : 0;
  if (c >= 1_000_000) {
    const m = Math.round((c / 1_000_000) * 10) / 10;
    return `${Number.isInteger(m) ? Math.trunc(m) : m}M`;
  }
  if (c >= 1000) {
    const k = Math.round((c / 1000) * 10) / 10;
    return `${Number.isInteger(k) ? Math.trunc(k) : k}K`;
  }
  return String(c);
}

function msUntilLocalMidnight() {
  const now = new Date();
  const end = new Date(now);
  end.setHours(24, 0, 0, 0);
  return Math.max(0, end.getTime() - now.getTime());
}

function formatHms(ms: number) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function GiftBoxIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" className="flex-shrink-0 drop-shadow-[0_0_4px_rgba(255,200,80,0.65)]" aria-hidden>
      <defs>
        <linearGradient id="elixSideGift" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFE9A8" />
          <stop offset="55%" stopColor="#FFD54A" />
          <stop offset="100%" stopColor="#C9A227" />
        </linearGradient>
      </defs>
      <rect x="3" y="7" width="10" height="7" rx="1.2" fill="url(#elixSideGift)" />
      <rect x="2.5" y="5" width="11" height="2.4" rx="0.6" fill="#FFF3C4" />
      <rect x="7.2" y="5" width="1.6" height="9" fill="#FE2C55" />
      <path d="M8 5 C6.2 3.2 4.2 4.2 4.8 5.6" stroke="#FE2C55" strokeWidth="1.2" fill="none" />
      <path d="M8 5 C9.8 3.2 11.8 4.2 11.2 5.6" stroke="#FE2C55" strokeWidth="1.2" fill="none" />
    </svg>
  );
}

function MissionRow({
  label,
  current,
  goal,
  barColor,
}: {
  label: string;
  current: number;
  goal: number;
  barColor: string;
}) {
  const safeGoal = Math.max(1, goal);
  const safeCur = Math.max(0, Math.min(current, safeGoal));
  const pct = Math.min(100, (safeCur / safeGoal) * 100);
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <span className="text-white/90 text-[8px] font-semibold whitespace-nowrap w-[58px] flex-shrink-0 truncate">
        {label}
      </span>
      <div className="flex-1 h-[5px] rounded-full bg-white/10 overflow-hidden min-w-[36px]">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: barColor }} />
      </div>
      <span className="text-white/75 text-[7px] font-bold tabular-nums whitespace-nowrap flex-shrink-0">
        {safeCur}/{safeGoal}
      </span>
      <GiftBoxIcon />
    </div>
  );
}

const RANK_RING = ['#FFD54A', '#C0C7D1', '#CD7F32'] as const;

/**
 * Photo yellow-contour stack (lower-right):
 * 1) Daily Mission + Top Supporters card
 * 2) Battle Pass capsule
 */
export function LiveSideMissionStack({
  missions,
  supporters,
  battlePassLevel,
  battlePassXp,
  battlePassXpMax,
  onViewAllSupporters,
  onBattlePass,
}: {
  missions: LiveSideMissionProgress;
  supporters: LiveSideSupporter[];
  battlePassLevel: number;
  battlePassXp: number;
  battlePassXpMax: number;
  onViewAllSupporters?: () => void;
  onBattlePass?: () => void;
}) {
  const [remainMs, setRemainMs] = useState(msUntilLocalMidnight);

  useEffect(() => {
    const id = window.setInterval(() => setRemainMs(msUntilLocalMidnight()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const xpMax = Math.max(1, battlePassXpMax);
  const xpCur = Math.max(0, Math.min(battlePassXp, xpMax));
  const xpPct = Math.min(100, (xpCur / xpMax) * 100);
  const level = Math.max(1, Math.floor(battlePassLevel) || 1);
  const top3 = supporters.slice(0, 3);

  return (
    <div
      className="fixed left-0 right-0 z-[50000] flex justify-center pointer-events-none"
      style={{ bottom: 'calc(62px + max(2px, env(safe-area-inset-bottom, 0px)))' }}
    >
      <div className="w-full max-w-[480px] mx-auto relative h-0 pointer-events-none">
        <div
          className="absolute pointer-events-auto flex flex-col gap-1.5"
          style={{ right: '8px', bottom: '0', width: '158px' }}
        >
          {/* Daily Mission + Top Supporters — one dark card */}
          <div
            className="rounded-xl px-2 py-1.5 flex flex-col gap-1.5"
            style={{
              background: 'rgba(8, 10, 28, 0.82)',
              border: '1px solid rgba(255,255,255,0.10)',
              backdropFilter: 'blur(8px)',
              boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
            }}
          >
            <div className="flex items-center justify-between gap-1">
              <div className="flex items-center gap-1 min-w-0">
                <Target size={11} className="text-[#FF4DA6] flex-shrink-0" strokeWidth={2.4} />
                <span className="text-white text-[9px] font-bold whitespace-nowrap">Daily Mission</span>
              </div>
              <div className="flex items-center gap-0.5 flex-shrink-0">
                <Clock size={9} className="text-[#F5D07A]" strokeWidth={2.2} />
                <span className="text-[#F5D07A] text-[8px] font-bold tabular-nums leading-none">
                  {formatHms(remainMs)}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <MissionRow
                label="Watch 30 min"
                current={missions.watchMin}
                goal={missions.watchGoal}
                barColor="linear-gradient(90deg,#FBBF24,#F59E0B)"
              />
              <MissionRow
                label="Send 10 gifts"
                current={missions.giftsSent}
                goal={missions.giftsGoal}
                barColor="linear-gradient(90deg,#FB7185,#E11D48)"
              />
              <MissionRow
                label="Join a battle"
                current={missions.battleJoined}
                goal={missions.battleGoal}
                barColor="linear-gradient(90deg,#86EFAC,#22C55E)"
              />
            </div>

            <div className="h-px w-full bg-white/10 my-0.5" />

            <div className="flex items-center justify-between gap-1">
              <div className="flex items-center gap-1 min-w-0">
                <Crown size={10} className="text-[#FFD54A] flex-shrink-0" fill="#FFD54A" strokeWidth={1.5} />
                <span className="text-white text-[9px] font-bold whitespace-nowrap">Top Supporters</span>
              </div>
              <button
                type="button"
                className="text-[#C084FC] text-[8px] font-semibold whitespace-nowrap active:opacity-80"
                onClick={(e) => {
                  e.stopPropagation();
                  onViewAllSupporters?.();
                }}
              >
                View all &gt;
              </button>
            </div>

            <div className="flex flex-col gap-1">
              {top3.length === 0 ? (
                <span className="text-white/35 text-[8px] py-0.5">No gifts yet</span>
              ) : (
                top3.map((s, i) => (
                  <div key={s.id || `${s.name}-${i}`} className="flex items-center gap-1.5 min-w-0">
                    <span
                      className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-[7px] font-black text-black flex-shrink-0"
                      style={{ background: RANK_RING[i] || RANK_RING[2] }}
                    >
                      {i + 1}
                    </span>
                    <AvatarRing src={s.avatar} alt={s.name} size={16} />
                    <span className="flex-1 min-w-0 text-white text-[8px] font-bold truncate">{s.name}</span>
                    <span className="text-[#FFD54A] text-[8px] font-bold tabular-nums flex-shrink-0">
                      {formatPointsShort(s.points)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Battle Pass — separate capsule */}
          <button
            type="button"
            className="w-full flex items-center gap-1.5 rounded-full pl-1.5 pr-2 py-1.5 active:scale-[0.98] transition-transform text-left"
            style={{
              background: 'linear-gradient(105deg, rgba(76,29,149,0.92) 0%, rgba(30,16,60,0.92) 55%, rgba(88,28,135,0.88) 100%)',
              border: '1px solid rgba(196,132,252,0.35)',
              boxShadow: '0 0 14px rgba(168,85,247,0.25)',
            }}
            onClick={(e) => {
              e.stopPropagation();
              onBattlePass?.();
            }}
          >
            <span
              className="w-7 h-7 flex-shrink-0 flex items-center justify-center text-[10px] font-black text-[#1A1200]"
              style={{
                clipPath: 'polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)',
                background: 'linear-gradient(160deg,#FFF3C4 0%,#FFD54A 45%,#C9A227 100%)',
                boxShadow: '0 0 8px rgba(255,213,74,0.55)',
              }}
            >
              {level}
            </span>
            <span className="flex-1 min-w-0 flex flex-col gap-0.5">
              <span className="text-white text-[9px] font-bold leading-none">Battle Pass</span>
              <span className="relative h-[6px] w-full rounded-full bg-black/35 overflow-hidden">
                <span
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{
                    width: `${xpPct}%`,
                    background: 'linear-gradient(90deg,#E879F9,#A855F7,#7C3AED)',
                  }}
                />
                <span className="absolute inset-0 flex items-center justify-center text-[6px] font-black text-white tabular-nums drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">
                  {xpCur}/{xpMax}
                </span>
              </span>
            </span>
            <span className="text-white/85 text-[11px] font-medium flex-shrink-0">&gt;</span>
          </button>
        </div>
      </div>
    </div>
  );
}

/** Photo demo supporters when no live gifters yet / DEMO UI on. */
export const LIVE_SIDE_DEMO_SUPPORTERS: LiveSideSupporter[] = [
  { id: 'demo-s1', name: 'KING✧Alex', avatar: '', points: 12500 },
  { id: 'demo-s2', name: 'Sarah', avatar: '', points: 8800 },
  { id: 'demo-s3', name: 'Michael', avatar: '', points: 6300 },
];

export const LIVE_SIDE_DEMO_MISSIONS: LiveSideMissionProgress = {
  watchMin: 20,
  watchGoal: 30,
  giftsSent: 7,
  giftsGoal: 10,
  battleJoined: 1,
  battleGoal: 1,
};
