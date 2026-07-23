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
  /**
   * Side stack is progress display only. Claims happen in Engagement Hub/drawer.
   * Never treat this panel as a claim surface.
   */
  claimable?: false;
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
    <svg width="18" height="18" viewBox="0 0 16 16" className="flex-shrink-0 drop-shadow-[0_0_4px_rgba(255,200,80,0.65)]" aria-hidden>
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
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-white/90 text-[11px] font-semibold whitespace-nowrap w-[78px] flex-shrink-0 truncate">
        {label}
      </span>
      <div className="flex-1 h-[7px] rounded-full bg-white/10 overflow-hidden min-w-[44px]">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: barColor }} />
      </div>
      <span className="text-white/80 text-[10px] font-bold tabular-nums whitespace-nowrap flex-shrink-0">
        {safeCur}/{safeGoal}
      </span>
      <GiftBoxIcon />
    </div>
  );
}

const RANK_RING = ['#FFD54A', '#C0C7D1', '#CD7F32'] as const;

/**
 * Photo yellow-contour stack (lower-right):
 * 1) Daily Mission + Top Supporters card (click side tab to open/close)
 * 2) Battle Pass capsule (shown when panel open)
 */
export function LiveSideMissionStack({
  missions,
  supporters,
  battlePassLevel,
  battlePassXp,
  battlePassXpMax,
  onViewAllSupporters,
  onBattlePass,
  onOpenMissions,
  /** When true, render panel/tab only (parent dock owns fixed position). */
  embedded = false,
}: {
  missions: LiveSideMissionProgress;
  supporters: LiveSideSupporter[];
  battlePassLevel: number;
  battlePassXp: number;
  battlePassXpMax: number;
  onViewAllSupporters?: () => void;
  onBattlePass?: () => void;
  /** Opens Engagement Hub/drawer — side stack never claims rewards itself. */
  onOpenMissions?: () => void;
  embedded?: boolean;
}) {
  const [remainMs, setRemainMs] = useState(msUntilLocalMidnight);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => setRemainMs(msUntilLocalMidnight()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const xpMax = Math.max(1, battlePassXpMax);
  const xpCur = Math.max(0, Math.min(battlePassXp, xpMax));
  const xpPct = Math.min(100, (xpCur / xpMax) * 100);
  const level = Math.max(1, Math.floor(battlePassLevel) || 1);
  const top3 = supporters.slice(0, 3);

  const closedTab = (
    <button
      type="button"
      title="Open Daily Mission"
      aria-expanded={false}
      className="flex flex-col items-center justify-center gap-1.5 active:scale-95 transition-transform"
      style={{
        width: '34px',
        minHeight: '88px',
        borderRadius: '12px 0 0 12px',
        background: 'rgba(8, 10, 28, 0.88)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRight: 'none',
        boxShadow: '-2px 2px 10px rgba(0,0,0,0.35)',
        backdropFilter: 'blur(8px)',
        marginBottom: embedded ? 0 : undefined,
      }}
      onClick={(e) => {
        e.stopPropagation();
        setOpen(true);
      }}
    >
      <Target size={14} className="text-[#FF4DA6]" strokeWidth={2.4} />
      <span
        className="text-white text-[10px] font-bold leading-none"
        style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
      >
        Mission
      </span>
      <Crown size={12} className="text-[#FFD54A]" fill="#FFD54A" strokeWidth={1.5} />
    </button>
  );

  const openPanel = (
    <div className="flex flex-col gap-2" style={{ width: '204px', marginRight: embedded ? 8 : undefined }}>
      <div
        className="rounded-xl px-2.5 py-2 flex flex-col gap-2"
        style={{
          background: 'rgba(8, 10, 22, 0.62)',
          border: '1px solid rgba(255, 255, 255, 0.22)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          boxShadow: '0 1px 6px rgba(0,0,0,0.28)',
        }}
      >
        <div className="flex items-center justify-between gap-1 w-full">
          <button
            type="button"
            className="flex items-center justify-between gap-1 flex-1 min-w-0 text-left active:opacity-90"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
            }}
            title="Close"
            aria-expanded={true}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <Target size={13} className="text-[#FF4DA6] flex-shrink-0" strokeWidth={2.4} />
              <span className="text-white text-[12px] font-bold whitespace-nowrap">Daily Mission</span>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <Clock size={11} className="text-[#F5D07A]" strokeWidth={2.2} />
              <span className="text-[#F5D07A] text-[10px] font-bold tabular-nums leading-none">
                {formatHms(remainMs)}
              </span>
              <span className="text-white/70 text-[12px] font-bold leading-none ml-0.5" aria-hidden>
                ›
              </span>
            </div>
          </button>
          {onOpenMissions ? (
            <button
              type="button"
              className="text-[#C084FC] text-[10px] font-semibold whitespace-nowrap active:opacity-80 flex-shrink-0 pl-1"
              onClick={(e) => {
                e.stopPropagation();
                onOpenMissions();
              }}
            >
              Hub
            </button>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
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
          <div className="flex items-center gap-1.5 min-w-0">
            <Crown size={12} className="text-[#FFD54A] flex-shrink-0" fill="#FFD54A" strokeWidth={1.5} />
            <span className="text-white text-[11px] font-bold whitespace-nowrap">Top Supporters</span>
          </div>
          <button
            type="button"
            className="text-[#C084FC] text-[10px] font-semibold whitespace-nowrap active:opacity-80"
            onClick={(e) => {
              e.stopPropagation();
              onViewAllSupporters?.();
            }}
          >
            View all &gt;
          </button>
        </div>

        <div className="flex flex-col gap-1.5">
          {top3.length === 0 ? (
            <span className="text-white/35 text-[10px] py-0.5">No supporters yet</span>
          ) : (
            top3.map((s, i) => (
              <div key={s.id || `${s.name}-${i}`} className="flex items-center gap-2 min-w-0">
                <span
                  className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-black text-black flex-shrink-0"
                  style={{ background: RANK_RING[i] || RANK_RING[2] }}
                >
                  {i + 1}
                </span>
                <AvatarRing src={s.avatar} alt={s.name} size={20} />
                <span className="flex-1 min-w-0 text-white text-[10px] font-bold truncate">{s.name}</span>
                <span className="text-[#FFD54A] text-[10px] font-bold tabular-nums flex-shrink-0">
                  {formatPointsShort(s.points)}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      <button
        type="button"
        className="w-full flex items-center gap-2 rounded-full pl-2 pr-2.5 py-2 active:scale-[0.98] transition-transform text-left"
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
          className="w-8 h-8 flex-shrink-0 flex items-center justify-center text-[11px] font-black text-[#1A1200]"
          style={{
            clipPath: 'polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)',
            background: 'linear-gradient(160deg,#FFF3C4 0%,#FFD54A 45%,#C9A227 100%)',
            boxShadow: '0 0 8px rgba(255,213,74,0.55)',
          }}
        >
          {level}
        </span>
        <span className="flex-1 min-w-0 flex flex-col gap-1">
          <span className="text-white text-[11px] font-bold leading-none">Battle Pass</span>
          <span className="relative h-[8px] w-full rounded-full bg-black/35 overflow-hidden">
            <span
              className="absolute inset-y-0 left-0 rounded-full"
              style={{
                width: `${xpPct}%`,
                background: 'linear-gradient(90deg,#E879F9,#A855F7,#7C3AED)',
              }}
            />
            <span className="absolute inset-0 flex items-center justify-center text-[8px] font-black text-white tabular-nums drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">
              {xpCur}/{xpMax}
            </span>
          </span>
        </span>
        <span className="text-white/85 text-[13px] font-medium flex-shrink-0">&gt;</span>
      </button>
    </div>
  );

  const body = !open ? closedTab : openPanel;

  if (embedded) {
    return <div className="relative flex flex-col items-end justify-end">{body}</div>;
  }

  return (
    <div
      className="fixed left-0 right-0 z-[50000] flex justify-center pointer-events-none"
      style={{ bottom: 'calc(62px + max(2px, env(safe-area-inset-bottom, 0px)))' }}
    >
      <div className="w-full max-w-[480px] mx-auto relative h-0 pointer-events-none">
        {!open && (
          <div className="absolute pointer-events-auto" style={{ right: 0, bottom: '48px' }}>
            {closedTab}
          </div>
        )}
        {open && (
          <div className="absolute pointer-events-auto" style={{ right: '8px', bottom: 0 }}>
            {openPanel}
          </div>
        )}
      </div>
    </div>
  );
}
