/**
 * Shared gift video queue ownership for host + spectator live controllers.
 * Owns: capped queue, current drain, txn dedupe Sets, enqueue helpers.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { GiftUiItem } from '../../../lib/giftsCatalog';
import {
  appendGiftPlayback,
  enqueueGiftSentVideo as ingestEnqueueGiftSentVideo,
  markBoundedTxn,
  type GiftBattleSide,
  type GiftPlaybackItem,
} from './liveGiftIngest';

export type { GiftBattleSide, GiftPlaybackItem };

export function useLiveGiftPlaybackQueue() {
  const [currentGift, setCurrentGift] = useState<GiftPlaybackItem | null>(null);
  const [giftQueue, setGiftQueue] = useState<GiftPlaybackItem[]>([]);
  const [giftKey, setGiftKey] = useState(0);

  const seenGiftTxnRef = useRef<Set<string>>(new Set());
  /** Host: video enqueued for this txn (allows metadata-first WS retry). */
  const playedGiftVideoTxnRef = useRef<Set<string>>(new Set());

  const enqueueGiftVideo = useCallback(
    (url: string, battleSide?: GiftBattleSide) => {
      if (!url) return;
      setGiftQueue((prev) =>
        appendGiftPlayback(prev, { video: url, battleSide: battleSide ?? null }),
      );
    },
    [],
  );

  const enqueueGiftVideoRef = useRef(enqueueGiftVideo);
  enqueueGiftVideoRef.current = enqueueGiftVideo;

  useEffect(() => {
    if (giftQueue.length > 0 && !currentGift) {
      setCurrentGift(giftQueue[0]);
      setGiftKey((k) => k + 1);
      setGiftQueue((prev) => prev.slice(1));
    }
  }, [giftQueue, currentGift]);

  const handleGiftEnded = useCallback(() => {
    setCurrentGift(null);
  }, []);

  const markGiftTxnSeen = useCallback((txnId: string) => {
    markBoundedTxn(seenGiftTxnRef, txnId);
  }, []);

  const hasSeenGiftTxn = useCallback((txnId: string) => {
    return !!(txnId && seenGiftTxnRef.current.has(txnId));
  }, []);

  const hasPlayedGiftVideoTxn = useCallback((txnId: string) => {
    return !!(txnId && playedGiftVideoTxnRef.current.has(txnId));
  }, []);

  /**
   * Resolve + enqueue from remote gift_sent.
   * Caller applies own-gift / battle-side filters before calling.
   * Pass trackPlayedVideo=true on host for URL-retry semantics.
   */
  const enqueueFromGiftSent = useCallback(
    (opts: {
      data: Record<string, unknown>;
      catalogRef: { current: GiftUiItem[] };
      setGiftsCatalog: (gifts: GiftUiItem[]) => void;
      battleSide?: GiftBattleSide;
      txnId?: string;
      trackPlayedVideo?: boolean;
      mounted: () => boolean;
    }) => {
      ingestEnqueueGiftSentVideo({
        data: opts.data,
        catalogRef: opts.catalogRef,
        setGiftsCatalog: opts.setGiftsCatalog,
        battleSide: opts.battleSide,
        txnId: opts.txnId,
        playedVideoTxnRef: opts.trackPlayedVideo ? playedGiftVideoTxnRef : undefined,
        mounted: opts.mounted,
        enqueue: enqueueGiftVideo,
      });
    },
    [enqueueGiftVideo],
  );

  return {
    currentGift,
    setCurrentGift,
    giftQueue,
    setGiftQueue,
    giftKey,
    setGiftKey,
    enqueueGiftVideo,
    enqueueGiftVideoRef,
    handleGiftEnded,
    seenGiftTxnRef,
    playedGiftVideoTxnRef,
    markGiftTxnSeen,
    hasSeenGiftTxn,
    hasPlayedGiftVideoTxn,
    enqueueFromGiftSent,
  };
}
