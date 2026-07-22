import React from 'react';
import { Crown, Gem, Plus, Star } from 'lucide-react';
import { AvatarRing } from './AvatarRing';
import type { GiftUiItem } from '../lib/giftsCatalog';
import { GIFT_COMBO_MAX } from '../lib/giftsCatalog';

/** Pink + Follow pill — identical on creator + spectator. */
export function LiveFollowPill({ onFollow }: { onFollow: (e: React.MouseEvent) => void }) {
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

export type LiveTopGifterSlot = {
  id: string;
  name: string;
  avatar: string;
  points: number;
};

function formatGiftCoinsShort(coins: number) {
  const c = typeof coins === 'number' && Number.isFinite(coins) ? coins : 0;
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

/** Top gifter avatar: crown + coin label — identical on creator + spectator. */
export function LiveTopGifterAvatar({
  slot,
  size,
  isMvp,
  onOpen,
}: {
  slot: LiveTopGifterSlot;
  size: number;
  isMvp: boolean;
  onOpen?: (id: string) => void;
}) {
  return (
    <div
      className="relative"
      onClick={(e) => {
        e.stopPropagation();
        if (slot.id && onOpen) onOpen(slot.id);
      }}
    >
      {isMvp && (
        <span className="absolute -top-1.5 -left-0.5 z-[3] flex items-center justify-center drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]">
          <Crown size={12} className="text-[#FFD54A]" fill="#FFD54A" strokeWidth={1.2} />
        </span>
      )}
      <div className={isMvp ? 'rounded-full ring-[1.5px] ring-[#FFD54A]' : ''}>
        <AvatarRing src={slot.avatar} alt={slot.name || ''} size={size} />
      </div>
      {isMvp && (
        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 z-[2] flex items-center gap-0.5 whitespace-nowrap">
          <span className="w-3.5 h-3.5 rounded-full bg-[#FFD54A] text-black text-[7px] font-black flex items-center justify-center leading-none shadow-[0_1px_2px_rgba(0,0,0,0.6)]">
            1
          </span>
          <span className="px-1 py-[1px] rounded-full bg-black/75 text-white text-[7px] font-bold tabular-nums leading-none">
            {formatGiftCoinsShort(slot.points)}
          </span>
        </div>
      )}
    </div>
  );
}

/** Diamond League capsule — identical on creator + spectator. */
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
      className="flex items-center gap-1.5 bg-black/55 backdrop-blur-[2px] rounded-xl pl-1.5 pr-2 py-1 cursor-pointer active:scale-95 transition-transform"
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
    >
      <Gem className="w-4 h-4 text-[#C084FC] flex-shrink-0" strokeWidth={2.2} fill="#A855F7" />
      <span className="flex flex-col items-start leading-none min-w-0">
        <span className="text-white text-[10px] font-bold whitespace-nowrap">Diamond League</span>
        {rank != null ? (
          <span className="text-white/70 text-[8px] font-semibold whitespace-nowrap mt-0.5">Rank {rank}</span>
        ) : null}
      </span>
      <span className="text-white/80 text-[10px] ml-0.5">&gt;</span>
    </button>
  );
}

/** Membership VIP capsule — identical on creator + spectator. */
export function LiveMembershipVipCapsule({ onOpen }: { onOpen: () => void }) {
  return (
    <div
      className="flex items-center gap-1.5 bg-black/55 backdrop-blur-[2px] rounded-xl pl-1.5 pr-2 py-1 cursor-pointer active:scale-95 transition-transform"
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
    >
      <Crown className="w-4 h-4 text-[#FFD54A] flex-shrink-0" strokeWidth={2} fill="#FFD54A" />
      <span className="flex flex-col items-start leading-none min-w-0">
        <span className="text-white text-[10px] font-bold whitespace-nowrap">Membership</span>
        <span className="flex items-center gap-0.5 mt-0.5">
          <span className="text-[#FFD54A] text-[8px] font-bold">VIP</span>
          <Star size={8} className="text-[#FFD54A]" fill="#FFD54A" strokeWidth={1.5} />
        </span>
      </span>
      <span className="text-white/80 text-[10px] ml-0.5">&gt;</span>
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
 * Tap active row = continue combo; tap panel = open gift panel.
 * Does not replace GiftPanel / GiftAnimationOverlay / gift pay path.
 */
export function LiveGiftComboColumn({
  stack,
  onCombo,
  onOpen,
}: {
  stack: LiveComboStackItem[];
  onCombo: () => void;
  /** Open gift panel (press the column) */
  onOpen?: () => void;
}) {
  if (stack.length === 0) return null;

  return (
    <div
      className="fixed left-0 right-0 z-[50001] flex justify-center pointer-events-none"
      style={{ bottom: 'calc(58px + max(2px, env(safe-area-inset-bottom, 0px)))' }}
    >
      <div className="w-full max-w-[480px] mx-auto relative h-0 pointer-events-none">
        {/* Right of chat (chat sits left ~0–42%); column sits mid-center like photo */}
        <div
          className="absolute pointer-events-auto"
          style={{ left: '48%', bottom: '8px', transform: 'translateX(-50%)' }}
        >
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
        </div>
      </div>
    </div>
  );
}
