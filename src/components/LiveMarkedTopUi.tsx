import React from 'react';
import { BadgeCheck, Plus } from 'lucide-react';
import { AvatarRing } from './AvatarRing';
import type { GiftUiItem } from '../lib/giftsCatalog';
import { resolveGiftAssetUrl } from '../lib/giftsCatalog';
import { GIFT_COMBO_MAX } from '../lib/giftsCatalog';
import type { LiveGiftGoal } from '../lib/liveGiftGoal';

/** Real gift coins received (elix_creator_earnings kind=gift) required for LIVE Pro. */
export const LIVE_PRO_GIFT_COIN_THRESHOLD = 1_000_000;

export function isLiveProFromGiftReach(totalGiftCoins: number): boolean {
  const n = typeof totalGiftCoins === 'number' && Number.isFinite(totalGiftCoins) ? totalGiftCoins : 0;
  return n >= LIVE_PRO_GIFT_COIN_THRESHOLD;
}

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

/** Top live capsule: first token only — never expand for full display name. */
function firstNameOnly(name: string): string {
  const raw = String(name || '')
    .trim()
    .replace(/^@+/, '');
  if (!raw) return 'User';
  const first = raw.split(/\s+/)[0];
  return first || 'User';
}

/** Live ranking chips — transparent fill + capsule border (writing sits on clear). */
const THIN_CAPSULE_STYLE: React.CSSProperties = {
  background: 'transparent',
  backgroundColor: 'transparent',
  border: '1px solid #2A2D33',
  boxShadow: 'none',
  backdropFilter: 'none',
  WebkitBackdropFilter: 'none',
};

/** Shared capsule title / subtitle — half silver / half red writing. */
const CAPSULE_TITLE = 'elix-silver-red-text text-[8px] font-bold whitespace-nowrap';
const CAPSULE_SUB = 'elix-silver-red-text text-[6px] font-semibold whitespace-nowrap mt-[0.5px]';
const CAPSULE_CHEVRON = 'elix-silver-red-text text-[8px] font-medium leading-none';

/** Same height / padding / round chip shape — shorter capsules (icons smaller in height). */
const THIN_CAPSULE_CLASS =
  'elix-live-thin-capsule inline-flex items-center gap-0.5 flex-shrink-0 rounded-full pl-1.5 pr-2 h-[22px] box-border pointer-events-auto active:scale-95 transition-transform bg-transparent shadow-none';

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
        className="flex items-center justify-center gap-0.5 h-[28px] px-2.5 rounded-full bg-[#E6E9EE] shadow-[0_0_10px_rgba(111,63,245,0.45)] active:scale-95 transition-transform flex-shrink-0 elix-solid-accent"
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
      className="col-start-1 row-start-1 z-20 relative flex items-center justify-center gap-0.5 self-stretch h-full rounded-full bg-[#E6E9EE] w-full elix-solid-accent"
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
      <Plus size={9} className="text-[#F5F5F7] flex-shrink-0" strokeWidth={3} />
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
 * name + blue verified, “N Likes • LIVE” or “LIVE Pro” only when earned (1M gift coins).
 * Level / Diamond tier live in the bottom creator panel (tap avatar), not here.
 * One action slot beside name: Follow first → after Follow, Join (membership).
 * One big oval covers avatar + name + Join — round on the circle side.
 * Does not touch the 3 MVP circles.
 */
