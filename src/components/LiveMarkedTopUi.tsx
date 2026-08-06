import React from 'react';
import { BadgeCheck, Gem, Heart, Plus } from 'lucide-react';
import { AvatarRing } from './AvatarRing';
import type { GiftUiItem } from '../lib/giftsCatalog';
import { GIFT_COMBO_MAX } from '../lib/giftsCatalog';
import { getLevelAccentStyle } from '../lib/levelColors';

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
function liveDiamondTierLabel(level: number) {
  const n = typeof level === 'number' && Number.isFinite(level) && level > 0 ? Math.floor(level) : 1;
  const roman = ['I', 'II', 'III', 'IV', 'V'] as const;
  const idx = Math.min(roman.length - 1, Math.floor((Math.max(1, n) - 1) / 20));
  return `Diamond ${roman[idx]}`;
}

/** Live ranking chips — same fill as live bottom icons (`bg-black/35 backdrop-blur-sm`). */
const THIN_CAPSULE_STYLE: React.CSSProperties = {
  background: 'rgba(0, 0, 0, 0.35)',
  border: 'none',
  boxShadow: 'none',
  backdropFilter: 'blur(4px)',
  WebkitBackdropFilter: 'blur(4px)',
};

/** Shared capsule title / subtitle — half silver / half red writing. */
const CAPSULE_TITLE = 'elix-silver-red-text text-[8px] font-bold whitespace-nowrap';
const CAPSULE_SUB = 'elix-silver-red-text text-[6px] font-semibold whitespace-nowrap mt-[0.5px]';
const CAPSULE_CHEVRON = 'elix-silver-red-text text-[8px] font-medium leading-none';

/** Same height / padding / round chip shape. */
const THIN_CAPSULE_CLASS =
  'inline-flex items-center gap-0.5 flex-shrink-0 rounded-full pl-1.5 pr-1.5 h-[22px] box-border pointer-events-auto active:scale-95 transition-transform';

