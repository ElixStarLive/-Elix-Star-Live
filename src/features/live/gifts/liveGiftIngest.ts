/**
 * Pure gift ingest helpers — txn dedupe bounds + playable URL resolve.
 * Playback queue state lives in useLiveGiftPlaybackQueue.
 */

import {
  fetchGiftsFromDatabase,
  pickGiftVideoUrl,
  preferPlayableGiftVideoUrl,
  resolveGiftAssetUrl,
  type GiftUiItem,
} from '../../../lib/giftsCatalog';
import { appendCapped, LIVE_GIFT_QUEUE_CAP } from '../../../lib/liveRuntimeCaps';
import { reportFailure } from '../../../lib/reportFailure';

export type GiftBattleSide = 'host' | 'opponent' | null;

export type GiftPlaybackItem = {
  video: string;
  battleSide?: GiftBattleSide;
};

/** Soft cap before trimming the txn Set; keep newest N after trim. */
const GIFT_TXN_DEDUP_SOFT_CAP = 200;
const GIFT_TXN_DEDUP_KEEP = 100;

export function extractGiftTxnId(data: Record<string, unknown>): string {
  return (
    (typeof data.transactionId === 'string' && data.transactionId) ||
    (typeof data.transaction_id === 'string' && data.transaction_id) ||
    ''
  );
}

export function extractGiftId(data: Record<string, unknown>): string {
  return (
    (typeof data.giftId === 'string' && data.giftId) ||
    (typeof data.gift_id === 'string' && data.gift_id) ||
    ''
  );
}

function trimBoundedTxnSet(
  set: Set<string>,
  softCap = GIFT_TXN_DEDUP_SOFT_CAP,
  keep = GIFT_TXN_DEDUP_KEEP,
): Set<string> {
  if (set.size <= softCap) return set;
  return new Set([...set].slice(-keep));
}

/** Add txn id and trim when the Set grows past the soft cap. */
export function markBoundedTxn(
  setRef: { current: Set<string> },
  txnId: string,
): void {
  if (!txnId) return;
  setRef.current.add(txnId);
  if (setRef.current.size > GIFT_TXN_DEDUP_SOFT_CAP) {
    setRef.current = trimBoundedTxnSet(setRef.current);
  }
}

/**
 * Resolve playable gift video URL from a gift_sent payload + catalog.
 * Same candidate order as host/spectator controllers historically used.
 */
function resolveGiftSentPlayUrl(
  data: Record<string, unknown>,
  catalog: GiftUiItem[],
  giftId?: string,
): string | null {
  const wsGiftId = giftId ?? extractGiftId(data);
  return (
    pickGiftVideoUrl(data, catalog) ||
    (wsGiftId
      ? pickGiftVideoUrl({ giftId: wsGiftId, gift_id: wsGiftId }, catalog)
      : null) ||
    pickGiftVideoUrl(
      {
        giftId: wsGiftId,
        gift_id: wsGiftId,
        video: typeof data.video === 'string' ? data.video : '',
        animation_url:
          typeof data.animation_url === 'string' ? data.animation_url : '',
      },
      catalog,
    )
  );
}

/**
 * Catalog / send path → playable gift video URL (CDN + prefer MP4).
 * Shared by host + spectator handleSendGift (and local playback enqueue).
 */
export function resolvePlayableGiftVideoUrl(
  giftVideo: string | null | undefined,
): string | null {
  if (!giftVideo || !giftVideo.trim()) return null;
  const trimmed = giftVideo.trim();
  return preferPlayableGiftVideoUrl(
    trimmed.startsWith('http://') || trimmed.startsWith('https://')
      ? trimmed
      : resolveGiftAssetUrl(trimmed.startsWith('/') ? trimmed : `/${trimmed}`),
  );
}

/** Local send / combo: only enqueue when path looks like a video. */
export function resolveLocalGiftVideoUrl(raw: string | null | undefined): string | null {
  if (!raw || !raw.trim()) return null;
  const trimmed = raw.trim();
  const ext = trimmed.split('?')[0].toLowerCase();
  const isVid =
    ext.endsWith('.mp4') || ext.endsWith('.webm') || ext.endsWith('.mov');
  if (!isVid) return null;
  return resolvePlayableGiftVideoUrl(trimmed);
}

export function appendGiftPlayback(
  prev: GiftPlaybackItem[],
  item: GiftPlaybackItem,
): GiftPlaybackItem[] {
  return appendCapped(prev, item, LIVE_GIFT_QUEUE_CAP);
}

export type EnqueueGiftSentVideoArgs = {
  data: Record<string, unknown>;
  catalogRef: { current: GiftUiItem[] };
  setGiftsCatalog: (gifts: GiftUiItem[]) => void;
  battleSide?: GiftBattleSide;
  txnId?: string;
  /**
   * Host: skip/re-mark via playedGiftVideoTxnRef so a second payload can retry
   * when the first lacked a playable URL.
   */
  playedVideoTxnRef?: { current: Set<string> };
  mounted: () => boolean;
  enqueue: (url: string, battleSide?: GiftBattleSide) => void;
};

/**
 * Normalize gift_sent → playable URL and enqueue.
 * Optional catalog refetch when gift id is known but URL is not yet resolvable.
 */
export function enqueueGiftSentVideo(args: EnqueueGiftSentVideoArgs): void {
  const {
    data,
    catalogRef,
    setGiftsCatalog,
    battleSide = null,
    playedVideoTxnRef,
    mounted,
    enqueue,
  } = args;
  const txnId = args.txnId ?? extractGiftTxnId(data);
  const wsGiftId = extractGiftId(data);

  const tryEnqueue = (url: string) => {
    if (!url) return;
    if (playedVideoTxnRef && txnId) {
      if (playedVideoTxnRef.current.has(txnId)) return;
      markBoundedTxn(playedVideoTxnRef, txnId);
    }
    enqueue(url, battleSide);
  };

  const playUrl = resolveGiftSentPlayUrl(data, catalogRef.current, wsGiftId);
  if (playUrl) {
    tryEnqueue(playUrl);
    return;
  }

  if (!wsGiftId) return;
  void fetchGiftsFromDatabase()
    .then((gifts) => {
      if (!mounted()) return;
      if (playedVideoTxnRef && txnId && playedVideoTxnRef.current.has(txnId)) return;
      if (gifts.length) {
        catalogRef.current = gifts;
        setGiftsCatalog(gifts);
      }
      const retryUrl = resolveGiftSentPlayUrl(data, catalogRef.current, wsGiftId);
      if (retryUrl) tryEnqueue(retryUrl);
    })
    .catch((err) => {
      reportFailure('live_gift_ingest_catalog', err);
      /* keep prior catalog — do not treat load failure as empty */
    });
}
