import React from 'react';
import { Coins, Crown, Gem, Plus, Star } from 'lucide-react';
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
          <Crown size={11} className="text-[#FFD54A]" fill="#FFD54A" strokeWidth={1.2} />
        </span>
      )}
      <div className={isMvp ? 'rounded-full ring-[1.5px] ring-white/90' : ''}>
        <AvatarRing src={slot.avatar} alt={slot.name || ''} size={size} />
      </div>
      {isMvp && (
        <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 z-[2] flex items-center gap-0.5 px-1 py-[1px] rounded-full bg-black/70 text-white text-[6px] font-bold leading-none tabular-nums whitespace-nowrap">
          <Coins size={7} className="text-[#FFD54A] flex-shrink-0" strokeWidth={2.5} />
          {formatGiftCoinsShort(slot.points)}
        </span>
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

/** Gift combo column — icon + xN beside it; identical on creator + spectator. */
export function LiveGiftComboColumn({
  stack,
  onCombo,
}: {
  stack: LiveComboStackItem[];
  onCombo: () => void;
}) {
  if (stack.length === 0) return null;
  return (
    <div className="fixed left-0 right-0 bottom-[calc(58px+max(2px,env(safe-area-inset-bottom,0px)))] z-[50001] flex justify-center pointer-events-none">
      <div className="w-full max-w-[480px] mx-auto px-3 flex justify-center pointer-events-auto">
        <div className="flex flex-col-reverse items-center gap-2">
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
                  if (isActive) onCombo();
                }}
                disabled={!isActive || n >= GIFT_COMBO_MAX}
                className="flex items-center gap-1.5 active:scale-95 transition-transform disabled:opacity-50 bg-transparent border-0 p-0"
              >
                {item.icon && (item.icon.startsWith('http') || item.icon.startsWith('/')) ? (
                  <img
                    src={item.icon}
                    alt=""
                    className="w-11 h-11 object-contain drop-shadow-[0_2px_6px_rgba(0,0,0,0.65)]"
                    draggable={false}
                  />
                ) : (
                  <span className="w-11 h-11 flex items-center justify-center text-2xl drop-shadow-[0_2px_6px_rgba(0,0,0,0.65)]">
                    🎁
                  </span>
                )}
                <span className="font-black italic text-white text-[22px] leading-none drop-shadow-[0_2px_4px_rgba(0,0,0,0.85)] tracking-tight">
                  x{label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
