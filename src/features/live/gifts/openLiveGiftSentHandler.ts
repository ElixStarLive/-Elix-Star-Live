/**
 * Shared host↔spectator gift_sent open: parse + txn gate in one step.
 */

import type { GiftUiItem } from '../../../lib/giftsCatalog';
import {
  parseLiveGiftSentEvent,
  type ParsedLiveGiftSentEvent,
} from './processLiveGiftSentEvent';
import { beginLiveGiftSentTxnGate } from './beginLiveGiftSentTxnGate';

export type OpenLiveGiftSentResult =
  | { skip: true }
  | {
      skip: false;
      alreadySeen: boolean;
      parsed: ParsedLiveGiftSentEvent;
    };

export function openLiveGiftSentHandler(
  data: unknown,
  giftsCatalog: GiftUiItem[] | null | undefined,
  txn: {
    hasSeenGiftTxn: (txnId: string) => boolean;
    hasPlayedGiftVideoTxn: (txnId: string) => boolean;
    markGiftTxnSeen: (txnId: string) => void;
  },
): OpenLiveGiftSentResult {
  const parsed = parseLiveGiftSentEvent(data, giftsCatalog ?? []);
  const gate = beginLiveGiftSentTxnGate({
    txnId: parsed.txnId,
    hasSeenGiftTxn: txn.hasSeenGiftTxn,
    hasPlayedGiftVideoTxn: txn.hasPlayedGiftVideoTxn,
    markGiftTxnSeen: txn.markGiftTxnSeen,
  });
  if (gate.shouldSkip) return { skip: true };
  return { skip: false, alreadySeen: gate.alreadySeen, parsed };
}
