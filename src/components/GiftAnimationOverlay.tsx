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
}

interface GiftAnimationOverlayProps {
  streamId: string;
}

const MERGE_WINDOW_MS = 2000;
const DISPLAY_DURATION_MS = 4000;

export default function GiftAnimationOverlay({ streamId }: GiftAnimationOverlayProps) {
  const [currentGift, setCurrentGift] = useState<GiftAnimation | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seenTxnRef = useRef<Set<string>>(new Set());
  const streamIdRef = useRef(streamId);
  streamIdRef.current = streamId;

  const ingest = (data: ElixGiftPillDetail & {
    stream_id?: string;
    gift_name?: string;
    gift_icon?: string;
    creator_name?: string;
    transactionId?: string;
    transaction_id?: string;
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

    const txnId =
      (typeof data.transactionId === 'string' && data.transactionId) ||
      (typeof data.transaction_id === 'string' && data.transaction_id) ||
      '';
    if (txnId) {
      if (seenTxnRef.current.has(txnId)) return;
      seenTxnRef.current.add(txnId);
      if (seenTxnRef.current.size > 200) {
        seenTxnRef.current = new Set([...seenTxnRef.current].slice(-100));
      }
    }

    const username = data.username ?? 'Someone';
    const giftName = data.giftName ?? data.gift_name ?? 'Gift';
    const quantity = typeof data.quantity === 'number' && data.quantity > 0 ? data.quantity : 1;
    const giftIcon = data.giftIcon ?? data.gift_icon ?? '🎁';
    const now = Date.now();

    setCurrentGift(prev => {
      const sameSenderSameGift =
        prev && prev.username === username && prev.giftName === giftName && now - prev.timestamp < MERGE_WINDOW_MS;
      if (sameSenderSameGift) {
        return { ...prev, quantity: prev.quantity + quantity, timestamp: now };
      }
      return {
        id: now.toString() + Math.random(),
        username,
        giftIcon,
        giftName,
        creatorName: data.creatorName ?? data.creator_name ?? 'Creator',
        quantity,
        timestamp: now,
      };
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
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!currentGift) return;
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      hideTimerRef.current = null;
      setCurrentGift(null);
    }, DISPLAY_DURATION_MS);
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [currentGift]);

  return (
    <div className="fixed inset-0 pointer-events-none z-[999996] flex justify-center">
      <div className="w-full max-w-[480px] relative">
        <div className="absolute left-0 right-0 px-1" style={{ top: 'calc(1cm + 7mm)' }}>
          {currentGift && (
            <div className="animate-slide-in-right w-full rounded-full flex items-center gap-1.5 overflow-hidden px-2 py-0.5 bg-red-600/85 backdrop-blur-sm">
              <div className="w-4 h-4 flex-shrink-0">
                {currentGift.giftIcon && (currentGift.giftIcon.startsWith('http') || currentGift.giftIcon.startsWith('/')) ? (
                  <img src={currentGift.giftIcon} alt="" className="w-full h-full object-contain" />
                ) : (
                  <span className="text-xs">{currentGift.giftIcon || '🎁'}</span>
                )}
              </div>
              <div className="flex-1 min-w-0 overflow-x-auto no-scrollbar">
                <p className="text-xs font-bold text-black whitespace-nowrap leading-tight">
                  {currentGift.username} sent {currentGift.giftName} to {currentGift.creatorName}
                  {currentGift.quantity > 1 && <span> x{currentGift.quantity}</span>}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
