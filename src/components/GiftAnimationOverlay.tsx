import React, { useState, useEffect, useRef } from 'react';
import { websocket } from '../lib/websocket';

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
  const streamIdRef = useRef(streamId);
  streamIdRef.current = streamId;

  useEffect(() => {
    websocket.on('gift_sent', handleGiftSent);

    return () => {
      websocket.off('gift_sent', handleGiftSent);
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleGiftSent = (data: any) => {
    const eventStreamId = data.streamId ?? data.stream_id;
    if (eventStreamId && eventStreamId !== streamIdRef.current) return;

    const username = data.username ?? 'Someone';
    const giftName = data.giftName ?? data.gift_name ?? 'Gift';
    const quantity = data.quantity ?? 1;
    const now = Date.now();

    setCurrentGift(prev => {
      const sameSenderSameGift = prev && prev.username === username && prev.giftName === giftName && now - prev.timestamp < MERGE_WINDOW_MS;
      if (sameSenderSameGift) {
        return { ...prev, quantity: prev.quantity + quantity, timestamp: now };
      }
      return {
        id: now.toString() + Math.random(),
        username,
        giftIcon: data.gift_icon,
        giftName,
        creatorName: data.creator_name ?? 'Creator',
        quantity,
        timestamp: now,
      };
    });
  };

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
