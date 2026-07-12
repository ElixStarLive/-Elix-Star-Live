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
  avatar?: string;
}

interface GiftAnimationOverlayProps {
  streamId: string;
}

const MERGE_WINDOW_MS = 2000;
const DISPLAY_DURATION_MS = 4500;
/** Keep a short stack of recent gift pills (TikTok-style left column). */
const MAX_VISIBLE = 3;

export default function GiftAnimationOverlay({ streamId }: GiftAnimationOverlayProps) {
  const [gifts, setGifts] = useState<GiftAnimation[]>([]);
  const hideTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const streamIdRef = useRef(streamId);
  streamIdRef.current = streamId;

  useEffect(() => {
    websocket.on('gift_sent', handleGiftSent);

    return () => {
      websocket.off('gift_sent', handleGiftSent);
      hideTimersRef.current.forEach((t) => clearTimeout(t));
      hideTimersRef.current.clear();
    };
  }, []);

  const scheduleHide = (id: string) => {
    const prev = hideTimersRef.current.get(id);
    if (prev) clearTimeout(prev);
    const t = setTimeout(() => {
      hideTimersRef.current.delete(id);
      setGifts((list) => list.filter((g) => g.id !== id));
    }, DISPLAY_DURATION_MS);
    hideTimersRef.current.set(id, t);
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleGiftSent = (data: any) => {
    const eventStreamId = data.streamId ?? data.stream_id;
    if (eventStreamId && eventStreamId !== streamIdRef.current) return;

    const username = data.username ?? 'Someone';
    const giftName = data.giftName ?? data.gift_name ?? 'Gift';
    const quantity = typeof data.quantity === 'number' && data.quantity > 0 ? data.quantity : 1;
    const now = Date.now();
    const giftIcon = data.gift_icon ?? data.giftIcon ?? '🎁';
    const avatar = typeof data.avatar === 'string' ? data.avatar : '';

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
        creatorName: data.creator_name ?? 'Creator',
        quantity,
        timestamp: now,
        avatar,
      };
      return [...prev, row].slice(-MAX_VISIBLE);
    });
  };

  if (gifts.length === 0) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-[215] flex justify-center">
      <div className="w-full max-w-[480px] relative h-full">
        <div
          className="absolute left-2 flex flex-col gap-1.5 items-start"
          style={{ bottom: 'calc(52px + max(2px, env(safe-area-inset-bottom, 0px)) + 10dvh)' }}
        >
          {gifts.map((g) => (
            <div
              key={g.id}
              className="flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-full bg-black/55 backdrop-blur-sm max-w-[min(280px,78vw)] animate-in slide-in-from-left-2 duration-200"
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