/** Pink + Follow pill — legacy hot-pink; kept for any non-profile uses. */
export function LiveFollowPill({
  onFollow,
  variant = 'capsule',
  isFollowing = false,
}: {
  onFollow: (e: React.MouseEvent) => void;
  /** `photo` = standalone pill next to host profile (mock). `capsule` = overlay on Join slot. */
  variant?: 'capsule' | 'photo';
  /** When true, capsule stays visible with "Following" label. */
  isFollowing?: boolean;
}) {
  const label = isFollowing ? 'Following' : 'Follow';
  if (variant === 'photo') {
    return (
      <button
        type="button"
        className="flex items-center justify-center gap-0.5 h-[28px] px-2.5 rounded-full bg-[#6F3FF5] shadow-[0_0_10px_rgba(255,59,92,0.45)] active:scale-95 transition-transform flex-shrink-0 elix-solid-red"
        onClick={onFollow}
        aria-label={label}
      >
        {!isFollowing ? <Plus size={12} className="text-white" strokeWidth={3} /> : null}
        <span className="text-white text-[11px] font-bold leading-none">{label}</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      className="col-start-1 row-start-1 z-20 relative flex items-center justify-center gap-0.5 self-stretch h-full rounded-full bg-[#6F3FF5] w-full elix-solid-red"
      onClick={onFollow}
      aria-label={label}
    >
      {!isFollowing ? <Plus size={12} className="text-white" strokeWidth={3} /> : null}
      <span className="text-white text-[10px] font-bold">{label}</span>
    </button>
  );
}

/** Follow — same thin capsule chrome as Membership (shared profile slot). */
export function LiveFollowCapsule({ onFollow }: { onFollow: (e: React.MouseEvent) => void }) {
  return (
    <button
      type="button"
      className={THIN_CAPSULE_CLASS}
      style={THIN_CAPSULE_STYLE}
      onClick={(e) => {
        e.stopPropagation();
        onFollow(e);
      }}
      aria-label="Follow"
    >
      <Plus size={11} className="text-[#F5F5F7] flex-shrink-0" strokeWidth={3} />
      <span className="flex flex-col items-start justify-center leading-none min-w-0">
        <span className={CAPSULE_TITLE}>Follow</span>
        <span className={`${CAPSULE_SUB} font-bold`}>Creator</span>
      </span>
      <span className={CAPSULE_CHEVRON}>&gt;</span>
    </button>
  );
}

/**
 * Host profile block (photo 1-1): gold-glow avatar (same soft halo as LIVE icons),
 * name + blue verified, “N Likes • LIVE Pro”, Lv pill + Diamond tier,
 * One action slot beside profile: Follow XOR Join — never both, never stacked.
 * Does not touch the 3 MVP circles.
 */
export function LiveHostProfileHeader({
  name,
  avatar,
  likes,
  level,
  avatarSize,
  showFollow,
  isFollowing = false,
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
  /** true = show Follow / Join action slot (spectators). */
  showFollow: boolean;
  isFollowing?: boolean;
  onAvatarClick: () => void;
  onLike: (e: React.PointerEvent) => void;
  onFollow: (e: React.MouseEvent) => void;
  /** Join (membership heart) — shown in the same slot after follow only. */
  joinSlot?: React.ReactNode;
}) {
  const safeLevel = typeof level === 'number' && Number.isFinite(level) && level > 0 ? Math.floor(level) : 1;
  const likesLabel = formatLikesShort(likes);
  const levelStyle = getLevelAccentStyle(safeLevel);

  return (
    <div className="flex items-center gap-1.5 min-w-0 pointer-events-auto">
      <button
        type="button"
        className="relative flex-shrink-0 rounded-full active:scale-95 transition-transform"
        onClick={(e) => {
          e.stopPropagation();
          onAvatarClick();
        }}
        aria-label="Open profile"
      >
        <AvatarRing src={avatar} alt={name} size={avatarSize} glow={false} />
      </button>

      <div className="flex flex-col justify-center min-w-0 gap-[2px]">
        <div className="flex items-center gap-1 min-w-0">
          <span className="elix-silver-red-text text-[12px] font-bold truncate max-w-[118px] leading-tight">
            {name}
          </span>
          <BadgeCheck
            size={14}
            className="text-[#F5F5F7] flex-shrink-0"
            fill="#D8D9DD"
            stroke="#FFFFFF"
            strokeWidth={1.6}
          />
          {/* Follow / Join — same slot, immediately beside name (spectators only) */}
          {showFollow ? (
            <div className="flex-shrink-0 flex items-center justify-center ml-0.5 relative z-30">
              {!isFollowing ? (
                <LiveFollowPill variant="photo" isFollowing={false} onFollow={onFollow} />
              ) : (
                joinSlot ?? null
              )}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          className="flex items-center gap-1 pointer-events-auto self-start -mt-0.5"
          onPointerDown={(e) => {
            e.stopPropagation();
            onLike(e);
          }}
        >
          <span className="elix-silver-red-text text-[9px] font-semibold tabular-nums leading-none whitespace-nowrap">
            {likesLabel} Likes
          </span>
          <span className="elix-silver-red-text text-[9px] leading-none">•</span>
          <span className="elix-silver-red-text text-[9px] font-semibold leading-none whitespace-nowrap">
            LIVE Pro
          </span>
        </button>
        <div className="flex items-center gap-1 mt-[1px]">
          <span
            className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-[2px] text-[8px] font-bold leading-none"
            style={{
              background: levelStyle.background,
              border: '1px solid rgba(255,255,255,0.35)',
              boxShadow: 'none',
            }}
          >
            <span className="elix-silver-red-text">Lv.{safeLevel}</span>
          </span>
          <span
            className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-[2px] text-[8px] font-bold leading-none bg-black/35 backdrop-blur-sm border-0 shadow-none"
          >
            <Gem size={9} className="flex-shrink-0" strokeWidth={2.2} />
            <span className="elix-silver-red-text text-[8px] font-bold leading-none whitespace-nowrap">
              {liveDiamondTierLabel(safeLevel)}
            </span>
          </span>
        </div>
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
      className={`flex items-center justify-center gap-1 h-[28px] px-2.5 rounded-full active:scale-95 transition-transform elix-solid-red ${
        hasJoinedToday
          ? 'bg-[#6F3FF5] border border-[#FF6B8A]'
          : 'bg-[#6F3FF5] border border-[#FF6B8A] shadow-[0_0_10px_rgba(255,59,92,0.55)]'
      }`}
      onClick={onJoin}
    >
      <div className="relative">
        <Heart
          className="w-3.5 h-3.5 text-white fill-white"
          strokeWidth={2.5}
        />
        {!hasJoinedToday && (
          <div className="absolute -top-1 -right-1 w-2 h-2 bg-white rounded-full flex items-center justify-center border border-[#6F3FF5]">
            <span className="text-[#6F3FF5] text-[6px] font-bold leading-none">+</span>
          </div>
        )}
      </div>
      <span className="text-white text-[10px] font-bold drop-shadow-[0_1px_1px_rgba(0,0,0,0.45)]">Join</span>
    </button>
  );
}

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
        <span className={CAPSULE_TITLE}>Diamond League</span>
        <span className={CAPSULE_SUB}>
          {rank != null ? `Rank ${rank}` : 'Rank —'}
        </span>
      </span>
      <span className={CAPSULE_CHEVRON}>&gt;</span>
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
        <span className={CAPSULE_TITLE}>Membership</span>
        <span className={`${CAPSULE_SUB} font-bold`}>VIP</span>
      </span>
      <span className={CAPSULE_CHEVRON}>&gt;</span>
    </button>
  );
}

/** Blue-pink diamond for Diamond League capsule. */
function LivePhotoDiamondIcon({ size = 14 }: { size?: number }) {
  const uid = `dl${size}`;
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" className="flex-shrink-0" aria-hidden>
      <defs>
        <linearGradient id={`${uid}Top`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#EEF2FF" />
          <stop offset="45%" stopColor="#A5B4FC" />
          <stop offset="100%" stopColor="#818CF8" />
        </linearGradient>
        <linearGradient id={`${uid}Bot`} x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0%" stopColor="#D8D9DD" />
          <stop offset="100%" stopColor="#6366F1" />
        </linearGradient>
      </defs>
      <path d="M9 1.2 L15.2 6.2 L9 16.8 L2.8 6.2 Z" fill={`url(#${uid}Bot)`} />
      <path d="M9 1.2 L15.2 6.2 L9 7.4 L2.8 6.2 Z" fill={`url(#${uid}Top)`} />
      <path d="M9 7.4 L15.2 6.2 L9 16.8 Z" fill="#6366F1" opacity="0.9" />
      <path d="M9 7.4 L2.8 6.2 L9 16.8 Z" fill="#D8D9DD" opacity="0.85" />
      <path d="M9 1.2 L9 7.4" stroke="#EEF2FF" strokeWidth="0.45" opacity="0.7" />
    </svg>
  );
}

/** Blue-pink crown for Membership VIP capsule. */
function LivePhotoCrownIcon({ size = 14 }: { size?: number }) {
  const uid = `cr${size}`;
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" className="flex-shrink-0" aria-hidden>
      <defs>
        <linearGradient id={uid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#EEF2FF" />
          <stop offset="45%" stopColor="#A5B4FC" />
          <stop offset="100%" stopColor="#818CF8" />
        </linearGradient>
      </defs>
      <path
        d="M2.2 12.2 L3.4 5.6 L6.5 8.4 L9 3.2 L11.5 8.4 L14.6 5.6 L15.8 12.2 Z"
        fill={`url(#${uid})`}
      />
      <rect x="2.4" y="12.2" width="13.2" height="2.4" rx="0.6" fill="#A5B4FC" />
      <circle cx="3.4" cy="5.4" r="1.05" fill="#EEF2FF" />
      <circle cx="9" cy="3" r="1.15" fill="#EEF2FF" />
      <circle cx="14.6" cy="5.4" r="1.05" fill="#EEF2FF" />
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
        <span className={CAPSULE_TITLE}>Weekly Ranking</span>
        <span className={CAPSULE_SUB}>
          {rank != null ? `No.${rank}` : 'No.—'}
        </span>
      </span>
      <span className={CAPSULE_CHEVRON}>&gt;</span>
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
      <svg width="11" height="11" viewBox="0 0 12 12" className="flex-shrink-0" aria-hidden>
        <defs>
          <linearGradient id="elixExplorePlanet" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#EEF2FF" />
            <stop offset="50%" stopColor="#A5B4FC" />
            <stop offset="100%" stopColor="#6366F1" />
          </linearGradient>
        </defs>
        <circle cx="6" cy="6" r="5" fill="url(#elixExplorePlanet)" />
        <ellipse cx="6" cy="6" rx="5.4" ry="2.1" fill="none" stroke="#EEF2FF" strokeWidth="0.7" opacity="0.85" />
        <path d="M6 1.2 C7.4 2.8 7.4 9.2 6 10.8 C4.6 9.2 4.6 2.8 6 1.2 Z" fill="#EEF2FF" opacity="0.35" />
      </svg>
      <span className="flex flex-col items-start justify-center leading-none min-w-0">
        <span className={CAPSULE_TITLE}>Explore</span>
        <span className={CAPSULE_SUB}>Live</span>
      </span>
      <span className={CAPSULE_CHEVRON}>&gt;</span>
    </button>
  );
}

/**
 * Photo sub-header: thin capsules on the same horizontal line (right-aligned).
 * Gap keeps them as individual pills, not one fused strip.
 * Weekly Ranking · Diamond League · Membership (optional) · Explore
 * When Membership lives in the profile Follow slot, pass showMembership={false}.
 */
export function LiveMarkedSubHeaderBar({
  rank,
  onDiamond,
  onMembership,
  onWeeklyRanking,
  onExplore,
  showMembership = true,
}: {
  rank: number | null;
  onDiamond: () => void;
  onMembership: () => void;
  onWeeklyRanking: () => void;
  onExplore: () => void;
  /** false when Membership is shown in the profile Follow slot instead. */
  showMembership?: boolean;
}) {
  return (
    <div className="mt-1 -translate-y-[2mm] w-full pointer-events-auto relative z-20 flex justify-end">
      <div className="flex items-center gap-1.5 flex-nowrap w-max max-w-full ml-auto overflow-x-auto no-scrollbar">
        <LiveWeeklyRankingPill rank={rank} onOpen={onWeeklyRanking} />
        <LiveDiamondLeagueCapsule rank={rank} onOpen={onDiamond} />
        {showMembership ? <LiveMembershipVipCapsule onOpen={onMembership} /> : null}
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
