import React, { useEffect, useRef, useState } from 'react';
import { websocket } from '../lib/websocket';
import { formatGiftDisplayName } from '../lib/giftsCatalog';
import {
  ELIX_GIFT_PILL_EVENT,
  type ElixGiftPillDetail,
} from './GiftAnimationOverlay';

/**
 * Separate live gift-feed stack (photo: cards + xN).
 * Listens to the same gift events as the existing pill overlay.
 * Does not modify GiftAnimationOverlay, GiftPanel, or gift send/pay logic.
 */

type FeedCard = {
  id: string;
  username: string;
  giftIcon: string;
  giftName: string;
  quantity: number;
  avatar: string;
  badge: 'top_gifter' | 'vip' | 'elite';
  timestamp: number;
};

const MERGE_MS = 8000;
const CLEAR_MS = 8000;
const MAX_CARDS = 3;

function badgeForQty(q: number): FeedCard['badge'] {
  if (q >= 25) return 'top_gifter';
  if (q >= 10) return 'vip';
  return 'elite';
}

const BADGE: Record<
  FeedCard['badge'],
  { label: string; chip: string; glow: string }
> = {
  top_gifter: {
    label: 'Top Gifter',
    chip: 'bg-purple-500 text-white',
    glow: 'border-purple-400/50 shadow-[0_0_10px_rgba(168,85,247,0.5)]',
  },
  vip: {
    label: 'VIP',
    chip: 'bg-pink-500 text-white',
    glow: 'border-pink-400/50 shadow-[0_0_10px_rgba(236,72,153,0.45)]',
  },
  elite: {
    label: 'Elite',
    chip: 'bg-orange-500 text-white',
    glow: 'border-orange-400/50 shadow-[0_0_10px_rgba(249,115,22,0.45)]',
  },
};

function formatXn(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K`;
  return String(n);
}

type Props = { streamId: string };

export function LiveGiftFeedStack({ streamId }: Props) {
  const [stack, setStack] = useState<FeedCard[]>([]);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streamIdRef = useRef(streamId);
  streamIdRef.current = streamId;

  const ingest = (data: ElixGiftPillDetail & {
    stream_id?: string;
    gift_name?: string;
    gift_icon?: string;
    creator_name?: string;
  }) => {
    const eventStreamId = data.streamId ?? data.stream_id;
    if (
      eventStreamId &&
      streamIdRef.current &&
      eventStreamId !== streamIdRef.current &&
      eventStreamId !== streamIdRef.current.replace(/^watch\//, '')
    ) {
      return;
    }

    const username = data.username ?? 'Someone';
    const giftName = data.giftName ?? data.gift_name ?? 'Gift';
    const quantity = typeof data.quantity === 'number' && data.quantity > 0 ? data.quantity : 1;
    const giftIcon = data.giftIcon ?? data.gift_icon ?? '🎁';
    const avatar = typeof data.avatar === 'string' ? data.avatar : '';
    const now = Date.now();

    setStack((prev) => {
      const idx = prev.findIndex(
        (p) => p.username === username && p.giftName === giftName && now - p.timestamp < MERGE_MS,
      );
      if (idx >= 0) {
        const next = [...prev];
        const qty = next[idx].quantity + quantity;
        next[idx] = {
          ...next[idx],
          quantity: qty,
          timestamp: now,
          badge: badgeForQty(qty),
          avatar: avatar || next[idx].avatar,
        };
        const [item] = next.splice(idx, 1);
        return [...next, item].slice(-MAX_CARDS);
      }
      return [
        ...prev,
        {
          id: `${now}-${Math.random()}`,
          username,
          giftIcon,
          giftName,
          quantity,
          avatar,
          badge: badgeForQty(quantity),
          timestamp: now,
        },
      ].slice(-MAX_CARDS);
    });
  };

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onWs = (data: any) => ingest(data);
    const onLocal = (ev: Event) => {
      const detail = (ev as CustomEvent<ElixGiftPillDetail>).detail;
      if (detail) ingest(detail);
    };
    websocket.on('gift_sent', onWs);
    window.addEventListener(ELIX_GIFT_PILL_EVENT, onLocal);
    return () => {
      websocket.off('gift_sent', onWs);
      window.removeEventListener(ELIX_GIFT_PILL_EVENT, onLocal);
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (stack.length === 0) return;
    if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
    clearTimerRef.current = setTimeout(() => {
      clearTimerRef.current = null;
      setStack([]);
    }, CLEAR_MS);
    return () => {
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
    };
  }, [stack]);

  if (stack.length === 0) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-[999995] flex justify-center">
      <div className="w-full max-w-[480px] relative h-full">
        <div
          className="absolute left-2 flex flex-col gap-1.5"
          style={{ top: 'calc(22dvh + 6mm)', maxWidth: '220px' }}
        >
          {stack.map((g) => {
            const style = BADGE[g.badge];
            return (
              <div key={g.id} className="flex items-center gap-1.5 animate-slide-in-right">
                <div
                  className={`flex-1 min-w-0 rounded-full bg-black/75 backdrop-blur-sm border px-1.5 py-1 flex items-center gap-1.5 ${style.glow}`}
                >
                  <div className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0 bg-white/10 border border-white/20">
                    {g.avatar && (g.avatar.startsWith('http') || g.avatar.startsWith('/')) ? (
                      <img src={g.avatar} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="w-full h-full flex items-center justify-center text-[10px] text-white/80">
                        {(g.username || '?')[0]}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 leading-none">
                    <span
                      className={`inline-block text-[7px] font-black px-1 py-[1px] rounded-sm mb-0.5 ${style.chip}`}
                    >
                      {style.label}
                    </span>
                    <p className="text-[10px] font-bold text-white truncate">{g.username}</p>
                    <p className="text-[8px] text-white/75 truncate">
                      sent {formatGiftDisplayName(g.giftName)}
                    </p>
                  </div>
                  <div className="w-6 h-6 flex-shrink-0">
                    {g.giftIcon && (g.giftIcon.startsWith('http') || g.giftIcon.startsWith('/')) ? (
                      <img src={g.giftIcon} alt="" className="w-full h-full object-contain" />
                    ) : (
                      <span className="text-sm">{g.giftIcon || '🎁'}</span>
                    )}
                  </div>
                </div>
                <span className="font-black italic text-white text-[20px] leading-none drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] flex-shrink-0">
                  x{formatXn(g.quantity)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
