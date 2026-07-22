import React from 'react';
import { BadgeCheck, Gem, Heart, Plus } from 'lucide-react';
import { AvatarRing } from './AvatarRing';

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
 * Host profile block: avatar (plain AvatarRing + Royce glow — morning style, no pink photo ring),
 * name + blue verified, “N Likes • LIVE Pro”, Lv pill + Diamond tier, Follow → then membership heart.
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
      <div className="relative z-[10] flex-shrink-0 pointer-events-auto cursor-pointer active:scale-95 transition-transform">
        <AvatarRing
          src={avatar}
          alt={name}
          size={avatarSize}
          onClick={(e) => {
            e.stopPropagation();
            onAvatarClick();
          }}
        />
      </div>

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

/** Same height / padding / border for every sub-header capsule. */
const THIN_CAPSULE_CLASS =
  'inline-flex items-center gap-1 flex-shrink-0 rounded-full pl-2 pr-2 h-[30px] box-border pointer-events-auto active:scale-95 transition-transform';

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
      <LivePhotoDiamondIcon size={14} />
      <span className="flex flex-col items-start justify-center leading-none min-w-0">
        <span className="text-white text-[9px] font-bold whitespace-nowrap">Diamond League</span>
        <span className="text-white/65 text-[7px] font-semibold whitespace-nowrap mt-[1px]">
          {rank != null ? `Rank ${rank}` : 'Rank —'}
        </span>
      </span>
      <span className="text-white/70 text-[9px] font-medium leading-none">&gt;</span>
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
      <LivePhotoCrownIcon size={14} />
      <span className="flex flex-col items-start justify-center leading-none min-w-0">
        <span className="text-white text-[9px] font-bold whitespace-nowrap">Membership</span>
        <span className="text-[#FFD54A] text-[7px] font-bold whitespace-nowrap mt-[1px]">VIP</span>
      </span>
      <span className="text-white/70 text-[9px] font-medium leading-none">&gt;</span>
    </button>
  );
}

/** Photo 3D-style Primary Gold diamond for Diamond League. */
function LivePhotoDiamondIcon({ size = 14 }: { size?: number }) {
  const uid = `dl${size}`;
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" className="flex-shrink-0 drop-shadow-[0_0_5px_rgba(212,175,55,0.7)]" aria-hidden>
      <defs>
        <linearGradient id={`${uid}Top`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#E8C96A" />
          <stop offset="45%" stopColor="#D4AF37" />
          <stop offset="100%" stopColor="#C9A227" />
        </linearGradient>
        <linearGradient id={`${uid}Bot`} x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0%" stopColor="#D4AF37" />
          <stop offset="100%" stopColor="#8B6914" />
        </linearGradient>
      </defs>
      <path d="M9 1.2 L15.2 6.2 L9 16.8 L2.8 6.2 Z" fill={`url(#${uid}Bot)`} />
      <path d="M9 1.2 L15.2 6.2 L9 7.4 L2.8 6.2 Z" fill={`url(#${uid}Top)`} />
      <path d="M9 7.4 L15.2 6.2 L9 16.8 Z" fill="#C9A227" opacity="0.9" />
      <path d="M9 7.4 L2.8 6.2 L9 16.8 Z" fill="#D4AF37" opacity="0.85" />
      <path d="M9 1.2 L9 7.4" stroke="#F2F2F2" strokeWidth="0.45" opacity="0.7" />
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
      <span className="text-[11px] leading-none w-[14px] h-[14px] flex items-center justify-center flex-shrink-0" aria-hidden>
        🔥
      </span>
      <span className="flex flex-col items-start justify-center leading-none min-w-0">
        <span className="text-white text-[9px] font-bold whitespace-nowrap">Weekly Ranking</span>
        <span className="text-white/65 text-[7px] font-semibold whitespace-nowrap mt-[1px]">
          {rank != null ? `No.${rank}` : 'No.—'}
        </span>
      </span>
      <span className="text-white/70 text-[9px] font-medium leading-none">&gt;</span>
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
      <svg width="14" height="14" viewBox="0 0 12 12" className="flex-shrink-0 drop-shadow-[0_0_4px_rgba(212,175,55,0.7)]" aria-hidden>
        <defs>
          <linearGradient id="elixExplorePlanet" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#E8C96A" />
            <stop offset="50%" stopColor="#D4AF37" />
            <stop offset="100%" stopColor="#C9A227" />
          </linearGradient>
        </defs>
        <circle cx="6" cy="6" r="5" fill="url(#elixExplorePlanet)" />
        <ellipse cx="6" cy="6" rx="5.4" ry="2.1" fill="none" stroke="#F2F2F2" strokeWidth="0.7" opacity="0.85" />
        <path d="M6 1.2 C7.4 2.8 7.4 9.2 6 10.8 C4.6 9.2 4.6 2.8 6 1.2 Z" fill="#E8C96A" opacity="0.35" />
      </svg>
      <span className="flex flex-col items-start justify-center leading-none min-w-0">
        <span className="text-white text-[9px] font-bold whitespace-nowrap">Explore</span>
        <span className="text-white/65 text-[7px] font-semibold whitespace-nowrap mt-[1px]">Live</span>
      </span>
      <span className="text-white/70 text-[9px] font-medium leading-none">&gt;</span>
    </button>
  );
}

/**
 * Photo sub-header: 4 separate thin capsules in one line, left-aligned under profile.
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
    <div className="mt-1 pointer-events-auto relative z-20 flex justify-start w-full">
      <div className="flex items-center gap-1 flex-nowrap w-max max-w-full">
        <LiveWeeklyRankingPill rank={rank} onOpen={onWeeklyRanking} />
        <LiveDiamondLeagueCapsule rank={rank} onOpen={onDiamond} />
        <LiveMembershipVipCapsule onOpen={onMembership} />
        <LiveExplorePill onOpen={onExplore} />
      </div>
    </div>
  );
}