export function LiveHostProfileHeader({
  name,
  avatar,
  likes,
  level: _level,
  avatarSize,
  showFollow,
  isFollowing = false,
  isLivePro = false,
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
  /** true = show Follow → Join action slot (spectators). */
  showFollow: boolean;
  isFollowing?: boolean;
  /** Earned badge — only after real gift reach (1M gift coins). Never free. */
  isLivePro?: boolean;
  onAvatarClick: () => void;
  onLike: (e: React.PointerEvent) => void;
  onFollow: (e: React.MouseEvent) => void;
  /** Join (membership) — shown in the same slot after Follow only. */
  joinSlot?: React.ReactNode;
}) {
  const likesLabel = formatLikesShort(likes);
  const shortName = firstNameOnly(name);

  return (
    <div
      className="elix-live-host-oval flex items-center gap-1.5 min-w-0 w-max max-w-full pointer-events-auto rounded-full pl-[2px] pr-2 py-[2px]"
      style={{
        background: 'transparent',
        backgroundColor: 'transparent',
        border: '1px solid #2A2D33',
        boxShadow: 'none',
        minHeight: avatarSize + 4,
        paddingRight: 'calc(8px + 3mm)',
      }}
    >
      <button
        type="button"
        className="relative flex-shrink-0 rounded-full active:scale-95 transition-transform"
        onClick={(e) => {
          e.stopPropagation();
          onAvatarClick();
        }}
        aria-label="Open profile"
      >
        <AvatarRing src={avatar} alt={name} size={avatarSize} />
      </button>

      <div className="flex flex-col justify-center min-w-0 gap-[2px] pr-0.5">
        <div className="flex items-center gap-1 min-w-0">
          <span className="elix-silver-red-text text-[12px] font-bold truncate leading-tight block overflow-hidden">
            {shortName}
          </span>
          <BadgeCheck
            size={14}
            data-elix-live-verified="true"
            className="text-[#F5F5F7] flex-shrink-0 drop-shadow-none"
            fill="none"
            stroke="#F5F5F7"
            strokeWidth={2}
          />
          {/* Follow + Join capsules. Join always stays when provided (owner: never remove Join). */}
          {(showFollow || joinSlot) ? (
            <div className="flex-shrink-0 flex items-center justify-center gap-1 relative z-30">
              {showFollow && !isFollowing ? (
                <LiveFollowPill variant="photo" isFollowing={false} onFollow={onFollow} />
              ) : null}
              {joinSlot ?? null}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          className="flex items-center gap-1 pointer-events-auto self-start -mt-0.5"
          style={{ position: 'relative', top: '-1.5mm' }}
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
            {isLivePro ? 'LIVE Pro' : 'LIVE'}
          </span>
        </button>
      </div>
    </div>
  );
}

/** Membership Join — gray until daily heart sent; orange after send (same day). */
export function LiveJoinPill({
  hasJoinedToday,
  onJoin,
}: {
  hasJoinedToday: boolean;
  onJoin: (e: React.MouseEvent) => void;
}) {
  // Gray = not sent today. Orange = membership heart sent today.
  const accent = hasJoinedToday ? '#FF6A3D' : '#6B7280';
  return (
    <button
      type="button"
      data-elix-join="true"
      data-elix-join-sent={hasJoinedToday ? 'true' : 'false'}
      className="elix-live-join-capsule flex items-center justify-center gap-1 h-[36px] pl-2 pr-2.5 rounded-full active:scale-95 transition-transform shadow-none outline-none flex-shrink-0 bg-transparent"
      style={{
        background: 'transparent',
        backgroundColor: 'transparent',
        backgroundImage: 'none',
        boxShadow: 'none',
        border: '1px solid #2A2D33',
        height: 'calc(36px + 0.5mm)',
        minHeight: 'calc(36px + 0.5mm)',
        position: 'relative',
        top: '1mm',
        marginTop: 0,
        marginLeft: '3mm',
        ['--elix-join-accent' as string]: accent,
        color: accent,
      }}
      onClick={onJoin}
      aria-label="Join"
    >
      <span className="relative inline-flex items-center justify-center w-[18px] h-[18px] flex-shrink-0 bg-transparent border-0 shadow-none" aria-hidden>
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          className="elix-join-heart block"
          aria-hidden
          fill="none"
          stroke={accent}
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ color: accent, background: 'transparent' }}
        >
          <path
            d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
            fill="none"
            stroke="currentColor"
          />
        </svg>
        {!hasJoinedToday ? (
          <span
            className="absolute inset-0 flex items-center justify-center text-[9px] font-black leading-none pt-px bg-transparent"
            style={{ color: accent }}
          >
            +
          </span>
        ) : null}
      </span>
      <span className="text-[13px] font-semibold leading-none bg-transparent" style={{ color: accent }}>
        Join
      </span>
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
      <LivePhotoDiamondIcon size={9} />
      <span className="flex flex-col items-start justify-center leading-none min-w-0">
        <span className={CAPSULE_TITLE}>Diamond League</span>
        <span className={CAPSULE_SUB}>
          {rank != null ? `Rank ${rank}` : 'Rank'}
        </span>
      </span>
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
      <LivePhotoCrownIcon size={9} />
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
      <span className="text-[8px] leading-none w-[9px] h-[9px] flex items-center justify-center flex-shrink-0" aria-hidden>
        🔥
      </span>
      <span className="flex flex-col items-start justify-center leading-none min-w-0">
        <span className={CAPSULE_TITLE}>Weekly Ranking</span>
        <span className={CAPSULE_SUB}>
          {rank != null ? `No.${rank}` : 'No.'}
        </span>
      </span>
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
      <svg width="9" height="9" viewBox="0 0 12 12" className="flex-shrink-0" aria-hidden>
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
    </button>
  );
}

