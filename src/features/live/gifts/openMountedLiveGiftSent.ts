/**
 * Open gift_sent for a mounted live room handler (host/spectator).
 */

import type { GiftUiItem } from '../../../lib/giftsCatalog';
import {
  openLiveGiftSentHandler,
  type OpenLiveGiftSentResult,
} from './openLiveGiftSentHandler';

export function openMountedLiveGiftSent(
  mounted: boolean,
  data: unknown,
  giftsCatalog: GiftUiItem[] | null | undefined,
  txn: {
    hasSeenGiftTxn: (txnId: string) => boolean;
    hasPlayedGiftVideoTxn: (txnId: string) => boolean;
    markGiftTxnSeen: (txnId: string) => void;
  },
): OpenLiveGiftSentResult | null {
  if (!mounted) return null;
  return openLiveGiftSentHandler(data, giftsCatalog, txn);
}
