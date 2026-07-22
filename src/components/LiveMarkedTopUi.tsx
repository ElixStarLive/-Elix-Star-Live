import React from 'react';
import { BadgeCheck, Gem, Heart, Plus } from 'lucide-react';
import { AvatarRing } from './AvatarRing';
import type { GiftUiItem } from '../lib/giftsCatalog';
import { GIFT_COMBO_MAX } from '../lib/giftsCatalog';

function formatLikesShort(count: number) {
  const c = typeof count === 'number' && Number.isFinite(count) ? count : 0;
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

/** Photo-style diamond badge label from host level (Diamond I…V). */
export function liveDiamondTierLabel(level: number) {
  const n = typeof level === 'number' && Number.isFinite(level) && level > 0 ? Math.floor(level) : 1;
  const roman = ['I', 'II', 'III', 'IV', 'V'] as const;
  const idx = Math.min(roman.length - 1, Math.floor((Math.max(1, n) - 1) / 20));
  return `Diamond ${roman[idx]}`;
}

/** Pink + Follow pill — photo hot-pink; identical on creator + spectator. */
export function LiveFollowPill({
  onFollow,
  variant = 'capsule',
}: {
  onFollow: (e: React.MouseEvent) => void;
  /** `photo` = standalone pill next to host profile (mock). `capsule` = overlay on Join slot. */
  variant?: 'capsule' | 'photo';
}) {
  if (variant === 'photo') {
    return (
      <button
        type="button"
        className="flex items-center justify-center gap-0.5 h-[28px] px-2.5 rounded-full bg-[#FE2C55] shadow-[0_0_10px_rgba(254,44,85,0.45)] active:scale-95 transition-transform flex-shrink-0"
        onClick={onFollow}
      >
        <Plus size={12} className="text-white" strokeWidth={3} />
        <span className="text-white text-[11px] font-bold leading-none">Follow</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      className="col-start-1 row-start-1 z-20 relative flex items-center justify-center gap-0.5 self-stretch h-full rounded-full bg-[#FE2C55] w-full"
      onClick={onFollow}
    >
      <Plus size={12} className="text-white" strokeWidth={3} />
      <span className="text-white text-[10px] font-bold">Follow</span>
    </button>
  );
}

/**
 * Host profile block (photo 1-1): pink ring avatar, name + blue verified,
 * “N Likes • LIVE Pro”, Lv pill + Diamond tier, Follow → then membership heart.
 * Viewer flow: Follow first; after follow, action slot shows Join (membership heart).
 * Does not touch the 3 MVP circles.
 */
export function LiveHostProfileHeader({
  name,
  avatar,
  likes,
  level,
  avatarSize,
  showFollow,
  onAvatarClick,
  onLike,
  onFollow,
  joinSlot,
}: {
  name: string;
  avatar: string;
  likes: number;
  level: number;
  avatarSize: number;
  /** true = show Follow; false = show membership heart (Join) when joinSlot set. */
  showFollow: boolean;
  onAvatarClick: () => void;
  onLike: (e: React.PointerEvent) => void;
  onFollow: (e: React.MouseEvent) => void;
  /** Membership heart — only after follow (or host own-stream Join). */
  joinSlot?: React.ReactNode;
}) {
  const safeLevel = typeof level === 'number' && Number.isFinite(level) && level > 0 ? Math.floor(level) : 1;
  const likesLabel = formatLikesShort(likes);

  return (
    <div className="flex items-center gap-1.5 min-w-0 pointer-events-auto">
      <button
        type="button"
        className="relative flex-shrink-0 rounded-full p-[1.5px] active:scale-95 transition-transform"
        style={{
          background: 'linear-gradient(145deg, #FF4DA6 0%, #FE2C55 45%, #C084FC 100%)',
          boxShadow: '0 0 12px rgba(254,44,85,0.55)',
        }}
        onClick={(e) => {
          e.stopPropagation();
          onAvatarClick();
        }}
        aria-label="Open profile"
      >
        <div className="rounded-full overflow-hidden bg-[#0B0B12]">
          <AvatarRing src={avatar} alt={name} size={avatarSize} />
        </div>
      </button>

      <div className="flex flex-col justify-center min-w-0 gap-[2px]">
        <div className="flex items-center gap-1 min-w-0">
          <span className="text-white text-[12px] font-bold truncate max-w-[118px] leading-tight">{name}</span>
          <BadgeCheck
            size={14}
            className="text-[#2F80FF] flex-shrink-0 drop-shadow-[0_0_4px_rgba(47,128,255,0.65)]"
            fill="#2F80FF"
            stroke="#FFFFFF"
            strokeWidth={1.6}
          />
        </div>
        <button
          type="button"
          className="flex items-center gap-1 pointer-events-auto self-start -mt-0.5"
          onPointerDown={(e) => {
            e.stopPropagation();
            onLike(e);
          }}
        >
          <span className="text-white/65 text-[9px] font-semibold tabular-nums leading-none whitespace-nowrap">
            {likesLabel} Likes
          </span>
          <span className="text-white/35 text-[9px] leading-none">•</span>
          <span className="text-white/65 text-[9px] font-semibold leading-none whitespace-nowrap">LIVE Pro</span>
        </button>
        <div className="flex items-center gap-1 mt-[1px]">
          <span
            className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-[2px] text-[8px] font-bold text-white leading-none"
            style={{
              background: 'linear-gradient(90deg, #7C3AED 0%, #A855F7 100%)',
              boxShadow: '0 0 6px rgba(168,85,247,0.45)',
            }}
          >
            Lv.{safeLevel}
          </span>
          <span
            className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-[2px] text-[8px] font-bold text-white leading-none"
            style={{
              background: 'linear-gradient(90deg, #FF4DA6 0%, #FE2C55 100%)',
              boxShadow: '0 0 6px rgba(254,44,85,0.5)',
            }}
          >
            <Gem size={9} className="text-white flex-shrink-0" strokeWidth={2.2} fill="#FFFFFF" />
            <span className="text-white text-[8px] font-bold leading-none whitespace-nowrap">
              {liveDiamondTierLabel(safeLevel)}
            </span>
          </span>
        </div>
      </div>

      <div className="flex-shrink-0 self-center ml-0.5">
        {showFollow ? (
          <LiveFollowPill variant="photo" onFollow={onFollow} />
        ) : (
          joinSlot ?? null
        )}
      </div>
    </div>
  );
}

/** Compact Join control used after Follow (photo profile action slot). */
export function LiveJoinPill({
  hasJoinedToday,
  onJoin,
}: {
  hasJoinedToday: boolean;
  onJoin: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      className={`flex items-center justify-center gap-1 h-[28px] px-2.5 rounded-full active:scale-95 transition-transform ${
        hasJoinedToday ? 'bg-[#FF4500]' : 'bg-black/55 border border-white/20'
      }`}
      onClick={onJoin}
    >
      <div className="relative">
        <Heart
          className={`w-3.5 h-3.5 ${hasJoinedToday ? 'text-white fill-white' : 'text-[#D4AF37] fill-[#FFFFFF]'}`}
          strokeWidth={2.5}
        />
        {!hasJoinedToday && (
          <div className="absolute -top-1 -right-1 w-2 h-2 bg-[#FFFFFF] rounded-full flex items-center justify-center border border-white">
            <span className="text-white text-[6px] font-bold leading-none">+</span>
          </div>
        )}
      </div>
      <span className={`${hasJoinedToday ? 'text-white' : 'text-[#D4AF37]'} text-[10px] font-bold`}>Join</span>
    </button>
  );
}

/** TikTok-style soft transparent capsule fundal (top pills). */
const THIN_CAPSULE_STYLE: React.CSSProperties = {
  background: 'rgba(0, 0, 0, 0.35)',
  border: '1px solid rgba(255, 255, 255, 0.12)',
  backdropFilter: 'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
  boxShadow: 'none',
};

/** Same height / padding / border for every sub-header capsule — shorter + right-side row. */
const THIN_CAPSULE_CLASS =
  'inline-flex items-center gap-0.5 flex-shrink-0 rounded-full pl-1.5 pr-1.5 h-[22px] box-border pointer-events-auto active:scale-95 transition-transform';

/** Diamond League — separate thin capsule. */
export function LiveDiamondLeagueCapsule({
  rank,
  onOpen,
}: {
  rank: number | null;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      className={THIN_CAPSULE_CLASS}
      style={THIN_CAPSULE_STYLE}
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
    >
      <LivePhotoDiamondIcon size={11} />
      <span className="flex flex-col items-start justify-center leading-none min-w-0">
        <span className="text-white text-[8px] font-bold whitespace-nowrap">Diamond League</span>
        <span className="text-white/65 text-[6px] font-semibold whitespace-nowrap mt-[0.5px]">
          {rank != null ? `Rank ${rank}` : 'Rank —'}
        </span>
      </span>
      <span className="text-white/70 text-[8px] font-medium leading-none">&gt;</span>
    </button>
  );
}

/** Membership VIP — same border/fill as Diamond League (no yellow contour). */
export function LiveMembershipVipCapsule({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      className={THIN_CAPSULE_CLASS}
      style={THIN_CAPSULE_STYLE}
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
    >
      <LivePhotoCrownIcon size={11} />
      <span className="flex flex-col items-start justify-center leading-none min-w-0">
        <span className="text-white text-[8px] font-bold whitespace-nowrap">Membership</span>
        <span className="text-[#FFD54A] text-[6px] font-bold whitespace-nowrap mt-[0.5px]">VIP</span>
      </span>
      <span className="text-white/70 text-[8px] font-medium leading-none">&gt;</span>
    </button>
  );
}

/** Photo 3D-style purple diamond for Diamond League. */
function LivePhotoDiamondIcon({ size = 14 }: { size?: number }) {
  const uid = `dl${size}`;
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" className="flex-shrink-0 drop-shadow-[0_0_5px_rgba(168,85,247,0.7)]" aria-hidden>
      <defs>
        <linearGradient id={`${uid}Top`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#E9D5FF" />
          <stop offset="45%" stopColor="#C084FC" />
          <stop offset="100%" stopColor="#7C3AED" />
        </linearGradient>
        <linearGradient id={`${uid}Bot`} x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0%" stopColor="#A855F7" />
          <stop offset="100%" stopColor="#4C1D95" />
        </linearGradient>
      </defs>
      <path d="M9 1.2 L15.2 6.2 L9 16.8 L2.8 6.2 Z" fill={`url(#${uid}Bot)`} />
      <path d="M9 1.2 L15.2 6.2 L9 7.4 L2.8 6.2 Z" fill={`url(#${uid}Top)`} />
      <path d="M9 7.4 L15.2 6.2 L9 16.8 Z" fill="#6D28D9" opacity="0.9" />
      <path d="M9 7.4 L2.8 6.2 L9 16.8 Z" fill="#A855F7" opacity="0.85" />
      <path d="M9 1.2 L9 7.4" stroke="#F3E8FF" strokeWidth="0.45" opacity="0.7" />
    </svg>
  );
}

/** Photo gold crown for Membership VIP. */
function LivePhotoCrownIcon({ size = 14 }: { size?: number }) {
  const uid = `cr${size}`;
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" className="flex-shrink-0 drop-shadow-[0_0_5px_rgba(255,213,74,0.6)]" aria-hidden>
      <defs>
        <linearGradient id={uid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFF3C4" />
          <stop offset="45%" stopColor="#FFD54A" />
          <stop offset="100%" stopColor="#C9A227" />
        </linearGradient>
      </defs>
      <path
        d="M2.2 12.2 L3.4 5.6 L6.5 8.4 L9 3.2 L11.5 8.4 L14.6 5.6 L15.8 12.2 Z"
        fill={`url(#${uid})`}
      />
      <rect x="2.4" y="12.2" width="13.2" height="2.4" rx="0.6" fill="#FFD54A" />
      <circle cx="3.4" cy="5.4" r="1.05" fill="#FFF8DC" />
      <circle cx="9" cy="3" r="1.15" fill="#FFF8DC" />
      <circle cx="14.6" cy="5.4" r="1.05" fill="#FFF8DC" />
    </svg>
  );
}

/** Weekly Ranking — identical chrome to Diamond League. */
export function LiveWeeklyRankingPill({
  rank,
  onOpen,
}: {
  rank: number | null;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      className={THIN_CAPSULE_CLASS}
      style={THIN_CAPSULE_STYLE}
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
    >
      <span className="text-[9px] leading-none w-[11px] h-[11px] flex items-center justify-center flex-shrink-0" aria-hidden>
        🔥
      </span>
      <span className="flex flex-col items-start justify-center leading-none min-w-0">
        <span className="text-white text-[8px] font-bold whitespace-nowrap">Weekly Ranking</span>
        <span className="text-white/65 text-[6px] font-semibold whitespace-nowrap mt-[0.5px]">
          {rank != null ? `No.${rank}` : 'No.—'}
        </span>
      </span>
      <span className="text-white/70 text-[8px] font-medium leading-none">&gt;</span>
    </button>
  );
}

/** Explore — identical chrome to Diamond League. */
export function LiveExplorePill({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      className={THIN_CAPSULE_CLASS}
      style={THIN_CAPSULE_STYLE}
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
    >
      <svg width="11" height="11" viewBox="0 0 12 12" className="flex-shrink-0 drop-shadow-[0_0_4px_rgba(168,85,247,0.7)]" aria-hidden>
        <defs>
          <linearGradient id="elixExplorePlanet" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#E9D5FF" />
            <stop offset="50%" stopColor="#A855F7" />
            <stop offset="100%" stopColor="#6D28D9" />
          </linearGradient>
        </defs>
        <circle cx="6" cy="6" r="5" fill="url(#elixExplorePlanet)" />
        <ellipse cx="6" cy="6" rx="5.4" ry="2.1" fill="none" stroke="#F3E8FF" strokeWidth="0.7" opacity="0.85" />
        <path d="M6 1.2 C7.4 2.8 7.4 9.2 6 10.8 C4.6 9.2 4.6 2.8 6 1.2 Z" fill="#DDD6FE" opacity="0.35" />
      </svg>
      <span className="flex flex-col items-start justify-center leading-none min-w-0">
        <span className="text-white text-[8px] font-bold whitespace-nowrap">Explore</span>
        <span className="text-white/65 text-[6px] font-semibold whitespace-nowrap mt-[0.5px]">Live</span>
      </span>
      <span className="text-white/70 text-[8px] font-medium leading-none">&gt;</span>
    </button>
  );
}

/**
 * Photo sub-header: 4 separate thin capsules in one line, right-aligned
 * so left stays clear for battle gloves.
 * 1 Weekly Ranking · 2 Diamond League · 3 Membership · 4 Explore
 */
export function LiveMarkedSubHeaderBar({
  rank,
  onDiamond,
  onMembership,
  onWeeklyRanking,
  onExplore,
}: {
  rank: number | null;
  onDiamond: () => void;
  onMembership: () => void;
  onWeeklyRanking: () => void;
  onExplore: () => void;
}) {
  return (
    <div className="mt-1 -translate-y-[2mm] w-full pointer-events-auto relative z-20 flex justify-end">
      <div className="flex items-center gap-0.5 flex-nowrap w-max max-w-full ml-auto overflow-x-auto no-scrollbar">
        <LiveWeeklyRankingPill rank={rank} onOpen={onWeeklyRanking} />
        <LiveDiamondLeagueCapsule rank={rank} onOpen={onDiamond} />
        <LiveMembershipVipCapsule onOpen={onMembership} />
        <LiveExplorePill onOpen={onExplore} />
      </div>
    </div>
  );
}

export type LiveComboStackItem = {
  key: string;
  icon: string;
  count: number;
  gift: GiftUiItem;
};

const LIVE_MARKED_UI_DEMO_KEY = 'elix_live_marked_ui_demo';

/** Demo on by default so circled combo column is visible without sending gifts. Tap DEMO UI to turn off. */
export function readLiveMarkedUiDemoEnabled(_isStoreBuild: boolean): boolean {
  try {
    const v = localStorage.getItem(LIVE_MARKED_UI_DEMO_KEY);
    if (v === '0') return false;
    return true;
  } catch {
    return true;
  }
}

export function writeLiveMarkedUiDemoEnabled(on: boolean) {
  try {
    localStorage.setItem(LIVE_MARKED_UI_DEMO_KEY, on ? '1' : '0');
  } catch {
    /* ignore */
  }
}

function demoGiftStub(id: string, name: string, iconPath: string): GiftUiItem {
  const icon = iconPath.startsWith('http') || iconPath.startsWith('/')
    ? (iconPath.startsWith('http') ? iconPath : `https://elixstorage.b-cdn.net${iconPath.startsWith('/') ? iconPath : `/${iconPath}`}`)
    : iconPath;
  return {
    id,
    name,
    coins: 0,
    giftType: 'big',
    isActive: true,
    icon,
    video: '',
    preview: icon,
  };
}

/** Photo demo stack: Lion x30, Galaxy x15, Firework x10 — visual only, not real gifts. */
export function buildLiveMarkedUiDemoComboStack(): LiveComboStackItem[] {
  const lion = demoGiftStub('demo-lion', 'Lion', '/gifts/treasure_drake_cub.png');
  const galaxy = demoGiftStub('demo-galaxy', 'Galaxy', '/gifts/elix_global_universe.png');
  const firework = demoGiftStub('demo-firework', 'Firework', '/gifts/celestial_star_wand.png');
  return [
    { key: 'demo-firework', icon: firework.icon, count: 10, gift: firework },
    { key: 'demo-galaxy', icon: galaxy.icon, count: 15, gift: galaxy },
    { key: 'demo-lion', icon: lion.icon, count: 30, gift: lion },
  ];
}

/** Tiny toggle so you can turn demo combo column on/off while testing.
 * Sits near the bottom Co-Host control (not over the top battle/header area). */
export function LiveMarkedUiDemoToggle({
  enabled,
  onToggle,
}: {
  enabled: boolean;
  onToggle: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      className="pointer-events-auto fixed z-[50050] rounded-full px-3 py-1 text-[10px] font-black tracking-wide active:scale-95 transition-transform"
      style={{
        bottom: 'calc(56px + max(2px, env(safe-area-inset-bottom, 0px)))',
        right: 'max(12px, calc(50% - 240px + 12px))',
        left: 'auto',
        background: enabled ? 'rgba(254,44,85,0.92)' : 'rgba(20,20,28,0.85)',
        color: '#fff',
        border: '1px solid rgba(255,255,255,0.25)',
        boxShadow: '0 2px 10px rgba(0,0,0,0.45)',
      }}
      onClick={(e) => {
        e.stopPropagation();
        onToggle(!enabled);
      }}
    >
      {enabled ? 'DEMO UI ON' : 'DEMO UI OFF'}
    </button>
  );
}

/**
 * Photo combo column (red contour): large gift icons + pink italic xN,
 * seated just right of live chat. Counts come from real combo sends.
 * Newest / active combo stays on TOP (flex-col-reverse). Do not move it to the bottom.
 * Does not replace GiftPanel / GiftAnimationOverlay / gift pay path.
 */
export function LiveGiftComboColumn({
  stack,
  onCombo,
  onOpen,
  /** When true, render column only (parent dock owns fixed position). */
  embedded = false,
}: {
  stack: LiveComboStackItem[];
  onCombo: () => void;
  /** Open gift panel (press the column) */
  onOpen?: () => void;
  embedded?: boolean;
}) {
  if (stack.length === 0) return null;

  const column = (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        onOpen?.();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen?.();
        }
      }}
      className="flex flex-col-reverse items-center gap-2 rounded-2xl px-2.5 py-2.5 border border-[#FF2D85]/35 bg-[rgba(8,6,24,0.82)] backdrop-blur-md shadow-[0_0_18px_rgba(255,45,133,0.25)] active:scale-[0.98] transition-transform"
    >
      {stack.map((item, idx) => {
        const isActive = idx === stack.length - 1;
        const n = item.count;
        const label = n >= 1000 ? `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K` : String(n);
        return (
          <button
            key={item.key}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (isActive) {
                onCombo();
              } else {
                onOpen?.();
              }
            }}
            disabled={isActive && n >= GIFT_COMBO_MAX}
            className="flex items-center gap-2 bg-transparent border-0 p-0 active:scale-95 transition-transform disabled:opacity-50"
          >
            {item.icon && (item.icon.startsWith('http') || item.icon.startsWith('/')) ? (
              <img
                src={item.icon}
                alt=""
                className="w-14 h-14 object-contain drop-shadow-[0_0_10px_rgba(255,45,133,0.45)]"
                draggable={false}
              />
            ) : (
              <span className="w-14 h-14 flex items-center justify-center text-3xl drop-shadow-[0_0_8px_rgba(255,45,133,0.4)]">
                🎁
              </span>
            )}
            <span
              className="font-black italic text-[26px] leading-none tracking-tight"
              style={{
                backgroundImage: 'linear-gradient(180deg, #FFFFFF 0%, #FF5AA8 55%, #FF2D85 100%)',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                color: 'transparent',
                WebkitTextFillColor: 'transparent',
                filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.85))',
              }}
            >
              x{label}
            </span>
          </button>
        );
      })}
    </div>
  );

  if (embedded) return column;

  return (
    <div
      className="fixed left-0 right-0 z-[50060] flex justify-center pointer-events-none"
      style={{ bottom: 'calc(58px + max(2px, env(safe-area-inset-bottom, 0px)))' }}
    >
      <div className="w-full max-w-[480px] mx-auto relative h-0 pointer-events-none">
        <div
          className="absolute pointer-events-auto"
          style={{ left: '48%', bottom: '8px', transform: 'translateX(-50%)' }}
        >
          {column}
        </div>
      </div>
    </div>
  );
}

/**
 * Shared lower-right dock: gift combo (live combos) + Daily Mission (mission progress).
 * Sources stay separate — only layout is shared.
 */
export function LiveComboMissionDock({
  combo,
  mission,
}: {
  combo: React.ReactNode;
  mission: React.ReactNode;
}) {
  return (
    <div
      className="fixed left-0 right-0 z-[50060] flex justify-center pointer-events-none"
      style={{ bottom: 'calc(58px + max(2px, env(safe-area-inset-bottom, 0px)))' }}
    >
      <div className="w-full max-w-[480px] mx-auto relative h-0 pointer-events-none">
        <div
          className="absolute right-0 bottom-0 flex flex-row items-end gap-1.5 pointer-events-none"
          style={{ paddingRight: 0 }}
        >
          {combo ? <div className="pointer-events-auto flex-shrink-0 mb-2">{combo}</div> : null}
          <div className="pointer-events-auto flex-shrink-0">{mission}</div>
        </div>
      </div>
    </div>
  );
}