/** Gift Goal — small top-bar capsule (progress / set). */
export function LiveGiftGoalCapsule({
  goal,
  onOpen,
}: {
  goal: LiveGiftGoal | null;
  onOpen: () => void;
}) {
  const done = goal ? goal.currentCount >= goal.targetCount : false;
  return (
    <button
      type="button"
      className={THIN_CAPSULE_CLASS}
      style={THIN_CAPSULE_STYLE}
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      aria-label="Gift Goal"
    >
      {goal?.giftIcon ? (
        <img
          src={resolveGiftAssetUrl(goal.giftIcon)}
          alt=""
          className="w-3 h-3 object-contain flex-shrink-0"
        />
      ) : (
        <span className="text-[8px] leading-none flex-shrink-0" aria-hidden>
          🎯
        </span>
      )}
      <span className="flex flex-col items-start justify-center leading-none min-w-0">
        <span className={CAPSULE_TITLE}>{goal ? (done ? 'Goal ✓' : 'Gift Goal') : 'Gift Goal'}</span>
        <span className={CAPSULE_SUB}>
          {goal ? `${goal.currentCount}/${goal.targetCount}` : 'Set'}
        </span>
      </span>
    </button>
  );
}

/**
 * Photo sub-header: thin capsules on the same horizontal line (right-aligned).
 * Gap keeps them as individual pills, not one fused strip.
 * Weekly Ranking · Diamond League · Gift Goal · Follow (optional) · Explore
 * Membership VIP capsule removed from live (owner); showMembership stays for opt-in only.
 */
export function LiveMarkedSubHeaderBar({
  rank,
  onDiamond,
  onMembership,
  onWeeklyRanking,
  onExplore,
  onFollow,
  onGiftGoal,
  giftGoal = null,
  showGiftGoal = false,
  showFollow = false,
  showMembership = false,
}: {
  rank: number | null;
  onDiamond: () => void;
  onMembership: () => void;
  onWeeklyRanking: () => void;
  onExplore: () => void;
  onFollow?: (e: React.MouseEvent) => void;
  onGiftGoal?: () => void;
  giftGoal?: LiveGiftGoal | null;
  /** Show Gift Goal capsule in the top row. */
  showGiftGoal?: boolean;
  /** Follow Creator thin capsule. */
  showFollow?: boolean;
  /** Membership VIP thin capsule — off by default (not used). */
  showMembership?: boolean;
}) {
  return (
    <div className="mt-1 -translate-y-[0.5mm] w-full pointer-events-auto relative z-20 flex justify-end">
      <div className="flex items-center gap-1.5 flex-nowrap w-max max-w-full ml-auto overflow-x-auto no-scrollbar">
        <LiveWeeklyRankingPill rank={rank} onOpen={onWeeklyRanking} />
        <LiveDiamondLeagueCapsule rank={rank} onOpen={onDiamond} />
        {showGiftGoal && onGiftGoal ? (
          <LiveGiftGoalCapsule goal={giftGoal} onOpen={onGiftGoal} />
        ) : null}
        {showFollow && onFollow ? <LiveFollowCapsule onFollow={onFollow} /> : null}
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
      className="flex flex-col-reverse items-center gap-2 rounded-2xl px-2.5 py-2.5 border border-[#2A2D33] elix-panel backdrop-blur-md shadow-none active:scale-[0.98] transition-transform"
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
      style={{ bottom: 'calc(58px + 6mm + max(2px, env(safe-area-inset-bottom, 0px)))' }}
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
