/**
 * Open gift_sent for a mounted live room handler (host/spectator).
 */

import type { GiftUiItem } from '../../../lib/giftsCatalog';
import type { ParsedLiveGiftSentEvent } from './processLiveGiftSentEvent';
import {
  openLiveGiftSentHandler,
  type OpenLiveGiftSentResult,
} from './openLiveGiftSentHandler';

type GiftTxnGate = {
  hasSeenGiftTxn: (txnId: string) => boolean;
  hasPlayedGiftVideoTxn: (txnId: string) => boolean;
  markGiftTxnSeen: (txnId: string) => void;
};

export function openMountedLiveGiftSent(
  mounted: boolean,
  data: unknown,
  giftsCatalog: GiftUiItem[] | null | undefined,
  txn: GiftTxnGate,
): OpenLiveGiftSentResult | null {
  if (!mounted) return null;
  return openLiveGiftSentHandler(data, giftsCatalog, txn);
}

/** Mounted open that collapses skip → null and flattens parsed fields. */
export function openMountedLiveGiftSentParsed(
  mounted: boolean,
  data: unknown,
  giftsCatalog: GiftUiItem[] | null | undefined,
  txn: GiftTxnGate,
): (ParsedLiveGiftSentEvent & { alreadySeen: boolean }) | null {
  const opened = openMountedLiveGiftSent(mounted, data, giftsCatalog, txn);
  if (!opened || opened.skip === true) return null;
  return { alreadySeen: opened.alreadySeen, ...opened.parsed };
}
