import React, { useState, useEffect, useRef } from 'react';
import { websocket } from '../lib/websocket';

export const ELIX_GIFT_PILL_EVENT = 'elix-gift-pill';

export type ElixGiftPillDetail = {
  username?: string;
  giftName?: string;
  giftIcon?: string;
  avatar?: string;
  quantity?: number;
  creatorName?: string;
  streamId?: string;
};

/** Call after a successful local gift send so the pill shows even if WS echo is delayed. */
export function pushLocalGiftPill(detail: ElixGiftPillDetail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(ELIX_GIFT_PILL_EVENT, { detail }));
}

interface GiftAnimation {
  id: string;
  username: string;
  giftIcon: string;
  giftName: string;
  creatorName: string;
  quantity: number;
  timestamp: number;
  avatar?: string;
}

interface GiftAnimationOverlayProps {
  streamId: string;
}

const MERGE_WINDOW_MS = 2500;
const DISPLAY_DURATION_MS = 5000;
const MAX_VISIBLE = 3;

export default function GiftAnimationOverlay({ streamId }: GiftAnimationOverlayProps) {
  const [gifts, setGifts] = useState<GiftAnimation[]>([]);
  const hideTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const seenTxnRef = useRef<Set<string>>(new Set());
  const streamIdRef = useRef(streamId);
  streamIdRef.current = streamId;

  const scheduleHide = (id: string) => {
    const prev = hideTimersRef.current.get(id);
    if (prev) clearTimeout(prev);
    const t = setTimeout(() => {
      hideTimersRef.current.delete(id);
      setGifts((list) => list.filter((g) => g.id !== id));
    }, DISPLAY_DURATION_MS);
    hideTimersRef.current.set(id, t);
  };

  const ingest = (raw: ElixGiftPillDetail & {
    stream_id?: string;
    gift_name?: string;
    gift_icon?: string;
    creator_name?: string;
    transactionId?: string;
    transaction_id?: string;
  }) => {
    const eventStreamId = raw.streamId ?? raw.stream_id;
    if (
      eventStreamId &&
      streamIdRef.current &&
      eventStreamId !== streamIdRef.current &&
      eventStreamId !== streamIdRef.current.replace(/^watch\//, '')
    ) {
      return;
    }

    const txnId =
      (typeof raw.transactionId === 'string' && raw.transactionId) ||
      (typeof raw.transaction_id === 'string' && raw.transaction_id) ||
      '';
    if (txnId) {
      if (seenTxnRef.current.has(txnId)) return;
      seenTxnRef.current.add(txnId);
      if (seenTxnRef.current.size > 200) {
        const keep = [...seenTxnRef.current].slice(-100);
        seenTxnRef.current = new Set(keep);
      }
    }

    const username = raw.username ?? 'Someone';
    const giftName = raw.giftName ?? raw.gift_name ?? 'Gift';
    const quantity = typeof raw.quantity === 'number' && raw.quantity > 0 ? raw.quantity : 1;
    const now = Date.now();
    const giftIcon = raw.giftIcon ?? raw.gift_icon ?? '🎁';
    const avatar = typeof raw.avatar === 'string' ? raw.avatar : '';

    setGifts((prev) => {
      const mergeIdx = prev.findIndex(
        (g) => g.username === username && g.giftName === giftName && now - g.timestamp < MERGE_WINDOW_MS,
      );
      if (mergeIdx >= 0) {
        const merged = {
          ...prev[mergeIdx],
          quantity: prev[mergeIdx].quantity + quantity,
          timestamp: now,
          giftIcon,
          avatar: avatar || prev[mergeIdx].avatar,
        };
        scheduleHide(merged.id);
        const next = [...prev];
        next[mergeIdx] = merged;
        return next;
      }
      const id = `${now}-${Math.random()}`;
      scheduleHide(id);
      const row: GiftAnimation = {
        id,
        username,
        giftIcon,
        giftName,
        creatorName: raw.creatorName ?? raw.creator_name ?? 'Creator',
        quantity,
        timestamp: now,
        avatar,
      };
      return [...prev, row].slice(-MAX_VISIBLE);
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
      hideTimersRef.current.forEach((t) => clearTimeout(t));
      // eslint-disable-next-line react-hooks/exhaustive-deps
      hideTimersRef.current.clear();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (gifts.length === 0) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-[240] flex justify-center">
      <div className="w-full max-w-[480px] relative h-full">
        <div
          className="absolute left-2 flex flex-col gap-1.5 items-start"
          style={{ bottom: 'calc(70px + max(2px, env(safe-area-inset-bottom, 0px)) + 8mm)' }}
        >
          {gifts.map((g) => (
            <div
              key={g.id}
              className="flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-full bg-black/60 backdrop-blur-sm max-w-[min(280px,78vw)] animate-in slide-in-from-left-2 duration-200 shadow-lg"
            >
              <div className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0 bg-[#222] border border-white/20">
                {g.avatar && (g.avatar.startsWith('http') || g.avatar.startsWith('/') || g.avatar.startsWith('data:')) ? (
                  <img src={g.avatar} alt="" className="w-full h-full object-cover" draggable={false} />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[9px] font-bold text-white/80">
                    {(g.username || '?').slice(0, 2).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-white text-[11px] font-bold truncate leading-tight">{g.username}</p>
                <p className="text-white/75 text-[10px] truncate leading-tight">sent {g.giftName}</p>
              </div>
              <div className="w-8 h-8 flex-shrink-0 flex items-center justify-center">
                {typeof g.giftIcon === 'string' && (g.giftIcon.startsWith('http') || g.giftIcon.startsWith('/')) ? (
                  <img src={g.giftIcon} alt="" className="w-7 h-7 object-contain" draggable={false} />
                ) : (
                  <span className="text-base leading-none">{g.giftIcon || '🎁'}</span>
                )}
              </div>
              <span className="text-[#FF2D55] text-[15px] font-black italic tabular-nums flex-shrink-0 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                x{g.quantity >= 1000 ? `${(g.quantity / 1000).toFixed(g.quantity % 1000 === 0 ? 0 : 1)}K` : g.quantity}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
