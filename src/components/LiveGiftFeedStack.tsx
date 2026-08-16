import React, { useEffect, useRef, useState } from 'react';
import { websocket } from '../lib/websocket';
import {
  ELIX_GIFT_PILL_EVENT,
  type ElixGiftPillDetail,
} from './GiftAnimationOverlay';
import { LIVE_BATTLE_STAGE_BOTTOM, LIVE_SOLO_CHAT_TOP_FROM_BOTTOM } from '../lib/profileFrame';
import { useAuthStore } from '../store/useAuthStore';

/**
 * Live gift combo counters (xN only). Sender chip lives in GiftAnimationOverlay.
 * Listens to the same gift events as the existing pill overlay.
 * Does not modify GiftAnimationOverlay, GiftPanel, or gift send/pay logic.
 */

type FeedCard = {
  id: string;
  username: string;
  giftName: string;
  quantity: number;
  timestamp: number;
};

const MERGE_MS = 8000;
const CLEAR_MS = 8000;
const MAX_CARDS = 3;

function formatXn(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K`;
  return String(n);
}

type Props = {
  streamId: string;
  /** Co-host split: sit on the bottom of the big left tile. Solo keeps the existing top offset. */
  isCohostMode?: boolean;
  /** Battle: sit at bottom:0 of the battle video stage (not the red Weekly Ranking banner). */
  isBattleMode?: boolean;
  /** CSS `top` of the co-host stage bottom edge (host and spectator stages differ). */
  cohostStageBottom?: string;
};

export function LiveGiftFeedStack({
  streamId,
  isCohostMode = false,
  isBattleMode = false,
  cohostStageBottom,
}: Props) {
  const [stack, setStack] = useState<FeedCard[]>([]);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streamIdRef = useRef(streamId);
  streamIdRef.current = streamId;

  const ingest = (data: ElixGiftPillDetail & {
    stream_id?: string;
    gift_name?: string;
    gift_icon?: string;
    creator_name?: string;
    user_id?: string;
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

    // The sender already renders their gift from the local pill, so the room
    // echo of that same gift must be ignored here — same own-echo rule the live
    // controllers use for gift chat and gift video. Local pills carry no user_id.
    const gifterId = typeof data.user_id === 'string' ? data.user_id.trim() : '';
    if (gifterId && gifterId === useAuthStore.getState().user?.id) return;

    const username = data.username ?? 'Someone';
    const giftName = data.giftName ?? data.gift_name ?? 'Gift';
    const quantity = typeof data.quantity === 'number' && data.quantity > 0 ? data.quantity : 1;
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
        };
        const [item] = next.splice(idx, 1);
        return [...next, item].slice(-MAX_CARDS);
      }
      return [
        ...prev,
        {
          id: `${now}-${Math.random()}`,
          username,
          giftName,
          quantity,
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
          style={
            isCohostMode && cohostStageBottom
              ? {
                  top: cohostStageBottom,
                  transform: 'translateY(calc(-100% - 2px))',
                  maxWidth: '220px',
                }
              : isBattleMode
                ? {
                    top: LIVE_BATTLE_STAGE_BOTTOM,
                    transform: 'translateY(-100%)',
                    maxWidth: '220px',
                  }
                : {
                    // Solo: top of chat (middle of screen), shifted 23mm down. Red banner stays on Weekly Ranking.
                    bottom: `calc(${LIVE_SOLO_CHAT_TOP_FROM_BOTTOM} - 23mm)`,
                    transform: 'translateY(-100%)',
                    maxWidth: '220px',
                  }
          }
        >
          {stack.map((g) => (
            <span
              key={g.id}
              className="font-black italic text-white text-[16px] leading-none drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] flex-shrink-0 animate-slide-in-right"
            >
              x{formatXn(g.quantity)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
